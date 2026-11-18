import { expect, test, type Page } from "@playwright/test";
import { HealthError, createHealthApi, toHealthError, type NativeHealthPlugin } from "../src/health/api";
import { HEALTH_COPY } from "../src/health/copy";
import {
  EXERCISE_TYPES,
  defaultHealthSettings,
  exerciseTypeFor,
  featureAllowed,
  localDateKey,
  noPermissions,
  overlappingSession,
  pickCurrentHeartRate,
  pickRecentSession,
  planSync,
  readsHeartRate,
  recordFingerprint,
  restingSummary,
  sanitizeHealthSettings,
  sanitizeSyncMap,
  sessionWindow,
  sourceName,
  weightSuggestion,
  workoutRecord,
  workoutWindow,
  type ExerciseSession,
  type WorkoutRecord,
} from "../src/health/core";
import type { WorkoutEntry } from "../src/planner";
import { sanitizeWorkoutEntry } from "../src/userData";
import { withCompletion, withHeartRateSource } from "../src/workout/draft";
import { emptyProfile } from "../src/workout/profile";
import { findExercise } from "../src/workout/exercises";

// v2.10 Health Connect (Android 14+): the decisions in src/health/core.ts and src/health/api.ts, and the
// screens with a fake native plugin (window.__calorieCompassHealthPlugin, read by src/health/api.ts).

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NOW = new Date("2026-11-07T15:00:00.000Z");
const ago = (ms: number, now = NOW) => new Date(now.getTime() - ms).toISOString();

const entryBase: WorkoutEntry = {
  id: "w1", exerciseId: "deadlift", nameZh: "传统硬拉", nameEn: "Conventional deadlift", bodyWeight: 112, sets: 1, reps: 10, loadKg: 150,
  restSec: null, secPerRep: null, holdSeconds: null, minutes: null, speedKmh: null, gradePct: null, watts: null, level: null, rpe: null, avgHr: null,
  durationMinutes: 12.5, burnLow: 12, burnMid: 23.4, burnHigh: 43, totalLow: null, totalHigh: null, headline: "training", modelVersion: 2, completed: true,
};

test.describe("heart rate choices", () => {
  test("the current heart rate is the newest sample of the last five minutes", () => {
    const samples = [
      { bpm: 96, time: ago(4 * MINUTE), source: "a" },
      { bpm: 127.6, time: ago(1 * MINUTE), source: "b" },
      { bpm: 140, time: ago(6 * MINUTE), source: "too old" },
      { bpm: 250, time: ago(0), source: "out of range" },
      { bpm: 101, time: "not a time", source: "broken" },
    ];
    expect(pickCurrentHeartRate(samples, NOW)).toEqual({ bpm: 128, time: ago(1 * MINUTE), source: "b" });
    // A band clock a little ahead of the phone still counts; more than a minute ahead does not.
    expect(pickCurrentHeartRate([{ bpm: 110, time: ago(-30_000), source: "x" }], NOW)?.bpm).toBe(110);
    expect(pickCurrentHeartRate([{ bpm: 110, time: ago(-2 * MINUTE), source: "x" }], NOW)).toBeNull();
    expect(pickCurrentHeartRate([{ bpm: 140, time: ago(5 * MINUTE + 1000), source: "x" }], NOW)).toBeNull();
    expect(pickCurrentHeartRate([], NOW)).toBeNull();
  });

  test("a workout another app is recording or finished in the last two hours is used", () => {
    const session = (start: number, end: number, extra: Partial<ExerciseSession> = {}): ExerciseSession => ({
      start: ago(start), end: ago(end), type: 45, title: "", source: "com.sec.android.app.shealth", own: false, ...extra,
    });
    const recent = session(50 * MINUTE, 10 * MINUTE, { title: "recent" });
    const older = session(3 * HOUR, 2.5 * HOUR, { title: "older" });
    const ours = session(20 * MINUTE, 1 * MINUTE, { own: true });
    expect(pickRecentSession([older, recent, ours], NOW)).toBe(recent);
    expect(pickRecentSession([older, ours], NOW)).toBeNull();
    const ongoing = session(30 * MINUTE, -20 * MINUTE, { title: "ongoing" });
    expect(pickRecentSession([recent, ongoing], NOW)).toBe(ongoing);
    // Only the part that has already happened is averaged.
    expect(sessionWindow(ongoing, NOW)).toEqual({ start: ago(30 * MINUTE), end: NOW.toISOString() });
    expect(pickRecentSession([session(-5 * MINUTE, -30 * MINUTE)], NOW)).toBeNull();
    expect(pickRecentSession([session(10 * MINUTE, 20 * MINUTE)], NOW)).toBeNull();
  });

  test("heart rate is read for strength exercises and resistance sessions, never for cardio", () => {
    const reads = (id: string) => readsHeartRate(findExercise(id)!);
    expect(["deadlift", "squat", "circuit", "strength-session"].map(reads)).toEqual([true, true, true, true]);
    expect(["walk", "run", "bike", "rower", "elliptical", "hiit", "plank"].map(reads)).toEqual([false, false, false, false, false, false, false]);
  });

  test("resting heart rate: the latest value and the average of seven days", () => {
    const summary = restingSummary([
      { bpm: 58, time: ago(10 * HOUR), source: "s" },
      { bpm: 61, time: ago(60 * HOUR), source: "s" },
      { bpm: 20, time: ago(5 * HOUR), source: "broken" },
      { bpm: 70, time: ago(8 * 24 * HOUR), source: "too old" },
    ], NOW);
    expect(summary).toEqual({ latest: { bpm: 58, time: ago(10 * HOUR), source: "s" }, average: 60, count: 2 });
    expect(restingSummary([], NOW)).toBeNull();
  });

  test("a weight is offered only when it is newer, different and plausible", () => {
    const profile = { ...emptyProfile(), weightKg: 112, updatedAt: "2026-11-01T08:00:00.000Z" };
    const reading = { kg: 110.44, time: "2026-11-05T07:00:00.000Z", source: "com.withings.wiscale2" };
    expect(weightSuggestion(profile, reading, null)).toEqual({ ...reading, kg: 110.4 });
    expect(weightSuggestion(profile, { ...reading, time: "2026-10-30T07:00:00.000Z" }, null)).toBeNull();
    expect(weightSuggestion(profile, { ...reading, kg: 112.02 }, null)).toBeNull();
    expect(weightSuggestion(profile, reading, reading.time)).toBeNull();
    expect(weightSuggestion(profile, { ...reading, kg: 900 }, null)).toBeNull();
    expect(weightSuggestion(profile, null, null)).toBeNull();
    expect(weightSuggestion({ ...profile, weightKg: null, updatedAt: "" }, reading, null)?.kg).toBe(110.4);
  });

  test("permissions per feature", () => {
    const permissions = { ...noPermissions(), heartRate: "granted" as const };
    expect(featureAllowed(permissions, "heartRate")).toBe(true);
    expect(featureAllowed(permissions, "writeBack")).toBe(false);
    expect(featureAllowed({ ...permissions, writeWorkouts: "granted", exercise: "granted" }, "writeBack")).toBe(true);
    expect(featureAllowed({ ...permissions, writeWorkouts: "granted" }, "writeBack")).toBe(false);
  });

  test("app names of the sources", () => {
    expect(sourceName("com.xiaomi.wearable", "zh")).toBe("小米运动健康");
    expect(sourceName("com.sec.android.app.shealth", "en")).toBe("Samsung Health");
    expect(sourceName("com.example.unknown", "zh")).toBe("其他应用");
    expect(sourceName("", "en")).toBe("another app");
  });
});

test.describe("write-back decisions", () => {
  const recordedAt = ago(30 * MINUTE);
  const day = localDateKey(new Date(recordedAt));

  test("an exercise ends when it was recorded, or else when it was ticked, on its own day", () => {
    expect(workoutWindow({ ...entryBase, recordedAt, completedAt: ago(1 * MINUTE) }, day, NOW)).toEqual({ start: ago(42.5 * MINUTE), end: recordedAt });
    expect(workoutWindow({ ...entryBase, completedAt: recordedAt }, day, NOW)).toEqual({ start: ago(42.5 * MINUTE), end: recordedAt });
    // A plan entry ticked on another day has no known time.
    const otherDay = localDateKey(new Date(new Date(recordedAt).getTime() + 2 * 24 * HOUR));
    expect(workoutWindow({ ...entryBase, recordedAt }, otherDay, NOW)).toBeNull();
    expect(workoutWindow({ ...entryBase }, day, NOW)).toBeNull();
    // Durations are kept between one minute and ten hours.
    expect(workoutWindow({ ...entryBase, recordedAt, durationMinutes: 0.4 }, day, NOW)?.start).toBe(ago(31 * MINUTE));
  });

  test("one record per exercise that is done and has energy", () => {
    const deadlift = findExercise("deadlift");
    const record = workoutRecord({ ...entryBase, recordedAt }, day, deadlift, "zh", NOW);
    expect(record).toEqual({ id: "w1", start: ago(42.5 * MINUTE), end: recordedAt, exerciseType: EXERCISE_TYPES.strengthTraining, title: "传统硬拉", kcal: 23 });
    expect(workoutRecord({ ...entryBase, recordedAt }, day, deadlift, "en", NOW)?.title).toBe("Conventional deadlift");
    expect(workoutRecord({ ...entryBase, recordedAt, completed: false }, day, deadlift, "zh", NOW)).toBeNull();
    expect(workoutRecord({ ...entryBase, recordedAt, burnMid: 0 }, day, deadlift, "zh", NOW)).toBeNull();
    // The title is not part of the fingerprint, so switching the language rewrites nothing.
    const english = workoutRecord({ ...entryBase, recordedAt }, day, deadlift, "en", NOW)!;
    expect(recordFingerprint(english)).toBe(recordFingerprint(record!));
  });

  test("Health Connect exercise types", () => {
    const type = (id: string) => exerciseTypeFor(findExercise(id));
    expect(type("deadlift")).toBe(EXERCISE_TYPES.strengthTraining);
    expect(type("walk")).toBe(EXERCISE_TYPES.walking);
    expect(type("run")).toBe(EXERCISE_TYPES.running);
    expect(type("bike")).toBe(EXERCISE_TYPES.bikingStationary);
    expect(type("rower")).toBe(EXERCISE_TYPES.rowingMachine);
    expect(type("plank")).toBe(EXERCISE_TYPES.calisthenics);
    expect(type("hiit")).toBe(EXERCISE_TYPES.highIntensityIntervalTraining);
    expect(type("strength-session")).toBe(EXERCISE_TYPES.strengthTraining);
    expect(exerciseTypeFor(undefined)).toBe(EXERCISE_TYPES.otherWorkout);
  });

  test("another app's workout at the same time blocks writing", () => {
    const record = { start: ago(40 * MINUTE), end: ago(30 * MINUTE) };
    const band = { start: ago(50 * MINUTE), end: ago(35 * MINUTE), type: 45, title: "", source: "s", own: false };
    expect(overlappingSession([band], record)).toBe(band);
    expect(overlappingSession([{ ...band, own: true }], record)).toBeNull();
    expect(overlappingSession([{ ...band, end: record.start }], record)).toBeNull();
    expect(overlappingSession([{ ...band, start: record.end, end: ago(0) }], record)).toBeNull();
  });

  test("the plan decides what is written, rewritten, deleted or forgotten", () => {
    const since = ago(2 * HOUR);
    const record = (id: string, end: string, kcal = 20): WorkoutRecord => ({ id, start: ago(10 * MINUTE, new Date(end)), end, exerciseType: 45, title: id, kcal });
    const fresh = record("fresh", ago(30 * MINUTE));
    const old = record("old", ago(3 * HOUR));
    const written = record("written", ago(40 * MINUTE));
    const changed = record("changed", ago(50 * MINUTE), 30);
    const skipped = record("skipped", ago(60 * MINUTE), 25);
    const map = {
      written: { state: "written" as const, fingerprint: recordFingerprint(written), at: since },
      changed: { state: "written" as const, fingerprint: recordFingerprint({ ...changed, kcal: 20 }), at: since },
      skipped: { state: "skipped-overlap" as const, fingerprint: recordFingerprint({ ...skipped, kcal: 20 }), at: since },
      unticked: { state: "written" as const, fingerprint: "x", at: since },
      "unticked-skipped": { state: "skipped-overlap" as const, fingerprint: "x", at: since },
      deleted: { state: "written" as const, fingerprint: "x", at: since },
      "deleted-skipped": { state: "skipped-overlap" as const, fingerprint: "x", at: since },
    };
    const ops = planSync([
      { id: "fresh", record: fresh },
      { id: "old", record: old },
      { id: "written", record: written },
      { id: "changed", record: changed },
      { id: "skipped", record: skipped },
      { id: "unticked", record: null },
      { id: "unticked-skipped", record: null },
      { id: "planned", record: null },
    ], map, since);
    expect(ops).toEqual([
      { kind: "write", record: fresh, checkOverlap: true },
      { kind: "write", record: changed, checkOverlap: false },
      { kind: "write", record: skipped, checkOverlap: true },
      { kind: "delete", id: "unticked" },
      { kind: "forget", id: "unticked-skipped" },
      { kind: "delete", id: "deleted" },
      { kind: "forget", id: "deleted-skipped" },
    ]);
    // Without a start time (write-back never turned on) nothing new is written.
    expect(planSync([{ id: "fresh", record: fresh }], {}, null)).toEqual([]);
  });

  test("stored settings and bookkeeping are cleaned", () => {
    expect(sanitizeHealthSettings(null)).toEqual(defaultHealthSettings());
    expect(sanitizeHealthSettings({ weight: true, restingHeartRate: "yes", writeBack: true, writeBackSince: "2026-11-07T00:00:00.000Z", ignoredWeightTime: "nope" })).toEqual({
      weight: true, restingHeartRate: false, writeBack: true, writeBackSince: "2026-11-07T00:00:00.000Z", ignoredWeightTime: null,
    });
    expect(sanitizeSyncMap({
      a: { state: "written", fingerprint: "f", at: "2026-11-07T10:00:00.000Z" },
      b: { state: "unknown", fingerprint: "f" },
      c: { state: "skipped-overlap", fingerprint: 3 },
      d: { state: "skipped-overlap", fingerprint: "g", at: "bad" },
      e: "broken",
    })).toEqual({
      a: { state: "written", fingerprint: "f", at: "2026-11-07T10:00:00.000Z" },
      d: { state: "skipped-overlap", fingerprint: "g", at: new Date(0).toISOString() },
    });
    expect(sanitizeSyncMap([1, 2])).toEqual({});
  });
});

test.describe("entries remember where the heart rate came from", () => {
  test("an edited heart rate becomes manual; an unchanged one keeps its source", () => {
    const fromBand: WorkoutEntry = { ...entryBase, avgHr: 128, hrSource: "healthConnect", hrFrom: ago(MINUTE), hrTo: ago(MINUTE) };
    expect(withHeartRateSource(fromBand, { ...fromBand, loadKg: 160 })).toEqual({ ...fromBand, loadKg: 160 });
    const typed = withHeartRateSource(fromBand, { ...fromBand, avgHr: 140 });
    expect(typed).toEqual({ ...entryBase, avgHr: 140, hrSource: "manual" });
    const cleared = withHeartRateSource(fromBand, { ...fromBand, avgHr: null });
    expect(cleared).toEqual({ ...entryBase, avgHr: null });
  });

  test("ticking stamps the time, unticking removes it", () => {
    const done = withCompletion({ ...entryBase, completed: false }, true, NOW);
    expect(done).toEqual({ ...entryBase, completed: true, completedAt: NOW.toISOString() });
    expect(withCompletion(done, false)).toEqual({ ...entryBase, completed: false });
  });

  test("stored entries keep valid v2.10 fields and drop broken ones", () => {
    const time = "2026-11-07T14:30:00.000Z";
    const full = { ...entryBase, avgHr: 128, recordedAt: time, completedAt: time, hrSource: "healthConnect", hrFrom: time, hrTo: time, fromTheFuture: 1 };
    expect(sanitizeWorkoutEntry(full)).toEqual(full);
    expect(sanitizeWorkoutEntry({ ...full, avgHr: null })).toEqual({ ...entryBase, avgHr: null, recordedAt: time, completedAt: time, fromTheFuture: 1 });
    expect(sanitizeWorkoutEntry({ ...full, hrSource: "manual" })).toEqual({ ...entryBase, avgHr: 128, recordedAt: time, completedAt: time, hrSource: "manual", fromTheFuture: 1 });
    expect(sanitizeWorkoutEntry({ ...full, hrSource: "band", completed: false, recordedAt: "yesterday" })).toEqual({ ...entryBase, avgHr: 128, completed: false, fromTheFuture: 1 });
    // Entries without the new fields read as before.
    expect(sanitizeWorkoutEntry(entryBase)).toEqual(entryBase);
  });
});

test.describe("the checked wrapper around the native plugin", () => {
  type Calls = { averages: { start: string; end: string }[]; writes: unknown[] };

  function plugin(overrides: Partial<NativeHealthPlugin>, calls: Calls = { averages: [], writes: [] }): NativeHealthPlugin {
    return {
      getStatus: async () => ({ available: true }),
      checkPermissions: async () => ({ heartRate: "granted", exercise: "granted", weight: "denied", restingHeartRate: "nonsense" }),
      requestPermissions: async ({ permissions }) => Object.fromEntries(permissions.map((alias) => [alias, "granted"])),
      readHeartRate: async () => ({ samples: [{ bpm: 96, time: ago(MINUTE), source: "com.xiaomi.wearable" }, { bpm: "x", time: ago(0) }, null] }),
      heartRateAverage: async (range) => {
        calls.averages.push(range);
        return { bpm: 131.4, count: 120 };
      },
      readExerciseSessions: async () => ({ sessions: [{ start: ago(40 * MINUTE), end: ago(5 * MINUTE), type: 45, title: "力量训练", source: "com.sec.android.app.shealth", own: false }, { start: "bad" }] }),
      readLatestWeight: async () => ({ kg: 110.4, time: ago(HOUR), source: "com.withings.wiscale2" }),
      readRestingHeartRate: async () => ({ samples: [{ bpm: 58, time: ago(HOUR), source: "s" }] }),
      writeWorkout: async (options) => {
        calls.writes.push(options);
        return {};
      },
      deleteWorkout: async () => ({}),
      openSettings: async () => ({}),
      ...overrides,
    };
  }
  const rejectWith = (code: string) => async () => {
    throw Object.assign(new Error(`native ${code}`), { code });
  };

  test("status and permissions are checked, not trusted", async () => {
    expect(await createHealthApi(plugin({})).status()).toEqual({ available: true });
    expect(await createHealthApi(plugin({ getStatus: async () => ({ available: false, reason: "android-version" }) })).status()).toEqual({ available: false, reason: "android-version" });
    expect(await createHealthApi(plugin({ getStatus: async () => ({ available: false, reason: "web" }) })).status()).toEqual({ available: false, reason: "error" });
    expect(await createHealthApi(plugin({ getStatus: rejectWith("failed") })).status()).toEqual({ available: false, reason: "error" });
    expect(await createHealthApi(plugin({})).permissions()).toEqual({ heartRate: "granted", exercise: "granted", weight: "denied", restingHeartRate: "prompt", writeWorkouts: "prompt" });
    expect((await createHealthApi(plugin({})).request(["weight"])).weight).toBe("granted");
  });

  test("the band's workout average comes first, the current heart rate second", async () => {
    const calls: Calls = { averages: [], writes: [] };
    const api = createHealthApi(plugin({}, calls));
    expect(await api.workoutHeartRate({ sessions: true, now: NOW })).toEqual({
      kind: "session", bpm: 131, start: ago(40 * MINUTE), end: ago(5 * MINUTE), source: "com.sec.android.app.shealth", title: "力量训练",
    });
    expect(calls.averages).toEqual([{ start: ago(40 * MINUTE), end: ago(5 * MINUTE) }]);
    // Without the workout permission only the current heart rate is read.
    expect(await api.workoutHeartRate({ sessions: false, now: NOW })).toEqual({ kind: "current", bpm: 96, time: ago(MINUTE), source: "com.xiaomi.wearable" });
    // No heart rate in the workout, or reading workouts fails: the current heart rate still helps.
    const empty = createHealthApi(plugin({ heartRateAverage: async () => ({ bpm: null, count: 0 }) }));
    expect((await empty.workoutHeartRate({ sessions: true, now: NOW }))?.kind).toBe("current");
    const denied = createHealthApi(plugin({ readExerciseSessions: rejectWith("permission") }));
    expect((await denied.workoutHeartRate({ sessions: true, now: NOW }))?.bpm).toBe(96);
    // Nothing fresh: null, so the screen can say so.
    const stale = createHealthApi(plugin({ readExerciseSessions: async () => ({ sessions: [] }), readHeartRate: async () => ({ samples: [{ bpm: 96, time: ago(20 * MINUTE), source: "s" }] }) }));
    expect(await stale.workoutHeartRate({ sessions: true, now: NOW })).toBeNull();
    // Errors keep the plugin's code.
    const gone = createHealthApi(plugin({ readExerciseSessions: rejectWith("unavailable") }));
    await expect(gone.workoutHeartRate({ sessions: true, now: NOW })).rejects.toMatchObject({ code: "unavailable" });
    const noPermission = createHealthApi(plugin({ readHeartRate: rejectWith("permission") }));
    await expect(noPermission.workoutHeartRate({ sessions: false, now: NOW })).rejects.toMatchObject({ code: "permission" });
  });

  test("weight, resting heart rate and writing", async () => {
    const calls: Calls = { averages: [], writes: [] };
    const api = createHealthApi(plugin({}, calls));
    expect(await api.latestWeight(NOW)).toEqual({ kg: 110.4, time: ago(HOUR), source: "com.withings.wiscale2" });
    expect(await createHealthApi(plugin({ readLatestWeight: async () => ({}) })).latestWeight(NOW)).toBeNull();
    expect(await createHealthApi(plugin({ readLatestWeight: async () => ({ kg: -1, time: ago(HOUR) }) })).latestWeight(NOW)).toBeNull();
    expect((await api.restingHeartRate(NOW))?.average).toBe(58);
    const record: WorkoutRecord = { id: "w1", start: ago(20 * MINUTE), end: ago(10 * MINUTE), exerciseType: 45, title: "传统硬拉", kcal: 23 };
    await api.writeWorkout(record, 7);
    expect(calls.writes).toEqual([{ ...record, version: 7 }]);
    const sessions = await api.sessions(new Date(NOW.getTime() - HOUR), NOW);
    expect(sessions).toHaveLength(1);
    await expect(createHealthApi(plugin({ writeWorkout: rejectWith("rate-limit") })).writeWorkout(record, 8)).rejects.toMatchObject({ code: "rate-limit" });
  });

  test("errors from the plugin keep their code", () => {
    expect(toHealthError(Object.assign(new Error("x"), { code: "permission" })).code).toBe("permission");
    expect(toHealthError({ code: "UNIMPLEMENTED", message: "not implemented" }).code).toBe("failed");
    expect(toHealthError("boom").message).toBe("boom");
    const own = new HealthError("invalid");
    expect(toHealthError(own)).toBe(own);
  });

  test("Chinese and English copy have the same entries", () => {
    const keys = (value: object): string[] => Object.entries(value).flatMap(([key, item]) => (typeof item === "object" && item !== null ? keys(item).map((inner) => `${key}.${inner}`) : [key])).sort();
    expect(keys(HEALTH_COPY.en)).toEqual(keys(HEALTH_COPY.zh));
  });
});

// ---------------------------------------------------------------- screens with a fake plugin

const PROFILE_KEY = "calorie-compass-v2.8-profile";
const PLANNER_KEY = "calorie-compass-v2.4-planner";
const SETTINGS_KEY = "calorie-compass-v2.10-health";
const SYNC_KEY = "calorie-compass-v2.10-health-sync";
const sampleUser = { sex: "male", birthYear: new Date().getFullYear() - 25, heightCm: 178, weightKg: 112, activityRating: null, vo2max: null, hrMax: null, updatedAt: "" };
const savedEntry = {
  id: "w1", exerciseId: "deadlift", nameZh: "传统硬拉", nameEn: "Conventional deadlift", bodyWeight: 112, sets: 1, reps: 10, loadKg: 150,
  restSec: null, secPerRep: null, holdSeconds: null, minutes: null, speedKmh: null, gradePct: null, watts: null, level: null, rpe: null, avgHr: null,
  durationMinutes: 0.5, burnLow: 12, burnMid: 23, burnHigh: 43, totalLow: null, totalHigh: null, headline: "training", modelVersion: 2, completed: false,
};

type FakeConfig = {
  status?: { available: boolean; reason?: string };
  permissions?: Record<string, string>;
  /** What the permission dialog answers. */
  grant?: boolean;
  /** Heart-rate samples, in minutes before the page loaded. */
  heartRate?: { bpm: number; minutesAgo: number; source?: string }[];
  sessions?: { startMinutesAgo: number; endMinutesAgo: number; title?: string; source?: string; own?: boolean }[];
  average?: { bpm: number | null; count: number };
  weight?: { kg: number; time: string; source?: string };
  resting?: { bpm: number; time: string }[];
};

/** Runs in the page before the app (page.addInitScript): the native plugin as the Android app has it. */
function installFakeHealth(config: FakeConfig) {
  const base = Date.now();
  const before = (minutes: number) => new Date(base - minutes * 60_000).toISOString();
  const state = {
    status: config.status ?? { available: true },
    permissions: { heartRate: "prompt", exercise: "prompt", weight: "prompt", restingHeartRate: "prompt", writeWorkouts: "prompt", ...config.permissions } as Record<string, string>,
    grant: config.grant ?? true,
    heartRate: config.heartRate ?? [],
    sessions: config.sessions ?? [],
    average: config.average ?? null,
    weight: config.weight ?? null,
    resting: config.resting ?? [],
    calls: [] as string[],
    requests: [] as string[][],
    averages: [] as { start: string; end: string }[],
    writes: [] as Record<string, unknown>[],
    deletes: [] as string[],
    settingsOpened: 0,
  };
  const fail = (code: string) => Object.assign(new Error(`fake ${code}`), { code });
  const allowed = (name: string, alias: string) => {
    state.calls.push(name);
    if (state.permissions[alias] !== "granted") throw fail("permission");
  };
  const inside = (time: string, range: { start: string; end: string }) => time >= range.start && time <= range.end;
  (window as any).__fakeHealth = state;
  (window as any).__calorieCompassHealthPlugin = {
    getStatus: async () => state.status,
    checkPermissions: async () => ({ ...state.permissions }),
    requestPermissions: async ({ permissions }: { permissions: string[] }) => {
      state.requests.push(permissions);
      for (const alias of permissions) state.permissions[alias] = state.grant ? "granted" : "denied";
      return { ...state.permissions };
    },
    readHeartRate: async (range: { start: string; end: string }) => {
      allowed("readHeartRate", "heartRate");
      const samples = state.heartRate.map((sample) => ({ bpm: sample.bpm, time: before(sample.minutesAgo), source: sample.source ?? "com.xiaomi.wearable" }));
      return { samples: samples.filter((sample) => inside(sample.time, range)) };
    },
    heartRateAverage: async (range: { start: string; end: string }) => {
      allowed("heartRateAverage", "heartRate");
      state.averages.push(range);
      return state.average ?? { bpm: null, count: 0 };
    },
    readExerciseSessions: async (range: { start: string; end: string }) => {
      allowed("readExerciseSessions", "exercise");
      const sessions = state.sessions.map((session) => ({
        start: before(session.startMinutesAgo), end: before(session.endMinutesAgo), type: 45, title: session.title ?? "", source: session.source ?? "com.sec.android.app.shealth", own: session.own ?? false,
      }));
      return { sessions: sessions.filter((session) => inside(session.start, range)) };
    },
    readLatestWeight: async (range: { start: string; end: string }) => {
      allowed("readLatestWeight", "weight");
      const weight = state.weight;
      return weight && inside(weight.time, range) ? { kg: weight.kg, time: weight.time, source: weight.source ?? "com.withings.wiscale2" } : {};
    },
    readRestingHeartRate: async (range: { start: string; end: string }) => {
      allowed("readRestingHeartRate", "restingHeartRate");
      return { samples: state.resting.filter((sample) => inside(sample.time, range)).map((sample) => ({ ...sample, source: "com.sec.android.app.shealth" })) };
    },
    writeWorkout: async (options: Record<string, unknown>) => {
      allowed("writeWorkout", "writeWorkouts");
      state.writes.push({ ...options });
      return {};
    },
    deleteWorkout: async ({ id }: { id: string }) => {
      allowed("deleteWorkout", "writeWorkouts");
      state.deletes.push(id);
      return {};
    },
    openSettings: async () => {
      state.settingsOpened += 1;
      return {};
    },
  };
}

type Seed = {
  /** Workouts of today; recordedMinutesAgo / completedMinutesAgo become recordedAt / completedAt. */
  workouts?: object[];
  settings?: object;
  profile?: object;
};

async function start(page: Page, config: FakeConfig | null, seed: Seed = {}) {
  if (config) await page.addInitScript(installFakeHealth, config);
  await page.goto("/");
  await page.evaluate(([keys, profile, workouts, settings]) => {
    localStorage.clear();
    localStorage.setItem(keys.profile, profile);
    const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const today = new Date();
    if (workouts) {
      const entries = (JSON.parse(workouts) as Record<string, unknown>[]).map(({ recordedMinutesAgo, completedMinutesAgo, ...entry }) => ({
        ...entry,
        ...(typeof recordedMinutesAgo === "number" ? { recordedAt: new Date(Date.now() - recordedMinutesAgo * 60_000).toISOString() } : {}),
        ...(typeof completedMinutesAgo === "number" ? { completedAt: new Date(Date.now() - completedMinutesAgo * 60_000).toISOString() } : {}),
      }));
      const monday = new Date(today);
      monday.setHours(12, 0, 0, 0);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const days = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + index);
        return { date: key(date), meals: [], workouts: key(date) === key(today) ? entries : [] };
      });
      localStorage.setItem(keys.planner, JSON.stringify({ version: 1, weeks: { [key(monday)]: { weekStart: key(monday), updatedAt: "x", days } } }));
    }
    if (settings) {
      const value = JSON.parse(settings);
      if (value.writeBackSince === "today") {
        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);
        value.writeBackSince = midnight.toISOString();
      }
      localStorage.setItem(keys.settings, JSON.stringify(value));
    }
  }, [
    { profile: PROFILE_KEY, planner: PLANNER_KEY, settings: SETTINGS_KEY },
    JSON.stringify(seed.profile ?? sampleUser),
    seed.workouts ? JSON.stringify(seed.workouts) : "",
    seed.settings ? JSON.stringify(seed.settings) : "",
  ] as const);
  await page.reload();
}

function current(page: Page) {
  return page.getByTestId("flow-current");
}

async function openWorkout(page: Page) {
  await page.locator(".feature-card", { hasText: "训练估算" }).click();
  await expect(current(page).locator(".wk-card")).toBeVisible();
}

async function openMyData(page: Page) {
  await page.getByRole("button", { name: "我的数据" }).first().click();
  // The backup card is the last card of My Data (the Health Connect card also uses its style).
  await expect(current(page).locator(".backup-card").last()).toBeVisible();
}

async function openTodayWorkouts(page: Page) {
  await page.locator(".weekly-card").click();
  await current(page).getByRole("button", { name: /编辑训练动作/ }).click();
  await expect(current(page).getByTestId("workout-entry").first()).toBeVisible();
}

async function back(page: Page) {
  await page.locator(".back-button").click();
  await expect(current(page)).toHaveCount(1);
}

function fake<T = any>(page: Page, key: string): Promise<T> {
  return page.evaluate((name) => (window as any).__fakeHealth[name], key);
}

function stored<T = any>(page: Page, key: string): Promise<T> {
  return page.evaluate((name) => JSON.parse(localStorage.getItem(name) ?? "null"), key);
}

async function storedWorkouts(page: Page): Promise<any[]> {
  const plan = await stored(page, PLANNER_KEY);
  return Object.values(plan?.weeks ?? {}).flatMap((week: any) => week.days.flatMap((day: any) => day.workouts));
}

const assist = (page: Page) => current(page).getByTestId("hr-assist");

test("outside the Android app nothing about Health Connect shows", async ({ page }) => {
  await start(page, null);
  await openWorkout(page);
  await expect(current(page).locator(".wk-card")).toBeVisible();
  await expect(assist(page)).toHaveCount(0);
  await back(page);
  await openMyData(page);
  await expect(current(page).getByTestId("health-card")).toHaveCount(0);
});

test("on Android 13 My Data explains why, and heart rate stays manual", async ({ page }) => {
  await start(page, { status: { available: false, reason: "android-version" } });
  await openMyData(page);
  await expect(current(page).getByTestId("health-card")).toContainText("需要 Android 14 或更新版本");
  await back(page);
  await openWorkout(page);
  await expect(current(page).getByTestId("workout-result")).toBeVisible();
  await expect(assist(page)).toHaveCount(0);
});

test("connecting fills the current heart rate, and the plan keeps where it came from", async ({ page }) => {
  await start(page, { heartRate: [{ bpm: 128, minutesAgo: 1 }, { bpm: 90, minutesAgo: 3 }] });
  await openWorkout(page);
  await expect(assist(page)).toHaveAttribute("data-phase", "connect");
  await expect(assist(page)).toContainText("从手环读取心率");
  await assist(page).getByRole("button", { name: "连接 Health Connect" }).click();
  await expect(assist(page)).toHaveAttribute("data-phase", "filled");
  await expect(assist(page)).toContainText("心率 128 次/分");
  await expect(assist(page)).toContainText("当前心率 · 1 分钟前 · 小米运动健康");
  expect(await fake(page, "requests")).toEqual([["heartRate", "exercise"]]);
  // The value is in the heart-rate field and used by the estimate.
  await current(page).locator(".wk-advanced-toggle").click();
  await expect(current(page).locator(".wk-card input[name=hr]")).toHaveValue("128");
  await expect(current(page).getByTestId("workout-result").locator(".wk-notes")).toContainText("Collins 1991");
  await current(page).getByRole("button", { name: "加入今天的训练计划" }).click();
  const [entry] = await storedWorkouts(page);
  expect(entry).toMatchObject({ exerciseId: "deadlift", avgHr: 128, hrSource: "healthConnect" });
  expect(entry.hrFrom).toBe(entry.hrTo);
  expect(Date.parse(entry.recordedAt)).toBeGreaterThan(Date.parse(entry.hrFrom));
  // The plan editor says so.
  await back(page);
  await openTodayWorkouts(page);
  await expect(current(page).getByTestId("entry-health-note")).toHaveText("心率 128 次/分来自 Health Connect");
});

test("a workout the band just recorded gives its average heart rate", async ({ page }) => {
  await start(page, {
    permissions: { heartRate: "granted", exercise: "granted" },
    heartRate: [{ bpm: 95, minutesAgo: 1 }],
    sessions: [{ startMinutesAgo: 45, endMinutesAgo: 5, title: "力量训练" }],
    average: { bpm: 131, count: 140 },
  });
  await openWorkout(page);
  await expect(assist(page)).toHaveAttribute("data-phase", "filled");
  await expect(assist(page)).toContainText("心率 131 次/分");
  await expect(assist(page)).toContainText("手环运动记录");
  await expect(assist(page)).toContainText("三星健康");
  const [range] = await fake<{ start: string; end: string }[]>(page, "averages");
  expect(Date.parse(range.end) - Date.parse(range.start)).toBe(40 * MINUTE);
  await current(page).getByRole("button", { name: "加入今天的训练计划" }).click();
  const [entry] = await storedWorkouts(page);
  expect(entry).toMatchObject({ avgHr: 131, hrSource: "healthConnect", hrFrom: range.start, hrTo: range.end });
});

test("without a recent heart rate the screen says so; coming back to the app reads again", async ({ page }) => {
  await start(page, { permissions: { heartRate: "granted" }, heartRate: [{ bpm: 120, minutesAgo: 9 }] });
  await openWorkout(page);
  await expect(assist(page)).toHaveAttribute("data-phase", "no-data");
  await expect(assist(page)).toContainText("还没有最近 5 分钟的心率");
  await current(page).locator(".wk-advanced-toggle").click();
  await expect(current(page).locator(".wk-card input[name=hr]")).toHaveValue("");
  // The band synced meanwhile; the app comes back to the foreground.
  await page.evaluate(() => {
    (window as any).__fakeHealth.heartRate.push({ bpm: 117, minutesAgo: 0 });
    window.dispatchEvent(new Event("calorie-compass:resumed"));
  });
  await expect(assist(page)).toHaveAttribute("data-phase", "filled");
  await expect(current(page).locator(".wk-card input[name=hr]")).toHaveValue("117");
});

test("a typed heart rate is the user's: it is kept and stored as manual", async ({ page }) => {
  await start(page, { permissions: { heartRate: "granted", exercise: "granted" }, heartRate: [{ bpm: 128, minutesAgo: 1 }] });
  await openWorkout(page);
  await expect(assist(page)).toHaveAttribute("data-phase", "filled");
  await current(page).locator(".wk-advanced-toggle").click();
  const field = current(page).locator(".wk-card input[name=hr]");
  await field.fill("140");
  await expect(assist(page)).toHaveAttribute("data-phase", "manual");
  await expect(assist(page)).toContainText("平均心率是你手动填写的。");
  await current(page).getByRole("button", { name: "加入今天的训练计划" }).click();
  const [entry] = await storedWorkouts(page);
  expect(entry).toMatchObject({ avgHr: 140, hrSource: "manual" });
  expect(entry.hrFrom).toBeUndefined();
  expect(typeof entry.recordedAt).toBe("string");
  // Reading from the band again replaces it on request.
  await assist(page).getByRole("button", { name: "从手环读取" }).click();
  await expect(field).toHaveValue("128");
  // Clearing the field leaves it empty.
  await field.fill("");
  await expect(assist(page)).toHaveAttribute("data-phase", "idle");
  await expect(field).toHaveValue("");
});

test("a refused permission keeps manual entry and points to the settings", async ({ page }) => {
  await start(page, { grant: false, heartRate: [{ bpm: 128, minutesAgo: 1 }] });
  await openWorkout(page);
  await assist(page).getByRole("button", { name: "连接 Health Connect" }).click();
  await expect(assist(page)).toHaveAttribute("data-phase", "denied");
  await expect(assist(page)).toContainText("没有读取心率的权限");
  await assist(page).getByRole("button", { name: "打开设置" }).click();
  await expect.poll(() => fake(page, "settingsOpened")).toBe(1);
  await current(page).locator(".wk-advanced-toggle").click();
  await current(page).locator(".wk-card input[name=hr]").fill("135");
  await expect(current(page).getByTestId("workout-result").locator(".wk-notes")).toContainText("Collins 1991");
});

test("cardio keeps manual heart rate; circuits read it like strength exercises", async ({ page }) => {
  await start(page, { permissions: { heartRate: "granted", exercise: "granted" }, heartRate: [{ bpm: 101, minutesAgo: 1 }] });
  await openWorkout(page);
  await expect(assist(page)).toHaveAttribute("data-phase", "filled");
  const pick = async (query: string) => {
    await current(page).locator(".wk-change").click();
    await current(page).locator(".wk-picker input").fill(query);
    await current(page).locator(".wk-picker-list button").first().click();
  };
  await pick("快走");
  await expect(current(page).locator(".wk-exercise strong")).toHaveText("快走 / 坡度走");
  await expect(assist(page)).toHaveCount(0);
  await current(page).locator(".wk-advanced-toggle").click();
  await expect(current(page).locator(".wk-card input[name=hr]")).toHaveValue("");
  await pick("循环训练");
  await expect(assist(page)).toHaveAttribute("data-phase", "filled");
  await expect(assist(page)).toContainText("心率 101 次/分");
});

test("My Data asks for each permission only when its feature is turned on", async ({ page }) => {
  test.setTimeout(60_000);
  const hour = 3_600_000;
  await start(page, {
    weight: { kg: 110.44, time: new Date(Date.now() - 20 * hour).toISOString() },
    resting: [{ bpm: 58, time: new Date(Date.now() - 10 * hour).toISOString() }, { bpm: 62, time: new Date(Date.now() - 60 * hour).toISOString() }],
  });
  await openMyData(page);
  const card = current(page).getByTestId("health-card");
  await expect(card).toBeVisible();
  for (const name of ["体重", "静息心率", "训练写回"]) await expect(card.getByRole("switch", { name })).toHaveAttribute("aria-checked", "false");
  expect(await fake(page, "requests")).toEqual([]);

  await card.locator("[data-row=heartRate]").getByRole("button", { name: "开启" }).click();
  await expect(card.locator("[data-row=heartRate]")).toContainText("已开启");

  await card.getByRole("switch", { name: "体重" }).click();
  await expect(card.getByRole("switch", { name: "体重" })).toHaveAttribute("aria-checked", "true");
  const offer = card.getByTestId("weight-offer");
  await expect(offer).toContainText("Health Connect 有新的体重：110.4 kg");
  await expect(offer).toContainText("Withings");
  await offer.getByRole("button", { name: "更新身体数据" }).click();
  await expect(card.locator("[data-row=weight]")).toContainText("最新体重 110.4 kg");
  expect((await stored(page, PROFILE_KEY)).weightKg).toBe(110.4);

  await card.getByRole("switch", { name: "静息心率" }).click();
  await expect(card.getByTestId("resting-heart-rate")).toContainText("最近 58 次/分");
  await expect(card.getByTestId("resting-heart-rate")).toContainText("7 天平均 60 次/分");

  await card.getByRole("switch", { name: "训练写回" }).click();
  await expect(card.getByTestId("write-back-status")).toHaveText("开启后，今天及以后勾选完成的训练会写入。");
  expect(await fake(page, "requests")).toEqual([["heartRate", "exercise"], ["weight"], ["restingHeartRate"], ["writeWorkouts", "exercise"]]);
  const settings = await stored(page, SETTINGS_KEY);
  expect(settings).toMatchObject({ weight: true, restingHeartRate: true, writeBack: true });
  expect(new Date(settings.writeBackSince).getHours()).toBe(0);

  // Turning a feature off stops it; the permission stays with Health Connect.
  await card.getByRole("switch", { name: "体重" }).click();
  await expect(card.locator("[data-row=weight]")).not.toContainText("最新体重");
  expect((await stored(page, SETTINGS_KEY)).weight).toBe(false);

  await card.getByRole("button", { name: "隐私说明" }).click();
  await expect(card).toContainText("不会发送到任何服务器");
  await card.getByRole("button", { name: "管理权限" }).click();
  await expect.poll(() => fake(page, "settingsOpened")).toBe(1);
});

test("a weight that is refused is not offered again", async ({ page }) => {
  const time = new Date(Date.now() - 5 * 3_600_000).toISOString();
  const config = { permissions: { weight: "granted" }, weight: { kg: 108, time } };
  await start(page, config, { settings: { weight: true } });
  await openWorkout(page);
  const offer = current(page).getByTestId("weight-offer");
  await expect(offer).toContainText("108 kg");
  await offer.getByRole("button", { name: "忽略" }).click();
  await expect(offer).toHaveCount(0);
  expect((await stored(page, SETTINGS_KEY)).ignoredWeightTime).toBe(time);
  await page.reload();
  await openWorkout(page);
  await expect.poll(() => fake<string[]>(page, "calls")).toContain("readLatestWeight");
  await expect(current(page).getByTestId("weight-offer")).toHaveCount(0);
  expect((await stored(page, PROFILE_KEY)).weightKg).toBe(112);
});

test("write-back writes a ticked exercise, follows its edits and removes it when unticked", async ({ page }) => {
  test.setTimeout(60_000);
  await start(page, { permissions: { writeWorkouts: "granted", exercise: "granted" } }, {
    workouts: [{ ...savedEntry, recordedMinutesAgo: 10 }],
    settings: { writeBack: true, writeBackSince: "today" },
  });
  await openTodayWorkouts(page);
  const card = current(page).getByTestId("workout-entry");
  await card.locator(".check-control").click();
  await expect.poll(() => fake<unknown[]>(page, "writes"), { timeout: 10_000 }).toHaveLength(1);
  const [first] = await fake<any[]>(page, "writes");
  const [entry] = await storedWorkouts(page);
  expect(first).toMatchObject({ id: "w1", exerciseType: 45, title: "传统硬拉", kcal: 23, end: entry.recordedAt });
  expect(Date.parse(first.end) - Date.parse(first.start)).toBe(MINUTE);
  await expect(card.getByTestId("entry-health-note")).toHaveText("已写入 Health Connect");
  // Editing the exercise rewrites its record with a newer version.
  await card.locator("input[name=load]").fill("200");
  await expect.poll(() => fake<unknown[]>(page, "writes"), { timeout: 10_000 }).toHaveLength(2);
  const [, second] = await fake<any[]>(page, "writes");
  expect(second.kcal).toBeGreaterThan(first.kcal);
  expect(second.version).toBeGreaterThan(first.version);
  // Unticking removes it from Health Connect.
  await card.locator(".check-control").click();
  await expect.poll(() => fake(page, "deletes"), { timeout: 10_000 }).toEqual(["w1"]);
  await expect(card.getByTestId("entry-health-note")).toHaveCount(0);
  await expect.poll(() => stored(page, SYNC_KEY)).toEqual({});
});

test("write-back leaves out what the band already recorded; deleting an exercise deletes its record", async ({ page }) => {
  test.setTimeout(60_000);
  await start(page, { permissions: { writeWorkouts: "granted", exercise: "granted" }, sessions: [{ startMinutesAgo: 30, endMinutesAgo: 5, title: "力量训练" }] }, {
    workouts: [
      { ...savedEntry, id: "w-band", completed: true, recordedMinutesAgo: 10, completedMinutesAgo: 1 },
      { ...savedEntry, id: "w-new", completed: true, recordedMinutesAgo: 2, completedMinutesAgo: 1 },
      { ...savedEntry, id: "w-untimed", completed: true },
    ],
    settings: { writeBack: true, writeBackSince: "today" },
  });
  await openTodayWorkouts(page);
  const cards = current(page).getByTestId("workout-entry");
  await expect(cards).toHaveCount(3);
  await expect.poll(() => fake<unknown[]>(page, "writes"), { timeout: 10_000 }).toHaveLength(1);
  expect((await fake<any[]>(page, "writes"))[0].id).toBe("w-new");
  await expect(cards.nth(0).getByTestId("entry-health-note")).toHaveText("同一时间手环已有运动记录，没有重复写入 Health Connect");
  await expect(cards.nth(1).getByTestId("entry-health-note")).toHaveText("已写入 Health Connect");
  await expect(cards.nth(2).getByTestId("entry-health-note")).toContainText("不知道这次训练的时间");

  // My Data counts them.
  await back(page);
  await back(page);
  await openMyData(page);
  await expect(current(page).getByTestId("write-back-status")).toHaveText("已写入 1 条训练；1 条因手环已有记录没有重复写入。");
  await back(page);

  await openTodayWorkouts(page);
  await cards.nth(1).getByRole("button", { name: "删除训练动作" }).click();
  await expect.poll(() => fake(page, "deletes"), { timeout: 10_000 }).toEqual(["w-new"]);
  await cards.nth(0).getByRole("button", { name: "删除训练动作" }).click();
  await expect.poll(() => stored(page, SYNC_KEY), { timeout: 10_000 }).toEqual({});
  // The skipped one was never written, so there was nothing to delete.
  expect(await fake(page, "deletes")).toEqual(["w-new"]);
});
