// Runs after `vite build`. Vite copies public/ into dist/client wholesale, so every source image
// in public/assets/food (including AI originals and pictures of removed foods) used to ship inside
// the Windows app. This removes the food images that the built app never references.
// Source files in public/ are not touched.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const client = path.join(root, "dist", "client");
const foodDir = path.join(client, "assets", "food");
const IMAGE = /\.(?:png|jpe?g|webp|gif|svg|avif)$/i;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function toUrlPath(file) {
  return `/${path.relative(client, file).split(path.sep).join("/")}`;
}

if (!fs.existsSync(foodDir)) {
  console.error(`Missing ${foodDir}. Run the Vite build first.`);
  process.exit(1);
}

const referenced = new Set();
for (const file of walk(client)) {
  if (!/\.(?:html|js|css)$/i.test(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(/\/assets\/[A-Za-z0-9_\-./%]+/g)) {
    try {
      referenced.add(decodeURIComponent(match[0]));
    } catch {
      referenced.add(match[0]);
    }
  }
}

const foodImages = walk(foodDir).filter((file) => IMAGE.test(file));
const used = foodImages.filter((file) => referenced.has(toUrlPath(file)));
if (!used.length) {
  console.error("No referenced food images were found in the build output; refusing to delete anything.");
  process.exit(1);
}

let removedBytes = 0;
const removed = foodImages.filter((file) => !referenced.has(toUrlPath(file)));
for (const file of removed) {
  removedBytes += fs.statSync(file).size;
  fs.rmSync(file);
}

function removeEmptyDirectories(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyDirectories(path.join(dir, entry.name));
  }
  if (dir !== foodDir && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
}
removeEmptyDirectories(foodDir);

// Safety net: every visible food must still have its picture after pruning.
const foods = JSON.parse(fs.readFileSync(path.join(root, "src", "foods.json"), "utf8"));
const missing = foods
  .filter((food) => !["placeholder", "pending"].includes(food.DataStatus) && food.Image)
  .map((food) => (food.Image.startsWith("/") ? food.Image : `/assets/food/${food.Image}`))
  .filter((image) => !fs.existsSync(path.join(client, ...image.split("/").filter(Boolean))));
if (missing.length) {
  console.error(`Pruning removed or missed images the catalog uses:\n${missing.join("\n")}`);
  process.exit(1);
}

console.log(`Pruned ${removed.length} unused food images (${(removedBytes / 1024 / 1024).toFixed(1)} MB); kept ${used.length}.`);
