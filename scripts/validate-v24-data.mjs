import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const foods = JSON.parse(fs.readFileSync(path.join(root, "src", "foods.json"), "utf8"));
const nutrients = new Set(["protein", "carbohydrate", "fat", "fiber", "mixed"]);
const errors = [];
const ids = new Set();
const names = new Set();
const images = new Set();

if (foods.length < 100) errors.push(`Expected a substantially expanded catalog of at least 100 foods, received ${foods.length}`);

for (const food of foods) {
  if (!food.Id || ids.has(food.Id)) errors.push(`Duplicate or missing Id: ${food.Id}`);
  ids.add(food.Id);
  const nameKey = `${food.NameZh}|${food.NameEn}`.toLowerCase();
  if (!food.NameZh || !food.NameEn || names.has(nameKey)) errors.push(`Duplicate or missing name: ${nameKey}`);
  names.add(nameKey);
  if (!nutrients.has(food.PrimaryNutrient)) errors.push(`${food.Id}: invalid PrimaryNutrient`);
  if (!(food.KcalPer100G > 0 && food.KcalPer100G < 1000)) errors.push(`${food.Id}: invalid kcal`);
  for (const key of ["ProteinPer100G", "CarbohydratePer100G", "FatPer100G", "FiberPer100G"]) {
    if (!(Number.isFinite(food[key]) && food[key] >= 0 && food[key] <= 100)) errors.push(`${food.Id}: invalid ${key}`);
  }
  if (!food.Image) errors.push(`${food.Id}: image missing`);
  if (images.has(food.Image)) errors.push(`${food.Id}: image URL/file is reused`);
  images.add(food.Image);
  if (/^https?:\/\//i.test(food.Image)) errors.push(`${food.Id}: image must be local, received remote URL: ${food.Image}`);
  if (!/^https?:\/\//i.test(food.Image) && !fs.existsSync(path.join(root, "public", food.Image.replace(/^\//, "")))) {
    errors.push(`${food.Id}: local image does not exist: ${food.Image}`);
  }
}

const popular = foods.filter((food) => food.FatLossPopular);
if (popular.length < 50) errors.push(`Expected at least 50 fat-loss popular foods, received ${popular.length}`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const counts = Object.fromEntries([...nutrients].map((nutrient) => [nutrient, foods.filter((food) => food.PrimaryNutrient === nutrient).length]));
console.log(JSON.stringify({ total: foods.length, fatLossPopular: popular.length, primaryNutrients: counts, uniqueImages: images.size }, null, 2));
