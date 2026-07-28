import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const foodsPath = path.join(root, "src", "foods.json");
const outputDirectory = path.join(root, "public", "assets", "food", "catalog");
const reportPath = path.join(root, "verification-v25-images", "openverse-curation.json");
const attributionPath = path.join(root, "public", "assets", "food", "ATTRIBUTION-V2.5.md");

const preparationWords = new Set([
  "baked", "beverage", "blanched", "boiled", "braised", "broth", "cold", "cooked", "deep", "dressed", "fried", "fresh", "frozen", "grilled", "low", "microwaved", "original", "pan", "poached", "porridge", "raw", "ready", "roasted", "salad", "seared", "simmered", "soup", "steamed", "stir", "to", "unsweetened",
]);
const ignoredWords = new Set(["and", "food", "meat", "plain", "with", "without"]);

function words(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

function baseQuery(food) {
  const base = words(food.NameEn).filter((word) => !preparationWords.has(word) && !ignoredWords.has(word));
  return base.join(" ") || food.NameEn;
}

async function search(query) {
  const params = new URLSearchParams({
    q: query,
    page_size: "20",
    license: "cc0,pdm,by,by-sa",
  });
  const response = await fetch(`https://api.openverse.org/v1/images/?${params}`, {
    headers: { "User-Agent": "CalorieCompass/2.5 offline food image curator" },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Openverse search ${response.status}`);
  const payload = await response.json();
  return payload.results ?? [];
}

function score(candidate, query) {
  const title = words(candidate.title ?? "");
  const queryWords = words(query).filter((word) => !ignoredWords.has(word));
  if (!queryWords.length) return 0;
  const matches = queryWords.filter((word) => title.includes(word)).length;
  const phrase = title.join(" ").includes(queryWords.join(" "));
  const photoBonus = candidate.height >= 300 && candidate.width >= 300 ? 5 : 0;
  return matches / queryWords.length * 100 + (phrase ? 40 : 0) + photoBonus;
}

async function choose(food, usedIds) {
  const exactQuery = food.NameEn;
  const exactResults = await search(exactQuery);
  const exactRanked = exactResults
    .filter((item) => item.thumbnail && !usedIds.has(item.id))
    .map((item) => ({ item, score: score(item, exactQuery) }))
    .sort((a, b) => b.score - a.score);
  if (exactRanked[0]?.score >= 70) return { ...exactRanked[0], confidence: "exact", query: exactQuery };

  const base = baseQuery(food);
  const fallbackQuery = `${base} food`;
  const fallbackResults = base.toLowerCase() === exactQuery.toLowerCase() ? exactResults : await search(fallbackQuery);
  const fallbackRanked = fallbackResults
    .filter((item) => item.thumbnail && !usedIds.has(item.id))
    .map((item) => ({ item, score: score(item, base) }))
    .sort((a, b) => b.score - a.score);
  if (fallbackRanked[0]?.score >= 65) return { ...fallbackRanked[0], confidence: "base", query: fallbackQuery };
  return null;
}

async function download(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "CalorieCompass/2.5 offline food image curator" },
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Image download ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) throw new Error(`Unexpected content type ${contentType}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 4_000) throw new Error(`Image too small (${bytes.length} bytes)`);
  const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  return { bytes, extension };
}

await fs.mkdir(outputDirectory, { recursive: true });
await fs.mkdir(path.dirname(reportPath), { recursive: true });
const foods = JSON.parse(await fs.readFile(foodsPath, "utf8"));
const report = [];
const attributions = [];
const usedIds = new Set();

let cursor = 0;
let completed = 0;
async function worker() {
  while (cursor < foods.length) {
    const food = foods[cursor];
    cursor += 1;
    try {
      const choice = await choose(food, usedIds);
      if (!choice) {
        report.push({ id: food.Id, name: food.NameEn, status: "no-match" });
      } else {
        const image = await download(choice.item.thumbnail);
        const filename = `${food.Id}.${image.extension}`;
        await fs.writeFile(path.join(outputDirectory, filename), image.bytes);
        food.Image = `/assets/food/catalog/${filename}`;
        usedIds.add(choice.item.id);
        report.push({ id: food.Id, name: food.NameEn, status: "curated", confidence: choice.confidence, query: choice.query, title: choice.item.title, score: Math.round(choice.score), source: choice.item.foreign_landing_url });
        attributions.push({ filename, name: food.NameEn, title: choice.item.title, creator: choice.item.creator || "Unknown creator", license: String(choice.item.license || "").toUpperCase(), licenseVersion: choice.item.license_version || "", source: choice.item.foreign_landing_url });
      }
    } catch (error) {
      report.push({ id: food.Id, name: food.NameEn, status: "error", error: String(error) });
    }
    completed += 1;
    if (completed % 20 === 0 || completed === foods.length) console.log(`Curated ${completed}/${foods.length}`);
  }
}

await Promise.all(Array.from({ length: 6 }, worker));

await fs.writeFile(foodsPath, `${JSON.stringify(foods, null, 2)}\n`);
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
const attribution = [
  "# Food image attribution — v2.5",
  "",
  "The following fixed local food photos were selected through Openverse from Creative Commons and public-domain sources.",
  "",
  ...attributions.map((item) => `- \`${item.filename}\` — ${item.name}; ${item.title}; ${item.creator}; ${item.license}${item.licenseVersion ? ` ${item.licenseVersion}` : ""}; ${item.source}`),
  "",
  "The custom-dish.png image was generated for this application with OpenAI image generation.",
  "",
].join("\n");
await fs.writeFile(attributionPath, attribution);
console.log(JSON.stringify({ total: foods.length, curated: report.filter((item) => item.status === "curated").length, exact: report.filter((item) => item.confidence === "exact").length, base: report.filter((item) => item.confidence === "base").length, unresolved: report.filter((item) => item.status !== "curated").length }, null, 2));
