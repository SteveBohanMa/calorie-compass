// Pure helpers for build-android.mjs (no file system, network or processes), tested by
// tests/android-build.test.mjs.

/** The Windows archive of "cmdline-tools;latest" in Google's Android SDK repository XML. */
export function findCommandLineTools(xml) {
  const block = /<remotePackage\b[^>]*\bpath="cmdline-tools;latest"[^>]*>([\s\S]*?)<\/remotePackage>/.exec(xml);
  if (!block) return null;
  for (const archive of block[1].matchAll(/<archive>([\s\S]*?)<\/archive>/g)) {
    if (!/<host-os>\s*windows\s*<\/host-os>/.test(archive[1])) continue;
    const url = /<url>\s*([^<\s]+)\s*<\/url>/.exec(archive[1])?.[1];
    const sha1 = /<checksum\b[^>]*>\s*([0-9a-fA-F]{40})\s*<\/checksum>/.exec(archive[1])?.[1] ?? null;
    if (url) return { url: new URL(url, "https://dl.google.com/android/repository/").href, sha1 };
  }
  return null;
}

/** The win-x64 zip in a Node.js SHASUMS256.txt: { name, sha256 }. */
export function findNodeZip(shasums) {
  const match = /^([0-9a-f]{64})\s+(node-v\d+\.\d+\.\d+-win-x64\.zip)$/m.exec(shasums);
  return match ? { name: match[2], sha256: match[1] } : null;
}

/** npm packages whose Android code the Capacitor Gradle files include (../node_modules/<package>/...). */
export function capacitorPackages(...gradleFiles) {
  const packages = new Set();
  for (const text of gradleFiles) {
    for (const match of String(text ?? "").matchAll(/node_modules\/((?:@[^/'"\s]+\/)?[^/'"\s]+)\//g)) packages.add(match[1]);
  }
  return [...packages].sort();
}

/** The fields of `aapt2 dump badging` this build checks. */
export function parseBadging(output) {
  const field = (pattern) => pattern.exec(output)?.[1] ?? null;
  return {
    packageName: field(/^package: name='([^']*)'/m),
    versionCode: field(/\bversionCode='([^']*)'/),
    versionName: field(/\bversionName='([^']*)'/),
    minSdk: field(/^(?:minSdkVersion|sdkVersion):'(\d+)'/m),
    targetSdk: field(/^targetSdkVersion:'(\d+)'/m),
    label: field(/^application-label:'([^']*)'/m),
  };
}

/** Highest version folder name, e.g. among the SDK's build-tools. */
export function newestVersion(names) {
  const parse = (name) => name.split(/[.-]/).map((part) => (/^\d+$/.test(part) ? Number(part) : -1));
  return [...names]
    .filter((name) => /^\d+(\.\d+)*$/.test(name))
    .sort((a, b) => {
      const left = parse(a);
      const right = parse(b);
      for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        const difference = (left[index] ?? 0) - (right[index] ?? 0);
        if (difference) return difference;
      }
      return 0;
    })
    .at(-1) ?? null;
}

/** "C:\\Users\\x" -> "C\\:\\\\Users\\\\x", the escaping local.properties needs for sdk.dir. */
export function propertiesPath(value) {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
}

/** Reads key=value lines of a .properties file (no escapes or continuations; what this build writes). */
export function parseProperties(text) {
  const values = {};
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) continue;
    const separator = trimmed.search(/[=:]/);
    if (separator <= 0) continue;
    values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return values;
}

/** versionCode used for package.json version x.y.z (same formula as customize-android.mjs). */
export function versionCodeFor(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;
  const [major, minor, patch] = match.slice(1).map(Number);
  return major * 10000 + minor * 100 + patch;
}

/** A proxy address such as "127.0.0.1:7897" or "http://host:8080" as { url, host, port, protocol }. */
export function parseProxy(value, source) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`);
  } catch {
    return null;
  }
  const protocol = url.protocol.replace(/:$/, "").toLowerCase();
  if (!url.hostname || !["http", "https", "socks5", "socks5h", "socks"].includes(protocol)) return null;
  const port = Number(url.port || (protocol === "https" ? 443 : protocol.startsWith("socks") ? 1080 : 80));
  return { url: `${protocol}://${url.hostname}:${port}`, host: url.hostname, port, protocol, source };
}

/** The proxy of the Windows "Internet Settings" (what browsers use), from `reg query` output; null when off. */
export function proxyFromRegistry(output) {
  const value = (name) => new RegExp(`^\\s*${name}\\s+REG_\\w+\\s+(.*?)\\s*$`, "m").exec(String(output ?? ""))?.[1] ?? null;
  if (!/^0x0*1$/i.test(value("ProxyEnable") ?? "")) return null;
  const server = value("ProxyServer");
  if (!server) return null;
  if (!server.includes("=")) return parseProxy(server, "Windows proxy settings");
  const parts = {};
  for (const part of server.split(";")) {
    const [key, address] = part.split("=").map((item) => item.trim());
    if (key && address) parts[key.toLowerCase()] = address;
  }
  if (parts.https) return parseProxy(parts.https, "Windows proxy settings");
  if (parts.http) return parseProxy(parts.http, "Windows proxy settings");
  if (parts.socks) return parseProxy(`socks5h://${parts.socks}`, "Windows proxy settings");
  return null;
}
