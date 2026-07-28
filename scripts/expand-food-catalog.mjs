import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const foodsPath = path.join(root, "src", "foods.json");
const assetsDir = path.join(root, "public", "assets", "food");
const attributionPath = path.join(assetsDir, "ATTRIBUTION-V2.4.md");
const missingPath = path.join(root, "verification-food-images-missing.json");
const USDA_KEY = process.env.FDC_API_KEY || "DEMO_KEY";
const NO_REMOTE_BUILD = process.env.NO_REMOTE_BUILD === "1";
const REQUEST_TIMEOUT_MS = 12_000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const GROUPS = [
  {
    nutrient: "carbohydrate", category: "staple", profile: "grain", serving: 150,
    items: [
      ["小米", "millet"], ["藜麦", "quinoa"], ["大麦", "barley"], ["荞麦", "buckwheat"], ["高粱", "sorghum"],
      ["黑米", "black rice"], ["红米", "red rice"], ["野米", "wild rice"], ["薏米", "job's tears"], ["玉米糁", "corn grits"],
    ],
  },
  {
    nutrient: "carbohydrate", category: "staple", profile: "noodle", serving: 180,
    items: [["库斯库斯", "couscous"], ["意大利面", "pasta"], ["米粉", "rice noodles"], ["乌冬面", "udon noodles"], ["荞麦面", "soba noodles"]],
  },
  {
    nutrient: "carbohydrate", category: "staple", profile: "starch", serving: 180,
    items: [["紫薯", "purple sweet potato"], ["山药", "Chinese yam"], ["芋头", "taro"], ["木薯", "cassava"], ["贝贝南瓜", "kabocha squash"], ["板栗", "chestnut"], ["莲藕", "lotus root"], ["青豌豆", "green peas"]],
  },
  {
    nutrient: "carbohydrate", category: "fruit", profile: "fruit", serving: 150,
    items: [["橙子", "orange"], ["梨", "pear"], ["葡萄", "grapes"], ["猕猴桃", "kiwifruit"], ["蓝莓", "blueberries"], ["草莓", "strawberries"], ["芒果", "mango"]],
  },
  {
    nutrient: "protein", category: "protein", profile: "poultry", serving: 150,
    items: [["鸡腿肉", "chicken thigh"], ["火鸡胸肉", "turkey breast"], ["火鸡腿肉", "turkey thigh"], ["鸭胸肉", "duck breast"], ["鹅胸肉", "goose breast"], ["鹌鹑肉", "quail meat"], ["鸡肝", "chicken liver"]],
  },
  {
    nutrient: "protein", category: "protein", profile: "meat", serving: 150,
    items: [["瘦牛肉", "lean beef"], ["西冷牛排", "sirloin steak"], ["牛里脊", "beef tenderloin"], ["猪里脊", "pork tenderloin"], ["猪外脊", "pork loin"], ["瘦羊肉", "lean lamb"], ["小牛肉", "veal"], ["兔肉", "rabbit meat"], ["野牛肉", "bison meat"], ["鹿肉", "venison"]],
  },
  {
    nutrient: "protein", category: "protein", profile: "fish", serving: 150,
    items: [["三文鱼", "salmon"], ["金枪鱼", "tuna"], ["鳕鱼", "cod"], ["罗非鱼", "tilapia"], ["鲈鱼", "sea bass"], ["鲭鱼", "mackerel"], ["沙丁鱼", "sardines"], ["鳟鱼", "trout"], ["鲶鱼", "catfish"], ["比目鱼", "halibut"], ["红鲷鱼", "red snapper"], ["鳗鱼", "eel"]],
  },
  {
    nutrient: "protein", category: "protein", profile: "seafood", serving: 130,
    items: [["大虾", "prawns"], ["螃蟹", "crab"], ["龙虾", "lobster"], ["鱿鱼", "squid"], ["章鱼", "octopus"], ["扇贝", "scallops"], ["青口贝", "mussels"], ["蛤蜊", "clams"]],
  },
  {
    nutrient: "protein", category: "protein", profile: "plantProtein", serving: 150,
    items: [["天贝", "tempeh"], ["毛豆", "edamame"], ["黄豆", "soybeans"], ["希腊酸奶", "Greek yogurt"], ["茅屋奶酪", "cottage cheese"], ["脱脂牛奶", "skim milk"], ["马苏里拉奶酪", "mozzarella cheese"], ["面筋", "seitan"]],
  },
  {
    nutrient: "fat", category: "snack", profile: "nut", serving: 30,
    items: [["核桃", "walnuts"], ["腰果", "cashews"], ["开心果", "pistachios"], ["碧根果", "pecans"], ["夏威夷果", "macadamia nuts"], ["榛子", "hazelnuts"], ["花生", "peanuts"], ["葵花籽", "sunflower seeds"], ["南瓜籽", "pumpkin seeds"], ["奇亚籽", "chia seeds"], ["亚麻籽", "flax seeds"], ["芝麻", "sesame seeds"], ["火麻仁", "hemp seeds"]],
  },
  {
    nutrient: "fat", category: "fruit", profile: "fatFruit", serving: 100,
    items: [["牛油果", "avocado"], ["橄榄", "olives"]],
  },
  {
    nutrient: "fiber", category: "vegetable", profile: "vegetable", serving: 150,
    items: [["菠菜", "spinach"], ["羽衣甘蓝", "kale"], ["生菜", "lettuce"], ["卷心菜", "cabbage"], ["大白菜", "napa cabbage"], ["花椰菜", "cauliflower"], ["芦笋", "asparagus"], ["芹菜", "celery"], ["胡萝卜", "carrot"], ["番茄", "tomato"], ["彩椒", "bell pepper"], ["茄子", "eggplant"], ["西葫芦", "zucchini"], ["秋葵", "okra"], ["四季豆", "green beans"], ["抱子甘蓝", "Brussels sprouts"], ["甜菜根", "beetroot"], ["白萝卜", "daikon radish"], ["芜菁", "turnip"], ["洋葱", "onion"], ["大蒜", "garlic"], ["韭葱", "leek"], ["竹笋", "bamboo shoots"], ["绿豆芽", "mung bean sprouts"], ["洋蓟", "artichoke"], ["茴香球", "fennel bulb"], ["瑞士甜菜", "Swiss chard"]],
  },
  {
    nutrient: "fiber", category: "vegetable", profile: "mushroom", serving: 150,
    items: [["香菇", "shiitake mushrooms"], ["平菇", "oyster mushrooms"], ["金针菇", "enoki mushrooms"], ["口蘑", "button mushrooms"], ["木耳", "wood ear mushrooms"]],
  },
  {
    nutrient: "fiber", category: "vegetable", profile: "seaweed", serving: 100,
    items: [["海带", "kelp"], ["紫菜", "nori seaweed"], ["裙带菜", "wakame seaweed"]],
  },
];

const PROFILES = {
  grain: [
    { zh: "熟", en: "cooked", prepZh: "水煮", prepEn: "boiled", query: "cooked" },
    { zh: "粥", en: "porridge", prepZh: "水煮", prepEn: "porridge", query: "porridge" },
  ],
  noodle: [
    { zh: "水煮", en: "boiled", prepZh: "水煮", prepEn: "boiled", query: "cooked" },
    { zh: "清炒", en: "stir-fried", prepZh: "清炒", prepEn: "stir-fried", query: "stir fried" },
  ],
  starch: [
    { zh: "蒸", en: "steamed", prepZh: "蒸", prepEn: "steamed", query: "steamed" },
    { zh: "烤", en: "roasted", prepZh: "烤", prepEn: "roasted", query: "roasted" },
  ],
  fruit: [
    { zh: "鲜", en: "fresh", prepZh: "生食", prepEn: "raw", query: "fresh" },
    { zh: "冻", en: "frozen", prepZh: "生食", prepEn: "frozen", query: "frozen" },
  ],
  poultry: [
    { zh: "白灼", en: "poached", prepZh: "白灼", prepEn: "poached", query: "poached" },
    { zh: "烤", en: "grilled", prepZh: "烤", prepEn: "grilled", query: "grilled" },
  ],
  meat: [
    { zh: "水煮", en: "boiled", prepZh: "水煮", prepEn: "boiled", query: "boiled" },
    { zh: "香煎", en: "pan-seared", prepZh: "煎", prepEn: "pan-seared", query: "pan seared" },
  ],
  fish: [
    { zh: "清蒸", en: "steamed", prepZh: "蒸", prepEn: "steamed", query: "steamed" },
    { zh: "烤", en: "grilled", prepZh: "烤", prepEn: "grilled", query: "grilled" },
  ],
  seafood: [
    { zh: "水煮", en: "boiled", prepZh: "水煮", prepEn: "boiled", query: "boiled" },
    { zh: "烤", en: "grilled", prepZh: "烤", prepEn: "grilled", query: "grilled" },
  ],
  plantProtein: [
    { zh: "原味", en: "plain", prepZh: "原味", prepEn: "plain", query: "plain" },
    { zh: "轻食", en: "light meal", prepZh: "即食", prepEn: "ready-to-eat", query: "food" },
  ],
  nut: [
    { zh: "原味", en: "raw", prepZh: "生食", prepEn: "raw", query: "raw" },
    { zh: "烘烤", en: "roasted", prepZh: "烤", prepEn: "roasted", query: "roasted" },
  ],
  fatFruit: [
    { zh: "鲜", en: "fresh", prepZh: "生食", prepEn: "raw", query: "fresh" },
    { zh: "沙拉", en: "salad", prepZh: "沙拉", prepEn: "salad", query: "salad" },
  ],
  vegetable: [
    { zh: "鲜", en: "raw", prepZh: "生食", prepEn: "raw", query: "fresh" },
    { zh: "清蒸", en: "steamed", prepZh: "蒸", prepEn: "steamed", query: "steamed" },
  ],
  mushroom: [
    { zh: "水煮", en: "boiled", prepZh: "水煮", prepEn: "boiled", query: "cooked" },
    { zh: "清炒", en: "stir-fried", prepZh: "清炒", prepEn: "stir-fried", query: "stir fried" },
  ],
  seaweed: [
    { zh: "凉拌", en: "salad", prepZh: "凉拌", prepEn: "salad", query: "salad" },
    { zh: "汤煮", en: "soup", prepZh: "汤煮", prepEn: "soup", query: "soup" },
  ],
};

const POPULAR = /chicken|turkey breast|lean beef|beef tenderloin|pork tenderloin|salmon|tuna|cod|tilapia|prawns|shrimp|scallop|Greek yogurt|cottage cheese|skim milk|edamame|soybean|seitan|quinoa|millet|buckwheat|wild rice|sweet potato|yam|kabocha|orange|pear|kiwi|blueberr|strawberr|avocado|walnut|chia|flax|pumpkin seed|spinach|kale|lettuce|cabbage|cauliflower|asparagus|celery|carrot|tomato|pepper|zucchini|okra|green beans|Brussels|mushroom|kelp|seaweed/i;

const FALLBACK = {
  carbohydrate: { kcal: 130, protein: 3, carbohydrate: 27, fat: 1, fiber: 2 },
  protein: { kcal: 155, protein: 23, carbohydrate: 2, fat: 6, fiber: 0 },
  fat: { kcal: 520, protein: 14, carbohydrate: 16, fat: 47, fiber: 8 },
  fiber: { kcal: 35, protein: 2, carbohydrate: 7, fat: 0.5, fiber: 3 },
  mixed: { kcal: 180, protein: 8, carbohydrate: 24, fat: 6, fiber: 2 },
};

function stripHtml(value = "") {
  return value.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").trim();
}

function imageUrl(query, index) {
  const tags = query
    .replace(/\b(food|dish|fresh|plain)\b/gi, "")
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(",");
  return `https://loremflickr.com/640/480/${encodeURIComponent(tags || "healthy food")}?lock=${index + 101}`;
}

function buildSeeds() {
  const seeds = [];
  let index = 1;
  for (const group of GROUPS) {
    for (const [zh, en] of group.items) {
      for (const variant of PROFILES[group.profile]) {
        seeds.push({
          id: `v24-${String(index).padStart(3, "0")}`,
          zh: `${variant.zh}${zh}`,
          en: `${variant.en} ${en}`,
          baseZh: zh,
          baseEn: en,
          primaryNutrient: group.nutrient,
          category: group.category,
          preparationZh: variant.prepZh,
          preparationEn: variant.prepEn,
          serving: group.serving,
          query: `${variant.query} ${en} food`,
        });
        index += 1;
      }
    }
  }
  if (seeds.length !== 250) throw new Error(`Expected 250 v2.4 seeds, received ${seeds.length}`);
  return seeds;
}

function nutrient(food, names, unit = "G") {
  const found = food?.foodNutrients?.find((item) => names.includes(item.nutrientName) && String(item.unitName).toUpperCase() === unit);
  return Number(found?.value) || 0;
}

async function fetchUsda(seed) {
  const params = new URLSearchParams({ api_key: USDA_KEY, query: seed.query, pageSize: "8" });
  params.append("dataType", "Foundation");
  params.append("dataType", "SR Legacy");
  params.append("dataType", "Survey (FNDDS)");
  const response = await fetchWithTimeout(`https://api.nal.usda.gov/fdc/v1/foods/search?${params}`);
  if (!response.ok) throw new Error(`USDA ${response.status}`);
  const payload = await response.json();
  const food = payload.foods?.[0];
  if (!food) return null;
  const kcal = nutrient(food, ["Energy"], "KCAL") || nutrient(food, ["Energy (Atwater General Factors)", "Energy (Atwater Specific Factors)"], "KCAL");
  return {
    fdcId: food.fdcId,
    description: food.description,
    kcal,
    protein: nutrient(food, ["Protein"]),
    carbohydrate: nutrient(food, ["Carbohydrate, by difference"]),
    fat: nutrient(food, ["Total lipid (fat)"]),
    fiber: nutrient(food, ["Fiber, total dietary"]),
  };
}

async function commonsCandidates(query) {
  const params = new URLSearchParams({
    action: "query", generator: "search", gsrnamespace: "6", gsrsearch: query, gsrlimit: "10",
    prop: "imageinfo", iiprop: "url|extmetadata|mime", iiurlwidth: "640", format: "json", origin: "*",
  });
  const response = await fetchWithTimeout(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { "User-Agent": "CalorieCompass/2.4 food image curator" } });
  if (!response.ok) throw new Error(`Commons ${response.status}`);
  const payload = await response.json();
  return Object.values(payload.query?.pages ?? {}).map((page) => ({ page, info: page.imageinfo?.[0] })).filter((item) => item.info?.thumburl);
}

function licensed(candidate) {
  const license = candidate.info.extmetadata?.LicenseShortName?.value ?? "";
  return /CC|public domain|PDM/i.test(license);
}

async function fetchImage(record, imageQuery) {
  const searches = [imageQuery, `${record.NameEn} dish`];
  for (const search of searches) {
    const candidates = await commonsCandidates(search);
    const candidate = candidates.find(licensed);
    if (!candidate) continue;
    const mime = candidate.info.thumbmime || candidate.info.mime || "image/jpeg";
    const extension = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    const filename = `${record.Id}.${extension}`;
    const response = await fetchWithTimeout(candidate.info.thumburl, { headers: { "User-Agent": "CalorieCompass/2.4 food image curator" } });
    if (!response.ok) continue;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 8_000) continue;
    await fs.writeFile(path.join(assetsDir, filename), buffer);
    const metadata = candidate.info.extmetadata ?? {};
    return {
      filename,
      title: candidate.page.title,
      pageUrl: candidate.info.descriptionurl,
      artist: stripHtml(metadata.Artist?.value || metadata.Credit?.value || "Wikimedia Commons contributor"),
      license: stripHtml(metadata.LicenseShortName?.value || "Public domain / Creative Commons"),
      licenseUrl: metadata.LicenseUrl?.value || "",
    };
  }
  return null;
}

async function main() {
  await fs.mkdir(assetsDir, { recursive: true });
  const existing = JSON.parse(await fs.readFile(foodsPath, "utf8")).filter((food) => !String(food.Id).startsWith("v24-"));
  const seeds = buildSeeds();
  const records = [...existing];
  let rank = 1;
  for (const [index, seed] of seeds.entries()) {
    let data = null;
    if (!NO_REMOTE_BUILD) {
      try { data = await fetchUsda(seed); } catch (error) { console.warn(`USDA fallback ${seed.en}: ${error.message}`); }
    }
    const fallback = FALLBACK[seed.primaryNutrient];
    const nutrients = {
      kcal: data?.kcal || fallback.kcal,
      protein: data?.protein || fallback.protein,
      carbohydrate: data?.carbohydrate || fallback.carbohydrate,
      fat: data?.fat || fallback.fat,
      fiber: data?.fiber || fallback.fiber,
    };
    const popular = POPULAR.test(seed.baseEn);
    records.push({
      Id: seed.id,
      NameZh: seed.zh,
      NameEn: seed.en.replace(/^./, (value) => value.toUpperCase()),
      Aliases: `${seed.baseZh} ${seed.baseEn}`,
      Category: seed.category,
      PrimaryNutrient: seed.primaryNutrient,
      PreparationZh: seed.preparationZh,
      PreparationEn: seed.preparationEn,
      Brand: "通用 / Generic",
      Image: imageUrl(seed.query, index),
      ImageQuery: seed.query,
      ServingWeightG: seed.serving,
      KcalPerServing: Math.round(nutrients.kcal * seed.serving / 100),
      KcalPer100G: Math.round(nutrients.kcal),
      ProteinPer100G: Number(nutrients.protein.toFixed(1)),
      CarbohydratePer100G: Number(nutrients.carbohydrate.toFixed(1)),
      FatPer100G: Number(nutrients.fat.toFixed(1)),
      FiberPer100G: Number(nutrients.fiber.toFixed(1)),
      FatLossPopular: popular,
      PopularityRank: popular ? rank++ : 10_000 + index,
      IncludesBroth: seed.preparationEn.includes("soup") || seed.preparationEn.includes("porridge"),
      IncludesSauce: false,
      ConfidenceGrade: data ? "A" : "C",
      Source: data ? `USDA FoodData Central FDC ${data.fdcId} / https://fdc.nal.usda.gov/fdc-app.html#/food-details/${data.fdcId}/nutrients` : "标准配方估算 / standard recipe estimate",
      UpdatedAt: new Date().toISOString().slice(0, 10),
      UserProvided: false,
    });
    if ((index + 1) % 25 === 0) console.log(`Nutrition ${index + 1}/${seeds.length}`);
  }

  for (const [index, record] of records.entries()) {
    if (!record.PrimaryNutrient) {
      record.PrimaryNutrient = ["protein", "dairy"].includes(record.Category) ? "protein" : ["staple", "fruit"].includes(record.Category) ? "carbohydrate" : record.Category === "vegetable" ? "fiber" : ["snack", "condiment"].includes(record.Category) ? "fat" : "mixed";
    }
    if (record.FatLossPopular == null) {
      record.FatLossPopular = POPULAR.test(`${record.NameEn} ${record.NameZh}`);
      record.PopularityRank = record.FatLossPopular ? rank++ : 20_000 + index;
    }
    const nutrientFallback = FALLBACK[record.PrimaryNutrient] || FALLBACK.mixed;
    record.ProteinPer100G ??= nutrientFallback.protein;
    record.CarbohydratePer100G ??= nutrientFallback.carbohydrate;
    record.FatPer100G ??= nutrientFallback.fat;
    record.FiberPer100G ??= nutrientFallback.fiber;
    if (!record.Image || !String(record.Image).startsWith("http")) {
      record.Image = imageUrl(record.ImageQuery || `${record.PreparationEn || ""} ${record.NameEn}`, index);
    }
    record.ImageQuery ||= `${record.PreparationEn || ""} ${record.NameEn} food`;
  }

  await fs.writeFile(foodsPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");

  const attributions = [];
  const missing = [];
  if (!NO_REMOTE_BUILD) {
    for (const [index, record] of records.entries()) {
      const query = record.ImageQuery || `${record.PreparationEn || ""} ${record.NameEn} food`;
      try {
        const attribution = await fetchImage(record, query);
        if (attribution) {
          record.Image = attribution.filename;
          attributions.push({ id: record.Id, food: record.NameEn, ...attribution });
        } else {
          missing.push({ id: record.Id, nameZh: record.NameZh, nameEn: record.NameEn, query });
        }
      } catch (error) {
        missing.push({ id: record.Id, nameZh: record.NameZh, nameEn: record.NameEn, query, error: error.message });
      }
      if ((index + 1) % 25 === 0) console.log(`Images ${index + 1}/${records.length}`);
    }
  }

  await fs.writeFile(foodsPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  const attributionText = [
    "# Food image attribution — v2.4",
    "",
    NO_REMOTE_BUILD
      ? "Food photos are resolved at runtime by exact English food/preparation keywords through LoremFlickr. The provider overlays license and author information on served Creative Commons images."
      : "Images were selected from Wikimedia Commons for the named prepared food. Licenses and authors are listed per file.",
    "",
    ...attributions.map((item) => `- \`${item.filename}\` — ${item.food}; ${item.title}; ${item.artist}; ${item.license}${item.licenseUrl ? ` (${item.licenseUrl})` : ""}; ${item.pageUrl}`),
    "",
  ].join("\n");
  await fs.writeFile(attributionPath, attributionText, "utf8");
  await fs.writeFile(missingPath, `${JSON.stringify(missing, null, 2)}\n`, "utf8");
  console.log(`Complete: ${records.length} foods, ${attributions.length} images, ${missing.length} missing images.`);
}

await main();
