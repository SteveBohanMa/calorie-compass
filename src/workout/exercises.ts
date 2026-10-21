// Exercise library for the workout estimator (model v2, Calorie Compass v2.8).
//
// Strength exercises are estimated from mechanical work (see model.ts). Every strength entry
// therefore carries the geometry the model needs:
//   rangeM        vertical travel of the external load per repetition for a 175 cm adult (m);
//                 scaled by height / 175 at run time.
//   bodyFraction  share of body mass that rises through `rangeM` with each repetition
//                 (segment masses after Winter, Biomechanics and Motor Control of Human Movement;
//                 push-up / squat / lunge / sit-up shares checked against Rustaden 2020 force-plate data).
//   loadMode      how the number the user types becomes the external load (see LOAD_MODES).
//   efficiency    muscular efficiency class, calibrated in model.ts.
// Cardio and time-based entries use ACSM metabolic equations or 2024 Adult Compendium codes.

export type ExerciseGroup = "legs" | "chest" | "back" | "shoulders" | "arms" | "core" | "cardio" | "conditioning";
export type Equipment = "barbell" | "dumbbell" | "machine" | "cable" | "bodyweight" | "cardio" | "mixed";
export type LoadMode = "total" | "perDumbbell" | "single" | "stack" | "plates45" | "bodyweightAdded" | "assist";
export type EfficiencyClass = "lower" | "upper" | "pushup" | "isolation" | "shortRange" | "core";
export type IntensityBand = "light" | "moderate" | "vigorous" | "veryHard";

type Base = {
  id: string;
  zh: string;
  en: string;
  /** Extra search words (Chinese and English), space separated. */
  aliases: string;
  group: ExerciseGroup;
  equipment: Equipment;
  musclesZh: string;
  musclesEn: string;
  noteZh?: string;
  noteEn?: string;
};

export type StrengthExercise = Base & {
  kind: "strength";
  loadMode: LoadMode;
  rangeM: number;
  bodyFraction: number;
  /** True when the travel is set by the machine or the box, not by the person's height. */
  fixedRange?: boolean;
  sides: 1 | 2;
  efficiency: EfficiencyClass;
  defaults: { load: number; sets: number; reps: number; restSec: number; secPerRep: number };
};

type WalkRunDefaults = { defaults: { speedKmh: number; gradePct: number; minutes: number } };
export type WalkRunExercise = (Base & WalkRunDefaults & { kind: "walk" }) | (Base & WalkRunDefaults & { kind: "run" });

export type CycleExercise = Base & {
  kind: "cycle";
  defaults: { watts: number; minutes: number };
};

export type RowExercise = Base & {
  kind: "row";
  defaults: { watts: number; minutes: number };
};

export type MetLevel = {
  id: string;
  zh: string;
  en: string;
  met: number;
  /** 2024 Adult Compendium activity code. */
  code: string;
  band: IntensityBand;
};

export type MetExercise = Base & {
  kind: "met";
  /** Which heart-rate equation applies: Keytel 2005 for steady aerobic work, Collins 1991 for weight-lifting circuits. */
  hrModel: "keytel" | "collins" | "none";
  levels: MetLevel[];
  /** "holds": the user enters sets × seconds (e.g. plank) instead of minutes. */
  timeInput: "minutes" | "holds";
  defaults: { level: string; minutes: number };
};

export type Exercise = StrengthExercise | WalkRunExercise | CycleExercise | RowExercise | MetExercise;

/** Assumed weight of a 45° leg-press sled when the user enters only the plates. */
export const LEG_PRESS_SLED_KG = 40;

export const LOAD_MODES: Record<LoadMode, { zh: string; en: string; hintZh: string; hintEn: string }> = {
  total: { zh: "总重量（千克）", en: "Total load (kg)", hintZh: "杠铃含杠（标准杆 20 kg）", hintEn: "Barbell including the bar (standard bar 20 kg)" },
  perDumbbell: { zh: "每只哑铃（千克）", en: "Each dumbbell (kg)", hintZh: "按两手各持一只计算；次数填每侧次数", hintEn: "Counted as one dumbbell in each hand; reps are per side" },
  single: { zh: "哑铃/壶铃（千克）", en: "Dumbbell / kettlebell (kg)", hintZh: "只用一只哑铃或壶铃", hintEn: "One dumbbell or kettlebell" },
  stack: { zh: "配重片读数（千克）", en: "Weight stack (kg)", hintZh: "按配重片移动距离等于把手移动距离估算", hintEn: "Assumes the stack moves as far as the handle" },
  plates45: { zh: "加挂杠片（千克）", en: "Plates added (kg)", hintZh: `不含滑台；滑台自重按 ${LEG_PRESS_SLED_KG} kg 估`, hintEn: `Excluding the sled; the sled is assumed to weigh ${LEG_PRESS_SLED_KG} kg` },
  bodyweightAdded: { zh: "额外负重（千克）", en: "Added load (kg)", hintZh: "自重已自动计入；没有额外负重填 0", hintEn: "Body weight is included automatically; enter 0 for none" },
  assist: { zh: "辅助重量（千克）", en: "Assistance (kg)", hintZh: "器械辅助抵消的重量", hintEn: "Weight the machine takes off" },
};

export const GROUPS: { id: ExerciseGroup; zh: string; en: string }[] = [
  { id: "legs", zh: "腿臀", en: "Legs & glutes" },
  { id: "chest", zh: "胸", en: "Chest" },
  { id: "back", zh: "背", en: "Back" },
  { id: "shoulders", zh: "肩", en: "Shoulders" },
  { id: "arms", zh: "手臂", en: "Arms" },
  { id: "core", zh: "核心", en: "Core" },
  { id: "cardio", zh: "有氧", en: "Cardio" },
  { id: "conditioning", zh: "综合", en: "Conditioning" },
];

export const EQUIPMENT: { id: Equipment; zh: string; en: string }[] = [
  { id: "barbell", zh: "杠铃", en: "Barbell" },
  { id: "dumbbell", zh: "哑铃/壶铃", en: "Dumbbell / kettlebell" },
  { id: "machine", zh: "器械", en: "Machine" },
  { id: "cable", zh: "绳索", en: "Cable" },
  { id: "bodyweight", zh: "自重", en: "Body weight" },
  { id: "cardio", zh: "有氧器械", en: "Cardio machine" },
  { id: "mixed", zh: "综合", en: "Mixed" },
];

type StrengthSpec = Omit<StrengthExercise, "kind" | "defaults" | "sides" | "aliases"> & {
  sides?: 1 | 2;
  aliases?: string;
  defaults?: Partial<StrengthExercise["defaults"]>;
};

function strength(spec: StrengthSpec): StrengthExercise {
  return {
    ...spec,
    kind: "strength",
    aliases: spec.aliases ?? "",
    sides: spec.sides ?? 1,
    defaults: { load: 20, sets: 4, reps: 10, restSec: 90, secPerRep: 3, ...spec.defaults },
  };
}

export const EXERCISES: Exercise[] = [
  // ---------- Legs & glutes ----------
  strength({ id: "squat", zh: "杠铃深蹲", en: "Barbell back squat", aliases: "深蹲 后蹲 squat", group: "legs", equipment: "barbell", musclesZh: "股四头肌、臀大肌", musclesEn: "Quads, glutes", loadMode: "total", rangeM: 0.5, bodyFraction: 0.8, efficiency: "lower", defaults: { load: 60, reps: 8, restSec: 120 } }),
  strength({ id: "goblet-squat", zh: "高脚杯深蹲", en: "Goblet squat", aliases: "哑铃深蹲 壶铃深蹲", group: "legs", equipment: "dumbbell", musclesZh: "股四头肌、臀大肌", musclesEn: "Quads, glutes", loadMode: "single", rangeM: 0.48, bodyFraction: 0.8, efficiency: "lower", defaults: { load: 16, reps: 12 } }),
  strength({ id: "bw-squat", zh: "徒手深蹲", en: "Body-weight squat", aliases: "自重深蹲 空蹲", group: "legs", equipment: "bodyweight", musclesZh: "股四头肌、臀大肌", musclesEn: "Quads, glutes", loadMode: "bodyweightAdded", rangeM: 0.45, bodyFraction: 0.8, efficiency: "lower", defaults: { load: 0, reps: 15, restSec: 60 } }),
  strength({ id: "deadlift", zh: "传统硬拉", en: "Conventional deadlift", aliases: "硬拉 deadlift", group: "legs", equipment: "barbell", musclesZh: "臀、腘绳肌、竖脊肌", musclesEn: "Glutes, hamstrings, spinal erectors", loadMode: "total", rangeM: 0.58, bodyFraction: 0.45, efficiency: "lower", defaults: { load: 80, reps: 8, restSec: 120 } }),
  strength({ id: "rdl", zh: "罗马尼亚硬拉", en: "Romanian deadlift", aliases: "直腿硬拉 RDL", group: "legs", equipment: "barbell", musclesZh: "腘绳肌、臀大肌", musclesEn: "Hamstrings, glutes", loadMode: "total", rangeM: 0.4, bodyFraction: 0.4, efficiency: "lower", defaults: { load: 50, reps: 10 } }),
  strength({ id: "lunge", zh: "哑铃箭步蹲", en: "Dumbbell lunge", aliases: "弓步蹲 箭步蹲 lunge", group: "legs", equipment: "dumbbell", musclesZh: "股四头肌、臀大肌", musclesEn: "Quads, glutes", loadMode: "perDumbbell", rangeM: 0.38, bodyFraction: 0.78, sides: 2, efficiency: "lower", defaults: { load: 8, reps: 10 } }),
  strength({ id: "split-squat", zh: "保加利亚分腿蹲", en: "Bulgarian split squat", aliases: "分腿蹲 后脚抬高", group: "legs", equipment: "dumbbell", musclesZh: "股四头肌、臀大肌", musclesEn: "Quads, glutes", loadMode: "perDumbbell", rangeM: 0.4, bodyFraction: 0.8, sides: 2, efficiency: "lower", defaults: { load: 6, reps: 10 } }),
  strength({ id: "step-up", zh: "哑铃登阶", en: "Dumbbell step-up", aliases: "踏箱 登台阶", group: "legs", equipment: "dumbbell", musclesZh: "股四头肌、臀大肌", musclesEn: "Quads, glutes", loadMode: "perDumbbell", rangeM: 0.4, bodyFraction: 0.95, fixedRange: true, sides: 2, efficiency: "lower", noteZh: "幅度按 40 cm 跳箱估算", noteEn: "Assumes a 40 cm box", defaults: { load: 6, reps: 10 } }),
  strength({ id: "leg-press", zh: "45° 倒蹬", en: "45° leg press", aliases: "腿举 倒蹬机 挂片 leg press", group: "legs", equipment: "machine", musclesZh: "股四头肌、臀大肌", musclesEn: "Quads, glutes", loadMode: "plates45", rangeM: 0.32, bodyFraction: 0.1, fixedRange: true, efficiency: "lower", noteZh: "滑台行程按 45 cm、倾角 45° 换算竖直距离", noteEn: "Assumes 45 cm of sled travel on a 45° track", defaults: { load: 60, reps: 12 } }),
  strength({ id: "machine-leg-press", zh: "坐姿腿举（插片器械）", en: "Seated leg press (selectorised)", aliases: "腿举 器械腿举", group: "legs", equipment: "machine", musclesZh: "股四头肌、臀大肌", musclesEn: "Quads, glutes", loadMode: "stack", rangeM: 0.35, bodyFraction: 0.05, fixedRange: true, efficiency: "lower", defaults: { load: 60, reps: 12 } }),
  strength({ id: "hip-thrust", zh: "杠铃臀推", en: "Barbell hip thrust", aliases: "臀推 hip thrust", group: "legs", equipment: "barbell", musclesZh: "臀大肌", musclesEn: "Glutes", loadMode: "total", rangeM: 0.3, bodyFraction: 0.4, efficiency: "lower", defaults: { load: 60, reps: 10 } }),
  strength({ id: "glute-bridge", zh: "臀桥", en: "Glute bridge", aliases: "徒手臀桥", group: "legs", equipment: "bodyweight", musclesZh: "臀大肌", musclesEn: "Glutes", loadMode: "bodyweightAdded", rangeM: 0.2, bodyFraction: 0.4, efficiency: "lower", defaults: { load: 0, reps: 15, restSec: 60 } }),
  strength({ id: "leg-extension", zh: "腿屈伸", en: "Leg extension", aliases: "坐姿腿屈伸", group: "legs", equipment: "machine", musclesZh: "股四头肌", musclesEn: "Quads", loadMode: "stack", rangeM: 0.3, bodyFraction: 0.08, efficiency: "isolation", defaults: { load: 30, reps: 12, restSec: 60 } }),
  strength({ id: "leg-curl", zh: "腿弯举", en: "Leg curl", aliases: "俯卧腿弯举 坐姿腿弯举", group: "legs", equipment: "machine", musclesZh: "腘绳肌", musclesEn: "Hamstrings", loadMode: "stack", rangeM: 0.3, bodyFraction: 0.03, efficiency: "isolation", defaults: { load: 25, reps: 12, restSec: 60 } }),
  strength({ id: "calf-raise", zh: "站姿提踵", en: "Standing calf raise", aliases: "提踵 小腿", group: "legs", equipment: "bodyweight", musclesZh: "小腿三头肌", musclesEn: "Calves", loadMode: "bodyweightAdded", rangeM: 0.08, bodyFraction: 0.95, efficiency: "shortRange", noteZh: "额外负重可填器械配重或手持哑铃合计", noteEn: "Added load can be a machine stack or dumbbells (combined)", defaults: { load: 0, reps: 15, restSec: 60 } }),

  // ---------- Chest ----------
  strength({ id: "bench", zh: "杠铃卧推", en: "Barbell bench press", aliases: "卧推 平板卧推 bench", group: "chest", equipment: "barbell", musclesZh: "胸大肌、三角肌前束、肱三头肌", musclesEn: "Chest, front delts, triceps", loadMode: "total", rangeM: 0.4, bodyFraction: 0.05, efficiency: "upper", defaults: { load: 40, reps: 8, restSec: 120 } }),
  strength({ id: "db-bench", zh: "哑铃卧推", en: "Dumbbell bench press", aliases: "哑铃平板卧推", group: "chest", equipment: "dumbbell", musclesZh: "胸大肌、肱三头肌", musclesEn: "Chest, triceps", loadMode: "perDumbbell", rangeM: 0.4, bodyFraction: 0.05, efficiency: "upper", defaults: { load: 14, reps: 10 } }),
  strength({ id: "incline-bench", zh: "上斜卧推", en: "Incline bench press", aliases: "上斜 incline", group: "chest", equipment: "barbell", musclesZh: "上胸、三角肌前束", musclesEn: "Upper chest, front delts", loadMode: "total", rangeM: 0.36, bodyFraction: 0.05, efficiency: "upper", defaults: { load: 35, reps: 10 } }),
  strength({ id: "chest-press", zh: "器械推胸", en: "Machine chest press", aliases: "坐姿推胸", group: "chest", equipment: "machine", musclesZh: "胸大肌、肱三头肌", musclesEn: "Chest, triceps", loadMode: "stack", rangeM: 0.3, bodyFraction: 0, efficiency: "upper", defaults: { load: 35, reps: 12 } }),
  strength({ id: "pushup", zh: "俯卧撑", en: "Push-up", aliases: "俯卧撑 push up", group: "chest", equipment: "bodyweight", musclesZh: "胸大肌、肱三头肌、核心", musclesEn: "Chest, triceps, core", loadMode: "bodyweightAdded", rangeM: 0.3, bodyFraction: 0.68, efficiency: "pushup", defaults: { load: 0, reps: 10, restSec: 60 } }),
  strength({ id: "knee-pushup", zh: "跪姿俯卧撑", en: "Knee push-up", aliases: "跪姿 俯卧撑", group: "chest", equipment: "bodyweight", musclesZh: "胸大肌、肱三头肌", musclesEn: "Chest, triceps", loadMode: "bodyweightAdded", rangeM: 0.27, bodyFraction: 0.5, efficiency: "pushup", defaults: { load: 0, reps: 12, restSec: 60 } }),
  strength({ id: "pec-deck", zh: "器械夹胸", en: "Pec deck fly", aliases: "蝴蝶机 夹胸 飞鸟", group: "chest", equipment: "machine", musclesZh: "胸大肌", musclesEn: "Chest", loadMode: "stack", rangeM: 0.3, bodyFraction: 0, efficiency: "isolation", defaults: { load: 30, reps: 12, restSec: 60 } }),
  strength({ id: "dips", zh: "双杠臂屈伸", en: "Parallel-bar dip", aliases: "臂屈伸 双杠 dips", group: "chest", equipment: "bodyweight", musclesZh: "下胸、肱三头肌", musclesEn: "Lower chest, triceps", loadMode: "bodyweightAdded", rangeM: 0.3, bodyFraction: 0.94, efficiency: "upper", defaults: { load: 0, reps: 8 } }),

  // ---------- Back ----------
  strength({ id: "pullup", zh: "引体向上", en: "Pull-up", aliases: "引体 pull up chin up", group: "back", equipment: "bodyweight", musclesZh: "背阔肌、肱二头肌", musclesEn: "Lats, biceps", loadMode: "bodyweightAdded", rangeM: 0.5, bodyFraction: 0.95, efficiency: "upper", defaults: { load: 0, reps: 6, restSec: 120 } }),
  strength({ id: "assisted-pullup", zh: "辅助引体向上", en: "Assisted pull-up", aliases: "助力引体", group: "back", equipment: "machine", musclesZh: "背阔肌、肱二头肌", musclesEn: "Lats, biceps", loadMode: "assist", rangeM: 0.5, bodyFraction: 0.95, efficiency: "upper", defaults: { load: 50, reps: 8 } }),
  strength({ id: "pulldown", zh: "高位下拉", en: "Lat pulldown", aliases: "下拉 pulldown", group: "back", equipment: "cable", musclesZh: "背阔肌、肱二头肌", musclesEn: "Lats, biceps", loadMode: "stack", rangeM: 0.5, bodyFraction: 0, efficiency: "upper", defaults: { load: 40, reps: 12 } }),
  strength({ id: "seated-row", zh: "坐姿绳索划船", en: "Seated cable row", aliases: "坐姿划船 划船", group: "back", equipment: "cable", musclesZh: "背阔肌、菱形肌", musclesEn: "Lats, rhomboids", loadMode: "stack", rangeM: 0.4, bodyFraction: 0, efficiency: "upper", defaults: { load: 40, reps: 12 } }),
  strength({ id: "row", zh: "杠铃俯身划船", en: "Barbell bent-over row", aliases: "俯身划船 杠铃划船", group: "back", equipment: "barbell", musclesZh: "背阔肌、斜方肌", musclesEn: "Lats, traps", loadMode: "total", rangeM: 0.35, bodyFraction: 0.06, efficiency: "upper", defaults: { load: 40, reps: 10 } }),
  strength({ id: "db-row", zh: "单臂哑铃划船", en: "One-arm dumbbell row", aliases: "哑铃划船 单臂划船", group: "back", equipment: "dumbbell", musclesZh: "背阔肌", musclesEn: "Lats", loadMode: "single", rangeM: 0.35, bodyFraction: 0.03, sides: 2, efficiency: "upper", noteZh: "次数填每侧次数", noteEn: "Reps are per side", defaults: { load: 16, reps: 10 } }),
  strength({ id: "back-extension", zh: "山羊挺身", en: "Back extension", aliases: "罗马椅 背伸", group: "back", equipment: "bodyweight", musclesZh: "竖脊肌、臀大肌", musclesEn: "Spinal erectors, glutes", loadMode: "bodyweightAdded", rangeM: 0.4, bodyFraction: 0.5, efficiency: "upper", defaults: { load: 0, reps: 12, restSec: 60 } }),

  // ---------- Shoulders ----------
  strength({ id: "ohp", zh: "杠铃推举", en: "Barbell overhead press", aliases: "站姿推举 肩推 推举", group: "shoulders", equipment: "barbell", musclesZh: "三角肌、肱三头肌", musclesEn: "Delts, triceps", loadMode: "total", rangeM: 0.45, bodyFraction: 0.06, efficiency: "upper", defaults: { load: 30, reps: 8, restSec: 120 } }),
  strength({ id: "db-press", zh: "哑铃推举", en: "Dumbbell shoulder press", aliases: "哑铃肩推 坐姿推举", group: "shoulders", equipment: "dumbbell", musclesZh: "三角肌、肱三头肌", musclesEn: "Delts, triceps", loadMode: "perDumbbell", rangeM: 0.42, bodyFraction: 0.06, efficiency: "upper", defaults: { load: 10, reps: 10 } }),
  strength({ id: "lateral-raise", zh: "哑铃侧平举", en: "Dumbbell lateral raise", aliases: "侧平举 侧举", group: "shoulders", equipment: "dumbbell", musclesZh: "三角肌中束", musclesEn: "Side delts", loadMode: "perDumbbell", rangeM: 0.55, bodyFraction: 0.05, efficiency: "isolation", defaults: { load: 5, reps: 15, restSec: 60 } }),
  strength({ id: "face-pull", zh: "绳索面拉", en: "Cable face pull", aliases: "面拉", group: "shoulders", equipment: "cable", musclesZh: "三角肌后束、斜方肌", musclesEn: "Rear delts, traps", loadMode: "stack", rangeM: 0.35, bodyFraction: 0, efficiency: "isolation", defaults: { load: 20, reps: 15, restSec: 60 } }),
  strength({ id: "shrug", zh: "耸肩", en: "Shrug", aliases: "杠铃耸肩 哑铃耸肩", group: "shoulders", equipment: "barbell", musclesZh: "斜方肌上部", musclesEn: "Upper traps", loadMode: "total", rangeM: 0.1, bodyFraction: 0.25, efficiency: "shortRange", noteZh: "用哑铃时填两只合计", noteEn: "With dumbbells, enter both combined", defaults: { load: 60, reps: 12, restSec: 60 } }),

  // ---------- Arms ----------
  strength({ id: "curl", zh: "哑铃弯举", en: "Dumbbell curl", aliases: "二头弯举 弯举 锤式弯举 curl", group: "arms", equipment: "dumbbell", musclesZh: "肱二头肌", musclesEn: "Biceps", loadMode: "perDumbbell", rangeM: 0.55, bodyFraction: 0.025, efficiency: "isolation", defaults: { load: 8, reps: 12, restSec: 60 } }),
  strength({ id: "barbell-curl", zh: "杠铃弯举", en: "Barbell curl", aliases: "二头弯举 曲杠弯举", group: "arms", equipment: "barbell", musclesZh: "肱二头肌", musclesEn: "Biceps", loadMode: "total", rangeM: 0.55, bodyFraction: 0.025, efficiency: "isolation", defaults: { load: 20, reps: 10, restSec: 60 } }),
  strength({ id: "pushdown", zh: "绳索下压", en: "Cable triceps pushdown", aliases: "三头下压 下压", group: "arms", equipment: "cable", musclesZh: "肱三头肌", musclesEn: "Triceps", loadMode: "stack", rangeM: 0.35, bodyFraction: 0, efficiency: "isolation", defaults: { load: 20, reps: 12, restSec: 60 } }),
  strength({ id: "overhead-extension", zh: "哑铃颈后臂屈伸", en: "Overhead triceps extension", aliases: "颈后臂屈伸 三头", group: "arms", equipment: "dumbbell", musclesZh: "肱三头肌", musclesEn: "Triceps", loadMode: "single", rangeM: 0.35, bodyFraction: 0.02, efficiency: "isolation", noteZh: "双手共持一只哑铃", noteEn: "One dumbbell held with both hands", defaults: { load: 12, reps: 12, restSec: 60 } }),

  // ---------- Core ----------
  strength({ id: "crunch", zh: "卷腹", en: "Crunch", aliases: "腹肌 卷腹", group: "core", equipment: "bodyweight", musclesZh: "腹直肌", musclesEn: "Abs", loadMode: "bodyweightAdded", rangeM: 0.15, bodyFraction: 0.2, efficiency: "core", defaults: { load: 0, reps: 20, restSec: 60 } }),
  strength({ id: "situp", zh: "仰卧起坐", en: "Sit-up", aliases: "仰卧起坐 sit up", group: "core", equipment: "bodyweight", musclesZh: "腹直肌、髂腰肌", musclesEn: "Abs, hip flexors", loadMode: "bodyweightAdded", rangeM: 0.35, bodyFraction: 0.45, efficiency: "core", defaults: { load: 0, reps: 15, restSec: 60 } }),
  strength({ id: "leg-raise", zh: "悬垂举腿", en: "Hanging leg raise", aliases: "举腿 悬垂", group: "core", equipment: "bodyweight", musclesZh: "腹直肌、髂腰肌", musclesEn: "Abs, hip flexors", loadMode: "bodyweightAdded", rangeM: 0.45, bodyFraction: 0.32, efficiency: "core", defaults: { load: 0, reps: 10, restSec: 60 } }),
  {
    id: "plank", zh: "平板支撑", en: "Plank", aliases: "平板 plank", group: "core", equipment: "bodyweight",
    musclesZh: "核心", musclesEn: "Core", kind: "met", hrModel: "none", timeInput: "holds",
    levels: [{ id: "light", zh: "一般", en: "Standard", met: 2.8, code: "02024", band: "light" }],
    defaults: { level: "light", minutes: 2 },
  },

  // ---------- Cardio ----------
  { id: "walk", zh: "快走 / 坡度走", en: "Walking / incline walk", aliases: "跑步机 走路 散步 爬坡 incline treadmill", group: "cardio", equipment: "cardio", musclesZh: "心肺、下肢", musclesEn: "Cardio, legs", kind: "walk", noteZh: "不扶扶手；扶扶手会明显降低消耗", noteEn: "Without holding the handrails; holding them lowers the cost", defaults: { speedKmh: 5, gradePct: 6, minutes: 30 } },
  { id: "run", zh: "跑步", en: "Running", aliases: "慢跑 跑步机 jogging", group: "cardio", equipment: "cardio", musclesZh: "心肺、下肢", musclesEn: "Cardio, legs", kind: "run", defaults: { speedKmh: 8, gradePct: 0, minutes: 20 } },
  { id: "bike", zh: "功率车 / 动感单车", en: "Stationary bike", aliases: "单车 骑行 动感单车 健身车 cycling", group: "cardio", equipment: "cardio", musclesZh: "心肺、下肢", musclesEn: "Cardio, legs", kind: "cycle", noteZh: "按仪表显示的平均功率（瓦）计算", noteEn: "Uses the average power (watts) on the console", defaults: { watts: 80, minutes: 30 } },
  { id: "rower", zh: "划船机", en: "Rowing machine", aliases: "划船 rowing", group: "cardio", equipment: "cardio", musclesZh: "心肺、全身", musclesEn: "Cardio, full body", kind: "row", noteZh: "按仪表显示的平均功率（瓦）分档", noteEn: "Uses the console's average power (watts)", defaults: { watts: 80, minutes: 20 } },
  {
    id: "elliptical", zh: "椭圆机", en: "Elliptical trainer", aliases: "椭圆 elliptical", group: "cardio", equipment: "cardio",
    musclesZh: "心肺、全身", musclesEn: "Cardio, full body", kind: "met", hrModel: "keytel", timeInput: "minutes",
    noteZh: "器械屏幕显示的热量通常偏高（Mier & Feito 2006）", noteEn: "Machine calorie displays tend to read high (Mier & Feito 2006)",
    levels: [
      { id: "moderate", zh: "中等", en: "Moderate", met: 5.0, code: "02048", band: "moderate" },
      { id: "vigorous", zh: "费力", en: "Vigorous", met: 9.0, code: "02049", band: "vigorous" },
    ],
    defaults: { level: "moderate", minutes: 30 },
  },
  {
    id: "stair", zh: "爬楼机 / 爬楼梯", en: "Stair climber", aliases: "爬楼 楼梯机 stairmaster", group: "cardio", equipment: "cardio",
    musclesZh: "心肺、下肢", musclesEn: "Cardio, legs", kind: "met", hrModel: "keytel", timeInput: "minutes",
    noteZh: "扶着扶手会降低消耗", noteEn: "Leaning on the handrails lowers the cost",
    levels: [
      { id: "slow", zh: "慢速", en: "Slow", met: 4.5, code: "17133", band: "moderate" },
      { id: "general", zh: "一般", en: "General", met: 6.8, code: "17131", band: "vigorous" },
      { id: "fast", zh: "快速", en: "Fast", met: 9.3, code: "17134", band: "veryHard" },
    ],
    defaults: { level: "general", minutes: 20 },
  },
  {
    id: "jump-rope", zh: "跳绳", en: "Jump rope", aliases: "跳绳 rope", group: "cardio", equipment: "mixed",
    musclesZh: "心肺、小腿", musclesEn: "Cardio, calves", kind: "met", hrModel: "keytel", timeInput: "minutes",
    levels: [
      { id: "steady", zh: "约 120 次/分", en: "About 120 skips/min", met: 9.0, code: "02069", band: "vigorous" },
      { id: "general", zh: "一般/较快", en: "General / faster", met: 11.0, code: "02068", band: "veryHard" },
    ],
    defaults: { level: "steady", minutes: 10 },
  },

  // ---------- Conditioning (whole-session, time-based) ----------
  {
    id: "hiit", zh: "高强度间歇（HIIT）", en: "High-intensity interval training", aliases: "HIIT 间歇 波比 tabata", group: "conditioning", equipment: "mixed",
    musclesZh: "全身", musclesEn: "Full body", kind: "met", hrModel: "keytel", timeInput: "minutes",
    levels: [
      { id: "moderate", zh: "中等", en: "Moderate", met: 7.0, code: "02210", band: "vigorous" },
      { id: "vigorous", zh: "费力", en: "Vigorous", met: 11.0, code: "02214", band: "veryHard" },
    ],
    defaults: { level: "moderate", minutes: 20 },
  },
  {
    id: "circuit", zh: "循环训练", en: "Circuit training", aliases: "循环 超级组 circuit", group: "conditioning", equipment: "mixed",
    musclesZh: "全身", musclesEn: "Full body", kind: "met", hrModel: "collins", timeInput: "minutes",
    levels: [
      { id: "light", zh: "轻松", en: "Light", met: 3.5, code: "02034", band: "light" },
      { id: "moderate", zh: "中等", en: "Moderate", met: 5.0, code: "02035", band: "moderate" },
      { id: "supersets", zh: "力量循环/超级组", en: "Resistance circuit / supersets", met: 5.8, code: "02055", band: "vigorous" },
      { id: "vigorous", zh: "高强度少休息", en: "Vigorous, minimal rest", met: 7.5, code: "02040", band: "veryHard" },
    ],
    defaults: { level: "supersets", minutes: 30 },
  },
  {
    id: "strength-session", zh: "力量训练（只知道时长）", en: "Strength session (time only)", aliases: "撸铁 力量训练 健身房 weight training", group: "conditioning", equipment: "mixed",
    musclesZh: "全身", musclesEn: "Full body", kind: "met", hrModel: "collins", timeInput: "minutes",
    noteZh: "只知道总时长时使用；能按动作逐个记录会更准", noteEn: "Use only when you know just the duration; logging each exercise is more accurate",
    levels: [
      { id: "general", zh: "一般（多个动作，8–15 次/组）", en: "General (several exercises, 8–15 reps)", met: 3.5, code: "02054", band: "moderate" },
      { id: "vigorous", zh: "大强度（大重量/健美式）", en: "Vigorous (heavy / body-building style)", met: 6.0, code: "02050", band: "vigorous" },
    ],
    defaults: { level: "general", minutes: 60 },
  },
];

// A Map, so ids read from storage such as "constructor" never resolve to Object.prototype members.
const EXERCISE_BY_ID = new Map<string, Exercise>(EXERCISES.map((exercise) => [exercise.id, exercise]));

export function findExercise(id: string): Exercise | undefined {
  return EXERCISE_BY_ID.get(id);
}

export function searchExercises(query: string, group: ExerciseGroup | "all" = "all", equipment: Equipment | "all" = "all") {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return EXERCISES.filter((exercise) => {
    if (group !== "all" && exercise.group !== group) return false;
    if (equipment !== "all" && exercise.equipment !== equipment) return false;
    if (!words.length) return true;
    const haystack = `${exercise.zh} ${exercise.en} ${exercise.aliases} ${exercise.musclesZh} ${exercise.musclesEn}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
