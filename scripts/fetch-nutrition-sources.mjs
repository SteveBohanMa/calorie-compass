// Downloads the public nutrition source files used to rebuild the food catalog (data rebuild, phase 1).
// Windows: double-click fetch-nutrition-sources.cmd. Otherwise: node scripts/fetch-nutrition-sources.mjs [--force]
// Raw files go to data-sources/raw/ (git-ignored). data-sources/manifest.json records each file's URL, size,
// SHA-256 and download date, so every number in the catalog can be traced back to an exact file.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const root = path.resolve(import.meta.dirname, "..");
const rawDir = path.join(root, "data-sources", "raw");
const manifestPath = path.join(root, "data-sources", "manifest.json");
const force = process.argv.includes("--force");

const SOURCES = [
  {
    id: "usda-sr-legacy",
    file: "FoodData_Central_sr_legacy_food_csv_2018-04.zip",
    url: "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip",
    title: "USDA FoodData Central - SR Legacy (April 2018), CSV",
    license: "Public domain (CC0 1.0)",
  },
  {
    id: "usda-foundation",
    file: "FoodData_Central_foundation_food_csv_2026-04-30.zip",
    url: "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2026-04-30.zip",
    title: "USDA FoodData Central - Foundation Foods (2026-04-30), CSV",
    license: "Public domain (CC0 1.0)",
  },
  {
    id: "mext-2023-ch2",
    file: "mext_standard_tables_2023_ch2.xlsx",
    url: "https://www.mext.go.jp/content/20260327-mxt_kagsei-mext-000029402_02.xlsx",
    title: "日本食品標準成分表（八訂）増補2023年 第2章（データ）",
    license: "文部科学省：食品成分データは自由に利用可。出典「日本食品標準成分表（八訂）増補2023年から引用」",
  },
  {
    id: "mext-2023-errata",
    file: "mext_standard_tables_2023_errata.xlsx",
    url: "https://www.mext.go.jp/content/20260327-mxt_kagsei-mext-000029402_16.xlsx",
    title: "日本食品標準成分表（八訂）増補2023年 正誤表（データ）",
    license: "同上 / same as above",
  },
];

async function sha256(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function looksLikeZip(file) {
  // .zip and .xlsx both start with "PK". An HTML error page would not.
  const fd = fs.openSync(file, "r");
  const head = Buffer.alloc(2);
  fs.readSync(fd, head, 0, 2, 0);
  fs.closeSync(fd);
  return head.toString("latin1") === "PK";
}

async function download(source, target) {
  const partial = `${target}.part`;
  const response = await fetch(source.url, {
    redirect: "follow",
    headers: { "User-Agent": "CalorieCompass-data-fetch/1.0 (personal nutrition app)" },
  });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial));
  if (!looksLikeZip(partial)) {
    fs.rmSync(partial, { force: true });
    throw new Error("downloaded file is not a zip/xlsx (the server probably returned an error page)");
  }
  fs.rmSync(target, { force: true });
  fs.renameSync(partial, target);
}

fs.mkdirSync(rawDir, { recursive: true });
const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : { note: "Raw nutrition source files. The files themselves are git-ignored; this manifest is committed.", sources: {} };
manifest.sources ??= {};

let failed = 0;
for (const [index, source] of SOURCES.entries()) {
  const target = path.join(rawDir, source.file);
  const label = `[${index + 1}/${SOURCES.length}] ${source.id}`;
  try {
    if (fs.existsSync(target) && !force) {
      console.log(`${label}: 已存在，跳过下载（加 --force 可重新下载）`);
    } else {
      console.log(`${label}: 下载中 ${source.url}`);
      await download(source, target);
    }
    if (!looksLikeZip(target)) throw new Error("existing file is not a zip/xlsx; rerun with --force");
    const bytes = fs.statSync(target).size;
    const digest = await sha256(target);
    const previous = manifest.sources[source.id];
    manifest.sources[source.id] = {
      title: source.title,
      url: source.url,
      file: `data-sources/raw/${source.file}`,
      license: source.license,
      bytes,
      sha256: digest,
      downloadedAt: previous && previous.sha256 === digest ? previous.downloadedAt : new Date().toISOString(),
    };
    console.log(`${label}: OK  ${(bytes / 1024 / 1024).toFixed(1)} MB  sha256 ${digest.slice(0, 16)}...`);
  } catch (error) {
    failed += 1;
    console.error(`${label}: 失败 / FAILED - ${error.message}`);
  }
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
if (failed) {
  console.error(`${failed} 个文件下载失败 / ${failed} download(s) failed`);
  process.exit(1);
}
console.log("ALL-DONE");
