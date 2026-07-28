import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const foods = JSON.parse(await fs.readFile(path.join(root, "src", "foods.json"), "utf8"));
const noto = JSON.parse(await fs.readFile(path.join(root, "node_modules", "@iconify-json", "noto", "icons.json"), "utf8"));

const rules = [
  [/rice ball/, "rice-ball"], [/rice|quinoa|millet|barley|buckwheat|sorghum|job's tears/, "cooked-rice"],
  [/oat|porridge|noodle|pasta|udon|soba|couscous/, "steaming-bowl"], [/bread|toast|sandwich|wrap|flatbread/, "bread"],
  [/sweet potato/, "roasted-sweet-potato"], [/potato|yam|taro|cassava|kabocha|lotus root/, "potato"], [/chestnut/, "chestnut"], [/corn/, "ear-of-corn"],
  [/blueberr/, "blueberries"], [/strawberr/, "strawberry"], [/kiwi/, "kiwi-fruit"], [/avocado/, "avocado"],
  [/banana/, "banana"], [/grape/, "grapes"], [/orange/, "tangerine"], [/pear/, "pear"], [/mango/, "mango"], [/apple/, "red-apple"], [/lemon/, "lemon"], [/watermelon/, "watermelon"], [/melon/, "melon"], [/peach/, "peach"],
  [/egg/, "egg"], [/chicken|turkey|duck|goose|quail/, "chicken"], [/lamb|goat/, "goat"], [/beef|steak|pork|veal|bison|venison|rabbit|meat/, "cut-of-meat"],
  [/shrimp|prawn/, "shrimp"], [/crab/, "crab"], [/lobster/, "lobster"], [/squid/, "squid"], [/octopus/, "octopus"], [/fish|salmon|tuna|cod|tilapia|bass|mackerel|sardine|trout|catfish|halibut|snapper|eel/, "fish"], [/scallop|mussel|clam/, "fish"],
  [/tofu|tempeh|edamame|soybean|seitan|bean|pea/, "beans"], [/yogurt|milk/, "glass-of-milk"], [/cheese/, "cheese-wedge"],
  [/peanut/, "peanuts"], [/walnut|cashew|pistachio|pecan|macadamia|hazelnut|seed|chia|flax|sesame|hemp/, "peanuts"], [/olive/, "olive"],
  [/broccoli|cauliflower/, "broccoli"], [/carrot/, "carrot"], [/tomato/, "tomato"], [/bell pepper/, "bell-pepper"], [/pepper/, "hot-pepper"], [/eggplant/, "eggplant"], [/cucumber|zucchini|okra/, "cucumber"], [/onion|leek/, "onion"], [/garlic/, "garlic"], [/mushroom/, "mushroom"],
  [/salad|spinach|kale|lettuce|cabbage|asparagus|celery|green beans|brussels|beetroot|radish|turnip|bamboo|artichoke|fennel|chard|kelp|seaweed|nori|wakame/, "green-salad"],
  [/soup|stew|braised|simmered/, "pot-of-food"], [/pancake/, "pancakes"],
];

const fallbackByNutrient = { protein: "cut-of-meat", carbohydrate: "sheaf-of-rice", fat: "avocado", fiber: "green-salad", mixed: "fork-and-knife-with-plate" };
const foodIcons = {};
for (const food of foods) {
  const name = `${food.NameEn} ${food.Aliases || ""}`.toLowerCase();
  foodIcons[food.Id] = rules.find(([pattern]) => pattern.test(name))?.[1] || fallbackByNutrient[food.PrimaryNutrient] || "fork-and-knife-with-plate";
}

const methodIcons = {
  pan: "shallow-pan-of-food", deep: "fried-shrimp", stir: "shallow-pan-of-food", steam: "steaming-bowl",
  boil: "pot-of-food", roast: "cooking", braise: "pot-of-food", simmer: "pot-of-food",
  blanch: "steaming-bowl", raw: "green-salad", soup: "steaming-bowl", microwave: "bowl-with-spoon",
};

const selectedNames = new Set([...Object.values(foodIcons), ...Object.values(methodIcons)]);
const icons = {};
for (const name of selectedNames) {
  const icon = noto.icons[name];
  if (!icon) throw new Error(`Noto icon not found: ${name}`);
  icons[name] = { body: icon.body, width: icon.width || noto.width || 32, height: icon.height || noto.height || 32 };
}

await fs.writeFile(path.join(root, "src", "food-icon-fallbacks.json"), `${JSON.stringify({ icons, foodIcons, methodIcons })}\n`, "utf8");
console.log(`Prepared ${Object.keys(icons).length} Noto icons for ${Object.keys(foodIcons).length} foods.`);
