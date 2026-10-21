// Custom dishes and the comparison list kept in browser storage.
import type { Food } from "../catalog";
import { CUSTOM_FOOD_IMAGE, STORAGE_KEYS, type CustomFood } from "../userData";

export type CompareFood = {
  id: string;
  zh: string;
  en: string;
  kcal: number;
  image: string;
  fallbackImage: string;
  servingGrams: number;
  preparationZh?: string;
  custom?: boolean;
};

export const CUSTOM_FOODS_KEY = STORAGE_KEYS.customFoods;
export const COMPARE_FOODS_KEY = STORAGE_KEYS.compareFoods;

export function readStoredList<T>(key: string): T[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function readCustomFoods() {
  return readStoredList<CustomFood>(CUSTOM_FOODS_KEY);
}

export function storeCustomFoods(items: CustomFood[]) {
  window.localStorage.setItem(CUSTOM_FOODS_KEY, JSON.stringify(items));
}

export function customToCompareFood(food: CustomFood): CompareFood {
  return {
    id: food.id,
    zh: food.nameZh,
    en: food.nameEn || food.nameZh,
    kcal: food.kcalPer100G,
    image: food.image || CUSTOM_FOOD_IMAGE,
    fallbackImage: CUSTOM_FOOD_IMAGE,
    servingGrams: food.servingWeightG,
    custom: true,
  };
}

export function catalogToCompareFood(food: Food): CompareFood {
  return {
    id: food.id,
    zh: food.zh,
    en: food.en,
    kcal: food.kcal,
    image: food.image,
    fallbackImage: food.fallbackImage,
    servingGrams: food.servingGrams,
    preparationZh: food.preparationZh,
  };
}

export function portionOf(food: CompareFood) {
  return { id: food.id, preparationZh: food.preparationZh, servingGrams: food.servingGrams, kcalPer100: food.kcal };
}
