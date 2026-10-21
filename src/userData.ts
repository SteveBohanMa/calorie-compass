import type { DayPlan, MealEntry, PlannerState, WeekPlan, WorkoutEntry } from "./planner";

export const APP_VERSION = "2.7.0";

// Browser-storage keys for user data. The names are part of the saved-data format:
// renaming a key hides everything users stored under it, so keep the historical
// version suffixes exactly as they are.
export const STORAGE_KEYS = {
  planner: "calorie-compass-v2.4-planner",
  customFoods: "calorie-compass-v2.5-custom-foods",
  compareFoods: "calorie-compass-v2.5-compare-foods",
  language: "calorie-compass-language",
} as const;

export const CUSTOM_FOOD_IMAGE = "/assets/food/custom-dish.png";
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export const BACKUP_FORMAT = "calorie-compass-backup";
export const BACKUP_VERSION = 1;

export type CustomFood = {
  id: string;
  nameZh: string;
  nameEn: string;
  kcalPer100G: number;
  servingWeightG: number;
  proteinPer100G: number;
  carbohydratePer100G: number;
  fatPer100G: number;
  fiberPer100G: number;
  image: string;
};

export type BackupData = {
  customFoods: CustomFood[];
  compareFoods: string[];
  planner: PlannerState | null;
};

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  appVersion: string;
  data: BackupData;
};

export type BackupSummary = {
  customFoods: number;
  compareFoods: number;
  weeks: number;
  mealEntries: number;
  workoutEntries: number;
  /** Entries that could not be read and were left out. */
  skipped: number;
};

export type BackupError = "invalid-json" | "not-a-backup" | "unsupported-version" | "invalid-data";

export type ParsedBackup =
  | { ok: true; backup: BackupFile; summary: BackupSummary }
  | { ok: false; error: BackupError };

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem" | "removeItem">;

const MEAL_SLOTS = new Set(["breakfast", "lunch", "dinner", "snack"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown, min = 0): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min;
}

function readJson(storage: StorageReader, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Returns a clean custom dish, or null when a required field is missing or malformed. */
export function sanitizeCustomFood(value: unknown): CustomFood | null {
  if (!isRecord(value)) return null;
  const { id, nameZh, nameEn, kcalPer100G } = value;
  if (!isString(id) || !id.trim() || !isString(nameZh) || !isString(nameEn)) return null;
  if (!nameZh.trim() && !nameEn.trim()) return null;
  if (!isNumber(kcalPer100G)) return null;
  const optional = (key: string, min: number, fallback: number) => (isNumber(value[key], min) ? (value[key] as number) : fallback);
  return {
    id,
    nameZh,
    nameEn,
    kcalPer100G,
    servingWeightG: optional("servingWeightG", 1, 100),
    proteinPer100G: optional("proteinPer100G", 0, 0),
    carbohydratePer100G: optional("carbohydratePer100G", 0, 0),
    fatPer100G: optional("fatPer100G", 0, 0),
    fiberPer100G: optional("fiberPer100G", 0, 0),
    // Only bundled images are allowed; anything else falls back to the default dish picture.
    image: isString(value.image) && value.image.startsWith("/assets/") ? value.image : CUSTOM_FOOD_IMAGE,
  };
}

/** A finite number, clamped to `min`; null when the value is not a number at all. */
function cleanNumber(value: unknown, min = 0): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, value) : null;
}

function cleanText(value: unknown) {
  return isString(value) ? value : "";
}

function sanitizeMealEntry(value: unknown): MealEntry | null {
  if (!isRecord(value) || !isString(value.id) || !value.id || !isString(value.foodId)) return null;
  const grams = cleanNumber(value.grams);
  const kcalPer100G = cleanNumber(value.kcalPer100G);
  const kcal = cleanNumber(value.kcal);
  if (grams === null || kcalPer100G === null || kcal === null) return null;
  return {
    id: value.id,
    slot: isString(value.slot) && MEAL_SLOTS.has(value.slot) ? (value.slot as MealEntry["slot"]) : "breakfast",
    foodId: value.foodId,
    nameZh: cleanText(value.nameZh),
    nameEn: cleanText(value.nameEn),
    grams,
    kcalPer100G,
    kcal,
    completed: value.completed === true,
  };
}

function sanitizeWorkoutEntry(value: unknown): WorkoutEntry | null {
  if (!isRecord(value) || !isString(value.id) || !value.id || !isString(value.exerciseId)) return null;
  const numbers = {
    bodyWeight: cleanNumber(value.bodyWeight),
    sets: cleanNumber(value.sets),
    reps: cleanNumber(value.reps),
    loadKg: cleanNumber(value.loadKg),
    durationMinutes: cleanNumber(value.durationMinutes),
    burnLow: cleanNumber(value.burnLow),
    burnHigh: cleanNumber(value.burnHigh),
  };
  if (Object.values(numbers).some((number) => number === null)) return null;
  return {
    id: value.id,
    exerciseId: value.exerciseId,
    nameZh: cleanText(value.nameZh),
    nameEn: cleanText(value.nameEn),
    ...(numbers as Record<keyof typeof numbers, number>),
    completed: value.completed === true,
  };
}

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function countEntries(day: unknown) {
  if (!isRecord(day)) return 0;
  return (Array.isArray(day.meals) ? day.meals.length : 0) + (Array.isArray(day.workouts) ? day.workouts.length : 0);
}

/**
 * Rebuilds one week as the planner expects it: seven consecutive days starting at the key.
 * Entries that cannot be read, repeat an id, or sit on a date outside the week are skipped.
 */
function sanitizeWeek(weekStart: string, value: unknown): { week: WeekPlan; skipped: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !isRecord(value) || !Array.isArray(value.days)) return null;
  const dates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const sources = new Map<string, Record<string, unknown>>();
  const seenIds = new Set<string>();
  let skipped = 0;
  for (const day of value.days) {
    if (isRecord(day) && isString(day.date) && dates.includes(day.date) && !sources.has(day.date)) sources.set(day.date, day);
    else skipped += countEntries(day);
  }
  const keep = <T extends { id: string }>(entries: unknown, sanitize: (entry: unknown) => T | null) => {
    const kept: T[] = [];
    for (const raw of Array.isArray(entries) ? entries : []) {
      const entry = sanitize(raw);
      if (!entry || seenIds.has(entry.id)) {
        skipped += 1;
        continue;
      }
      seenIds.add(entry.id);
      kept.push(entry);
    }
    return kept;
  };
  const days: DayPlan[] = dates.map((date) => ({
    date,
    meals: keep(sources.get(date)?.meals, sanitizeMealEntry),
    workouts: keep(sources.get(date)?.workouts, sanitizeWorkoutEntry),
  }));
  return { week: { weekStart, days, updatedAt: isString(value.updatedAt) ? value.updatedAt : new Date(0).toISOString() }, skipped };
}

/** Cleans a stored or imported weekly plan; null when it is not a planner state at all. */
export function sanitizePlannerState(value: unknown): { state: PlannerState; skipped: number } | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.weeks)) return null;
  const weeks: Record<string, WeekPlan> = {};
  let skipped = 0;
  for (const [key, raw] of Object.entries(value.weeks)) {
    const result = sanitizeWeek(key, raw);
    if (!result) {
      skipped += isRecord(raw) && Array.isArray(raw.days) ? raw.days.reduce((total: number, day: unknown) => total + countEntries(day), 0) : 0;
      continue;
    }
    weeks[key] = result.week;
    skipped += result.skipped;
  }
  return { state: { version: 1, weeks }, skipped };
}

function summarize(data: BackupData, skipped: number): BackupSummary {
  const weeks = data.planner ? Object.values(data.planner.weeks) : [];
  const days = weeks.flatMap((week) => week.days);
  return {
    customFoods: data.customFoods.length,
    compareFoods: data.compareFoods.length,
    weeks: weeks.filter((week) => week.days.some((day) => day.meals.length || day.workouts.length)).length,
    mealEntries: days.reduce((total, day) => total + day.meals.length, 0),
    workoutEntries: days.reduce((total, day) => total + day.workouts.length, 0),
    skipped,
  };
}

function cleanData(customFoods: unknown, compareFoods: unknown, planner: unknown) {
  const foods = Array.isArray(customFoods) ? customFoods.map(sanitizeCustomFood) : [];
  const compared = Array.isArray(compareFoods) ? compareFoods : [];
  const plan = planner === null || planner === undefined ? null : sanitizePlannerState(planner);
  const data: BackupData = {
    customFoods: foods.filter((food): food is CustomFood => food !== null),
    compareFoods: compared.filter(isString),
    planner: plan?.state ?? null,
  };
  const skipped = (foods.length - data.customFoods.length) + (compared.length - data.compareFoods.length) + (plan?.skipped ?? 0);
  return { data, skipped, plannerUnreadable: planner !== null && planner !== undefined && plan === null };
}

/** Collects everything the user created on this device into one backup, reporting unreadable entries. */
export function createBackupWithReport(storage: StorageReader, now = new Date()): { backup: BackupFile; summary: BackupSummary } {
  const { data, skipped } = cleanData(
    readJson(storage, STORAGE_KEYS.customFoods),
    readJson(storage, STORAGE_KEYS.compareFoods),
    readJson(storage, STORAGE_KEYS.planner),
  );
  const backup: BackupFile = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), appVersion: APP_VERSION, data };
  return { backup, summary: summarize(data, skipped) };
}

export function createBackup(storage: StorageReader, now = new Date()): BackupFile {
  return createBackupWithReport(storage, now).backup;
}

export function serializeBackup(backup: BackupFile) {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

export function summarizeBackup(backup: BackupFile) {
  return summarize(backup.data, 0);
}

/** Chinese name for the desktop save dialog; ASCII for browser downloads, which may drop non-ASCII names. */
export function backupFileName(now = new Date(), style: "zh" | "ascii" = "zh") {
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  return style === "zh" ? `燃卡快查-数据备份-${date}.json` : `calorie-compass-backup-${date}.json`;
}

/**
 * Validates a backup file. The file must be a Calorie Compass backup with the expected structure;
 * individual entries that cannot be read are skipped and counted in `summary.skipped`.
 */
export function parseBackup(text: string): ParsedBackup {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return { ok: false, error: "invalid-json" };
  }
  if (!isRecord(value) || value.format !== BACKUP_FORMAT) return { ok: false, error: "not-a-backup" };
  if (value.version !== BACKUP_VERSION) {
    return { ok: false, error: isNumber(value.version) && value.version > BACKUP_VERSION ? "unsupported-version" : "invalid-data" };
  }
  const raw = value.data;
  if (!isRecord(raw) || !Array.isArray(raw.customFoods) || !Array.isArray(raw.compareFoods)) {
    return { ok: false, error: "invalid-data" };
  }
  const { data, skipped, plannerUnreadable } = cleanData(raw.customFoods, raw.compareFoods, raw.planner);
  if (plannerUnreadable) return { ok: false, error: "invalid-data" };
  const backup: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: isString(value.exportedAt) ? value.exportedAt : "",
    appVersion: isString(value.appVersion) ? value.appVersion : "",
    data,
  };
  return { ok: true, backup, summary: summarize(data, skipped) };
}

/**
 * Replaces this device's user data with the backup's contents. If any write fails (for example
 * when storage is full), the previous values are restored and the error is rethrown.
 */
export function applyBackup(storage: StorageReader & StorageWriter, backup: BackupFile) {
  const keys = [STORAGE_KEYS.customFoods, STORAGE_KEYS.compareFoods, STORAGE_KEYS.planner];
  const previous = keys.map((key) => [key, storage.getItem(key)] as const);
  try {
    storage.setItem(STORAGE_KEYS.customFoods, JSON.stringify(backup.data.customFoods));
    storage.setItem(STORAGE_KEYS.compareFoods, JSON.stringify(backup.data.compareFoods));
    if (backup.data.planner) storage.setItem(STORAGE_KEYS.planner, JSON.stringify(backup.data.planner));
    else storage.removeItem(STORAGE_KEYS.planner);
  } catch (error) {
    for (const [key, old] of previous) {
      try {
        if (old === null) storage.removeItem(key);
        else storage.setItem(key, old);
      } catch {
        // Best effort: keep restoring the remaining keys.
      }
    }
    throw error;
  }
}
