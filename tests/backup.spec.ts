import { expect, test } from "@playwright/test";
import fs from "node:fs";
import {
  APP_VERSION,
  CUSTOM_FOOD_IMAGE,
  STORAGE_KEYS,
  applyBackup,
  createBackup,
  createBackupWithReport,
  emptyPortionPrefs,
  parseBackup,
  sanitizePlannerState,
  serializeBackup,
  type CustomFood,
} from "../src/userData";

// Pure logic tests for the backup format; no browser needed.

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const dish: CustomFood = {
  id: "custom-1", nameZh: "自制牛肉卷", nameEn: "Beef wrap", kcalPer100G: 210, servingWeightG: 150,
  proteinPer100G: 15, carbohydratePer100G: 20, fatPer100G: 8, fiberPer100G: 2, image: CUSTOM_FOOD_IMAGE,
};

function day(date: string) {
  return { date, meals: [] as unknown[], workouts: [] as unknown[] };
}

// A workout entry in the v2.8 format (workout model v2).
function v2Workout(id = "workout-1") {
  return {
    id, exerciseId: "deadlift", nameZh: "传统硬拉", nameEn: "Conventional deadlift", bodyWeight: 112,
    sets: 1, reps: 10, loadKg: 150, restSec: null, secPerRep: null, holdSeconds: null, minutes: null,
    speedKmh: null, gradePct: null, watts: null, level: null, rpe: null, avgHr: null,
    durationMinutes: 0.5, burnLow: 19, burnMid: 27, burnHigh: 40, totalLow: null, totalHigh: null,
    headline: "training", modelVersion: 2, completed: false,
  };
}

// A workout entry saved by v2.7 or earlier (placeholder numbers; the user asked for these to be cleared).
const legacyWorkout = { id: "workout-old", exerciseId: "deadlift", nameZh: "硬拉", nameEn: "Deadlift", bodyWeight: 112, sets: 1, reps: 10, loadKg: 150, durationMinutes: 0, burnLow: 8, burnHigh: 11, completed: false };

const profile = { sex: "male", birthYear: 2001, heightCm: 178, weightKg: 112, activityRating: 3, vo2max: null, hrMax: null, updatedAt: "2026-10-20T00:00:00.000Z" };

function plannerWithOneMeal() {
  const days = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"].map(day);
  days[1].meals.push({ id: "meal-1", slot: "lunch", foodId: "f001", nameZh: "白米饭", nameEn: "Cooked white rice", grams: 150, kcalPer100G: 116, kcal: 174, completed: true });
  days[1].workouts.push(v2Workout());
  return { version: 1, weeks: { "2026-10-12": { weekStart: "2026-10-12", days, updatedAt: "2026-10-15T00:00:00.000Z" } } };
}

function seededStorage() {
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_KEYS.customFoods, JSON.stringify([dish]));
  storage.setItem(STORAGE_KEYS.compareFoods, JSON.stringify(["f001", "custom-1"]));
  storage.setItem(STORAGE_KEYS.planner, JSON.stringify(plannerWithOneMeal()));
  storage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
  return storage;
}

test("APP_VERSION matches package.json", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  expect(APP_VERSION).toBe(pkg.version);
});

test("a backup round-trips custom dishes, comparisons and plans", () => {
  const text = serializeBackup(createBackup(seededStorage(), new Date("2026-10-15T12:00:00Z")));
  const parsed = parseBackup(text);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.summary).toEqual({ customFoods: 1, compareFoods: 2, weeks: 1, mealEntries: 1, workoutEntries: 1, skipped: 0, legacyWorkouts: 0, profile: true, favorites: 0, portions: 0 });
  // Favorites and portion settings are always part of a v2.8 backup, even when empty.
  expect(parsed.backup.data.favorites).toEqual([]);
  expect(parsed.backup.data.portions).toEqual(emptyPortionPrefs());

  const target = new MemoryStorage();
  target.setItem(STORAGE_KEYS.customFoods, JSON.stringify([{ ...dish, id: "old" }]));
  applyBackup(target, parsed.backup);
  expect(JSON.parse(target.getItem(STORAGE_KEYS.customFoods)!)).toEqual([dish]);
  expect(JSON.parse(target.getItem(STORAGE_KEYS.compareFoods)!)).toEqual(["f001", "custom-1"]);
  expect(JSON.parse(target.getItem(STORAGE_KEYS.planner)!)).toEqual(plannerWithOneMeal());
  expect(JSON.parse(target.getItem(STORAGE_KEYS.profile)!)).toEqual(profile);
  expect(JSON.parse(target.getItem(STORAGE_KEYS.favorites)!)).toEqual([]);
  expect(JSON.parse(target.getItem(STORAGE_KEYS.portions)!)).toEqual(emptyPortionPrefs());
});

test("favorites and portion sizes travel with the backup", () => {
  const storage = seededStorage();
  storage.setItem(STORAGE_KEYS.favorites, JSON.stringify(["f031", "f001"]));
  storage.setItem(STORAGE_KEYS.portions, JSON.stringify({ compareMode: "portion", amounts: { f031: 4, f001: 200 }, pieceGrams: { f031: 40 } }));
  const parsed = parseBackup(serializeBackup(createBackup(storage)));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.summary).toMatchObject({ favorites: 2, portions: 3 });
  const target = new MemoryStorage();
  applyBackup(target, parsed.backup);
  expect(JSON.parse(target.getItem(STORAGE_KEYS.favorites)!)).toEqual(["f031", "f001"]);
  expect(JSON.parse(target.getItem(STORAGE_KEYS.portions)!)).toEqual({ compareMode: "portion", amounts: { f031: 4, f001: 200 }, pieceGrams: { f031: 40 } });
  // A backup made before v2.8 has neither, so the device keeps its own.
  const old = { ...parsed.backup, data: { customFoods: [], compareFoods: [], planner: null } };
  const reparsed = parseBackup(JSON.stringify(old));
  expect(reparsed.ok).toBe(true);
  if (reparsed.ok) applyBackup(target, reparsed.backup);
  expect(JSON.parse(target.getItem(STORAGE_KEYS.favorites)!)).toEqual(["f031", "f001"]);
});

test("workout entries from before v2.8 are dropped and counted", () => {
  const planner = plannerWithOneMeal();
  planner.weeks["2026-10-12"].days[2].workouts.push(legacyWorkout);
  // A backup file written by v2.7 still contains the old entry.
  const valid = createBackup(seededStorage());
  const parsed = parseBackup(JSON.stringify({ ...valid, data: { ...valid.data, planner } }));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.summary).toMatchObject({ workoutEntries: 1, legacyWorkouts: 1, skipped: 0 });
  expect(parsed.backup.data.planner!.weeks["2026-10-12"].days[2].workouts).toEqual([]);
  // Exporting from a device that still stores old entries leaves them out as well.
  const storage = seededStorage();
  storage.setItem(STORAGE_KEYS.planner, JSON.stringify(planner));
  const { summary } = createBackupWithReport(storage);
  expect(summary).toMatchObject({ workoutEntries: 1, legacyWorkouts: 1 });
});

test("entries written by a newer app version are kept, including fields this version does not know", () => {
  const planner = plannerWithOneMeal();
  const days = planner.weeks["2026-10-12"].days;
  const newer = { id: "workout-v3", exerciseId: "deadlift-v3", nameZh: "新版硬拉", nameEn: "Deadlift (v3)", burnLow: 20, burnMid: 30, burnHigh: 45, modelVersion: 3, completed: true, phases: [{ kind: "eccentric", seconds: 3 }] };
  days[2].workouts.push(newer);
  (days[1].workouts[0] as Record<string, unknown>).device = "watch";
  (days[1].meals[0] as Record<string, unknown>).brand = "自家";
  days[3].meals.push({ id: "meal-oden", slot: "dinner", foodId: "f031", nameZh: "关东煮白萝卜", nameEn: "Oden daikon", grams: 120, kcalPer100G: 18, kcal: 21.6, pieceGrams: 40, completed: false });
  days[3].meals.push({ id: "meal-bad-piece", slot: "dinner", foodId: "f031", nameZh: "", nameEn: "", grams: 30, kcalPer100G: 18, kcal: 5.4, pieceGrams: "big", completed: false });
  const result = sanitizePlannerState(planner)!;
  expect(result.skipped).toBe(0);
  expect(result.legacyWorkouts).toBe(0);
  const week = result.state.weeks["2026-10-12"];
  expect(week.days[2].workouts).toEqual([newer]);
  expect(week.days[1].workouts[0]).toMatchObject({ device: "watch", modelVersion: 2 });
  expect(week.days[1].meals[0]).toMatchObject({ brand: "自家" });
  expect(week.days[3].meals[0].pieceGrams).toBe(40);
  expect("pieceGrams" in week.days[3].meals[1]).toBe(false);
  // Version markers that are not numbers are unreadable; an older numbered model counts as legacy.
  const odd = plannerWithOneMeal();
  odd.weeks["2026-10-12"].days[4].workouts.push({ ...v2Workout("workout-string"), modelVersion: "2" });
  odd.weeks["2026-10-12"].days[4].workouts.push({ ...v2Workout("workout-v1"), modelVersion: 1 });
  odd.weeks["2026-10-12"].days[4].workouts.push({ ...newer, id: "workout-v3-broken", burnMid: "lots" });
  const oddResult = sanitizePlannerState(odd)!;
  expect(oddResult.skipped).toBe(2);
  expect(oddResult.legacyWorkouts).toBe(1);
});

test("only a complete body profile is imported", () => {
  const valid = createBackup(seededStorage());
  const partial = { ...valid, data: { ...valid.data, profile: { ...profile, weightKg: null } } };
  const parsed = parseBackup(JSON.stringify(partial));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.summary.profile).toBe(false);
  expect(parsed.summary.skipped).toBe(1);
  const target = new MemoryStorage();
  target.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
  applyBackup(target, parsed.backup);
  expect(JSON.parse(target.getItem(STORAGE_KEYS.profile)!)).toEqual(profile);
});

test("backups without a profile keep the profile already on the device", () => {
  const valid = createBackup(seededStorage());
  const old = { ...valid, data: { customFoods: valid.data.customFoods, compareFoods: valid.data.compareFoods, planner: valid.data.planner } };
  const parsed = parseBackup(JSON.stringify(old));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.summary.profile).toBe(false);
  const target = new MemoryStorage();
  target.setItem(STORAGE_KEYS.profile, JSON.stringify({ ...profile, weightKg: 108 }));
  applyBackup(target, parsed.backup);
  expect(JSON.parse(target.getItem(STORAGE_KEYS.profile)!).weightKg).toBe(108);
});

test("files that are not valid backups are rejected", () => {
  const valid = createBackup(seededStorage());
  expect(parseBackup("not json")).toEqual({ ok: false, error: "invalid-json" });
  expect(parseBackup(JSON.stringify({ hello: 1 }))).toEqual({ ok: false, error: "not-a-backup" });
  expect(parseBackup(JSON.stringify({ ...valid, version: 99 }))).toEqual({ ok: false, error: "unsupported-version" });
  expect(parseBackup(JSON.stringify({ ...valid, data: { ...valid.data, customFoods: "nope" } }))).toEqual({ ok: false, error: "invalid-data" });
  expect(parseBackup(JSON.stringify({ ...valid, data: { ...valid.data, planner: { version: 2, weeks: {} } } }))).toEqual({ ok: false, error: "invalid-data" });
});

test("unreadable entries are skipped and counted instead of breaking the import", () => {
  const valid = createBackup(seededStorage());
  const planner = plannerWithOneMeal();
  const days = planner.weeks["2026-10-12"].days;
  days.pop(); // a missing day is rebuilt empty
  days.push({ ...days[0], meals: [{ id: "meal-x", junk: true }] }); // duplicate date: its entry is skipped
  days[2].meals.push({ ...(days[1].meals[0] as object), id: "meal-1" }); // repeated id: skipped
  const parsed = parseBackup(JSON.stringify({ ...valid, data: { ...valid.data, customFoods: [{ id: "x" }, dish], planner } }));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.backup.data.customFoods).toEqual([dish]);
  expect(parsed.summary).toMatchObject({ customFoods: 1, mealEntries: 1, workoutEntries: 1, skipped: 3 });
  const week = parsed.backup.data.planner!.weeks["2026-10-12"];
  expect(week.days.map((day) => day.date)).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
});

test("export keeps the weekly plan when an entry holds an out-of-range number", () => {
  const storage = seededStorage();
  const planner = plannerWithOneMeal();
  (planner.weeks["2026-10-12"].days[1].workouts[0] as { durationMinutes: number }).durationMinutes = -1;
  storage.setItem(STORAGE_KEYS.planner, JSON.stringify(planner));
  const backup = createBackup(storage);
  expect(backup.data.planner).not.toBeNull();
  expect(backup.data.planner!.weeks["2026-10-12"].days[1].workouts[0].durationMinutes).toBe(0);
});

test("a failed import restores the previous data", () => {
  const parsed = parseBackup(serializeBackup(createBackup(seededStorage())));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  class FullStorage extends MemoryStorage {
    setItem(key: string, value: string) {
      if (key === STORAGE_KEYS.planner && value.includes("meal-1")) throw new Error("QuotaExceededError");
      super.setItem(key, value);
    }
  }
  const target = new FullStorage();
  target.setItem(STORAGE_KEYS.customFoods, JSON.stringify([{ ...dish, id: "mine" }]));
  expect(() => applyBackup(target, parsed.backup)).toThrow("QuotaExceededError");
  expect(JSON.parse(target.getItem(STORAGE_KEYS.customFoods)!)).toEqual([{ ...dish, id: "mine" }]);
  expect(target.getItem(STORAGE_KEYS.compareFoods)).toBeNull();
});

test("imported dishes can only use bundled images", () => {
  const valid = createBackup(seededStorage());
  const remote = { ...dish, image: "https://example.com/tracker.png" };
  const parsed = parseBackup(JSON.stringify({ ...valid, data: { ...valid.data, customFoods: [remote] } }));
  expect(parsed.ok).toBe(true);
  if (parsed.ok) expect(parsed.backup.data.customFoods[0].image).toBe(CUSTOM_FOOD_IMAGE);
});
