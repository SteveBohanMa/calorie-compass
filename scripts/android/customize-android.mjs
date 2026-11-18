#!/usr/bin/env node
// Applies the Calorie Compass settings to the Capacitor Android project in android/ (created once by
// `npx cap add android`). Safe to run any number of times; build-android.ps1 runs it before every build.
//
//  - version from package.json and release signing (android/app/calorie-compass.gradle)
//  - MainActivity, the file-export plugin and the Health Connect plugin (templates in scripts/android/native/)
//  - launcher icon, start screen, colors and the Health Connect privacy text (scripts/android/res/, copied over android's res/)
//  - theme: status and navigation bars in the app's background color with dark icons; no dark theme
//  - main activity: portrait, resizes above the keyboard
//  - Health Connect (v2.10): the health permissions the app may ask for and the privacy page Android 14
//    requires before it grants any of them
//
// Edit the templates and this script, not the generated copies in android/.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");
const templates = path.join(root, "scripts", "android");
const app = path.join(root, "android", "app");
const main = path.join(app, "src", "main");
const changes = [];

function fail(message) {
  console.error(`customize-android: ${message}`);
  process.exit(1);
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function writeIfChanged(file, text, label) {
  if (fs.existsSync(file) && read(file) === text) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
  changes.push(`${label}: ${path.relative(root, file)}`);
}

function update(file, transform, label) {
  if (!fs.existsSync(file)) fail(`missing ${path.relative(root, file)}`);
  writeIfChanged(file, transform(read(file)), label);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (!fs.existsSync(path.join(app, "build.gradle"))) {
  fail("android/app/build.gradle is missing. Create the project first: npx cap add android");
}

const pkg = JSON.parse(read(path.join(root, "package.json")));
const config = JSON.parse(read(path.join(root, "capacitor.config.json")));
const appId = String(config.appId ?? "");
const appName = String(config.appName ?? "");
if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(appId)) fail(`unexpected appId "${appId}" in capacitor.config.json`);
if (!appName || /[<>&]/.test(appName)) fail(`unexpected appName "${appName}" in capacitor.config.json`);

// ---------------------------------------------------------------- version and signing

const version = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version ?? "");
if (!version) fail(`package.json version "${pkg.version}" is not x.y.z`);
const [major, minor, patch] = version.slice(1).map(Number);
if (minor > 99 || patch > 99) fail("versionCode = major * 10000 + minor * 100 + patch needs minor and patch below 100");
const versionCode = major * 10000 + minor * 100 + patch;

writeIfChanged(path.join(app, "calorie-compass.gradle"), `// Calorie Compass build settings, applied at the end of app/build.gradle.
// Written by scripts/android/customize-android.mjs from package.json; edit that script, not this file.
android {
    defaultConfig {
        versionCode = ${versionCode}
        versionName = "${pkg.version}"
    }
    lint {
        // Lint is not part of this project's checks (npm test is); keep release builds independent of it.
        checkReleaseBuilds = false
        abortOnError = false
    }
}

// Release signing. scripts/android/build-android.ps1 points CALORIE_COMPASS_SIGNING at a UTF-8
// properties file (storeFile, storePassword, keyAlias, keyPassword) kept outside the repository.
// Every update must be signed with the same key, or Android refuses to install it over the old app.
def calorieCompassSigning = System.getenv("CALORIE_COMPASS_SIGNING")
if (calorieCompassSigning) {
    def signing = new Properties()
    new File(calorieCompassSigning).withReader("UTF-8") { signing.load(it) }
    android {
        signingConfigs {
            calorieCompass {
                storeFile = new File(signing.getProperty("storeFile"))
                storePassword = signing.getProperty("storePassword")
                keyAlias = signing.getProperty("keyAlias")
                keyPassword = signing.getProperty("keyPassword")
            }
        }
        buildTypes {
            release {
                signingConfig = signingConfigs.calorieCompass
            }
        }
    }
}
`, "version and signing");

update(path.join(app, "build.gradle"), (text) => text.includes("apply from: 'calorie-compass.gradle'")
  ? text
  : `${text.trimEnd()}\n\n// Calorie Compass: version from package.json and release signing (scripts/android/customize-android.mjs)\napply from: 'calorie-compass.gradle'\n`,
"build settings");

// ---------------------------------------------------------------- native code

const javaDir = path.join(main, "java", ...appId.split("."));
if (!fs.existsSync(javaDir)) fail(`missing ${path.relative(root, javaDir)}; does capacitor.config.json's appId match the android project?`);
for (const name of ["MainActivity.java", "CalorieCompassFilesPlugin.java", "CalorieCompassHealthPlugin.java", "HealthConnectAccess.java", "HealthPrivacyActivity.java"]) {
  const text = read(path.join(templates, "native", name)).replaceAll("__PACKAGE__", appId);
  writeIfChanged(path.join(javaDir, name), text, "native code");
}
const kotlinActivity = path.join(javaDir, "MainActivity.kt");
if (fs.existsSync(kotlinActivity)) {
  fs.rmSync(kotlinActivity);
  changes.push(`removed the template's ${path.relative(root, kotlinActivity)} (replaced by MainActivity.java)`);
}

// ---------------------------------------------------------------- resources

function copyTree(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyTree(source, target);
      continue;
    }
    const bytes = fs.readFileSync(source);
    if (fs.existsSync(target) && Buffer.compare(fs.readFileSync(target), bytes) === 0) continue;
    fs.mkdirSync(to, { recursive: true });
    fs.writeFileSync(target, bytes);
    changes.push(`resource: ${path.relative(root, target)}`);
  }
}
copyTree(path.join(templates, "res"), path.join(main, "res"));

update(path.join(main, "res", "values", "strings.xml"), (text) => {
  let out = text;
  for (const key of ["app_name", "title_activity_main"]) {
    const pattern = new RegExp(`(<string\\s+name="${key}"\\s*>)[^<]*(</string>)`);
    if (!pattern.test(out)) fail(`strings.xml has no ${key}`);
    out = out.replace(pattern, `$1${appName}$2`);
  }
  return out;
}, "app name");

// ---------------------------------------------------------------- theme

const MARK_START = "<!-- calorie-compass:start -->";
const MARK_END = "<!-- calorie-compass:end -->";
const BAR_ITEMS = [
  ["android:statusBarColor", "@color/cc_mint_50"],
  ["android:navigationBarColor", "@color/cc_mint_50"],
  ["android:windowLightStatusBar", "true"],
  ["android:windowLightNavigationBar", "true", "27"],
];

function itemLines(items, indent) {
  return items.map(([name, value, api]) => `${indent}<item name="${name}"${api ? ` tools:targetApi="${api}"` : ""}>${value}</item>`);
}

/** Rewrites one <style>: optional new parent, own items between markers, same-named template items removed. */
function editStyle(text, name, { parent, items }) {
  const pattern = new RegExp(`(<style\\b(?=[^>]*\\bname="${escapeRegExp(name)}")[^>]*>)([\\s\\S]*?)(</style>)`);
  const found = pattern.exec(text);
  if (!found || /\/>$/.test(found[1])) fail(`styles.xml has no editable style "${name}":\n${text}`);
  let [, open, body, close] = found;
  if (parent) {
    open = /\bparent="[^"]*"/.test(open) ? open.replace(/\bparent="[^"]*"/, `parent="${parent}"`) : open.replace(/>$/, ` parent="${parent}">`);
  }
  body = body.replace(new RegExp(`\\s*${escapeRegExp(MARK_START)}[\\s\\S]*?${escapeRegExp(MARK_END)}`), "");
  for (const [item] of items) {
    body = body.replace(new RegExp(`\\s*<item\\s+name="${escapeRegExp(item)}"[^>]*>[^<]*</item>`, "g"), "");
  }
  const indent = /\n([ \t]+)<item/.exec(body)?.[1] ?? "        ";
  const block = [`${indent}${MARK_START}`, ...itemLines(items, indent), `${indent}${MARK_END}`].join("\n");
  const closeIndent = /\n([ \t]*)$/.exec(body)?.[1] ?? "    ";
  body = `${body.replace(/\s*$/, "")}\n${block}\n${closeIndent}`;
  return text.slice(0, found.index) + open + body + close + text.slice(found.index + found[0].length);
}

update(path.join(main, "res", "values", "styles.xml"), (text) => {
  let out = text;
  if (!/<resources\b[^>]*xmlns:tools=/.test(out)) {
    if (!/<resources\b/.test(out)) fail(`styles.xml has no <resources>:\n${text}`);
    out = out.replace(/<resources\b/, '<resources xmlns:tools="http://schemas.android.com/tools"');
  }
  // The app has no dark design: a light parent keeps the WebView and system bars light in dark mode.
  out = editStyle(out, "AppTheme.NoActionBar", {
    parent: "Theme.AppCompat.Light.NoActionBar",
    items: [
      ...BAR_ITEMS,
      ["android:windowBackground", "@color/cc_mint_50"],
      ["android:forceDarkAllowed", "false", "29"],
    ],
  });
  const launch = /<style\b(?=[^>]*\bname="AppTheme\.NoActionBarLaunch")[^>]*>/.exec(out);
  if (!launch) fail(`styles.xml has no style "AppTheme.NoActionBarLaunch":\n${text}`);
  const splashParent = /parent="[^"]*SplashScreen[^"]*"/.test(launch[0]);
  out = editStyle(out, "AppTheme.NoActionBarLaunch", {
    items: [
      // Shown until the app's first screen is drawn: app background color with the brand mark.
      ["android:background", "@drawable/cc_launch_background"],
      ...(splashParent ? [["windowSplashScreenBackground", "@color/cc_mint_50"]] : []),
      ...BAR_ITEMS,
    ],
  });
  return out;
}, "theme");

// ---------------------------------------------------------------- manifest

update(path.join(main, "AndroidManifest.xml"), (text) => {
  const activity = /<activity\b(?=[^>]*android:name="\.MainActivity")[^>]*>/.exec(text);
  if (!activity) fail(`AndroidManifest.xml has no .MainActivity:\n${text}`);
  let tag = activity[0];
  for (const [name, value] of [["android:windowSoftInputMode", "adjustResize"], ["android:screenOrientation", "portrait"]]) {
    const pattern = new RegExp(`${name}="[^"]*"`);
    tag = pattern.test(tag) ? tag.replace(pattern, `${name}="${value}"`) : tag.replace(/^<activity\b/, `<activity\n            ${name}="${value}"`);
  }
  return text.slice(0, activity.index) + tag + text.slice(activity.index + activity[0].length);
}, "main activity");

// Health Connect (v2.10). The app asks for these only when the user turns a feature on (src/health/).
// Android 14 grants health permissions only to apps that handle VIEW_PERMISSION_USAGE with the
// HEALTH_PERMISSIONS category; the alias is protected so only the system can open it.
const HEALTH_PERMISSIONS = [
  "android.permission.health.READ_HEART_RATE",
  "android.permission.health.READ_EXERCISE",
  "android.permission.health.READ_WEIGHT",
  "android.permission.health.READ_RESTING_HEART_RATE",
  "android.permission.health.WRITE_EXERCISE",
  "android.permission.health.WRITE_ACTIVE_CALORIES_BURNED",
];
const HEALTH_START = "<!-- calorie-compass:health:start -->";
const HEALTH_END = "<!-- calorie-compass:health:end -->";

update(path.join(main, "AndroidManifest.xml"), (text) => {
  let out = text.replace(new RegExp(`[ \\t]*${escapeRegExp(HEALTH_START)}[\\s\\S]*?${escapeRegExp(HEALTH_END)}\\n?`, "g"), "");
  if (!/<\/application>/.test(out) || !/<\/manifest>/.test(out)) fail(`AndroidManifest.xml has no </application> or </manifest>:\n${text}`);
  const activities = [
    `        ${HEALTH_START}`,
    "        <activity",
    "            android:name=\".HealthPrivacyActivity\"",
    "            android:exported=\"false\"",
    "            android:label=\"@string/cc_health_privacy_title\"",
    "            android:theme=\"@android:style/Theme.DeviceDefault.Light.NoActionBar\" />",
    "        <activity-alias",
    "            android:name=\".HealthPermissionUsageActivity\"",
    "            android:exported=\"true\"",
    "            android:permission=\"android.permission.START_VIEW_PERMISSION_USAGE\"",
    "            android:targetActivity=\".HealthPrivacyActivity\">",
    "            <intent-filter>",
    "                <action android:name=\"android.intent.action.VIEW_PERMISSION_USAGE\" />",
    "                <category android:name=\"android.intent.category.HEALTH_PERMISSIONS\" />",
    "            </intent-filter>",
    "        </activity-alias>",
    `        ${HEALTH_END}`,
    "",
  ].join("\n");
  const permissions = [
    `    ${HEALTH_START}`,
    ...HEALTH_PERMISSIONS.map((name) => `    <uses-permission android:name="${name}" />`),
    `    ${HEALTH_END}`,
    "",
  ].join("\n");
  out = out.replace(/([ \t]*)<\/application>/, (match) => `${activities}${match}`);
  out = out.replace(/<\/manifest>/, (match) => `${permissions}${match}`);
  return out;
}, "Health Connect");

// ---------------------------------------------------------------- report

console.log(`Android project: ${appId}, "${appName}", version ${pkg.version} (code ${versionCode})`);
console.log(changes.length ? `Changed:\n  ${changes.join("\n  ")}` : "Already up to date.");
if (process.argv.includes("--print")) {
  for (const file of [
    path.join(root, "android", "variables.gradle"),
    path.join(app, "build.gradle"),
    path.join(main, "AndroidManifest.xml"),
    path.join(main, "res", "values", "styles.xml"),
    path.join(main, "res", "values", "strings.xml"),
  ]) {
    if (fs.existsSync(file)) console.log(`\n----- ${path.relative(root, file)} -----\n${read(file)}`);
  }
}
