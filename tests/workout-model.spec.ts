import { expect, test } from "@playwright/test";
import { draftFor, draftProblems, draftToInput, entryFromDraft, entryToDraft, recomputeEntry } from "../src/workout/draft";
import { EXERCISES, GROUPS, findExercise, searchExercises, type Exercise } from "../src/workout/exercises";
import {
  EFFICIENCY,
  KCAL_PER_KG_M,
  collinsNetKcal,
  duringShareForSet,
  epocFraction,
  estimateWorkout,
  keytelNetKcalPerMinute,
  maxHeartRate,
  maxOxygenUptake,
  recoveredWithin,
  restingKcalPerDay,
  restingKcalPerMinute,
  rowingMet,
  recoveryInSessionWindow,
  type BodyProfile,
  type WorkoutEstimate,
  type WorkoutInput,
} from "../src/workout/model";
import { emptyProfile, missingProfileFields, sanitizeProfile, toBodyProfile } from "../src/workout/profile";

// Pure tests for the v2 workout model (Calorie Compass v2.8). No browser needed.

const sampleUser: BodyProfile = { sex: "male", age: 25, heightCm: 178, weightKg: 112 };

function ex(id: string): Exercise {
  const exercise = findExercise(id);
  if (!exercise) throw new Error(`missing exercise ${id}`);
  return exercise;
}

function estimate(id: string, input: WorkoutInput, profile = sampleUser) {
  return estimateWorkout(ex(id), input, profile);
}

function part(result: WorkoutEstimate, key: string) {
  const found = result.components.find((component) => component.key === key);
  if (!found) throw new Error(`missing component ${key}`);
  return found;
}

/**
 * What the model alone puts inside the heart-rate window of a strength exercise with entered rest:
 * the sets plus the recovery of earlier sets that is finished before the last set ends.
 */
function modelWindow(result: WorkoutEstimate) {
  if (result.detail.type !== "strength") throw new Error("strength only");
  const { sets, setSeconds, restSec } = result.detail;
  const recoveryPerSet = part(result, "between").kcal.mid / ((sets - 1) * recoveredWithin(restSec!));
  return part(result, "during").kcal.mid + recoveryInSessionWindow(sets, restSec!, setSeconds, recoveryPerSet);
}

/** The person's resting oxygen uptake in mL/kg/min (Mifflin–St Jeor, 5 kcal per litre). */
function restingVo2(profile: BodyProfile) {
  return restingKcalPerMinute(profile) / 5 * 1000 / profile.weightKg;
}

test("resting metabolism uses Mifflin–St Jeor", () => {
  expect(restingKcalPerDay(sampleUser)).toBeCloseTo(10 * 112 + 6.25 * 178 - 5 * 25 + 5, 6);
  const female = { ...sampleUser, sex: "female" as const };
  expect(restingKcalPerDay(female)).toBeCloseTo(10 * 112 + 6.25 * 178 - 5 * 25 - 161, 6);
  const unspecified = { ...sampleUser, sex: "unspecified" as const };
  expect(restingKcalPerDay(unspecified)).toBeCloseTo((restingKcalPerDay(sampleUser) + restingKcalPerDay(female)) / 2, 6);
  // A heavy adult's resting metabolism is well below 1 MET = 3.5 mL/kg/min (Byrne 2005).
  const oneMetPerMinute = 3.5 * 112 / 1000 * 5;
  expect(restingKcalPerMinute(sampleUser)).toBeLessThan(oneMetPerMinute * 0.8);
});

test("maximal heart rate and VO2max fall back to Tanaka and Jackson", () => {
  expect(maxHeartRate(sampleUser)).toEqual({ value: 208 - 0.7 * 25, measured: false });
  expect(maxHeartRate({ ...sampleUser, hrMax: 196 })).toEqual({ value: 196, measured: true });
  const bmi = 112 / 1.78 ** 2;
  const jackson = 56.363 + 1.921 * 2 - 0.381 * 25 - 0.754 * bmi + 10.987;
  expect(maxOxygenUptake(sampleUser).value).toBeCloseTo(jackson, 6);
  expect(maxOxygenUptake(sampleUser).ratingAssumed).toBe(true);
  expect(maxOxygenUptake({ ...sampleUser, activityRating: 5 }).value).toBeCloseTo(jackson + 1.921 * 3, 6);
  expect(maxOxygenUptake({ ...sampleUser, vo2max: 41 })).toEqual({ value: 41, measured: true, ratingAssumed: false });
});

test("published equations are implemented as written", () => {
  // Keytel 2005, men, without VO2max: kJ/min = −55.0969 + 0.6309·HR + 0.1988·W + 0.2017·A
  const keytel = keytelNetKcalPerMinute(sampleUser, 135);
  const grossKj = -55.0969 + 0.6309 * 135 + 0.1988 * 112 + 0.2017 * 25;
  expect(keytel.netPerMinute).toBeCloseTo(grossKj / 4.184 - restingKcalPerMinute(sampleUser), 6);
  // Collins 1991: %VO2max = 0.582·%HRmax − 1.7911
  const collins = collinsNetKcal(sampleUser, 140, 10);
  const percentHr = 100 * 140 / (208 - 0.7 * 25);
  const vo2 = (0.582 * percentHr - 1.7911) / 100 * maxOxygenUptake(sampleUser).value;
  expect(collins.net).toBeCloseTo((vo2 * 112 / 1000) * 5 * 10 - restingKcalPerMinute(sampleUser) * 10, 6);
  // Compendium rowing bins and EPOC shares
  expect(rowingMet(60)).toBe(5);
  expect(rowingMet(125)).toBeCloseTo(7.5, 6);
  expect(rowingMet(300)).toBe(14);
  expect(epocFraction(0.3)).toBe(0.03);
  expect(epocFraction(0.75)).toBeCloseTo(0.1, 6);
  expect(epocFraction(1.2)).toBe(0.15);
});

test("the headline example: 112 kg man, deadlift 150 kg × 10", () => {
  const result = estimate("deadlift", { loadKg: 150, sets: 1, reps: 10 });
  // work = 10 × 0.58 m × 178/175 × (150 + 0.45 × 112) kg
  const work = 10 * 0.58 * (178 / 175) * (150 + 0.45 * 112);
  expect(result.detail.type === "strength" && result.detail.workPerSetKgM).toBeCloseTo(work, 6);
  const mechanical = work * KCAL_PER_KG_M;
  // The range is mechanical energy ÷ the efficiency bounds of the lower-body class.
  expect(result.extra.low).toBeCloseTo(mechanical / EFFICIENCY.lower.high, 6);
  expect(result.extra.high).toBeCloseTo(mechanical / EFFICIENCY.lower.low, 6);
  expect(result.extra.mid).toBeCloseTo(mechanical / Math.sqrt(EFFICIENCY.lower.low * EFFICIENCY.lower.high), 6);
  expect(result.extra.mid).toBeGreaterThan(20);
  expect(result.extra.mid).toBeLessThan(25);
  // v2.7 gave 8–11 kcal; the evidence-based range is higher.
  expect(result.extra.low).toBeGreaterThan(11);
  expect(result.headline).toBe("training");
  expect(result.total).toBeNull();
  expect(result.notes).toContain("resting-excluded");
  expect(result.notes).not.toContain("between-excluded");
});

test("heavier loads always cost more (no cap)", () => {
  const mids = [100, 150, 200, 250].map((loadKg) => estimate("deadlift", { loadKg, sets: 1, reps: 5 }).extra.mid);
  for (let index = 1; index < mids.length; index += 1) expect(mids[index]).toBeGreaterThan(mids[index - 1] * 1.15);
});

test("body mass matters for body-weight lifts, barely for curls", () => {
  const light = { ...sampleUser, weightKg: 70 };
  const curlHeavy = estimate("curl", { loadKg: 10, sets: 3, reps: 12 }).extra.mid;
  const curlLight = estimate("curl", { loadKg: 10, sets: 3, reps: 12 }, light).extra.mid;
  expect(curlHeavy / curlLight).toBeLessThan(1.1);
  const pullHeavy = estimate("pullup", { loadKg: 0, sets: 3, reps: 5 }).extra.mid;
  const pullLight = estimate("pullup", { loadKg: 0, sets: 3, reps: 5 }, light).extra.mid;
  expect(pullHeavy / pullLight).toBeCloseTo(112 / 70, 1);
});

test("rest time decides whether rest recovery and resting metabolism are counted", () => {
  const noRest = estimate("deadlift", { loadKg: 150, sets: 5, reps: 10 });
  const withRest = estimate("deadlift", { loadKg: 150, sets: 5, reps: 10, restSec: 120 });
  expect(noRest.headline).toBe("training");
  expect(noRest.notes).toEqual(expect.arrayContaining(["between-excluded", "resting-excluded"]));
  expect(part(noRest, "between").included).toBe(false);
  expect(part(noRest, "post").included).toBe(true);
  expect(withRest.headline).toBe("total");
  expect(withRest.components.every((component) => component.included)).toBe(true);
  // Entering the rest adds exactly the recovery between sets that was shown as "not counted".
  const potentialBetween = part(noRest, "between").kcal.mid;
  expect(withRest.extra.mid).toBeCloseTo(noRest.extra.mid + potentialBetween, 6);
  expect(withRest.total!.mid).toBeGreaterThan(withRest.extra.mid);
  // Session = 5 × 10 × 3 s + 4 × 120 s = 10.5 min
  expect(withRest.sessionMinutes).toBeCloseTo(10.5, 6);
  // Full five-set extra energy is five times one set's full energy.
  expect(withRest.extra.mid).toBeCloseTo(5 * estimate("deadlift", { loadKg: 150, sets: 1, reps: 10 }).extra.mid, 6);
});

test("rest length changes resting metabolism and the timing of recovery, not the extra energy", () => {
  const short = estimate("bench", { loadKg: 80, sets: 4, reps: 8, restSec: 60 });
  const long = estimate("bench", { loadKg: 80, sets: 4, reps: 8, restSec: 180 });
  expect(long.extra.mid).toBeCloseTo(short.extra.mid, 6);
  expect(long.total!.mid - short.total!.mid).toBeCloseTo(restingKcalPerMinute(sampleUser) * 3 * 2, 6);
  // Recovery that does not fit into a short rest is finished after the last set (τ = 60 s).
  expect(part(long, "between").kcal.mid).toBeGreaterThan(part(short, "between").kcal.mid);
  expect(part(long, "post").kcal.mid).toBeLessThan(part(short, "post").kcal.mid);
  expect(part(short, "between").kcal.mid + part(short, "post").kcal.mid).toBeCloseTo(part(long, "between").kcal.mid + part(long, "post").kcal.mid, 6);
  const detail = short.detail.type === "strength" ? short.detail : null;
  expect(detail?.recoveredInRest).toBeCloseTo(1 - Math.exp(-1), 6);
  // Rest 0: nothing is recovered between sets, everything is counted after the last set.
  const none = estimate("bench", { loadKg: 80, sets: 4, reps: 8, restSec: 0 });
  expect(part(none, "between").kcal.mid).toBe(0);
  expect(none.extra.mid).toBeCloseTo(short.extra.mid, 6);
  expect(none.sessionMinutes).toBeCloseTo((4 * 8 * 3) / 60, 6);
});

test("the share spent during a set follows oxygen-uptake kinetics", () => {
  // 30-s set: ≈ 24 % during the set (Scott 2014); longer sets keep more of their cost inside the set.
  expect(duringShareForSet(30)).toBeCloseTo(0.8 * (1 - (40 / 30) * (1 - Math.exp(-30 / 40))), 9);
  expect(duringShareForSet(30)).toBeGreaterThan(0.22);
  expect(duringShareForSet(30)).toBeLessThan(0.26);
  expect(duringShareForSet(90)).toBeGreaterThan(duringShareForSet(30));
  expect(duringShareForSet(1)).toBe(0.15);
  expect(duringShareForSet(10_000)).toBe(0.6);
  expect(recoveredWithin(0)).toBe(0);
  expect(recoveredWithin(60)).toBeCloseTo(1 - Math.exp(-1), 9);
  const single = estimate("deadlift", { loadKg: 150, sets: 1, reps: 10 });
  const detail = single.detail.type === "strength" ? single.detail : null;
  expect(detail?.setSeconds).toBe(30);
  expect(part(single, "during").kcal.mid / single.extra.mid).toBeCloseTo(duringShareForSet(30), 6);
});

test("tempo and RPE adjust within their bounds", () => {
  const base = estimate("squat", { loadKg: 80, sets: 1, reps: 8 }).extra.mid;
  expect(estimate("squat", { loadKg: 80, sets: 1, reps: 8, secPerRep: 6 }).extra.mid).toBeCloseTo(base * 1.3, 6);
  expect(estimate("squat", { loadKg: 80, sets: 1, reps: 8, secPerRep: 15 }).extra.mid).toBeCloseTo(base * 1.5, 6);
  const failure = estimate("squat", { loadKg: 80, sets: 1, reps: 8, rpe: 10 });
  expect(failure.rpe?.factor).toBeCloseTo(1.18, 6);
  // RPE scales only the part after the set (8 reps × 3 s = 24 s set).
  const during = duringShareForSet(24);
  expect(failure.extra.mid).toBeCloseTo(base * (during + (1 - during) * 1.18), 6);
  expect(estimate("squat", { loadKg: 80, sets: 1, reps: 8, rpe: 1 }).rpe?.factor).toBeCloseTo(0.82, 6);
});

test("heart rate joins strength estimates and is checked for plausibility", () => {
  const model = estimate("deadlift", { loadKg: 150, sets: 5, reps: 10, restSec: 120 });
  const withHr = estimate("deadlift", { loadKg: 150, sets: 5, reps: 10, restSec: 120, avgHr: 140 });
  expect(withHr.heartRate?.used).toBe(true);
  const weight = withHr.heartRate!.weight;
  expect(weight).toBeGreaterThan(0.2);
  expect(weight).toBeLessThan(0.8);
  // The heart rate is compared with what the model puts inside the same window (sets + rests) …
  const window = modelWindow(model);
  expect(withHr.heartRate!.modelKcal).toBeCloseTo(window, 6);
  // … which includes leftover recovery of earlier sets that runs into later sets, not only the rests.
  expect(window).toBeGreaterThan(part(model, "during").kcal.mid + part(model, "between").kcal.mid);
  // The window is replaced by the log-weighted combination; everything after the last set stays as modelled.
  const hrKcal = withHr.heartRate!.heartRateKcal!;
  const combined = Math.exp((1 - weight) * Math.log(window) + weight * Math.log(hrKcal));
  expect(withHr.extra.mid).toBeCloseTo(model.extra.mid - window + combined, 6);
  // If the heart rate agreed with the model, nothing would change (no double counting).
  expect(Math.min(window, hrKcal)).toBeLessThanOrEqual(combined + 1e-9);
  expect(Math.max(window, hrKcal)).toBeGreaterThanOrEqual(combined - 1e-9);
  // Combining two estimates narrows the range.
  expect(withHr.extra.high / withHr.extra.low).toBeLessThan(model.extra.high / model.extra.low);

  // Without a rest time the heart rate still corrects the work during sets, over the exercise's typical rest.
  const withoutRest = estimate("deadlift", { loadKg: 150, sets: 5, reps: 10, avgHr: 140 });
  expect(withoutRest.heartRate?.used).toBe(true);
  expect(withoutRest.notes).toContain("hr-assumed-rest");
  expect(withoutRest.detail.type === "strength" && withoutRest.detail.assumedRestSec).toBe(ex("deadlift").defaults.restSec);
  expect(part(withoutRest, "between").included).toBe(false);
  expect(withoutRest.headline).toBe("training");

  // Implausible values are rejected before any equation is applied (HRmax 190.5 for a 25-year-old).
  const above = estimate("deadlift", { loadKg: 150, sets: 5, reps: 10, restSec: 120, avgHr: 200 });
  expect(above.heartRate?.used).toBe(false);
  expect(above.notes).toContain("hr-above-max");
  expect(above.extra.mid).toBeCloseTo(model.extra.mid, 6);
  const tooLow = estimate("deadlift", { loadKg: 150, sets: 5, reps: 10, restSec: 120, avgHr: 80 });
  expect(tooLow.heartRate?.used).toBe(false);
  expect(tooLow.notes).toContain("hr-too-low");
  const short = estimate("deadlift", { loadKg: 150, sets: 1, reps: 5, avgHr: 140 });
  expect(short.heartRate?.used).toBe(false);
  expect(short.notes).toContain("hr-window-short");
  // A measured maximum above the entered average makes the same value usable.
  expect(estimate("deadlift", { loadKg: 150, sets: 5, reps: 10, restSec: 120, avgHr: 200 }, { ...sampleUser, hrMax: 205 }).heartRate?.used).toBe(true);
});

test("RPE and heart rate can be used together for strength", () => {
  const both = estimate("deadlift", { loadKg: 150, sets: 5, reps: 10, restSec: 120, rpe: 9, avgHr: 140 });
  expect(both.rpe?.used).toBe(true);
  expect(both.rpe?.factor).toBeCloseTo(1.12, 6);
  expect(both.heartRate?.used).toBe(true);
  // The heart-rate route is compared with the RPE-adjusted model for the same window.
  const rpeOnly = estimate("deadlift", { loadKg: 150, sets: 5, reps: 10, restSec: 120, rpe: 9 });
  expect(both.heartRate?.modelKcal).toBeCloseTo(modelWindow(rpeOnly), 6);
  const weight = both.heartRate!.weight;
  const combined = Math.exp((1 - weight) * Math.log(modelWindow(rpeOnly)) + weight * Math.log(both.heartRate!.heartRateKcal!));
  expect(both.extra.mid).toBeCloseTo(rpeOnly.extra.mid - modelWindow(rpeOnly) + combined, 6);
});

test("zero work is reported instead of inventing a number", () => {
  const assisted = estimate("assisted-pullup", { loadKg: 130, sets: 3, reps: 8, restSec: 90 });
  expect(assisted.notes).toContain("assist-cancels-body");
  expect(assisted.extra.mid).toBe(0);
  const empty = estimate("pulldown", { loadKg: 0, sets: 3, reps: 8, restSec: 90 });
  expect(empty.notes).toContain("no-work");
  expect(empty.extra.mid).toBe(0);
  // Heart rate cannot rescue a set without work.
  const emptyHr = estimate("pulldown", { loadKg: 0, sets: 3, reps: 8, restSec: 90, avgHr: 130 });
  expect(emptyHr.heartRate?.used).toBe(false);
  expect(emptyHr.notes).toContain("no-work");
});

test("machine travel does not scale with height, free-weight range does", () => {
  const tall = { ...sampleUser, heightCm: 200 };
  const range = (id: string, profile: BodyProfile) => {
    const detail = estimate(id, { loadKg: 100, sets: 1, reps: 10 }, profile).detail;
    return detail.type === "strength" ? detail.rangeM : NaN;
  };
  expect(range("leg-press", tall)).toBeCloseTo(range("leg-press", sampleUser), 9);
  expect(range("step-up", tall)).toBeCloseTo(range("step-up", sampleUser), 9);
  expect(range("squat", tall) / range("squat", sampleUser)).toBeCloseTo(200 / 178, 6);
  expect(estimate("leg-press", { loadKg: 100, sets: 1, reps: 10 }).notes).toContain("sled-assumed");
});

test("ACSM equations, with the person's own resting uptake instead of 3.5 mL/kg/min", () => {
  const rest = restingVo2(sampleUser);
  // A 112 kg man rests well below 3.5 mL/kg/min, so the extra energy is a bit higher than the "net" VO2.
  expect(rest).toBeLessThan(3.0);
  const walk = estimate("walk", { speedKmh: 5, gradePct: 10, minutes: 30 });
  const speed = 5000 / 60;
  const walkExtra = (0.1 * speed + 1.8 * speed * 0.1 + 3.5 - rest) * 112 / 1000 * 5 * 30;
  expect(part(walk, "exercise").kcal.mid).toBeCloseTo(walkExtra, 6);
  expect(walk.detail.type === "cardio" && walk.detail.restingVo2PerKg).toBeCloseTo(rest, 9);
  expect(walk.headline).toBe("total");
  expect(walk.total!.mid).toBeCloseTo(walk.extra.mid + restingKcalPerMinute(sampleUser) * 30, 6);
  // Exercise part + resting metabolism = the ACSM gross oxygen uptake × 5 kcal/L.
  const grossAcsm = (0.1 * speed + 1.8 * speed * 0.1 + 3.5) * 112 / 1000 * 5 * 30;
  expect(part(walk, "exercise").kcal.mid + part(walk, "resting").kcal.mid).toBeCloseTo(grossAcsm, 6);
  const run = estimate("run", { speedKmh: 8, gradePct: 0, minutes: 20 });
  const runSpeed = 8000 / 60;
  expect(part(run, "exercise").kcal.mid).toBeCloseTo((0.2 * runSpeed + 3.5 - rest) * 112 / 1000 * 5 * 20, 6);
  const bike = estimate("bike", { watts: 100, minutes: 30 });
  expect(part(bike, "exercise").kcal.mid).toBeCloseTo((1.8 * 100 * 6.12 + 3.5 * 112 + (3.5 - rest) * 112) / 1000 * 5 * 30, 6);
  // Outside the tested speeds the note appears and the range widens.
  const fastWalk = estimate("walk", { speedKmh: 6.5, gradePct: 0, minutes: 10 });
  expect(fastWalk.notes).toContain("walk-speed-high");
  const normalWalk = estimate("walk", { speedKmh: 5.5, gradePct: 0, minutes: 10 });
  expect(normalWalk.notes).not.toContain("walk-speed-high");
  expect(fastWalk.extra.high / fastWalk.extra.low).toBeGreaterThan(normalWalk.extra.high / normalWalk.extra.low);
  expect(estimate("walk", { speedKmh: 2.5, gradePct: 0, minutes: 10 }).notes).toContain("walk-speed-low");
  expect(estimate("run", { speedKmh: 4.5, gradePct: 0, minutes: 10 }).notes).toContain("run-speed-low");
  expect(estimate("run", { speedKmh: 6, gradePct: 0, minutes: 10 }).notes).not.toContain("run-speed-low");
  expect(estimate("bike", { watts: 300, minutes: 10 }).notes).toContain("watts-outside-validated");
});

test("rowing scales only the body-moving part with body mass", () => {
  const rest = restingVo2(sampleUser);
  const met = rowingMet(120);
  const row = estimate("rower", { watts: 120, minutes: 20 });
  const effective = 75 + 0.25 * (112 - 75);
  expect(row.detail.type === "cardio" && row.detail.effectiveMassKg).toBeCloseTo(effective, 9);
  expect(part(row, "exercise").kcal.mid).toBeCloseTo(((met - 1) * 3.5 * effective + (3.5 - rest) * 112) / 1000 * 5 * 20, 6);
  // Same power, very different body mass: the extra energy differs far less than the body mass does.
  const light = estimate("rower", { watts: 120, minutes: 20 }, { ...sampleUser, weightKg: 70 });
  const ratio = part(row, "exercise").kcal.mid / part(light, "exercise").kcal.mid;
  expect(ratio).toBeGreaterThan(1);
  expect(ratio).toBeLessThan(1.25);
});

test("heart rate for aerobic work is checked and weighted by validity", () => {
  const bike = estimate("bike", { watts: 100, minutes: 30, avgHr: 140 });
  expect(bike.heartRate?.used).toBe(true);
  expect(bike.heartRate?.method).toBe("keytel");
  const above = estimate("bike", { watts: 100, minutes: 30, avgHr: 205 });
  expect(above.heartRate?.used).toBe(false);
  expect(above.notes).toContain("hr-above-max");
  const low = estimate("bike", { watts: 100, minutes: 30, avgHr: 70 });
  expect(low.heartRate?.used).toBe(false);
  expect(low.notes).toContain("hr-too-low");
  expect(estimate("bike", { watts: 100, minutes: 2, avgHr: 140 }).notes).toContain("hr-window-short");
  // Intervals are not the steady state Keytel was fitted on: heart rate counts for less.
  expect(estimate("hiit", { level: "vigorous", minutes: 20, avgHr: 160 }).notes).toContain("hr-outside-validated");
  // Keytel's sample: 18–45 years, 47–120 kg, few heavy women; unspecified sex averages both equations.
  expect(keytelNetKcalPerMinute(sampleUser, 140).widened).toBe(false);
  expect(keytelNetKcalPerMinute({ ...sampleUser, age: 50 }, 140).widened).toBe(true);
  expect(keytelNetKcalPerMinute({ ...sampleUser, weightKg: 130 }, 140).widened).toBe(true);
  expect(keytelNetKcalPerMinute({ ...sampleUser, weightKg: 90, sex: "unspecified" }, 140).widened).toBe(true);
  expect(keytelNetKcalPerMinute({ ...sampleUser, weightKg: 90, sex: "female" }, 140).widened).toBe(true);
  expect(keytelNetKcalPerMinute({ ...sampleUser, weightKg: 80, sex: "female" }, 140).widened).toBe(false);
  const heartWeight = (profile: BodyProfile) => estimate("elliptical", { level: "moderate", minutes: 30, avgHr: 140 }, profile).heartRate!.weight;
  expect(heartWeight({ ...sampleUser, weightKg: 90, sex: "female" })).toBeLessThan(heartWeight({ ...sampleUser, weightKg: 80, sex: "female" }));
  const unspecified = { ...sampleUser, sex: "unspecified" as const };
  const averageKj = ((-55.0969 + 0.6309 * 140 + 0.1988 * 112 + 0.2017 * 25) + (-20.4022 + 0.4472 * 140 - 0.1263 * 112 + 0.074 * 25)) / 2;
  expect(keytelNetKcalPerMinute(unspecified, 140).netPerMinute).toBeCloseTo(averageKj / 4.184 - restingKcalPerMinute(unspecified), 6);
});

test("Compendium activities subtract the person's own resting metabolism", () => {
  const elliptical = estimate("elliptical", { level: "moderate", minutes: 30 });
  const expected = (5 * 3.5 * 112 / 1000 * 5 - restingKcalPerMinute(sampleUser)) * 30;
  expect(elliptical.components.find((part) => part.key === "exercise")!.kcal.mid).toBeCloseTo(expected, 6);
  const rpe = estimate("elliptical", { level: "moderate", minutes: 30, rpe: 6 });
  expect(rpe.rpe?.used).toBe(true);
  expect(rpe.rpe?.weight).toBeGreaterThan(0);
  const circuit = estimate("circuit", { level: "light", minutes: 30, rpe: 8 });
  expect(circuit.rpe?.levelId).toBe("supersets");
  expect(estimate("walk", { speedKmh: 5, gradePct: 0, minutes: 30, rpe: 5 }).notes).toContain("rpe-not-applicable");
  expect(estimate("strength-session", { minutes: 60 }).notes).toContain("weight-bias");
  expect(estimate("plank", { sets: 3, holdSeconds: 60, avgHr: 120 }).notes).toContain("hr-not-applicable");
});

test("planks follow the rest rule: resting metabolism only with an entered rest", () => {
  const noRest = estimate("plank", { sets: 3, holdSeconds: 60 });
  expect(noRest.headline).toBe("training");
  expect(noRest.total).toBeNull();
  expect(noRest.sessionMinutes).toBeNull();
  expect(part(noRest, "resting").included).toBe(false);
  expect(noRest.notes).toContain("resting-excluded");
  const withRest = estimate("plank", { sets: 3, holdSeconds: 60, restSec: 30 });
  expect(withRest.headline).toBe("total");
  expect(withRest.sessionMinutes).toBeCloseTo(3 + 2 * 0.5, 9);
  expect(withRest.extra.mid).toBeCloseTo(noRest.extra.mid, 9);
  expect(withRest.total!.mid).toBeCloseTo(withRest.extra.mid + restingKcalPerMinute(sampleUser) * 4, 6);
  const plank = ex("plank");
  const draft = { ...draftFor(plank), rest: "30" };
  expect(draftProblems(plank, draft)).toEqual([]);
  expect(draftProblems(plank, { ...draft, rest: "1000" })).toEqual(["rest"]);
  const entry = entryFromDraft("plank-1", plank, draft, 112, estimateWorkout(plank, draftToInput(draft), sampleUser));
  expect(entry).toMatchObject({ restSec: 30, holdSeconds: 40, sets: 3, headline: "total", durationMinutes: 3 });
});

test("published measurements fall inside the model's ranges", () => {
  const inside = (result: WorkoutEstimate, value: number, label: string) => {
    expect(result.extra.low, `${label}: low`).toBeLessThanOrEqual(value);
    expect(result.extra.high, `${label}: high`).toBeGreaterThanOrEqual(value);
  };
  // Scott et al. 2014 (Cent Eur J Sport Sci Med 8:53–59): 22 men of 83 kg, Smith machine, one set per lift.
  // Oxygen during the set + recovery was 67.1 % (deadlift) and 78.1 % (squat) of the reported totals.
  const scottMen: BodyProfile = { sex: "male", age: 22, heightCm: 178, weightKg: 83 };
  inside(estimate("deadlift", { loadKg: 22.7, sets: 1, reps: 22 }, scottMen), 20.1 * 0.671, "Scott deadlift 22.7 × 22");
  inside(estimate("deadlift", { loadKg: 63.5, sets: 1, reps: 30 }, scottMen), 41.3 * 0.671, "Scott deadlift 63.5 × 30");
  inside(estimate("squat", { loadKg: 81.6, sets: 1, reps: 10 }, scottMen), 10.0 * 0.781, "Scott squat 81.6 × 10");
  inside(estimate("squat", { loadKg: 104.3, sets: 1, reps: 15 }, scottMen), 22.7 * 0.781, "Scott squat 104.3 × 15");
  // Scott 2012: 5-rep bench sets at ~70 kg cost 3.5–4.6 kcal each (oxygen during + after the set).
  const bench = estimate("bench", { loadKg: 70, sets: 1, reps: 5 }, { sex: "male", age: 22, heightCm: 178, weightKg: 82 });
  expect(bench.extra.low).toBeLessThan(3.5);
  expect(bench.extra.high).toBeGreaterThan(4.6);
  // Dudley et al. 1991: about 3 kcal per kJ of concentric leg work, i.e. ≈ 8 % efficiency.
  const dudley = 0.239 / 3;
  expect(EFFICIENCY.lower.low).toBeLessThanOrEqual(dudley);
  expect(EFFICIENCY.lower.high).toBeGreaterThanOrEqual(dudley);
  // Brown et al. 1994: about 4.0 kcal per kJ of external deadlift work (marginal cost).
  const headline = estimate("deadlift", { loadKg: 150, sets: 1, reps: 10 });
  const rangeM = headline.detail.type === "strength" ? headline.detail.rangeM : 0;
  inside(headline, 10 * rangeM * 150 * 9.80665 / 1000 * 4.0, "Brown deadlift");
  // Nakagata et al. 2022 (6 s per rep, 66 kg men): body-weight squat 0.50, push-up 0.77, heel raise 0.13 kcal per rep.
  const nakagata: BodyProfile = { sex: "male", age: 22, heightCm: 170, weightKg: 66 };
  for (const [id, value] of [["bw-squat", 0.5], ["pushup", 0.77], ["calf-raise", 0.13]] as const) {
    const result = estimate(id, { loadKg: 0, sets: 1, reps: 10, secPerRep: 6 }, nakagata);
    expect(result.extra.low / 10, `${id} low`).toBeLessThanOrEqual(value);
    expect(result.extra.high / 10, `${id} high`).toBeGreaterThanOrEqual(value);
  }
  // Vezina et al. 2014: push-ups at 20 per minute ≈ 0.385 kcal per rep (recovery-based).
  const vezina = estimate("pushup", { loadKg: 0, sets: 1, reps: 20 }, { sex: "male", age: 22, heightCm: 175, weightKg: 74.5 });
  expect(vezina.extra.low / 20).toBeLessThan(0.385);
  expect(vezina.extra.high / 20).toBeGreaterThan(0.385);
});

test("every exercise gives finite, ordered ranges with its defaults", () => {
  const ids = new Set<string>();
  for (const exercise of EXERCISES) {
    expect(ids.has(exercise.id), exercise.id).toBe(false);
    ids.add(exercise.id);
    const result = estimateWorkout(exercise, draftToInput(draftFor(exercise)), sampleUser);
    for (const range of [result.extra, ...(result.total ? [result.total] : [])]) {
      expect(Number.isFinite(range.low) && Number.isFinite(range.high), exercise.id).toBe(true);
      expect(range.low, exercise.id).toBeLessThanOrEqual(range.mid);
      expect(range.mid, exercise.id).toBeLessThanOrEqual(range.high);
    }
    expect(result.extra.mid, exercise.id).toBeGreaterThan(0);
  }
  expect(EXERCISES.length).toBeGreaterThanOrEqual(45);
  for (const group of GROUPS) expect(EXERCISES.some((exercise) => exercise.group === group.id), group.id).toBe(true);
  expect(searchExercises("二头").map((exercise) => exercise.id)).toContain("curl");
  expect(searchExercises("下拉").map((exercise) => exercise.id)).toContain("pulldown");
  expect(searchExercises("", "all", "barbell").every((exercise) => exercise.equipment === "barbell")).toBe(true);
});

test("plan entries keep their inputs and recompute consistently", () => {
  const exercise = ex("deadlift");
  const draft = { ...draftFor(exercise), load: "150", sets: "5", reps: "10", rest: "120", rpe: "8" };
  const result = estimateWorkout(exercise, draftToInput(draft), sampleUser);
  const entry = entryFromDraft("workout-1", exercise, draft, 112, result);
  expect(entry.modelVersion).toBe(2);
  expect(entry.burnLow).toBe(Math.round(result.extra.low));
  expect(entry.burnMid).toBe(Math.round(result.extra.mid));
  expect(entry.totalLow).toBe(Math.round(result.total!.low));
  expect(entryToDraft(entry)).toMatchObject({ load: "150", sets: "5", reps: "10", rest: "120", rpe: "8", tempo: "", hr: "" });
  expect(recomputeEntry(entry, exercise, sampleUser)).toEqual(entry);
  const walk = ex("walk");
  const walkDraft = { ...draftFor(walk), minutes: "45" };
  const walkEntry = entryFromDraft("workout-2", walk, walkDraft, 112, estimateWorkout(walk, draftToInput(walkDraft), sampleUser));
  expect(walkEntry.minutes).toBe(45);
  expect(walkEntry.sets).toBe(0);
});

test("profiles are validated and complete before estimating", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  const clean = sanitizeProfile({ sex: "male", birthYear: 2001, heightCm: 178, weightKg: 112, activityRating: 9, vo2max: 5, hrMax: 190, updatedAt: "x" }, now);
  expect(clean).toMatchObject({ sex: "male", birthYear: 2001, heightCm: 178, weightKg: 112, activityRating: null, vo2max: null, hrMax: 190 });
  expect(toBodyProfile(clean!, undefined, now)).toMatchObject({ sex: "male", age: 25, heightCm: 178, weightKg: 112 });
  expect(toBodyProfile(clean!, 100, now)?.weightKg).toBe(100);
  expect(missingProfileFields(emptyProfile())).toEqual(["sex", "age", "heightCm", "weightKg"]);
  expect(toBodyProfile(emptyProfile())).toBeNull();
  expect(sanitizeProfile("nope")).toBeNull();
  expect(sanitizeProfile({ sex: "robot", weightKg: 1000 })).toMatchObject({ sex: null, weightKg: null });
});

test("form values are checked against the model's limits", () => {
  const deadlift = ex("deadlift");
  const base = { ...draftFor(deadlift), load: "150", sets: "5", reps: "10" };
  expect(draftProblems(deadlift, base)).toEqual([]);
  expect(draftProblems(deadlift, { ...base, sets: "2.5" })).toEqual(["sets"]);
  expect(draftProblems(deadlift, { ...base, reps: "0" })).toEqual(["reps"]);
  expect(draftProblems(deadlift, { ...base, load: "" })).toEqual(["load"]);
  expect(draftProblems(deadlift, { ...base, load: "700" })).toEqual(["load"]);
  expect(draftProblems(deadlift, { ...base, rest: "" })).toEqual([]);
  expect(draftProblems(deadlift, { ...base, rest: "1200" })).toEqual(["rest"]);
  expect(draftProblems(deadlift, { ...base, tempo: "0.5" })).toEqual(["tempo"]);
  expect(draftProblems(deadlift, { ...base, rpe: "11" })).toEqual(["rpe"]);
  expect(draftProblems(deadlift, { ...base, hr: "140.5" })).toEqual(["hr"]);
  expect(draftProblems(deadlift, { ...base, hr: "35" })).toEqual(["hr"]);
  const walk = ex("walk");
  expect(draftProblems(walk, { ...draftFor(walk), grade: "" })).toEqual(["grade"]);
  expect(draftProblems(walk, { ...draftFor(walk), speed: "30" })).toEqual(["speed"]);
  const plank = ex("plank");
  expect(draftProblems(plank, { ...draftFor(plank), hold: "3" })).toEqual(["hold"]);
  expect(draftProblems(plank, { ...draftFor(plank), sets: "31" })).toEqual(["sets"]);
  // Every default form is valid.
  for (const exercise of EXERCISES) expect(draftProblems(exercise, draftFor(exercise)), exercise.id).toEqual([]);
});

test("exercise lookup only knows real exercises", () => {
  expect(findExercise("deadlift")?.id).toBe("deadlift");
  expect(findExercise("constructor")).toBeUndefined();
  expect(findExercise("__proto__")).toBeUndefined();
  expect(findExercise("retired-machine")).toBeUndefined();
});
