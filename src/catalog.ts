import rawFoods from "./foods.json";
import { foodFallbackImage } from "./foodIcon";

export type Lang = "zh" | "en";
export type PrimaryNutrient = "protein" | "carbohydrate" | "fat" | "fiber" | "mixed";

export type Food = {
  id: string;
  zh: string;
  en: string;
  aliases: string;
  category: string;
  primaryNutrient: PrimaryNutrient;
  preparationZh: string;
  preparationEn: string;
  brand: string;
  image: string;
  fallbackImage: string;
  kcal: number;
  servingGrams: number;
  servingKcal: number;
  /** Grams per 100 g. null = not verified yet; never show an estimate in its place. */
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
  fiber: number | null;
  isFatLossPopular: boolean;
  popularityRank: number;
  grade: string;
  includesBroth: boolean;
  includesSauce: boolean;
  sourceZh: string;
  sourceEn: string;
  /** Caveat shown on the detail page, e.g. "edible part" or "check the package label". */
  noteZh: string;
  noteEn: string;
};

type RawFood = {
  Id: string;
  NameZh: string;
  NameEn: string;
  Aliases: string;
  Category: string;
  PrimaryNutrient?: PrimaryNutrient;
  PreparationZh: string;
  PreparationEn: string;
  Brand: string;
  Image?: string;
  ServingWeightG: number;
  KcalPerServing: number;
  KcalPer100G: number;
  ProteinPer100G?: number;
  CarbohydratePer100G?: number;
  FatPer100G?: number;
  FiberPer100G?: number;
  FatLossPopular?: boolean;
  PopularityRank?: number;
  IncludesBroth: boolean;
  IncludesSauce: boolean;
  /** A: the source has this exact cooking method. B: similar method or a simple recipe. C: varies by brand; check the label. */
  ConfidenceGrade: string;
  Source: string;
  NoteZh?: string;
  NoteEn?: string;
  /**
   * "placeholder": the numbers are category defaults, not data.
   * "pending": waiting for a source (China Food Composition Tables or package labels).
   * Records with either status are never shown.
   */
  DataStatus?: string;
};

const HIDDEN_STATUSES = new Set(["placeholder", "pending"]);

function inferPrimaryNutrient(food: RawFood): PrimaryNutrient {
  if (food.PrimaryNutrient) return food.PrimaryNutrient;
  if (["protein", "dairy"].includes(food.Category)) return "protein";
  if (["staple", "fruit"].includes(food.Category)) return "carbohydrate";
  if (["snack", "condiment"].includes(food.Category)) return "fat";
  if (food.Category === "vegetable") return "fiber";
  return "mixed";
}

export const FOODS: Food[] = (rawFoods as RawFood[])
  .filter((food) => !HIDDEN_STATUSES.has(food.DataStatus ?? ""))
  .map((food, index) => {
    const [sourceZh, ...sourceEn] = food.Source.split(" / ");
    return {
      id: food.Id,
      zh: food.NameZh,
      en: food.NameEn,
      aliases: food.Aliases,
      category: food.Category,
      primaryNutrient: inferPrimaryNutrient(food),
      preparationZh: food.PreparationZh,
      preparationEn: food.PreparationEn,
      brand: food.Brand,
      image: food.Image
        ? (/^(?:https?:\/\/|\/)/i.test(food.Image) ? food.Image : `/assets/food/${food.Image}`)
        : "/assets/food/chicken.jpg",
      fallbackImage: foodFallbackImage(food.Id),
      kcal: food.KcalPer100G,
      servingGrams: food.ServingWeightG,
      servingKcal: food.KcalPerServing,
      protein: food.ProteinPer100G ?? null,
      carbohydrate: food.CarbohydratePer100G ?? null,
      fat: food.FatPer100G ?? null,
      fiber: food.FiberPer100G ?? null,
      isFatLossPopular: food.FatLossPopular ?? false,
      popularityRank: food.PopularityRank ?? 10_000 + index,
      grade: food.ConfidenceGrade,
      includesBroth: food.IncludesBroth,
      includesSauce: food.IncludesSauce,
      sourceZh,
      sourceEn: sourceEn.join(" / ") || sourceZh,
      noteZh: food.NoteZh ?? "",
      noteEn: food.NoteEn ?? food.NoteZh ?? "",
    };
  })
  .sort((a, b) => Number(b.isFatLossPopular) - Number(a.isFatLossPopular) || a.popularityRank - b.popularityRank);

export function hasVerifiedNutrients(food: Food) {
  return food.protein !== null && food.carbohydrate !== null && food.fat !== null && food.fiber !== null;
}

export function localizedLabel(item: { zh: string; en: string }, lang: Lang) {
  return lang === "zh" ? item.zh : item.en;
}
