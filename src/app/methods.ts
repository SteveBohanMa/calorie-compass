// Cooking-method tiles for the lookup. Tiles without foods are hidden automatically.
import { FOODS, type Food } from "../catalog";

export type Method = {
  id: string;
  zh: string;
  en: string;
  image: string;
  tone: "mint" | "lime" | "peach" | "sky";
};

// Every cooking method the catalog can use. Methods with no foods yet are hidden from the
// lookup grid automatically (see VISIBLE_METHODS) and appear once data is added.
export const METHODS: Method[] = [
  { id: "pan", zh: "煎", en: "Pan-sear", image: "/assets/food/method-pan.jpg", tone: "mint" },
  { id: "deep", zh: "炸", en: "Deep-fry", image: "/assets/food/method-deep.jpg", tone: "peach" },
  { id: "stir", zh: "炒", en: "Stir-fry", image: "/assets/food/method-stir.jpg", tone: "lime" },
  { id: "steam", zh: "蒸", en: "Steam", image: "/assets/food/method-steam.jpg", tone: "sky" },
  { id: "boil", zh: "煮", en: "Boil", image: "/assets/food/method-boil.jpg", tone: "mint" },
  { id: "roast", zh: "烤", en: "Roast", image: "/assets/food/method-roast.jpg", tone: "peach" },
  { id: "braise", zh: "卤·炖", en: "Braise", image: "/assets/food/method-braise.jpg", tone: "lime" },
  { id: "simmer", zh: "焖", en: "Simmer", image: "/assets/food/method-simmer.jpg", tone: "sky" },
  { id: "blanch", zh: "白灼", en: "Blanch", image: "/assets/food/method-blanch.jpg", tone: "sky" },
  { id: "raw", zh: "生食·原味", en: "Raw & plain", image: "/assets/food/method-raw.jpg", tone: "mint" },
  { id: "oden", zh: "关东煮", en: "Oden", image: "/assets/food/catalog/f034.jpg", tone: "peach" },
  { id: "microwave", zh: "微波", en: "Microwave", image: "/assets/food/method-microwave.jpg", tone: "peach" },
  { id: "cold", zh: "凉拌·沙拉", en: "Cold & salad", image: "/assets/food/catalog/f022.jpg", tone: "lime" },
];

export const METHOD_BY_ID: Record<string, Method> = Object.fromEntries(METHODS.map((method) => [method.id, method]));

export const METHOD_PREPARATIONS: Record<string, string[]> = {
  pan: ["煎"], deep: ["炸", "油炸"], stir: ["清炒", "炒", "爆炒"], steam: ["蒸"], boil: ["水煮", "汤煮"],
  roast: ["烤", "烘焙"], braise: ["卤", "炖", "红烧"], simmer: ["焖"], blanch: ["白灼"],
  raw: ["生食", "原味"], oden: ["关东煮"], microwave: ["微波"], cold: ["凉拌", "沙拉"],
};

export function foodsForMethod(method: Method) {
  const preparations = METHOD_PREPARATIONS[method.id] ?? [];
  return FOODS.filter((food) => preparations.includes(food.preparationZh));
}

export const VISIBLE_METHODS = METHODS.filter((method) => foodsForMethod(method).length > 0);

/** The cooking-method tile a food belongs to (used when a food is opened from favorites). */
export function methodForFood(food: Food): Method {
  const id = Object.entries(METHOD_PREPARATIONS).find(([, preparations]) => preparations.includes(food.preparationZh))?.[0];
  return (id && METHOD_BY_ID[id]) || METHOD_BY_ID.pan;
}
