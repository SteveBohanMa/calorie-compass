// Health Connect in the Android app (v2.10): the decisions, as pure functions (no Capacitor, React or
// storage), tested in tests/health.spec.ts. src/health/api.ts talks to the native plugin
// (scripts/android/native/CalorieCompassHealthPlugin.java) and src/health/HealthContext.tsx keeps the
// app's state. Owner's rules (docs: "燃卡快查 v2.10 更新文档"):
// - Heart rate is read for strength exercises (and resistance-type sessions) only, never for aerobic ones.
//   A workout the watch or band is recording or has just finished gives its average heart rate; otherwise
//   the newest sample of the last few minutes is used. Too few samples are not judged here: the user can
//   always change the value.
// - Write-back is off until turned on; only exercises ticked as done are written, one record per exercise,
//   and not when the band already has a workout at that time. Unticking or deleting removes the record.
import type { WorkoutEntry } from "../planner";
import type { Exercise } from "../workout/exercises";
import { INPUT_LIMITS } from "../workout/model";
import { PROFILE_LIMITS, type StoredProfile } from "../workout/profile";

export type Lang = "zh" | "en";

// ---------------------------------------------------------------- permissions and status

/** Permission aliases of the native plugin (one or more Android health permissions each). */
export type HealthAlias = "heartRate" | "exercise" | "weight" | "restingHeartRate" | "writeWorkouts";
export const HEALTH_ALIASES: readonly HealthAlias[] = ["heartRate", "exercise", "weight", "restingHeartRate", "writeWorkouts"];

export type PermissionValue = "granted" | "denied" | "prompt" | "prompt-with-rationale";
export type HealthPermissions = Record<HealthAlias, PermissionValue>;

export type HealthUnavailableReason = "web" | "android-version" | "no-health-connect" | "error";
export type HealthStatus = { available: true } | { available: false; reason: HealthUnavailableReason };

/**
 * What each feature asks for. Heart rate also asks to read workouts (for the band's workout average) but
 * works without it; write-back needs to read workouts to avoid writing over the band's own record.
 */
export const FEATURE_PERMISSIONS = {
  heartRate: { request: ["heartRate", "exercise"], required: ["heartRate"] },
  weight: { request: ["weight"], required: ["weight"] },
  restingHeartRate: { request: ["restingHeartRate"], required: ["restingHeartRate"] },
  writeBack: { request: ["writeWorkouts", "exercise"], required: ["writeWorkouts", "exercise"] },
} as const satisfies Record<string, { request: readonly HealthAlias[]; required: readonly HealthAlias[] }>;
export type HealthFeature = keyof typeof FEATURE_PERMISSIONS;

export function noPermissions(): HealthPermissions {
  return { heartRate: "prompt", exercise: "prompt", weight: "prompt", restingHeartRate: "prompt", writeWorkouts: "prompt" };
}

export function featureAllowed(permissions: HealthPermissions, feature: HealthFeature) {
  return FEATURE_PERMISSIONS[feature].required.every((alias) => permissions[alias] === "granted");
}

// ---------------------------------------------------------------- readings

export type HeartRateSample = { bpm: number; time: string; source: string };
export type ExerciseSession = { start: string; end: string; type: number; title: string; source: string; own: boolean };
export type WeightReading = { kg: number; time: string; source: string };
export type RestingSummary = { latest: HeartRateSample; average: number; count: number };

/** Where an automatically filled heart rate came from. */
export type HeartRateReading =
  | { kind: "current"; bpm: number; time: string; source: string }
  | { kind: "session"; bpm: number; start: string; end: string; source: string; title: string };

/** "Current" heart rate: the newest sample may be at most this old (owner's choice: 5 minutes). */
export const FRESH_HEART_RATE_MINUTES = 5;
/** A band workout counts as "just finished" for this long after it ended. */
export const RECENT_SESSION_HOURS = 2;
/** Workouts are found by their start time; this is how far back they are looked for. */
export const SESSION_SEARCH_HOURS = 12;
/** Weight readings older than this are not offered (Health Connect also limits reads to about 30 days). */
export const WEIGHT_DAYS = 30;
export const RESTING_DAYS = 7;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function timeOf(value: string | null | undefined) {
  if (typeof value !== "string") return Number.NaN;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

function iso(ms: number) {
  return new Date(ms).toISOString();
}

/**
 * Exercises whose heart rate is read automatically: strength exercises and resistance-type sessions
 * (circuit training, a whole strength session). Aerobic exercises keep manual entry: cardio machines show
 * their own numbers, and the app is about the energy of anaerobic training.
 */
export function readsHeartRate(exercise: Exercise): boolean {
  return exercise.kind === "strength" || (exercise.kind === "met" && exercise.hrModel === "collins");
}

/** A whole-number heart rate the workout form accepts (INPUT_LIMITS.avgHr), or null. */
export function usableHeartRate(bpm: unknown): number | null {
  if (typeof bpm !== "number" || !Number.isFinite(bpm)) return null;
  const value = Math.round(bpm);
  return value >= INPUT_LIMITS.avgHr.min && value <= INPUT_LIMITS.avgHr.max ? value : null;
}

/**
 * The newest usable sample measured at most FRESH_HEART_RATE_MINUTES before `now` (one minute after `now`
 * is accepted for clock differences between the band and the phone).
 */
export function pickCurrentHeartRate(samples: HeartRateSample[], now: Date): HeartRateSample | null {
  const earliest = now.getTime() - FRESH_HEART_RATE_MINUTES * MINUTE;
  const latest = now.getTime() + MINUTE;
  let best: HeartRateSample | null = null;
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const sample of samples) {
    const time = timeOf(sample.time);
    const bpm = usableHeartRate(sample.bpm);
    if (!Number.isFinite(time) || bpm === null || time < earliest || time > latest) continue;
    if (time > bestTime) {
      best = { ...sample, bpm };
      bestTime = time;
    }
  }
  return best;
}

/** The workout another app (the watch or band) is recording or finished at most RECENT_SESSION_HOURS ago. */
export function pickRecentSession(sessions: ExerciseSession[], now: Date): ExerciseSession | null {
  const cutoff = now.getTime() - RECENT_SESSION_HOURS * HOUR;
  let best: ExerciseSession | null = null;
  let bestEnd = Number.NEGATIVE_INFINITY;
  for (const session of sessions) {
    const start = timeOf(session.start);
    const end = timeOf(session.end);
    if (session.own || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    if (start >= now.getTime() || end < cutoff) continue;
    if (end > bestEnd) {
      best = session;
      bestEnd = end;
    }
  }
  return best;
}

/** The part of a workout that has already happened. */
export function sessionWindow(session: ExerciseSession, now: Date) {
  return { start: iso(timeOf(session.start)), end: iso(Math.min(timeOf(session.end), now.getTime())) };
}

/** The entry fields that record where an automatic heart rate came from. */
export function heartRateFields(reading: HeartRateReading): Required<Pick<WorkoutEntry, "hrSource" | "hrFrom" | "hrTo">> {
  return reading.kind === "current"
    ? { hrSource: "healthConnect", hrFrom: reading.time, hrTo: reading.time }
    : { hrSource: "healthConnect", hrFrom: reading.start, hrTo: reading.end };
}

/** Whole minutes from `time` to `now` (0 when it is in the future). */
export function minutesAgo(time: string, now: Date) {
  const ms = timeOf(time);
  return Number.isFinite(ms) ? Math.max(0, Math.floor((now.getTime() - ms) / MINUTE)) : 0;
}

/** Latest resting heart rate and its average over RESTING_DAYS, or null when there is none. */
export function restingSummary(samples: HeartRateSample[], now: Date): RestingSummary | null {
  const from = now.getTime() - RESTING_DAYS * 24 * HOUR;
  const usable = samples.filter((sample) => {
    const time = timeOf(sample.time);
    return Number.isFinite(time) && time >= from && time <= now.getTime() + MINUTE
      && typeof sample.bpm === "number" && sample.bpm >= 25 && sample.bpm <= 150;
  });
  if (!usable.length) return null;
  const latest = usable.reduce((best, sample) => (timeOf(sample.time) > timeOf(best.time) ? sample : best));
  const average = usable.reduce((total, sample) => total + sample.bpm, 0) / usable.length;
  return { latest: { ...latest, bpm: Math.round(latest.bpm) }, average: Math.round(average), count: usable.length };
}

/**
 * The weight to offer for the body data: newer than the profile's last save, different by at least
 * 0.1 kg, inside the profile's limits and not dismissed. Null when there is nothing to offer.
 */
export function weightSuggestion(profile: StoredProfile, reading: WeightReading | null, ignoredTime: string | null): WeightReading | null {
  if (!reading) return null;
  const kg = Math.round(reading.kg * 10) / 10;
  if (!(kg >= PROFILE_LIMITS.weightKg.min && kg <= PROFILE_LIMITS.weightKg.max)) return null;
  if (ignoredTime !== null && ignoredTime === reading.time) return null;
  if (profile.weightKg !== null && Math.abs(profile.weightKg - kg) < 0.05) return null;
  const saved = timeOf(profile.updatedAt);
  if (Number.isFinite(saved) && timeOf(reading.time) <= saved) return null;
  return { ...reading, kg };
}

// ---------------------------------------------------------------- write-back

/** Health Connect exercise types (android.health.connect.datatypes.ExerciseSessionType). */
export const EXERCISE_TYPES = {
  strengthTraining: 45,
  calisthenics: 8,
  walking: 53,
  running: 33,
  bikingStationary: 5,
  rowingMachine: 61,
  elliptical: 60,
  stairClimbingMachine: 59,
  highIntensityIntervalTraining: 20,
  otherWorkout: 58,
} as const;

const MET_EXERCISE_TYPES: Record<string, number> = {
  plank: EXERCISE_TYPES.calisthenics,
  elliptical: EXERCISE_TYPES.elliptical,
  stair: EXERCISE_TYPES.stairClimbingMachine,
  hiit: EXERCISE_TYPES.highIntensityIntervalTraining,
  circuit: EXERCISE_TYPES.strengthTraining,
  "strength-session": EXERCISE_TYPES.strengthTraining,
};

export function exerciseTypeFor(exercise: Exercise | undefined): number {
  switch (exercise?.kind) {
    case "strength": return EXERCISE_TYPES.strengthTraining;
    case "walk": return EXERCISE_TYPES.walking;
    case "run": return EXERCISE_TYPES.running;
    case "cycle": return EXERCISE_TYPES.bikingStationary;
    case "row": return EXERCISE_TYPES.rowingMachine;
    case "met": return MET_EXERCISE_TYPES[exercise.id] ?? EXERCISE_TYPES.otherWorkout;
    default: return EXERCISE_TYPES.otherWorkout;
  }
}

/** yyyy-mm-dd in local time (the planner's day keys). */
export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * When a done exercise happened: it ends when it was recorded on the workout screen, or else when it was
 * ticked as done, and lasts the entry's duration. That time has to fall on the entry's own day; a plan
 * entry ticked on another day has no known time and is not written.
 */
export function workoutWindow(entry: WorkoutEntry, date: string, now: Date): { start: string; end: string } | null {
  const stamp = typeof entry.recordedAt === "string" ? entry.recordedAt : entry.completedAt;
  const endMs = timeOf(stamp);
  if (!Number.isFinite(endMs) || localDateKey(new Date(endMs)) !== date) return null;
  const end = Math.min(endMs, now.getTime());
  const duration = Number.isFinite(entry.durationMinutes) ? Math.min(600, Math.max(1, entry.durationMinutes)) : 1;
  return { start: iso(end - duration * MINUTE), end: iso(end) };
}

/** What write-back puts into Health Connect for one exercise. kcal is the entry's extra energy (midpoint). */
export type WorkoutRecord = { id: string; start: string; end: string; exerciseType: number; title: string; kcal: number };

export function workoutRecord(entry: WorkoutEntry, date: string, exercise: Exercise | undefined, lang: Lang, now: Date): WorkoutRecord | null {
  if (!entry.completed) return null;
  const kcal = Math.round(entry.burnMid);
  if (!(kcal > 0)) return null;
  const window = workoutWindow(entry, date, now);
  if (!window) return null;
  const title = (lang === "zh" ? entry.nameZh || entry.nameEn : entry.nameEn || entry.nameZh) || entry.exerciseId;
  return { id: entry.id, ...window, exerciseType: exerciseTypeFor(exercise), title: title.slice(0, 100), kcal };
}

/** What a written record depends on; the title is left out so switching the language rewrites nothing. */
export function recordFingerprint(record: WorkoutRecord) {
  return [record.start, record.end, record.exerciseType, record.kcal].join("|");
}

/** A workout by another app that overlaps the record's time, or null. */
export function overlappingSession(sessions: ExerciseSession[], record: { start: string; end: string }): ExerciseSession | null {
  const start = timeOf(record.start);
  const end = timeOf(record.end);
  return sessions.find((session) => !session.own && timeOf(session.start) < end && timeOf(session.end) > start) ?? null;
}

export type SyncItem = { state: "written" | "skipped-overlap"; fingerprint: string; at: string };
/** Device-local bookkeeping of write-back, by entry id (not part of backups: it describes this phone). */
export type SyncMap = Record<string, SyncItem>;

export type SyncOp =
  | { kind: "write"; record: WorkoutRecord; checkOverlap: boolean }
  | { kind: "delete"; id: string }
  | { kind: "forget"; id: string };

/**
 * What write-back has to do so Health Connect matches the plan. `current` lists every workout entry with
 * the record it should have (null: none). New records are only written for exercises that end after
 * `since` (the start of the day write-back was turned on), so turning it on does not copy old history;
 * records already written keep following their entry.
 */
export function planSync(current: { id: string; record: WorkoutRecord | null }[], map: SyncMap, since: string | null): SyncOp[] {
  const ops: SyncOp[] = [];
  const seen = new Set<string>();
  const sinceMs = timeOf(since);
  for (const { id, record } of current) {
    seen.add(id);
    const previous = map[id];
    if (record) {
      const fingerprint = recordFingerprint(record);
      if (!previous) {
        if (Number.isFinite(sinceMs) && timeOf(record.end) >= sinceMs) ops.push({ kind: "write", record, checkOverlap: true });
      } else if (previous.fingerprint !== fingerprint) {
        ops.push({ kind: "write", record, checkOverlap: previous.state !== "written" });
      }
    } else if (previous) {
      ops.push(previous.state === "written" ? { kind: "delete", id } : { kind: "forget", id });
    }
  }
  for (const [id, previous] of Object.entries(map)) {
    if (!seen.has(id)) ops.push(previous.state === "written" ? { kind: "delete", id } : { kind: "forget", id });
  }
  return ops;
}

// ---------------------------------------------------------------- settings (device-local)

export type HealthSettings = {
  /** Offer newer weights from Health Connect for the body data. */
  weight: boolean;
  /** Show the resting heart rate in My Data. */
  restingHeartRate: boolean;
  /** Write exercises ticked as done to Health Connect. */
  writeBack: boolean;
  /** Start of the day write-back was turned on (ISO); first writes only happen for later workouts. */
  writeBackSince: string | null;
  /** Time of the weight reading the user chose to ignore. */
  ignoredWeightTime: string | null;
};

export function defaultHealthSettings(): HealthSettings {
  return { weight: false, restingHeartRate: false, writeBack: false, writeBackSince: null, ignoredWeightTime: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function timeText(value: unknown) {
  return typeof value === "string" && Number.isFinite(timeOf(value)) ? value : null;
}

export function sanitizeHealthSettings(value: unknown): HealthSettings {
  if (!isRecord(value)) return defaultHealthSettings();
  return {
    weight: value.weight === true,
    restingHeartRate: value.restingHeartRate === true,
    writeBack: value.writeBack === true,
    writeBackSince: timeText(value.writeBackSince),
    ignoredWeightTime: timeText(value.ignoredWeightTime),
  };
}

export function sanitizeSyncMap(value: unknown): SyncMap {
  const map: SyncMap = {};
  if (!isRecord(value)) return map;
  for (const [id, item] of Object.entries(value)) {
    if (!id || !isRecord(item) || typeof item.fingerprint !== "string") continue;
    if (item.state !== "written" && item.state !== "skipped-overlap") continue;
    map[id] = { state: item.state, fingerprint: item.fingerprint, at: timeText(item.at) ?? new Date(0).toISOString() };
  }
  return map;
}

// ---------------------------------------------------------------- names

/** Apps that commonly write to Health Connect, by package name. */
const SOURCE_NAMES: Record<string, { zh: string; en: string }> = {
  "com.sec.android.app.shealth": { zh: "三星健康", en: "Samsung Health" },
  "com.xiaomi.wearable": { zh: "小米运动健康", en: "Mi Fitness" },
  "com.mi.health": { zh: "小米健康", en: "Mi Health" },
  "com.xiaomi.hm.health": { zh: "Zepp Life", en: "Zepp Life" },
  "com.huami.watch.hmwatchmanager": { zh: "Zepp", en: "Zepp" },
  "com.huawei.health": { zh: "华为运动健康", en: "Huawei Health" },
  "com.heytap.health": { zh: "欢太健康", en: "HeyTap Health" },
  "com.google.android.apps.fitness": { zh: "Google 健身", en: "Google Fit" },
  "com.fitbit.FitbitMobile": { zh: "Fitbit", en: "Fitbit" },
  "com.garmin.android.apps.connectmobile": { zh: "Garmin Connect", en: "Garmin Connect" },
  "com.ouraring.oura": { zh: "Oura", en: "Oura" },
  "com.withings.wiscale2": { zh: "Withings", en: "Withings" },
  "fi.polar.polarflow": { zh: "Polar Flow", en: "Polar Flow" },
  "com.android.healthconnect.controller": { zh: "Health Connect", en: "Health Connect" },
  "com.google.android.apps.healthdata": { zh: "Health Connect", en: "Health Connect" },
};

export function sourceName(packageName: string, lang: Lang) {
  return SOURCE_NAMES[packageName]?.[lang] ?? (lang === "zh" ? "其他应用" : "another app");
}
