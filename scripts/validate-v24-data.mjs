// Food catalog checks. Run with `npm run test:data`.
// Structure checks apply to every record. Records marked DataStatus "placeholder" carry category
// defaults, and "pending" records wait for a source; the app never shows either.
// Visible records must be fully sourced (v2.7): grade A/B/C, all four nutrients, a traceable source.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const foods = JSON.parse(fs.readFileSync(path.join(root, "src", "foods.json"), "utf8"));
const nutrients = new Set(["protein", "carbohydrate", "fat", "fiber", "mixed"]);
const macroKeys = ["ProteinPer100G", "CarbohydratePer100G", "FatPer100G", "FiberPer100G"];
const hiddenStatuses = new Set(["placeholder", "pending"]);
const grades = new Set(["A", "B", "C"]);
// Every visible number must point at a source table or say it is a recipe estimate built from them.
const traceableSource = /^(?:USDA FoodData Central|日本食品标准成分表|配方估算)/;
const errors = [];
const ids = new Set();
const names = new Set();
const images = new Set();

for (const food of foods) {
  if (!food.Id || ids.has(food.Id)) errors.push(`Duplicate or missing Id: ${food.Id}`);
  ids.add(food.Id);
  const nameKey = `${food.NameZh}|${food.NameEn}`.toLowerCase();
  if (!food.NameZh || !food.NameEn || names.has(nameKey)) errors.push(`Duplicate or missing name: ${nameKey}`);
  names.add(nameKey);
  if (!nutrients.has(food.PrimaryNutrient)) errors.push(`${food.Id}: invalid PrimaryNutrient`);
  if (!(food.KcalPer100G > 0 && food.KcalPer100G < 1000)) errors.push(`${food.Id}: invalid kcal`);
  if (!(food.ServingWeightG > 0)) errors.push(`${food.Id}: invalid serving weight`);
  if (Math.abs(food.KcalPer100G * food.ServingWeightG / 100 - food.KcalPerServing) > 3) {
    errors.push(`${food.Id}: KcalPerServing does not match KcalPer100G × ServingWeightG`);
  }
  if (food.DataStatus !== undefined && !hiddenStatuses.has(food.DataStatus)) errors.push(`${food.Id}: unknown DataStatus ${food.DataStatus}`);
  if ((food.NoteZh === undefined) !== (food.NoteEn === undefined)) errors.push(`${food.Id}: NoteZh and NoteEn must both be present or both absent`);
  if (!hiddenStatuses.has(food.DataStatus)) {
    if (!grades.has(food.ConfidenceGrade)) errors.push(`${food.Id}: visible records need grade A, B or C (got ${food.ConfidenceGrade})`);
    if (!traceableSource.test(food.Source || "")) errors.push(`${food.Id}: visible records need a traceable source (got "${food.Source}")`);
    if (macroKeys.some((key) => food[key] === undefined || food[key] === null)) errors.push(`${food.Id}: visible records need all four nutrients`);
  }

  // Nutrients are optional, but when present they must be complete and agree with the calories,
  // so template values (e.g. 182 kcal of macros on a 22 kcal radish) can never come back.
  const present = macroKeys.filter((key) => food[key] !== undefined && food[key] !== null);
  if (present.length && present.length !== macroKeys.length) errors.push(`${food.Id}: nutrients must be all present or all absent`);
  if (present.length === macroKeys.length) {
    for (const key of macroKeys) {
      if (!(Number.isFinite(food[key]) && food[key] >= 0 && food[key] <= 100)) errors.push(`${food.Id}: invalid ${key}`);
    }
    const base = 4 * food.ProteinPer100G + 4 * food.CarbohydratePer100G + 9 * food.FatPer100G;
    const tolerance = Math.max(25, food.KcalPer100G * 0.2);
    const consistent = [base, base + 2 * food.FiberPer100G, base - 2 * food.FiberPer100G]
      .some((estimate) => Math.abs(estimate - food.KcalPer100G) <= tolerance);
    if (!consistent) errors.push(`${food.Id}: nutrients (${Math.round(base)} kcal) do not match ${food.KcalPer100G} kcal/100 g`);
    if (!food.Source || hiddenStatuses.has(food.DataStatus)) errors.push(`${food.Id}: nutrients need a verifiable source`);
  }

  if (!food.Image) errors.push(`${food.Id}: image missing`);
  if (images.has(food.Image)) errors.push(`${food.Id}: image URL/file is reused`);
  images.add(food.Image);
  if (/^https?:\/\//i.test(food.Image)) errors.push(`${food.Id}: image must be local, received remote URL: ${food.Image}`);
  if (!/^https?:\/\//i.test(food.Image) && !fs.existsSync(path.join(root, "public", food.Image.replace(/^\//, "")))) {
    errors.push(`${food.Id}: local image does not exist: ${food.Image}`);
  }
}

const visible = foods.filter((food) => !hiddenStatuses.has(food.DataStatus));
for (let index = 1; index <= 50; index += 1) {
  const id = `f${String(index).padStart(3, "0")}`;
  const record = foods.find((food) => food.Id === id);
  // A canonical record may only be hidden while it waits for a source ("pending"), never deleted.
  if (!record) errors.push(`Canonical v1 record ${id} must stay in the catalog`);
  else if (record.DataStatus === "placeholder") errors.push(`Canonical v1 record ${id} must not be a placeholder`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const counts = Object.fromEntries([...nutrients].map((nutrient) => [nutrient, visible.filter((food) => food.PrimaryNutrient === nutrient).length]));
console.log(JSON.stringify({
  total: foods.length,
  visible: visible.length,
  placeholdersHidden: foods.filter((food) => food.DataStatus === "placeholder").length,
  pendingHidden: foods.filter((food) => food.DataStatus === "pending").length,
  byGrade: Object.fromEntries([...grades].map((grade) => [grade, visible.filter((food) => food.ConfidenceGrade === grade).length])),
  withVerifiedNutrients: visible.filter((food) => macroKeys.every((key) => food[key] != null)).length,
  visibleByPrimaryNutrient: counts,
  uniqueImages: images.size,
}, null, 2));
