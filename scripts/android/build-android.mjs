#!/usr/bin/env node
// Builds the signed Android app (APK) of Calorie Compass on Windows. Double-click build-android.cmd in
// the repository root, or run: node scripts/android/build-android.mjs [--skip-tests]
//
// Tools are downloaded once into %LOCALAPPDATA%\CalorieCompassAndroid and nothing is installed
// system-wide: a portable JDK 21 (Gradle cannot run on newer JDKs), the Android SDK command-line
// tools, and Node.js 24 if the installed Node.js is older than 22 (needed by Capacitor 8).
// Running this accepts the Android SDK license agreements (sdkmanager --licenses) for the owner.
//
// Steps: tools -> npm install -> npm test -> web build -> Capacitor project -> signing key -> Gradle
// in an ASCII-only folder (Android's build tools fail in paths with Chinese characters) -> checks ->
// release-vX.Y-android/CalorieCompass-vX.Y.Z.apk. Details go to build-android.log.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import dns from "node:dns";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import {
  capacitorPackages,
  findCommandLineTools,
  findNodeZip,
  newestVersion,
  parseBadging,
  parseProperties,
  parseProxy,
  propertiesPath,
  proxyFromRegistry,
  versionCodeFor,
} from "./build-helpers.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const logFile = path.join(repo, "build-android.log");
const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
const tools = path.join(localAppData, "CalorieCompassAndroid");
const downloads = path.join(tools, "downloads");
const jdkHome = path.join(tools, "jdk21");
const sdkRoot = path.join(tools, "sdk");
const nodeHome = path.join(tools, "node");
const work = path.join(tools, "w");
// Outside the repository on purpose: the signing key must never be committed, and must be kept.
const signingDir = path.join(path.dirname(repo), "android-signing");
const skipTests = process.argv.includes("--skip-tests");

const COMMAND_LINE_TOOLS_FALLBACK = "https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip";
const MICROSOFT_JDK_21 = "https://aka.ms/download-jdk/microsoft-jdk-21-windows-x64.zip";
const SDK_PACKAGES = ["platform-tools", "platforms;android-36", "build-tools;36.0.0"];
const KEY_ALIAS = "calorie-compass";

const started = Date.now();
let stepNumber = 0;
let stepStarted = started;

// How this PC reaches the internet: `proxy` is the Windows proxy (what the browser uses, e.g. a
// proxy app) or HTTPS_PROXY; `mode` is the download method that worked: "proxy", "direct" or "windows".
const network = { proxy: null, mode: null };
dns.setDefaultResultOrder?.("ipv4first");

// ---------------------------------------------------------------- logging and processes

function log(text) {
  fs.appendFileSync(logFile, `${text}\n`);
}

function clock() {
  return new Date().toTimeString().slice(0, 8);
}

function step(title) {
  if (stepNumber) log(`(step took ${Math.round((Date.now() - stepStarted) / 1000)} s)`);
  stepNumber += 1;
  stepStarted = Date.now();
  console.log(`[${stepNumber}] ${title}`);
  log(`\n===== STEP ${stepNumber}: ${title} (${clock()}) =====`);
}

function note(text) {
  console.log(`      ${text}`);
  log(text);
}

function quote(value) {
  return `"${value}"`;
}

/**
 * Runs a program; output goes to the log. `shell` is needed for .cmd/.bat files: give one complete
 * command line (quote paths yourself). Resolves to { code, output } when `capture` is set.
 */
function run(command, args = [], { cwd = repo, env = process.env, shell = false, input = null, allowFailure = false, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    log(`> ${shell ? command : [command, ...args].map((part) => (/\s/.test(part) ? quote(part) : part)).join(" ")}`);
    const child = spawn(command, shell ? [] : args, {
      cwd,
      env,
      shell,
      windowsHide: true,
      stdio: [input === null ? "ignore" : "pipe", "pipe", "pipe"],
    });
    const chunks = [];
    const collect = (chunk) => {
      fs.appendFileSync(logFile, chunk);
      if (capture) chunks.push(chunk);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    if (input !== null) {
      child.stdin.on("error", () => undefined); // the program may exit before reading everything
      child.stdin.end(input);
    }
    child.on("error", reject);
    child.on("close", (code) => {
      log(`(exit code ${code})`);
      const output = Buffer.concat(chunks).toString("utf8");
      if (code === 0 || allowFailure) resolve(capture ? { code, output } : code);
      else reject(new Error(`${path.basename(shell ? command.split(" ")[0].replace(/"/g, "") : command)} failed (exit code ${code}). See build-android.log.`));
    });
  });
}

function withPath(env, ...folders) {
  const next = { ...env };
  const key = Object.keys(next).find((name) => name.toUpperCase() === "PATH") ?? "Path";
  next[key] = [...folders, next[key] ?? ""].join(path.delimiter);
  return next;
}

// ---------------------------------------------------------------- downloads

function sizeText(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function systemProgram(name) {
  return path.join(process.env.SystemRoot || "C:\\Windows", "System32", name);
}

function describeError(error) {
  const cause = error?.cause;
  return [error?.message, cause?.code, cause?.message].filter(Boolean).join(" / ") || String(error);
}

async function detectNetwork() {
  const fromEnvironment = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (fromEnvironment) {
    network.proxy = parseProxy(fromEnvironment, "HTTPS_PROXY");
  } else {
    const result = await run(systemProgram("reg.exe"), ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"], { capture: true, allowFailure: true }).catch(() => null);
    network.proxy = result ? proxyFromRegistry(result.output) : null;
  }
  note(network.proxy ? `proxy found: ${network.proxy.url} (${network.proxy.source})` : "no proxy set in Windows; connecting directly");
}

/**
 * Downloads with whatever works on this PC: curl.exe (through the Windows proxy when one is set, then
 * directly), Node's fetch, then PowerShell (which follows the Windows proxy settings itself). The
 * method that worked is tried first next time and decides how npm, sdkmanager and Gradle connect.
 */
async function download(url, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const partial = `${file}.part`;
  const curl = systemProgram("curl.exe");
  const curlArgs = ["-L", "--fail", "--retry", "2", "--connect-timeout", "30", "-sS", "-o", partial];
  const attempts = [];
  if (fs.existsSync(curl) && network.proxy) {
    attempts.push({ mode: "proxy", name: `curl through ${network.proxy.url}`, go: () => run(curl, [...curlArgs, "-x", network.proxy.url, url]) });
  }
  if (fs.existsSync(curl)) {
    attempts.push({ mode: "direct", name: "curl", go: () => run(curl, [...curlArgs, "--noproxy", "*", url]) });
  }
  attempts.push({
    mode: "direct",
    name: "Node.js fetch",
    go: async () => {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial));
    },
  });
  attempts.push({
    mode: "windows",
    name: "PowerShell",
    go: () => run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `$ProgressPreference = 'SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri '${url}' -OutFile '${partial}'`]),
  });
  if (network.mode) attempts.sort((a, b) => Number(b.mode === network.mode) - Number(a.mode === network.mode));

  log(`download ${url}`);
  const failures = [];
  for (const attempt of attempts) {
    try {
      fs.rmSync(partial, { force: true });
      await attempt.go();
      if (!fs.existsSync(partial)) throw new Error("nothing was downloaded");
      fs.renameSync(partial, file);
      if (network.mode !== attempt.mode) {
        network.mode = attempt.mode;
        note(`downloads work with ${attempt.name}`);
      }
      log(`saved ${file} (${sizeText(fs.statSync(file).size)}) with ${attempt.name}`);
      return;
    } catch (error) {
      failures.push(`${attempt.name}: ${describeError(error)}`);
      log(`${attempt.name} failed: ${describeError(error)}`);
    }
  }
  fs.rmSync(partial, { force: true });
  throw new Error(`Could not download ${url}. This PC could not reach the server (${failures.join("; ")}).`);
}

async function getText(url) {
  const file = path.join(downloads, `page-${crypto.randomBytes(6).toString("hex")}.txt`);
  await download(url, file);
  try {
    return fs.readFileSync(file, "utf8");
  } finally {
    fs.rmSync(file, { force: true });
  }
}

/** Proxy settings for the programs started later, matching how the downloads got through. */
function proxyEnv(env) {
  if (network.mode !== "proxy" || !network.proxy) return env;
  return {
    ...env,
    HTTPS_PROXY: network.proxy.url,
    HTTP_PROXY: network.proxy.url,
    NO_PROXY: "localhost,127.0.0.1,::1",
  };
}

function httpProxy() {
  return network.mode === "proxy" && network.proxy && network.proxy.protocol.startsWith("http") ? network.proxy : null;
}

async function fileHash(file, algorithm) {
  const hash = crypto.createHash(algorithm);
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest("hex");
}

async function verify(file, algorithm, expected) {
  if (!expected) return;
  const actual = await fileHash(file, algorithm);
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    fs.rmSync(file, { force: true });
    throw new Error(`Checksum mismatch for ${path.basename(file)}; the download was removed, run the build again.`);
  }
  log(`${algorithm} ok: ${path.basename(file)}`);
}

/** Extracts a zip into `target`, which must end up holding the archive's single top folder. */
async function extractSingleFolder(zip, target) {
  const temp = `${target}.extract`;
  fs.rmSync(temp, { recursive: true, force: true });
  fs.mkdirSync(temp, { recursive: true });
  const tar = systemProgram("tar.exe");
  if (fs.existsSync(tar)) {
    await run(tar, ["-xf", zip, "-C", temp]);
  } else {
    await run("powershell.exe", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${temp}' -Force`]);
  }
  const entries = fs.readdirSync(temp);
  if (entries.length !== 1) throw new Error(`Unexpected contents in ${path.basename(zip)}: ${entries.join(", ")}`);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(path.join(temp, entries[0]), target);
  fs.rmSync(temp, { recursive: true, force: true });
}

// ---------------------------------------------------------------- tools

async function ensureNode() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 22) {
    note(`Node.js ${process.versions.node} (installed)`);
    return { npm: "npm.cmd", npx: "npx.cmd", folders: [] };
  }
  const npm = path.join(nodeHome, "npm.cmd");
  if (!fs.existsSync(npm)) {
    note(`Node.js ${process.versions.node} is too old for Capacitor 8; downloading Node.js 24`);
    const base = "https://nodejs.org/dist/latest-v24.x/";
    const zip = findNodeZip(await getText(`${base}SHASUMS256.txt`));
    if (!zip) throw new Error("Could not find the Node.js 24 download");
    const file = path.join(downloads, zip.name);
    if (!fs.existsSync(file)) await download(base + zip.name, file);
    await verify(file, "sha256", zip.sha256);
    await extractSingleFolder(file, nodeHome);
  }
  note(`Node.js from ${nodeHome}`);
  return { npm: quote(npm), npx: quote(path.join(nodeHome, "npx.cmd")), folders: [nodeHome] };
}

async function ensureJdk() {
  const java = path.join(jdkHome, "bin", "java.exe");
  if (!fs.existsSync(java)) {
    note("downloading a portable JDK 21");
    let file;
    try {
      const assets = JSON.parse(await getText("https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse"));
      const jdk = Array.isArray(assets) ? assets.find((asset) => asset?.binary?.package?.link?.endsWith(".zip"))?.binary?.package : null;
      if (!jdk) throw new Error("no Windows x64 zip in the Adoptium answer");
      file = path.join(downloads, jdk.name);
      if (!fs.existsSync(file)) await download(jdk.link, file);
      await verify(file, "sha256", jdk.checksum);
      note(`JDK: Eclipse Temurin (${jdk.name})`);
    } catch (error) {
      // Microsoft's build of OpenJDK 21 is the same JDK from another server.
      log(`Eclipse Temurin unavailable (${describeError(error)}); trying the Microsoft Build of OpenJDK 21`);
      file = path.join(downloads, "microsoft-jdk-21-windows-x64.zip");
      if (!fs.existsSync(file)) await download(MICROSOFT_JDK_21, file);
      const checksum = /\b([0-9a-fA-F]{64})\b/.exec(await getText(`${MICROSOFT_JDK_21}.sha256sum.txt`))?.[1];
      if (!checksum) throw new Error("No checksum for the Microsoft OpenJDK download");
      await verify(file, "sha256", checksum);
      note("JDK: Microsoft Build of OpenJDK 21");
    }
    await extractSingleFolder(file, jdkHome);
  }
  const { output } = await run(java, ["-version"], { capture: true });
  note(`JDK: ${output.split(/\r?\n/).find((line) => line.trim()) ?? "?"}`);
}

async function ensureSdk(env) {
  const sdkmanager = path.join(sdkRoot, "cmdline-tools", "latest", "bin", "sdkmanager.bat");
  if (!fs.existsSync(sdkmanager)) {
    note("downloading the Android SDK command-line tools");
    let archive = { url: COMMAND_LINE_TOOLS_FALLBACK, sha1: null };
    try {
      archive = findCommandLineTools(await getText("https://dl.google.com/android/repository/repository2-3.xml")) ?? archive;
    } catch (error) {
      log(`repository list unavailable (${error.message}); using ${COMMAND_LINE_TOOLS_FALLBACK}`);
    }
    const file = path.join(downloads, path.basename(new URL(archive.url).pathname));
    if (!fs.existsSync(file)) await download(archive.url, file);
    await verify(file, "sha1", archive.sha1);
    await extractSingleFolder(file, path.join(sdkRoot, "cmdline-tools", "latest"));
  }
  const installed = fs.existsSync(path.join(sdkRoot, "licenses", "android-sdk-license"))
    && SDK_PACKAGES.every((name) => fs.existsSync(path.join(sdkRoot, ...name.split(";"))));
  if (installed) {
    note(`Android SDK: ${sdkRoot}`);
    return;
  }
  const proxy = httpProxy();
  const proxyArgs = proxy ? ` --proxy=http --proxy_host=${proxy.host} --proxy_port=${proxy.port}` : "";
  const manager = `${quote(sdkmanager)} --sdk_root=${quote(sdkRoot)}${proxyArgs}`;
  note("accepting the Android SDK licenses");
  await run(`${manager} --licenses`, [], { shell: true, env, input: "y\n".repeat(80) });
  note(`installing ${SDK_PACKAGES.join(", ")}`);
  await run(`${manager} ${SDK_PACKAGES.map(quote).join(" ")}`, [], { shell: true, env, input: "y\n".repeat(20) });
}

// ---------------------------------------------------------------- signing

async function ensureSigning(env) {
  const keystore = path.join(signingDir, "calorie-compass-release.jks");
  const propertiesFile = path.join(signingDir, "keystore.properties");
  if (!fs.existsSync(keystore)) {
    if (fs.existsSync(propertiesFile)) {
      throw new Error(`${propertiesFile} exists but the keystore next to it is missing. Restore calorie-compass-release.jks from a backup: an APK signed with a new key cannot update the installed app.`);
    }
    note("creating the app signing key (once)");
    const password = crypto.randomBytes(24).toString("base64url");
    const temp = path.join(tools, "new-release-key.jks");
    fs.rmSync(temp, { force: true });
    fs.mkdirSync(tools, { recursive: true });
    // Generated in an ASCII path and moved afterwards: Java may misread non-ASCII command-line paths.
    await run(path.join(jdkHome, "bin", "keytool.exe"), [
      "-genkeypair", "-keystore", temp, "-storetype", "PKCS12",
      "-storepass:env", "CALORIE_COMPASS_KEY_PASSWORD", "-keypass:env", "CALORIE_COMPASS_KEY_PASSWORD",
      "-alias", KEY_ALIAS, "-keyalg", "RSA", "-keysize", "4096", "-validity", "36500",
      "-dname", "CN=Calorie Compass, O=SteveBohanMa, C=US",
    ], { env: { ...env, CALORIE_COMPASS_KEY_PASSWORD: password } });
    fs.mkdirSync(signingDir, { recursive: true });
    fs.copyFileSync(temp, keystore);
    fs.rmSync(temp, { force: true });
    fs.writeFileSync(propertiesFile, [
      "# Signing key of the Calorie Compass Android app (created by scripts/android/build-android.mjs).",
      "# Keep this folder and back it up. Never commit or share it.",
      `keyAlias=${KEY_ALIAS}`,
      `storePassword=${password}`,
      `keyPassword=${password}`,
      "",
    ].join("\n"), "utf8");
    fs.writeFileSync(path.join(signingDir, ".gitignore"), "*\n", "utf8");
    fs.writeFileSync(path.join(signingDir, "README.txt"), [
      "Signing key of the Calorie Compass (燃卡快查) Android app.",
      "",
      "Every update of the app must be signed with this key. Without it Android will not install a new",
      "version over the old one; the old app would have to be uninstalled, which deletes its data on the phone.",
      "",
      "- Keep calorie-compass-release.jks and keystore.properties together and back them up (e.g. a USB stick).",
      "- Never put them in the GitHub repository or send them to anyone.",
      "",
    ].join("\r\n"), "utf8");
  } else {
    note(`signing key: ${keystore}`);
  }

  const values = parseProperties(fs.readFileSync(propertiesFile, "utf8"));
  for (const key of ["keyAlias", "storePassword", "keyPassword"]) {
    if (!values[key]) throw new Error(`${propertiesFile} has no ${key}`);
  }
  // Gradle gets an ASCII-path copy (see the note at the top).
  const buildSigning = path.join(work, "signing");
  fs.mkdirSync(buildSigning, { recursive: true });
  const buildKeystore = path.join(buildSigning, "release.jks");
  fs.copyFileSync(keystore, buildKeystore);
  const buildProperties = path.join(buildSigning, "keystore.properties");
  fs.writeFileSync(buildProperties, [
    `storeFile=${buildKeystore.replace(/\\/g, "/")}`,
    `storePassword=${values.storePassword}`,
    `keyAlias=${values.keyAlias}`,
    `keyPassword=${values.keyPassword}`,
    "",
  ].join("\n"), "utf8");
  return buildProperties;
}

// ---------------------------------------------------------------- Android project

function robocopy(source, target) {
  return run("robocopy.exe", [source, target, "/MIR", "/XD", "build", ".gradle", ".idea", ".cxx", "/R:2", "/W:2", "/NFL", "/NDL", "/NJH", "/NJS", "/NP"], { allowFailure: true })
    .then((code) => {
      if (code >= 8) throw new Error(`Copying ${source} failed (robocopy ${code})`);
    });
}

async function copyToBuildFolder() {
  const androidDir = path.join(repo, "android");
  const settings = fs.readFileSync(path.join(androidDir, "capacitor.settings.gradle"), "utf8");
  const appBuild = path.join(androidDir, "app", "capacitor.build.gradle");
  const packages = capacitorPackages(settings, fs.existsSync(appBuild) ? fs.readFileSync(appBuild, "utf8") : "");
  if (!packages.includes("@capacitor/android")) throw new Error("android/capacitor.settings.gradle does not include @capacitor/android; run npx cap sync android");
  await robocopy(androidDir, path.join(work, "android"));
  for (const name of packages) {
    await robocopy(path.join(repo, "node_modules", ...name.split("/")), path.join(work, "node_modules", ...name.split("/")));
  }
  fs.writeFileSync(path.join(work, "android", "local.properties"), `sdk.dir=${propertiesPath(sdkRoot)}\n`, "utf8");
  note(`build folder: ${work} (with ${packages.join(", ")})`);
}

// ---------------------------------------------------------------- main

async function main() {
  fs.writeFileSync(logFile, `Calorie Compass Android build log, started ${new Date().toString()}\n`);
  if (process.platform !== "win32") throw new Error("This script builds on Windows.");
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"));
  const config = JSON.parse(fs.readFileSync(path.join(repo, "capacitor.config.json"), "utf8"));
  log(`version ${pkg.version}, app id ${config.appId}, Node.js ${process.versions.node}, repository ${repo}, tools ${tools}`);
  console.log(`Calorie Compass ${pkg.version} - Android build. Details: build-android.log`);

  step("Tools (downloaded the first time only)");
  await detectNetwork();
  const node = await ensureNode();
  await ensureJdk();
  await ensureSdk(withPath({ ...process.env, JAVA_HOME: jdkHome }, path.join(jdkHome, "bin")));
  // Built after the downloads, so npm, Playwright and Gradle connect the way the downloads did.
  const env = proxyEnv(withPath({ ...process.env, JAVA_HOME: jdkHome, ANDROID_HOME: sdkRoot, ANDROID_SDK_ROOT: sdkRoot }, ...node.folders, path.join(jdkHome, "bin")));
  const capacitorEnv = { ...env, CI: "1" }; // the Capacitor CLI asks no questions
  if (network.mode) note(`network: ${network.mode === "proxy" ? `through ${network.proxy.url}` : network.mode}`);

  step("npm install (adds Capacitor the first time)");
  await run(`${node.npm} config list`, [], { shell: true, env, allowFailure: true }); // registry and proxy, for the log
  await run(`${node.npm} install --no-audit --no-fund`, [], { shell: true, env });

  let testsFailed = false;
  if (skipTests) {
    step("Tests skipped (--skip-tests)");
  } else {
    step("npm test (data, runtime and app tests, including the phone-size checks)");
    await run(`${node.npx} playwright install chromium`, [], { shell: true, env });
    // A failing test does not stop the build, so its results and the APK can be looked at together;
    // the run still ends as failed.
    testsFailed = (await run(`${node.npm} test`, [], { shell: true, env, allowFailure: true })) !== 0;
    note(testsFailed ? "TESTS FAILED - see build-android.log; continuing so the APK can be checked too" : "all tests passed");
  }

  step("Web build (npm run build)");
  await run(`${node.npm} run build`, [], { shell: true, env });

  step("Capacitor Android project");
  if (!fs.existsSync(path.join(repo, "android", "app", "build.gradle"))) {
    if (fs.existsSync(path.join(repo, "android"))) throw new Error("android/ exists but has no app/build.gradle. Move it away and run again.");
    note("creating android/ (npx cap add android)");
    await run(`${node.npx} cap add android`, [], { shell: true, env: capacitorEnv });
  }
  await run(`node ${quote(path.join(repo, "scripts", "android", "customize-android.mjs"))} --print`, [], { shell: true, env });
  await run(`${node.npx} cap sync android`, [], { shell: true, env: capacitorEnv });

  step("Signing key");
  const signing = await ensureSigning(env);

  step("Gradle build of the APK (the first build downloads Gradle and the Android libraries)");
  await copyToBuildFolder();
  const gradleDir = path.join(work, "android");
  const proxy = httpProxy();
  const gradleProxy = proxy
    ? ["https", "http"].map((scheme) => ` -D${scheme}.proxyHost=${proxy.host} -D${scheme}.proxyPort=${proxy.port}`).join("") + ' "-Dhttp.nonProxyHosts=localhost|127.*|[::1]"'
    : "";
  await run(`${quote(path.join(gradleDir, "gradlew.bat"))} --no-daemon --console=plain${gradleProxy} assembleRelease`, [], {
    shell: true,
    cwd: gradleDir,
    env: { ...env, CALORIE_COMPASS_SIGNING: signing },
  });

  step("Checks");
  const apk = path.join(gradleDir, "app", "build", "outputs", "apk", "release", "app-release.apk");
  if (!fs.existsSync(apk)) throw new Error(`No signed APK at ${apk}`);
  const buildTools = newestVersion(fs.readdirSync(path.join(sdkRoot, "build-tools")));
  if (!buildTools) throw new Error("No Android build-tools installed");
  const toolsDir = path.join(sdkRoot, "build-tools", buildTools);
  await run(`${quote(path.join(toolsDir, "apksigner.bat"))} verify --verbose --print-certs ${quote(apk)}`, [], { shell: true, env });
  const { output } = await run(path.join(toolsDir, "aapt2.exe"), ["dump", "badging", apk], { capture: true, env });
  const badging = parseBadging(output);
  log(JSON.stringify(badging));
  const problems = [];
  if (badging.packageName !== config.appId) problems.push(`package ${badging.packageName}, expected ${config.appId}`);
  if (badging.versionName !== pkg.version) problems.push(`versionName ${badging.versionName}, expected ${pkg.version}`);
  if (Number(badging.versionCode) !== versionCodeFor(pkg.version)) problems.push(`versionCode ${badging.versionCode}`);
  if (!(Number(badging.minSdk) <= 34)) problems.push(`minSdk ${badging.minSdk} does not run on Android 14 (API 34)`);
  if (problems.length) throw new Error(`APK check failed: ${problems.join("; ")}`);
  note(`${badging.packageName} ${badging.versionName} (code ${badging.versionCode}), Android ${badging.minSdk}+ (API), target API ${badging.targetSdk}, name "${badging.label}"`);

  step("Release file");
  const [major, minor] = pkg.version.split(".");
  const outDir = path.join(repo, `release-v${major}.${minor}-android`);
  const outFile = path.join(outDir, `CalorieCompass-v${pkg.version}.apk`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(apk, outFile);
  const sha256 = (await fileHash(outFile, "sha256")).toUpperCase();
  const size = fs.statSync(outFile).size;
  fs.writeFileSync(path.join(outDir, "SHA256.txt"), `${sha256}  ${path.basename(outFile)}\r\n`, "utf8");
  log(`APK ${outFile}\nsize ${size} bytes (${sizeText(size)})\nSHA-256 ${sha256}`);
  note(`${path.relative(repo, outFile)} (${sizeText(size)})`);
  note(`SHA-256 ${sha256}`);
  log(`\n(step took ${Math.round((Date.now() - stepStarted) / 1000)} s)`);
  if (testsFailed) {
    log(`APK-BUILT-BUT-TESTS-FAILED in ${Math.round((Date.now() - started) / 1000)} s`);
    console.error("\nThe APK was built, but npm test reported failures (see build-android.log). Check them before installing.");
    process.exitCode = 2;
    return;
  }
  log(`ALL-DONE in ${Math.round((Date.now() - started) / 1000)} s`);
}

main().catch((error) => {
  try {
    log(`\nFAILED at step ${stepNumber}: ${error.stack ?? error}${error?.cause ? `\ncause: ${describeError(error.cause)}` : ""}`);
  } catch {
    // The log itself may be the problem; the console still shows the error.
  }
  console.error(`\nFAILED at step ${stepNumber}: ${describeError(error)}`);
  process.exitCode = 1;
});
