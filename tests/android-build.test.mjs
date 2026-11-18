// Checks the pure parts of the Windows Android build (scripts/android/build-helpers.mjs).
// Run with: node --test tests/android-build.test.mjs (part of npm test).
import assert from "node:assert/strict";
import test from "node:test";
import {
  capacitorPackages,
  findCommandLineTools,
  findNodeZip,
  newestVersion,
  parseBadging,
  parseProperties,
  propertiesPath,
  versionCodeFor,
} from "../scripts/android/build-helpers.mjs";

test("finds the Windows command-line tools in the SDK repository list", () => {
  const xml = `<sdk:sdk-repository xmlns:sdk="http://schemas.android.com/sdk/android/repo/repository2/03">
    <remotePackage path="cmdline-tools;19.0"><archives><archive><complete><size>1</size><checksum type="sha1">${"0".repeat(40)}</checksum><url>old.zip</url></complete><host-os>windows</host-os></archive></archives></remotePackage>
    <remotePackage path="cmdline-tools;latest">
      <archives>
        <archive><complete><size>1</size><checksum type="sha1">${"a".repeat(40)}</checksum><url>commandlinetools-linux-1_latest.zip</url></complete><host-os>linux</host-os></archive>
        <archive><complete><size>1</size><checksum type="sha1">${"b".repeat(40)}</checksum><url>commandlinetools-win-1_latest.zip</url></complete><host-os>windows</host-os></archive>
      </archives>
    </remotePackage>
  </sdk:sdk-repository>`;
  assert.deepEqual(findCommandLineTools(xml), {
    url: "https://dl.google.com/android/repository/commandlinetools-win-1_latest.zip",
    sha1: "b".repeat(40),
  });
  assert.equal(findCommandLineTools("<sdk-repository/>"), null);
});

test("finds the Windows zip of Node.js", () => {
  const sums = `${"1".repeat(64)}  node-v24.11.0-linux-x64.tar.xz\n${"2".repeat(64)}  node-v24.11.0-win-x64.zip\n${"3".repeat(64)}  node-v24.11.0-win-arm64.zip\n`;
  assert.deepEqual(findNodeZip(sums), { name: "node-v24.11.0-win-x64.zip", sha256: "2".repeat(64) });
});

test("lists the npm packages the Capacitor Gradle files include", () => {
  const settings = `include ':capacitor-android'
project(':capacitor-android').projectDir = new File('../node_modules/@capacitor/android/capacitor')

include ':capacitor-app'
project(':capacitor-app').projectDir = new File('../node_modules/@capacitor/app/android')`;
  assert.deepEqual(capacitorPackages(settings, "", undefined), ["@capacitor/android", "@capacitor/app"]);
});

test("reads the fields of aapt2 dump badging", () => {
  const output = `package: name='io.github.stevebohanma.caloriecompass' versionCode='20900' versionName='2.9.0' platformBuildVersionName='16' compileSdkVersion='36'
minSdkVersion:'24'
targetSdkVersion:'36'
uses-permission: name='android.permission.INTERNET'
application-label:'燃卡快查'
application: label='燃卡快查' icon='res/mipmap-anydpi-v26/ic_launcher.xml'`;
  assert.deepEqual(parseBadging(output), {
    packageName: "io.github.stevebohanma.caloriecompass",
    versionCode: "20900",
    versionName: "2.9.0",
    minSdk: "24",
    targetSdk: "36",
    label: "燃卡快查",
  });
});

test("version helpers", () => {
  assert.equal(newestVersion(["35.0.0", "36.0.0", "9.0.0", "36.0.0-rc1", "notes"]), "36.0.0");
  assert.equal(newestVersion([]), null);
  assert.equal(versionCodeFor("2.9.0"), 20900);
  assert.equal(versionCodeFor("2.10.3"), 21003);
  assert.equal(versionCodeFor("2.9"), null);
});

test("properties files", () => {
  assert.equal(propertiesPath("C:\\Users\\x\\sdk"), "C\\:\\\\Users\\\\x\\\\sdk");
  assert.deepEqual(parseProperties("# comment\r\nkeyAlias=calorie-compass\r\nstorePassword = abc_-123\n\nbroken line\n"), {
    keyAlias: "calorie-compass",
    storePassword: "abc_-123",
  });
});

test("reads the Windows proxy settings", async () => {
  const { parseProxy, proxyFromRegistry } = await import("../scripts/android/build-helpers.mjs");
  const on = `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyEnable    REG_DWORD    0x1
    ProxyServer    REG_SZ    127.0.0.1:7897
    ProxyOverride    REG_SZ    localhost;127.*;<local>
`;
  assert.deepEqual(proxyFromRegistry(on), { url: "http://127.0.0.1:7897", host: "127.0.0.1", port: 7897, protocol: "http", source: "Windows proxy settings" });
  assert.equal(proxyFromRegistry(on.replace("0x1", "0x0")), null);
  assert.equal(proxyFromRegistry("    ProxyEnable    REG_DWORD    0x1\n"), null);
  assert.equal(proxyFromRegistry(on.replace("127.0.0.1:7897", "http=10.0.0.1:8080;https=10.0.0.1:8443;socks=10.0.0.1:1080")).url, "http://10.0.0.1:8443");
  assert.equal(proxyFromRegistry(on.replace("127.0.0.1:7897", "socks=127.0.0.1:7890")).url, "socks5h://127.0.0.1:7890");
  assert.equal(parseProxy("http://proxy.example:3128", "environment").port, 3128);
  assert.equal(parseProxy("", "environment"), null);
  assert.equal(parseProxy("ftp://x:1", "environment"), null);
});
