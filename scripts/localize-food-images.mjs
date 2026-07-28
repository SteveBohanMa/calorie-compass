import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const foodsPath = path.join(root, "src", "foods.json");
const outputDirectory = path.join(root, "public", "assets", "food", "catalog");

const methodImages = [
  ["method-pan", "https://loremflickr.com/640/480/pan-seared,food?lock=11"],
  ["method-deep", "https://loremflickr.com/640/480/deep-fried,food?lock=12"],
  ["method-stir", "https://loremflickr.com/640/480/stir-fried,food?lock=13"],
  ["method-steam", "https://loremflickr.com/640/480/steamed,food?lock=14"],
  ["method-boil", "https://loremflickr.com/640/480/boiled,food?lock=15"],
  ["method-roast", "https://loremflickr.com/640/480/roasted,food?lock=16"],
  ["method-braise", "https://loremflickr.com/640/480/braised,food?lock=17"],
  ["method-simmer", "https://loremflickr.com/640/480/simmered,food?lock=18"],
  ["method-blanch", "https://loremflickr.com/640/480/blanched,food?lock=19"],
  ["method-raw", "https://loremflickr.com/640/480/raw,healthy,food?lock=20"],
  ["method-soup", "https://loremflickr.com/640/480/soup,food?lock=21"],
  ["method-microwave", "https://loremflickr.com/640/480/microwave,meal?lock=22"],
];

function safeName(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]+/g, "-");
}

async function download(url, target, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "User-Agent": "CalorieCompass/2.5 offline image localizer" },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) throw new Error(`Unexpected content type: ${contentType}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 2_000) throw new Error(`Image is too small: ${bytes.length} bytes`);
      await fs.writeFile(target, bytes);
      return bytes.length;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 700));
    }
  }
  throw lastError;
}

async function runQueue(tasks, concurrency = 8) {
  const failures = [];
  let cursor = 0;
  let completed = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const task = tasks[cursor];
      cursor += 1;
      try {
        const size = await download(task.url, task.target);
        completed += 1;
        if (completed % 25 === 0 || completed === tasks.length) console.log(`Downloaded ${completed}/${tasks.length} (${task.name}, ${size} bytes)`);
      } catch (error) {
        failures.push({ name: task.name, url: task.url, error: String(error) });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return failures;
}

await fs.mkdir(outputDirectory, { recursive: true });
const foods = JSON.parse(await fs.readFile(foodsPath, "utf8"));
const originalImages = new Map(foods.map((food) => [food.Id, food.Image]));
const tasks = foods.map((food) => {
  const filename = `${safeName(food.Id)}.jpg`;
  food.Image = `/assets/food/catalog/${filename}`;
  return { name: food.Id, url: originalImages.get(food.Id), target: path.join(outputDirectory, filename) };
});

for (const [name, url] of methodImages) {
  tasks.push({ name, url, target: path.join(root, "public", "assets", "food", `${name}.jpg`) });
}

const failures = await runQueue(tasks);
if (failures.length) {
  await fs.writeFile(path.join(root, "verification-food-images-missing.json"), `${JSON.stringify(failures, null, 2)}\n`);
  throw new Error(`${failures.length} images failed to download; foods.json was not changed.`);
}

await fs.writeFile(foodsPath, `${JSON.stringify(foods, null, 2)}\n`);
await fs.writeFile(path.join(root, "verification-food-images-missing.json"), "[]\n");
console.log(`Localized ${foods.length} food images and ${methodImages.length} method images.`);
