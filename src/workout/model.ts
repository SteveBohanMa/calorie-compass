// Workout energy model v2 (Calorie Compass v2.8). Pure functions: no React, no storage.
//
// What is counted
//   Extra energy = energy spent because of the exercise, above resting metabolism. For strength work it
//   is the oxygen used during the sets, during the rests between sets (recovery of each set) and after
//   the last set (excess post-exercise oxygen consumption, EPOC). The lactate-equivalent "anaerobic"
//   energy is not added on top, because recovery oxygen already pays it back.
//   Following the product rules: between-set recovery and resting metabolism are only counted when the
//   user enters the rest time (which also fixes the session length; the same holds for planks); post-exercise
//   recovery is always counted. An average heart rate replaces the model's energy for the time it covers.
//
// Strength (work-based)
//   work per set (kg·m) = sides × reps × range × height/175 × (external load + body share × body mass)
//   full extra energy per set = work × 9.80665 / 4184 / efficiency × tempo factor
//   Efficiency ranges per exercise class come from studies that measured oxygen use and recovery for
//   known loads: Scott et al. 2011/2012/2014, Brown et al. 1994, Dudley et al. 1991, Ratamess et al. 2015,
//   Vezina et al. 2014, Nakagata et al. 2022, Farinatti & Castinheiras Neto 2011, Pafili et al. 2010.
//   When it is spent: the share during the set follows oxygen-uptake on-kinetics (τ ≈ 40 s, so ≈ 24 % for
//   a 30-s set as in Scott 2014, more for longer sets; Özyener et al. 2001 measured τ ≈ 30–40 s for the
//   fast phase); the rest is recovery after the set (87 %) and prolonged EPOC (13 %). Recovery runs with
//   τ ≈ 60 s (fast off-phase plus part of the slow component after heavy work), so a short rest leaves
//   part of it for later; the total does not depend on rest length (Farinatti 2011).
//
// Cardio
//   ACSM metabolic equations for walking, running and leg cycling; 2024 Adult Compendium METs otherwise.
//   Extra energy is gross energy minus the person's own resting metabolism (Mifflin–St Jeor), not minus
//   1 MET = 3.5 mL/kg/min, which overstates resting metabolism by 20–35 % in heavier adults
//   (Byrne 2005, McMurray 2014). Rowing power is scaled to a 75 kg reference rower.
//
// Optional signals
//   Heart rate: Keytel 2005 for steady aerobic work; Collins 1991 (weight lifting specific) for strength,
//   combined with the model by inverse-variance weighting on a log scale.
//   RPE (1–10): scales the recovery part of strength sets (closer to failure → larger recovery cost,
//   Thornton & Potteiger 2002; Scott 2011) and picks or informs the intensity of time-based activities.

import {
  LEG_PRESS_SLED_KG,
  type CycleExercise,
  type EfficiencyClass,
  type Exercise,
  type IntensityBand,
  type MetExercise,
  type MetLevel,
  type RowExercise,
  type StrengthExercise,
  type WalkRunExercise,
} from "./exercises";

export const WORKOUT_MODEL_VERSION = 2;
/** kcal per litre of oxygen (Compendium / ACSM convention). */
export const KCAL_PER_LITRE_O2 = 5.0;
/** Mechanical energy of lifting 1 kg by 1 m, in kcal. */
export const KCAL_PER_KG_M = 9.80665 / 4184;
export const REFERENCE_HEIGHT_CM = 175;
/** Ranges are drawn as the central 80 % of a log-normal error (z = 1.2816). */
const Z80 = 1.2816;

/**
 * Muscular efficiency bounds per class (extra energy incl. recovery, relative to concentric mechanical work
 * including the lifted share of body mass). Wide on purpose: published measurements disagree by about 3.5×.
 * Lower body: Brown 1994 / Dudley 1991 imply ≈ 6–8 %; Scott et al. 2014 (Smith machine, oxygen during the
 * set + recovery) imply 13–15 % for the deadlift and 17–23 % for the squat.
 */
export const EFFICIENCY: Record<EfficiencyClass, { low: number; high: number }> = {
  lower: { low: 0.065, high: 0.23 },
  upper: { low: 0.055, high: 0.12 },
  pushup: { low: 0.05, high: 0.1 },
  isolation: { low: 0.04, high: 0.08 },
  shortRange: { low: 0.045, high: 0.13 },
  core: { low: 0.035, high: 0.075 },
};

/** Oxygen-uptake on-kinetics time constant (s) used to split a set's energy into "during" and "after". */
export const ON_KINETICS_TAU_S = 40;
/** Recovery time constant (s): the share of a set's recovery completed within a rest of r seconds is 1 − e^(−r/τ). */
export const RECOVERY_TAU_S = 60;
/** Of the energy after a set, the share that is prolonged EPOC rather than the minutes right after it (Scott 2014: 65:10). */
export const PROLONGED_SHARE_OF_RECOVERY = 0.13;
/** Heart-rate averages over less than this many minutes are not used. */
export const MIN_HEART_RATE_MINUTES = 3;
/** Error of the resting-metabolism equation (Frankenfield 2013: ~80 % within ±11 %). */
const RESTING_SIGMA = 0.09;

/** Typical seconds per repetition in the calibration studies (1.5 s up, 1.5 s down). */
export const REFERENCE_SECONDS_PER_REP = 3;

/** Accepted input ranges. The form rejects values outside them instead of letting the model clamp silently. */
export const INPUT_LIMITS = {
  sets: { min: 1, max: 30, integer: true },
  reps: { min: 1, max: 100, integer: true },
  loadKg: { min: 0, max: 600, integer: false },
  restSec: { min: 0, max: 900, integer: false },
  secPerRep: { min: 1, max: 15, integer: false },
  holdSeconds: { min: 5, max: 600, integer: true },
  minutes: { min: 1, max: 600, integer: false },
  speedKmh: { min: 1, max: 25, integer: false },
  gradePct: { min: 0, max: 40, integer: false },
  watts: { min: 10, max: 600, integer: false },
  rpe: { min: 1, max: 10, integer: false },
  avgHr: { min: 40, max: 230, integer: true },
} as const;

/** Share of a set's extra energy spent while the set is still running, from VO2 on-kinetics. */
export function duringShareForSet(setSeconds: number) {
  const seconds = Math.max(0.1, setSeconds);
  const lagged = (ON_KINETICS_TAU_S / seconds) * (1 - Math.exp(-seconds / ON_KINETICS_TAU_S));
  return clamp(0.8 * (1 - lagged), 0.15, 0.6);
}

/** Share of a set's recovery that happens within a rest of `restSec` seconds. */
export function recoveredWithin(restSec: number) {
  return 1 - Math.exp(-Math.max(0, restSec) / RECOVERY_TAU_S);
}

/**
 * Recovery of sets 1…n−1 that physically happens before the last set ends (during later rests and sets),
 * i.e. inside the time an average heart rate over "sets + rests" covers. Set k's recovery has
 * (n − k) × (rest + set) seconds left in that window.
 */
export function recoveryInSessionWindow(sets: number, restSec: number, setSeconds: number, recoveryPerSet: number) {
  let total = 0;
  for (let k = 1; k < sets; k += 1) total += recoveryPerSet * recoveredWithin((sets - k) * (Math.max(0, restSec) + setSeconds));
  return total;
}

export type Sex = "male" | "female" | "unspecified";

export type BodyProfile = {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  /** Jackson 1990 physical activity rating, 0–7. */
  activityRating?: number | null;
  /** Measured maximal oxygen uptake, mL/kg/min. */
  vo2max?: number | null;
  /** Measured maximal heart rate, bpm. */
  hrMax?: number | null;
};

export type Range = { low: number; mid: number; high: number };

export type WorkoutInput = {
  loadKg?: number;
  sets?: number;
  reps?: number;
  /** Seconds of rest between sets. null/undefined = not entered. */
  restSec?: number | null;
  secPerRep?: number | null;
  /** Seconds per hold for hold-type exercises (plank). */
  holdSeconds?: number;
  minutes?: number;
  speedKmh?: number;
  gradePct?: number;
  watts?: number;
  level?: string;
  rpe?: number | null;
  avgHr?: number | null;
};

export type ComponentKey = "during" | "between" | "post" | "exercise" | "epoc" | "resting";
export type EnergyComponent = { key: ComponentKey; kcal: Range; included: boolean };

export type EstimateNote =
  | "between-excluded"
  | "resting-excluded"
  | "hr-assumed-rest"
  | "hr-window-short"
  | "hr-above-max"
  | "hr-too-low"
  | "hr-outside-validated"
  | "hr-not-applicable"
  | "vo2max-estimated"
  | "near-max"
  | "high-intensity"
  | "weight-bias"
  | "walk-speed-high"
  | "walk-speed-low"
  | "run-speed-low"
  | "watts-outside-validated"
  | "assist-cancels-body"
  | "no-work"
  | "sled-assumed"
  | "age-outside-validated"
  | "rpe-not-applicable";

export type HeartRateUse = {
  method: "keytel" | "collins";
  used: boolean;
  /** Share of the final estimate that came from heart rate (0–1). */
  weight: number;
  percentMax: number;
  hrMax: number;
  hrMaxMeasured: boolean;
  vo2max?: number;
  vo2maxMeasured?: boolean;
  /** kcal the heart-rate route alone gave for the part it covers. */
  heartRateKcal?: number;
  /** kcal the model alone gave for the same part. */
  modelKcal?: number;
};

export type RpeUse = {
  used: boolean;
  /** The effort the user entered (1–10). */
  value: number;
  /** Strength: multiplier on the recovery part. */
  factor?: number;
  levelId?: string;
  /** Cardio: share of the estimate that came from effort, and what effort alone gave. */
  weight?: number;
  rpeKcalPerMinute?: number;
  reserveFraction?: number;
};

export type StrengthDetail = {
  type: "strength";
  sets: number;
  reps: number;
  sides: 1 | 2;
  externalLoadKg: number;
  bodyMassMovedKg: number;
  rangeM: number;
  workPerSetKgM: number;
  mechanicalKcalPerSet: number;
  efficiency: { low: number; mid: number; high: number };
  secPerRep: number;
  setSeconds: number;
  /** Share of a set's extra energy spent during the set. */
  duringShare: number;
  /** Share of each set's recovery that falls within the entered rest (null when rest was not entered). */
  recoveredInRest: number | null;
  tempoFactor: number;
  rpeFactor: number;
  restSec: number | null;
  /** Heart-rate window rest when the rest was not entered (the exercise's typical rest). */
  assumedRestSec: number | null;
};

export type CardioDetail = {
  type: "cardio";
  equation: "acsm-walk" | "acsm-run" | "acsm-cycle" | "compendium";
  minutes: number;
  met?: number;
  code?: string;
  levelId?: string;
  /** Net kcal/min from the equation or Compendium value alone (before heart rate / RPE). */
  equationKcalPerMinute: number;
  /** ACSM walking/running only: the equation's net VO2 above 3.5 mL/kg/min. */
  equationNetVo2PerKg?: number;
  /** The person's resting VO2 (mL/kg/min) from Mifflin–St Jeor. */
  restingVo2PerKg: number;
  /** Rowing only: body mass used for the power-related part. */
  effectiveMassKg?: number;
  netKcalPerMinute: number;
  grossVo2PerKg: number;
  vo2max: number;
  vo2maxMeasured: boolean;
  epocFraction: number;
};

export type WorkoutEstimate = {
  modelVersion: number;
  exerciseId: string;
  kind: Exercise["kind"];
  /** "total": extra + resting metabolism is the headline; "training": only the counted extra energy. */
  headline: "total" | "training";
  extra: Range;
  total: Range | null;
  components: EnergyComponent[];
  /** Session length when known (strength and holds: sets + entered rests; cardio: entered minutes). */
  sessionMinutes: number | null;
  /** Time under load / time moving. */
  activeMinutes: number;
  perSet: Range | null;
  restingKcalPerDay: number;
  heartRate: HeartRateUse | null;
  rpe: RpeUse | null;
  relativeIntensity: number | null;
  notes: EstimateNote[];
  detail: StrengthDetail | CardioDetail;
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function optionalNumber(value: number | null | undefined, min: number, max: number) {
  return finite(value) && value >= min && value <= max ? value : null;
}

export function logRange(mid: number, sigma: number): Range {
  const safe = Math.max(0, mid);
  return { low: safe * Math.exp(-Z80 * sigma), mid: safe, high: safe * Math.exp(Z80 * sigma) };
}

export function sumRanges(ranges: Range[]): Range {
  return ranges.reduce((total, range) => ({ low: total.low + range.low, mid: total.mid + range.mid, high: total.high + range.high }), { low: 0, mid: 0, high: 0 });
}

function sigmaFromBounds(low: number, high: number) {
  return Math.log(high / low) / (2 * Z80);
}

export function efficiencyFor(efficiency: EfficiencyClass) {
  const { low, high } = EFFICIENCY[efficiency];
  return { low, high, mid: Math.sqrt(low * high), sigma: sigmaFromBounds(low, high) };
}

/** Mifflin–St Jeor (1990) resting energy expenditure, kcal/day. "unspecified" uses the mean of both equations. */
export function restingKcalPerDay(profile: BodyProfile) {
  const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;
  const sexTerm = profile.sex === "male" ? 5 : profile.sex === "female" ? -161 : -78;
  return Math.max(600, base + sexTerm);
}

export function restingKcalPerMinute(profile: BodyProfile) {
  return restingKcalPerDay(profile) / 1440;
}

/** Measured maximal heart rate, or Tanaka et al. 2001: 208 − 0.7 × age. */
export function maxHeartRate(profile: BodyProfile) {
  const measured = optionalNumber(profile.hrMax, 100, 230);
  return measured !== null ? { value: measured, measured: true } : { value: 208 - 0.7 * profile.age, measured: false };
}

/** Rating used when the person has not chosen one (regular light activity 10–60 min/week). */
export const DEFAULT_ACTIVITY_RATING = 2;

/** Measured VO2max, or the Jackson et al. 1990 non-exercise BMI model (SE 5.6 mL/kg/min). */
export function maxOxygenUptake(profile: BodyProfile) {
  const measured = optionalNumber(profile.vo2max, 10, 90);
  if (measured !== null) return { value: measured, measured: true, ratingAssumed: false };
  const rating = optionalNumber(profile.activityRating, 0, 7);
  const bmi = profile.weightKg / (profile.heightCm / 100) ** 2;
  const sexTerm = profile.sex === "male" ? 1 : profile.sex === "female" ? 0 : 0.5;
  const value = 56.363 + 1.921 * (rating ?? DEFAULT_ACTIVITY_RATING) - 0.381 * profile.age - 0.754 * bmi + 10.987 * sexTerm;
  return { value: clamp(value, 12, 80), measured: false, ratingAssumed: rating === null };
}

/** Inverse-variance combination of two log-normal estimates. */
export function combineEstimates(modelMid: number, modelSigma: number, otherMid: number, otherSigma: number) {
  const modelWeight = 1 / modelSigma ** 2;
  const otherWeight = 1 / otherSigma ** 2;
  const logMid = (modelWeight * Math.log(modelMid) + otherWeight * Math.log(otherMid)) / (modelWeight + otherWeight);
  return { mid: Math.exp(logMid), sigma: Math.sqrt(1 / (modelWeight + otherWeight)), otherShare: otherWeight / (modelWeight + otherWeight) };
}

/** Collins et al. 1991: during weight lifting, %VO2max = 0.582 × %HRmax − 1.7911. Returns net kcal over `minutes`. */
export function collinsNetKcal(profile: BodyProfile, avgHr: number, minutes: number) {
  const hrMax = maxHeartRate(profile);
  const vo2max = maxOxygenUptake(profile);
  const percentMax = (100 * avgHr) / hrMax.value;
  const percentVo2 = 0.582 * percentMax - 1.7911;
  const grossVo2PerKg = (percentVo2 / 100) * vo2max.value;
  const grossKcal = (grossVo2PerKg * profile.weightKg / 1000) * KCAL_PER_LITRE_O2 * minutes;
  const net = grossKcal - restingKcalPerMinute(profile) * minutes;
  const measuredInputs = Number(hrMax.measured) + Number(vo2max.measured);
  // Collins scatter plus Jackson (SE 5.6 mL/kg/min ≈ 16 %) plus the net conversion.
  let sigma = measuredInputs === 2 ? 0.18 : measuredInputs === 1 ? 0.25 : 0.35;
  if (!vo2max.measured && vo2max.ratingAssumed) sigma += 0.05;
  // Collins measured 63–82 % HRmax during lifting circuits.
  const widened = percentMax < 60 || percentMax > 85;
  if (widened) sigma *= 1.5;
  return { net, sigma, percentMax, widened, hrMax, vo2max };
}

/** Keytel et al. 2005 equation without VO2max (kJ/min), converted to net kcal/min. */
export function keytelNetKcalPerMinute(profile: BodyProfile, avgHr: number) {
  const { weightKg: weight, age } = profile;
  const male = -55.0969 + 0.6309 * avgHr + 0.1988 * weight + 0.2017 * age;
  const female = -20.4022 + 0.4472 * avgHr - 0.1263 * weight + 0.074 * age;
  const kj = profile.sex === "male" ? male : profile.sex === "female" ? female : (male + female) / 2;
  const net = kj / 4.184 - restingKcalPerMinute(profile);
  const hrMax = maxHeartRate(profile);
  const percentMax = (100 * avgHr) / hrMax.value;
  // Developed on 18–45-year-olds, 47–120 kg, at 57–90 % HRmax in steady state; the female equation has a
  // negative weight term and was fitted on few heavy women.
  const widened = percentMax < 55 || percentMax > 92 || age < 18 || age > 45 || weight < 47 || weight > 120
    || profile.sex === "unspecified" || (profile.sex === "female" && weight > 85);
  return { netPerMinute: net, sigma: 0.25 * (widened ? 1.5 : 1), percentMax, widened, hrMax };
}

/** EPOC as a share of net exercise energy by relative intensity (LaForgia 2006; Børsheim & Bahr 2003). */
export function epocFraction(relativeIntensity: number) {
  if (relativeIntensity < 0.5) return 0.03;
  if (relativeIntensity < 0.75) return 0.03 + (0.07 * (relativeIntensity - 0.5)) / 0.25;
  return Math.min(0.15, 0.1 + (0.05 * (relativeIntensity - 0.75)) / 0.25);
}

/** Prolonged EPOC share used for time-based resistance sessions (Kelleher 2010; Haltom 1999). */
export const RESISTANCE_SESSION_EPOC = 0.12;

/** 2024 Compendium stationary-rowing codes (<100, 100–149, 150–199, ≥200 W) interpolated between bin centres. */
export function rowingMet(watts: number) {
  const points: [number, number][] = [[75, 5.0], [125, 7.5], [175, 11.0], [225, 14.0]];
  if (watts <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x0, y0] = points[index - 1];
    if (watts <= x1) return y0 + ((y1 - y0) * (watts - x0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}

const BAND_ORDER: IntensityBand[] = ["light", "moderate", "vigorous", "veryHard"];

/**
 * The app's 1–10 effort scale: 1–3 light, 4–6 moderate, 7–8 vigorous, 9–10 near maximal
 * (in line with the 0–10 relative-intensity scale of the Physical Activity Guidelines, where moderate is 5–6
 * and vigorous starts at 7–8).
 */
export function bandForRpe(rpe: number): IntensityBand {
  if (rpe < 4) return "light";
  if (rpe < 7) return "moderate";
  if (rpe < 9) return "vigorous";
  return "veryHard";
}

export function levelForRpe(exercise: MetExercise, rpe: number): MetLevel {
  const target = BAND_ORDER.indexOf(bandForRpe(rpe));
  let best = exercise.levels[0];
  let bestDistance = Infinity;
  for (const level of exercise.levels) {
    const distance = Math.abs(BAND_ORDER.indexOf(level.band) - target);
    if (distance < bestDistance) {
      best = level;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Effort (1–10) → fraction of oxygen-uptake reserve, following the ACSM bands
 * (light 30–39 %, moderate 40–59 %, vigorous 60–89 %, near maximal ≥ 90 % VO2R).
 */
export function reserveFractionForRpe(rpe: number) {
  return clamp(0.2 + 0.081 * (rpe - 1), 0.15, 0.95);
}

function externalLoad(exercise: StrengthExercise, load: number) {
  switch (exercise.loadMode) {
    case "perDumbbell":
      return 2 * load;
    case "plates45":
      return load + LEG_PRESS_SLED_KG;
    case "assist":
      return -load;
    default:
      return load;
  }
}

function ageNote(profile: BodyProfile, notes: EstimateNote[]) {
  // Mifflin–St Jeor was developed on adults aged 19–78.
  if (profile.age < 19 || profile.age > 78) notes.push("age-outside-validated");
}

function heartRateBase(method: "keytel" | "collins", profile: BodyProfile, avgHr: number): HeartRateUse {
  const hrMax = maxHeartRate(profile);
  return { method, used: false, weight: 0, percentMax: (100 * avgHr) / hrMax.value, hrMax: hrMax.value, hrMaxMeasured: hrMax.measured };
}

/** Rejects implausible averages before any equation is applied. Returns the note, or null when usable. */
function heartRateProblem(percentMax: number, minimumPercent: number): EstimateNote | null {
  if (percentMax > 100) return "hr-above-max";
  if (percentMax < minimumPercent) return "hr-too-low";
  return null;
}

function estimateStrength(exercise: StrengthExercise, input: WorkoutInput, profile: BodyProfile): WorkoutEstimate {
  const notes: EstimateNote[] = [];
  ageNote(profile, notes);
  const limits = INPUT_LIMITS;
  const sets = Math.round(clamp(finite(input.sets) ? input.sets : exercise.defaults.sets, limits.sets.min, limits.sets.max));
  const reps = Math.round(clamp(finite(input.reps) ? input.reps : exercise.defaults.reps, limits.reps.min, limits.reps.max));
  const load = clamp(finite(input.loadKg) ? input.loadKg : exercise.defaults.load, limits.loadKg.min, limits.loadKg.max);
  const restSec = optionalNumber(input.restSec, limits.restSec.min, limits.restSec.max);
  const restGiven = restSec !== null;
  const secPerRep = optionalNumber(input.secPerRep, limits.secPerRep.min, limits.secPerRep.max) ?? exercise.defaults.secPerRep;
  const rpe = optionalNumber(input.rpe, limits.rpe.min, limits.rpe.max);
  const avgHr = optionalNumber(input.avgHr, limits.avgHr.min, limits.avgHr.max);

  const externalLoadKg = externalLoad(exercise, load);
  const bodyMassMovedKg = exercise.bodyFraction * profile.weightKg;
  const movingMass = Math.max(0, externalLoadKg + bodyMassMovedKg);
  if (exercise.loadMode === "assist" && movingMass <= 0) notes.push("assist-cancels-body");
  else if (movingMass <= 0) notes.push("no-work");
  if (exercise.loadMode === "plates45") notes.push("sled-assumed");
  // Machine travel and box height do not change with the person's height.
  const rangeM = exercise.fixedRange ? exercise.rangeM : exercise.rangeM * (profile.heightCm / REFERENCE_HEIGHT_CM);
  const workPerSetKgM = exercise.sides * reps * rangeM * movingMass;
  const mechanicalKcalPerSet = workPerSetKgM * KCAL_PER_KG_M;

  const efficiency = efficiencyFor(exercise.efficiency);
  const tempoFactor = clamp(1 + 0.1 * (secPerRep - REFERENCE_SECONDS_PER_REP), 0.85, 1.5);
  const rpeFactor = rpe !== null ? clamp(1 + 0.06 * (rpe - 7), 0.82, 1.18) : 1;
  const setSeconds = reps * exercise.sides * secPerRep;
  const duringShare = duringShareForSet(setSeconds);
  const setFull = (mechanicalKcalPerSet / efficiency.mid) * tempoFactor;
  const duringPerSet = setFull * duringShare;
  const recoveryPerSet = setFull * (1 - duringShare) * (1 - PROLONGED_SHARE_OF_RECOVERY) * rpeFactor;
  const prolongedPerSet = setFull * (1 - duringShare) * PROLONGED_SHARE_OF_RECOVERY * rpeFactor;

  // Recovery of sets 1…n−1: within the entered rest it is "between"; what is left over is finished later.
  const potentialBetween = (sets - 1) * recoveryPerSet;
  const recoveredInRest = restGiven ? recoveredWithin(restSec) : null;
  let duringMid = sets * duringPerSet;
  let betweenMid = restGiven ? potentialBetween * recoveredInRest! : 0;
  const carriedOver = restGiven ? potentialBetween - betweenMid : 0;
  let postMid = recoveryPerSet + carriedOver + sets * prolongedPerSet;

  const activeMinutes = (sets * setSeconds) / 60;
  const sessionMinutes = restGiven ? activeMinutes + ((sets - 1) * restSec) / 60 : null;

  let sessionSigma = efficiency.sigma;
  let heartRate: HeartRateUse | null = null;
  let assumedRestSec: number | null = null;
  if (avgHr !== null) {
    heartRate = heartRateBase("collins", profile, avgHr);
    // Without an entered rest, the heart rate still informs the work during sets; its window uses the typical rest.
    const windowRest = restGiven ? restSec : exercise.defaults.restSec;
    const windowMinutes = activeMinutes + ((sets - 1) * windowRest) / 60;
    // What the model says happens inside that window: the sets plus the recovery of earlier sets that is
    // finished before the last set ends (part of a short rest's leftover recovery runs into the next set).
    const recoveryInWindow = recoveryInSessionWindow(sets, windowRest, setSeconds, recoveryPerSet);
    const modelWindow = duringMid + recoveryInWindow;
    const problem = modelWindow <= 0 ? null : heartRateProblem(heartRate.percentMax, 45);
    if (modelWindow <= 0) {
      if (!notes.includes("assist-cancels-body")) notes.push("no-work");
    } else if (problem) {
      notes.push(problem);
    } else if (windowMinutes < MIN_HEART_RATE_MINUTES) {
      notes.push("hr-window-short");
    } else {
      const route = collinsNetKcal(profile, avgHr, windowMinutes);
      if (route.net <= 0) {
        notes.push("hr-too-low");
      } else {
        const combined = combineEstimates(modelWindow, efficiency.sigma, route.net, route.sigma);
        const scale = combined.mid / modelWindow;
        duringMid *= scale;
        if (restGiven) {
          // The heart rate replaces exactly the in-window energy: the recovery within each rest and the
          // leftover recovery that still falls inside the window (booked under post-exercise recovery).
          const leftoverInWindow = recoveryInWindow - betweenMid;
          betweenMid *= scale;
          postMid += leftoverInWindow * (scale - 1);
        } else {
          assumedRestSec = windowRest;
          notes.push("hr-assumed-rest");
        }
        sessionSigma = combined.sigma;
        if (route.widened) notes.push("hr-outside-validated");
        if (!route.vo2max.measured) notes.push("vo2max-estimated");
        heartRate = {
          ...heartRate, used: true, weight: combined.otherShare, vo2max: route.vo2max.value, vo2maxMeasured: route.vo2max.measured,
          heartRateKcal: route.net, modelKcal: modelWindow,
        };
      }
    }
  }

  const during = logRange(duringMid, sessionSigma);
  const between = logRange(restGiven ? betweenMid : potentialBetween, restGiven ? sessionSigma : efficiency.sigma);
  const post = logRange(postMid, efficiency.sigma);
  const restingPerMinute = restingKcalPerMinute(profile);
  const resting = logRange(restingPerMinute * (sessionMinutes ?? activeMinutes), RESTING_SIGMA);

  const components: EnergyComponent[] = [
    { key: "during", kcal: during, included: true },
    { key: "between", kcal: between, included: restGiven },
    { key: "post", kcal: post, included: true },
    { key: "resting", kcal: resting, included: restGiven },
  ];
  if (!restGiven) {
    if (sets > 1) notes.push("between-excluded");
    notes.push("resting-excluded");
  }
  const extra = sumRanges(components.filter((part) => part.included && part.key !== "resting").map((part) => part.kcal));
  const total = restGiven ? sumRanges([extra, resting]) : null;

  return {
    modelVersion: WORKOUT_MODEL_VERSION,
    exerciseId: exercise.id,
    kind: "strength",
    headline: restGiven ? "total" : "training",
    extra,
    total,
    components,
    sessionMinutes,
    activeMinutes,
    perSet: logRange(duringPerSet + recoveryPerSet + prolongedPerSet, efficiency.sigma),
    restingKcalPerDay: restingKcalPerDay(profile),
    heartRate,
    rpe: rpe !== null ? { used: true, value: rpe, factor: rpeFactor } : null,
    relativeIntensity: null,
    notes: [...new Set(notes)],
    detail: {
      type: "strength", sets, reps, sides: exercise.sides, externalLoadKg, bodyMassMovedKg, rangeM, workPerSetKgM,
      mechanicalKcalPerSet, efficiency: { low: efficiency.low, mid: efficiency.mid, high: efficiency.high },
      secPerRep, setSeconds, duringShare, recoveredInRest, tempoFactor, rpeFactor, restSec, assumedRestSec,
    },
  };
}

type CardioExercise = WalkRunExercise | CycleExercise | RowExercise | MetExercise;

function estimateCardio(exercise: CardioExercise, input: WorkoutInput, profile: BodyProfile): WorkoutEstimate {
  const notes: EstimateNote[] = [];
  ageNote(profile, notes);
  const weight = profile.weightKg;
  const restingPerMinute = restingKcalPerMinute(profile);
  const restingVo2PerKg = (restingPerMinute / KCAL_PER_LITRE_O2) * 1000 / weight;
  const rpe = optionalNumber(input.rpe, 1, 10);
  const avgHr = optionalNumber(input.avgHr, 40, 230);

  const limits = INPUT_LIMITS;
  // Holds (plank) follow the strength rule: resting metabolism only when the rest between holds is entered.
  const holds = exercise.kind === "met" && exercise.timeInput === "holds";
  let holdSets = 1;
  let holdRestSec: number | null = null;
  let minutes: number;
  if (holds) {
    holdSets = Math.round(clamp(finite(input.sets) ? input.sets : 3, limits.sets.min, limits.sets.max));
    const hold = clamp(finite(input.holdSeconds) ? input.holdSeconds : 40, limits.holdSeconds.min, limits.holdSeconds.max);
    minutes = (holdSets * hold) / 60;
    holdRestSec = optionalNumber(input.restSec, limits.restSec.min, limits.restSec.max);
  } else {
    minutes = clamp(finite(input.minutes) ? input.minutes : exercise.defaults.minutes, limits.minutes.min, limits.minutes.max);
  }

  let netPerMinute = 0;
  let sigma = 0.2;
  let equation: CardioDetail["equation"] = "compendium";
  let met: number | undefined;
  let code: string | undefined;
  let levelId: string | undefined;
  let rpeUse: RpeUse | null = null;
  let hrMethod: "keytel" | "collins" | "none" = "keytel";
  let equationNetVo2PerKg: number | undefined;
  let equationPerMinute: number | null = null;
  let effectiveMassKg: number | undefined;
  // ACSM equations predict gross VO2 with 3.5 mL/kg/min as the resting term; extra = gross − own resting VO2.
  const restingAdjustment = 3.5 - restingVo2PerKg;

  if (exercise.kind === "walk" || exercise.kind === "run") {
    const speed = clamp(finite(input.speedKmh) ? input.speedKmh : exercise.defaults.speedKmh, limits.speedKmh.min, limits.speedKmh.max);
    const grade = clamp(finite(input.gradePct) ? input.gradePct : exercise.defaults.gradePct, limits.gradePct.min, limits.gradePct.max) / 100;
    const metresPerMinute = (speed * 1000) / 60;
    // ACSM: walking VO2 = 0.1·S + 1.8·S·G + 3.5; running VO2 = 0.2·S + 0.9·S·G + 3.5 (mL/kg/min, S in m/min).
    const netVo2 = exercise.kind === "walk" ? 0.1 * metresPerMinute + 1.8 * metresPerMinute * grade : 0.2 * metresPerMinute + 0.9 * metresPerMinute * grade;
    netPerMinute = ((netVo2 + restingAdjustment) * weight / 1000) * KCAL_PER_LITRE_O2;
    equationNetVo2PerKg = netVo2;
    equation = exercise.kind === "walk" ? "acsm-walk" : "acsm-run";
    sigma = 0.12;
    // Walking equation: 50–100 m/min (3–6 km/h). Running: above 134 m/min, or from 80 m/min when truly jogging.
    if (exercise.kind === "walk" && speed > 6) {
      notes.push("walk-speed-high");
      sigma = 0.18;
    }
    if (exercise.kind === "walk" && speed < 3) {
      notes.push("walk-speed-low");
      sigma = 0.18;
    }
    if (exercise.kind === "run" && speed < 4.8) {
      notes.push("run-speed-low");
      sigma = 0.2;
    } else if (exercise.kind === "run" && speed < 8) {
      sigma = 0.15;
    }
  } else if (exercise.kind === "cycle") {
    const watts = clamp(finite(input.watts) ? input.watts : exercise.defaults.watts, limits.watts.min, limits.watts.max);
    // ACSM leg cycling: VO2 = 1.8·WR/BM + 3.5 + 3.5 (WR in kg·m/min, 1 W = 6.12 kg·m/min).
    const extraVo2Absolute = 1.8 * watts * 6.12 + 3.5 * weight + restingAdjustment * weight;
    netPerMinute = (extraVo2Absolute / 1000) * KCAL_PER_LITRE_O2;
    sigma = 0.12;
    equation = "acsm-cycle";
    if (watts < 50 || watts > 200) {
      notes.push("watts-outside-validated");
      sigma = 0.16;
    }
  } else if (exercise.kind === "row") {
    const watts = clamp(finite(input.watts) ? input.watts : exercise.defaults.watts, limits.watts.min, limits.watts.max);
    met = rowingMet(watts);
    code = watts < 100 ? "02071" : watts < 150 ? "02072" : watts < 200 ? "02073" : "02074";
    // Compendium values describe ~75 kg rowers; at a given power only the body-moving part grows with mass.
    effectiveMassKg = 75 + 0.25 * (weight - 75);
    const extraVo2Absolute = (met - 1) * 3.5 * effectiveMassKg + restingAdjustment * weight;
    netPerMinute = (extraVo2Absolute / 1000) * KCAL_PER_LITRE_O2;
    sigma = 0.22;
  } else {
    hrMethod = exercise.hrModel;
    let level = exercise.levels.find((candidate) => candidate.id === input.level) ?? exercise.levels.find((candidate) => candidate.id === exercise.defaults.level) ?? exercise.levels[0];
    if (rpe !== null && exercise.hrModel === "collins") {
      // Resistance-type sessions: effort picks the Compendium level (aerobic RPE–VO2 relations overstate lifting).
      level = levelForRpe(exercise, rpe);
      rpeUse = { used: true, value: rpe, levelId: level.id };
    }
    met = level.met;
    code = level.code;
    levelId = level.id;
    netPerMinute = met * 3.5 * weight / 1000 * KCAL_PER_LITRE_O2 - restingPerMinute;
    equationPerMinute = Math.max(0, netPerMinute);
    sigma = 0.2;
    if (exercise.hrModel === "collins" && weight > 90) {
      // Time-based strength METs scale with body mass, but lifting cost follows the load, not body fat (Lytle 2019).
      notes.push("weight-bias");
      sigma = 0.3;
    }
    if (rpe !== null && exercise.hrModel === "keytel" && netPerMinute > 0) {
      const vo2maxForRpe = maxOxygenUptake(profile);
      const fraction = reserveFractionForRpe(rpe);
      const rpeNetVo2PerKg = fraction * Math.max(1, vo2maxForRpe.value - restingVo2PerKg);
      const rpeNetPerMinute = (rpeNetVo2PerKg * weight / 1000) * KCAL_PER_LITRE_O2;
      const rpeSigma = 0.25 + (vo2maxForRpe.measured ? 0 : 0.05) + (vo2maxForRpe.ratingAssumed ? 0.03 : 0);
      const combined = combineEstimates(netPerMinute, sigma, rpeNetPerMinute, rpeSigma);
      rpeUse = { used: true, value: rpe, levelId: level.id, weight: combined.otherShare, rpeKcalPerMinute: rpeNetPerMinute, reserveFraction: fraction };
      if (!vo2maxForRpe.measured) notes.push("vo2max-estimated");
      netPerMinute = combined.mid;
      sigma = combined.sigma;
    }
  }
  if (rpe !== null && rpeUse === null) {
    notes.push("rpe-not-applicable");
    rpeUse = { used: false, value: rpe };
  }

  netPerMinute = Math.max(0, netPerMinute);
  if (equationPerMinute === null) equationPerMinute = netPerMinute;
  let exerciseMid = netPerMinute * minutes;
  let exerciseSigma = sigma;
  let heartRate: HeartRateUse | null = null;

  if (avgHr !== null) {
    if (hrMethod === "none") {
      notes.push("hr-not-applicable");
    } else {
      heartRate = heartRateBase(hrMethod, profile, avgHr);
      const problem = heartRateProblem(heartRate.percentMax, hrMethod === "keytel" ? 40 : 45);
      if (exerciseMid <= 0) {
        notes.push("no-work");
      } else if (problem) {
        notes.push(problem);
      } else if (minutes < MIN_HEART_RATE_MINUTES) {
        notes.push("hr-window-short");
      } else if (hrMethod === "keytel") {
        const route = keytelNetKcalPerMinute(profile, avgHr);
        const routeKcal = route.netPerMinute * minutes;
        // Interval work is not the steady state Keytel was fitted on.
        const routeSigma = exercise.id === "hiit" ? route.sigma * 1.5 : route.sigma;
        if (routeKcal <= 0) {
          notes.push("hr-too-low");
        } else {
          const combined = combineEstimates(exerciseMid, sigma, routeKcal, routeSigma);
          if (route.widened || exercise.id === "hiit") notes.push("hr-outside-validated");
          heartRate = { ...heartRate, used: true, weight: combined.otherShare, heartRateKcal: routeKcal, modelKcal: exerciseMid };
          exerciseMid = combined.mid;
          exerciseSigma = combined.sigma;
        }
      } else {
        const route = collinsNetKcal(profile, avgHr, minutes);
        if (route.net <= 0) {
          notes.push("hr-too-low");
        } else {
          const combined = combineEstimates(exerciseMid, sigma, route.net, route.sigma);
          if (route.widened) notes.push("hr-outside-validated");
          if (!route.vo2max.measured) notes.push("vo2max-estimated");
          heartRate = {
            ...heartRate, used: true, weight: combined.otherShare, vo2max: route.vo2max.value, vo2maxMeasured: route.vo2max.measured,
            heartRateKcal: route.net, modelKcal: exerciseMid,
          };
          exerciseMid = combined.mid;
          exerciseSigma = combined.sigma;
        }
      }
    }
  }

  const vo2max = maxOxygenUptake(profile);
  const grossVo2PerKg = (exerciseMid / minutes / KCAL_PER_LITRE_O2) * 1000 / weight + restingVo2PerKg;
  const relativeIntensity = grossVo2PerKg / vo2max.value;
  if (relativeIntensity > 0.95) notes.push("near-max");
  else if (relativeIntensity > 0.85) notes.push("high-intensity");
  const fraction = exercise.kind === "met" && exercise.hrModel === "collins" ? RESISTANCE_SESSION_EPOC : epocFraction(relativeIntensity);

  const exerciseRange = logRange(exerciseMid, exerciseSigma);
  const epoc = logRange(exerciseMid * fraction, 0.4);
  const sessionMinutes = !holds ? minutes : holdRestSec !== null ? minutes + ((holdSets - 1) * holdRestSec) / 60 : null;
  const restingIncluded = sessionMinutes !== null;
  if (!restingIncluded) notes.push("resting-excluded");
  const resting = logRange(restingPerMinute * (sessionMinutes ?? minutes), RESTING_SIGMA);
  const components: EnergyComponent[] = [
    { key: "exercise", kcal: exerciseRange, included: true },
    { key: "epoc", kcal: epoc, included: true },
    { key: "resting", kcal: resting, included: restingIncluded },
  ];
  const extra = sumRanges([exerciseRange, epoc]);
  return {
    modelVersion: WORKOUT_MODEL_VERSION,
    exerciseId: exercise.id,
    kind: exercise.kind,
    headline: restingIncluded ? "total" : "training",
    extra,
    total: restingIncluded ? sumRanges([extra, resting]) : null,
    components,
    sessionMinutes,
    activeMinutes: minutes,
    perSet: null,
    restingKcalPerDay: restingKcalPerDay(profile),
    heartRate,
    rpe: rpeUse,
    relativeIntensity,
    notes: [...new Set(notes)],
    detail: {
      type: "cardio", equation, minutes, met, code, levelId,
      equationKcalPerMinute: equationPerMinute, equationNetVo2PerKg, restingVo2PerKg, effectiveMassKg,
      netKcalPerMinute: exerciseMid / minutes,
      grossVo2PerKg, vo2max: vo2max.value, vo2maxMeasured: vo2max.measured, epocFraction: fraction,
    },
  };
}

export function estimateWorkout(exercise: Exercise, input: WorkoutInput, profile: BodyProfile): WorkoutEstimate {
  return exercise.kind === "strength" ? estimateStrength(exercise, input, profile) : estimateCardio(exercise, input, profile);
}

/** The headline range: total when the session length is known, otherwise the counted training energy. */
export function headlineRange(estimate: WorkoutEstimate): Range {
  return estimate.headline === "total" && estimate.total ? estimate.total : estimate.extra;
}
