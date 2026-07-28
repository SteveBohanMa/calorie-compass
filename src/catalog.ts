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
  protein: number;
  carbohydrate: number;
  fat: number;
  fiber: number;
  isFatLossPopular: boolean;
  popularityRank: number;
  grade: string;
  includesBroth: boolean;
  includesSauce: boolean;
  sourceZh: string;
  sourceEn: string;
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
  ConfidenceGrade: string;
  Source: string;
};

function inferPrimaryNutrient(food: RawFood): PrimaryNutrient {
  if (food.PrimaryNutrient) return food.PrimaryNutrient;
  if (["protein", "dairy"].includes(food.Category)) return "protein";
  if (["staple", "fruit"].includes(food.Category)) return "carbohydrate";
  if (["snack", "condiment"].includes(food.Category)) return "fat";
  if (food.Category === "vegetable") return "fiber";
  return "mixed";
}

export const FOODS: Food[] = (rawFoods as RawFood[])
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
      protein: food.ProteinPer100G ?? 0,
      carbohydrate: food.CarbohydratePer100G ?? 0,
      fat: food.FatPer100G ?? 0,
      fiber: food.FiberPer100G ?? 0,
      isFatLossPopular: food.FatLossPopular ?? false,
      popularityRank: food.PopularityRank ?? 10_000 + index,
      grade: food.ConfidenceGrade,
      includesBroth: food.IncludesBroth,
      includesSauce: food.IncludesSauce,
      sourceZh,
      sourceEn: sourceEn.join(" / ") || sourceZh,
    };
  })
  .sort((a, b) => Number(b.isFatLossPopular) - Number(a.isFatLossPopular) || a.popularityRank - b.popularityRank);

export function localizedLabel(item: { zh: string; en: string }, lang: Lang) {
  return lang === "zh" ? item.zh : item.en;
}

export type Exercise = {
  id: string;
  zh: string;
  en: string;
  muscleZh: string;
  muscleEn: string;
  equipmentZh: string;
  equipmentEn: string;
  patternZh: string;
  patternEn: string;
  met: number;
  tempo: number;
  rest: number;
};

export const EXERCISES: Exercise[] = [
  { id: "deadlift", zh: "硬拉", en: "Deadlift", muscleZh: "背、臀、腿", muscleEn: "Back, glutes, legs", equipmentZh: "杠铃", equipmentEn: "Barbell", patternZh: "髋铰链", patternEn: "Hinge", met: 5, tempo: 5, rest: 120 },
  { id: "squat", zh: "深蹲", en: "Squat", muscleZh: "腿、臀、核心", muscleEn: "Legs, glutes, core", equipmentZh: "杠铃", equipmentEn: "Barbell", patternZh: "蹲", patternEn: "Squat", met: 5, tempo: 5, rest: 120 },
  { id: "bench", zh: "卧推", en: "Bench press", muscleZh: "胸、肩、三头", muscleEn: "Chest, shoulders, triceps", equipmentZh: "杠铃", equipmentEn: "Barbell", patternZh: "推", patternEn: "Push", met: 5, tempo: 4, rest: 105 },
  { id: "row", zh: "俯身划船", en: "Bent-over row", muscleZh: "背、二头", muscleEn: "Back, biceps", equipmentZh: "杠铃", equipmentEn: "Barbell", patternZh: "拉", patternEn: "Pull", met: 5, tempo: 4, rest: 90 },
  { id: "pulldown", zh: "高位下拉", en: "Lat pulldown", muscleZh: "背、二头", muscleEn: "Back, biceps", equipmentZh: "固定器械", equipmentEn: "Machine", patternZh: "拉", patternEn: "Pull", met: 3.5, tempo: 4, rest: 75 },
  { id: "press", zh: "肩上推举", en: "Shoulder press", muscleZh: "肩、三头", muscleEn: "Shoulders, triceps", equipmentZh: "哑铃", equipmentEn: "Dumbbells", patternZh: "推", patternEn: "Push", met: 5, tempo: 4, rest: 90 },
  { id: "curl", zh: "二头弯举", en: "Biceps curl", muscleZh: "二头", muscleEn: "Biceps", equipmentZh: "哑铃", equipmentEn: "Dumbbells", patternZh: "弯举", patternEn: "Curl", met: 3.5, tempo: 4, rest: 60 },
  { id: "pushdown", zh: "绳索下压", en: "Cable pushdown", muscleZh: "三头", muscleEn: "Triceps", equipmentZh: "绳索", equipmentEn: "Cable", patternZh: "伸展", patternEn: "Extension", met: 3.5, tempo: 4, rest: 60 },
  { id: "lunge", zh: "负重弓步", en: "Weighted lunge", muscleZh: "腿、臀", muscleEn: "Legs, glutes", equipmentZh: "哑铃", equipmentEn: "Dumbbells", patternZh: "蹲", patternEn: "Squat", met: 5, tempo: 5, rest: 90 },
  { id: "pullup", zh: "引体向上", en: "Pull-up", muscleZh: "背、二头、核心", muscleEn: "Back, biceps, core", equipmentZh: "自重", equipmentEn: "Bodyweight", patternZh: "拉", patternEn: "Pull", met: 5, tempo: 4, rest: 105 },
  { id: "pushup", zh: "俯卧撑", en: "Push-up", muscleZh: "胸、肩、三头", muscleEn: "Chest, shoulders, triceps", equipmentZh: "自重", equipmentEn: "Bodyweight", patternZh: "推", patternEn: "Push", met: 3.5, tempo: 3, rest: 60 },
  { id: "farmer", zh: "农夫行走", en: "Farmer's carry", muscleZh: "全身、核心", muscleEn: "Full body, core", equipmentZh: "哑铃", equipmentEn: "Dumbbells", patternZh: "负重行走", patternEn: "Loaded carry", met: 6, tempo: 3, rest: 90 },
  { id: "running", zh: "慢跑", en: "Jogging", muscleZh: "心肺、腿", muscleEn: "Cardio, legs", equipmentZh: "跑步机/户外", equipmentEn: "Treadmill/outdoor", patternZh: "有氧", patternEn: "Cardio", met: 7, tempo: 1, rest: 0 },
  { id: "cycling", zh: "骑行", en: "Cycling", muscleZh: "心肺、腿", muscleEn: "Cardio, legs", equipmentZh: "单车", equipmentEn: "Bike", patternZh: "有氧", patternEn: "Cardio", met: 6.8, tempo: 1, rest: 0 },
  { id: "rope", zh: "跳绳", en: "Jump rope", muscleZh: "心肺、全身", muscleEn: "Cardio, full body", equipmentZh: "跳绳", equipmentEn: "Rope", patternZh: "有氧", patternEn: "Cardio", met: 10, tempo: 1, rest: 0 },
];

export type WorkoutResult = {
  grossLow: number;
  grossHigh: number;
  netLow: number;
  netHigh: number;
  duration: number;
  met: number;
  inferred: boolean;
};

export function estimateWorkout({
  exercise,
  bodyWeight,
  sets,
  reps,
  loadKg,
  duration,
  tempo,
  rest,
  rpe,
  heartRate,
}: {
  exercise: Exercise;
  bodyWeight: number;
  sets: number;
  reps: number;
  loadKg: number;
  duration?: number;
  tempo?: number;
  rest?: number;
  rpe?: number;
  heartRate?: number;
}): WorkoutResult {
  const safeWeight = Math.min(300, Math.max(25, bodyWeight || 70));
  const setCount = Math.min(30, Math.max(1, sets || 1));
  const repCount = Math.min(100, Math.max(1, reps || 1));
  const safeLoad = Math.min(500, Math.max(0, loadKg || 0));
  const tempoSeconds = Math.min(15, Math.max(1, tempo || exercise.tempo));
  const restSeconds = Math.min(600, Math.max(0, rest ?? exercise.rest));
  const activeMinutes = Math.max(0.5, setCount * repCount * tempoSeconds / 60);
  const restMinutes = Math.max(0, (setCount - 1) * restSeconds / 60);
  const inferred = !duration;
  const totalMinutes = inferred ? activeMinutes + restMinutes : Math.max(1, duration || 1);
  const loadRatio = safeLoad / safeWeight;
  const loadModifier = Math.min(1.14, Math.max(0.9, 0.92 + loadRatio * 0.18));
  const rpeModifier = rpe ? Math.min(1.14, Math.max(0.86, 1 + (rpe - 7) * 0.045)) : 1;
  const heartModifier = heartRate ? Math.min(1.16, Math.max(0.9, 0.84 + (heartRate - 85) / 260)) : 1;
  const met = Math.min(12, Math.max(2.5, exercise.met * loadModifier * Math.max(rpeModifier, heartModifier)));
  const grossPerMinute = met * 3.5 * safeWeight / 200;
  const gross = inferred
    ? grossPerMinute * activeMinutes + 1.5 * 3.5 * safeWeight / 200 * restMinutes
    : grossPerMinute * totalMinutes;
  const net = Math.max(0, gross - 3.5 * safeWeight / 200 * totalMinutes);
  const uncertainty = inferred ? 0.17 : 0.12;
  return {
    grossLow: Math.round(gross * (1 - uncertainty)),
    grossHigh: Math.round(gross * (1 + uncertainty)),
    netLow: Math.round(net * (1 - uncertainty)),
    netHigh: Math.round(net * (1 + uncertainty)),
    duration: totalMinutes,
    met,
    inferred,
  };
}
