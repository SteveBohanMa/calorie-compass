import { expect, test } from "@playwright/test";
import fs from "node:fs";
import {
  APP_VERSION,
  CUSTOM_FOOD_IMAGE,
  STORAGE_KEYS,
  applyBackup,
  createBackup,
  parseBackup,
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

function plannerWithOneMeal() {
  const days = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"].map(day);
  days[1].meals.push({ id: "meal-1", slot: "lunch", foodId: "f001", nameZh: "白米饭", nameEn: "Cooked white rice", grams: 150, kcalPer100G: 116, kcal: 174, completed: true });
  days[1].workouts.push({ id: "workout-1", exerciseId: "deadlift", nameZh: "硬拉", nameEn: "Deadlift", bodyWeight: 112, sets: 1, reps: 10, loadKg: 150, durationMinutes: 0, burnLow: 8, burnHigh: 11, completed: false });
  return { version: 1, weeks: { "2026-10-12": { weekStart: "2026-10-12", days, updatedAt: "2026-10-15T00:00:00.000Z" } } };
}

function seededStorage() {
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_KEYS.customFoods, JSON.stringify([dish]));
  storage.setItem(STORAGE_KEYS.compareFoods, JSON.stringify(["f001", "custom-1"]));
  storage.setItem(STORAGE_KEYS.planner, JSON.stringify(plannerWithOneMeal()));
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
  expect(parsed.summary).toEqual({ customFoods: 1, compareFoods: 2, weeks: 1, mealEntries: 1, workoutEntries: 1, skipped: 0 });

  const target = new MemoryStorage();
  target.setItem(STORAGE_KEYS.customFoods, JSON.stringify([{ ...dish, id: "old" }]));
  applyBackup(target, parsed.backup);
  expect(JSON.parse(target.getItem(STORAGE_KEYS.customFoods)!)).toEqual([dish]);
  expect(JSON.parse(target.getItem(STORAGE_KEYS.compareFoods)!)).toEqual(["f001", "custom-1"]);
  expect(JSON.parse(target.getItem(STORAGE_KEYS.planner)!)).toEqual(plannerWithOneMeal());
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
