// Portion helpers shared by the food detail page, the comparison and the meal plan.
import type { PortionPrefs } from "../userData";

export type PortionFood = {
  id: string;
  preparationZh?: string;
  /** Typical serving in grams (for oden: one piece / skewer). */
  servingGrams: number;
  kcalPer100: number;
};

/** The oden broth is measured by weight; every other oden item is bought by the piece or skewer. */
export function soldByPiece(food: PortionFood) {
  return food.preparationZh === "关东煮" && food.id !== "f036";
}

export function pieceWeight(food: PortionFood, prefs: PortionPrefs) {
  return prefs.pieceGrams[food.id] ?? food.servingGrams;
}

/** The amount shown by default: one piece, or one typical serving in grams. */
export function defaultAmount(food: PortionFood) {
  return soldByPiece(food) ? 1 : food.servingGrams;
}

export function chosenAmount(food: PortionFood, prefs: PortionPrefs) {
  return prefs.amounts[food.id] ?? defaultAmount(food);
}

export function amountToGrams(food: PortionFood, amount: number, prefs: PortionPrefs) {
  return soldByPiece(food) ? amount * pieceWeight(food, prefs) : amount;
}

export function kcalForGrams(kcalPer100: number, grams: number) {
  return (kcalPer100 * grams) / 100;
}
