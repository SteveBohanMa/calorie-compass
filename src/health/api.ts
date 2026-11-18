// Health Connect (v2.10): the contract of the native plugin (scripts/android/native/
// CalorieCompassHealthPlugin.java) and a checked wrapper around it. No Capacitor import here:
// src/native/android.ts registers the plugin on Android and calls installHealthPlugin(); everywhere else
// (Windows app, browser) healthApi() reports the feature as unavailable and the app keeps manual entry.
import {
  HEALTH_ALIASES,
  RESTING_DAYS,
  SESSION_SEARCH_HOURS,
  WEIGHT_DAYS,
  FRESH_HEART_RATE_MINUTES,
  noPermissions,
  pickCurrentHeartRate,
  pickRecentSession,
  restingSummary,
  sessionWindow,
  usableHeartRate,
  type ExerciseSession,
  type HealthAlias,
  type HealthPermissions,
  type HealthStatus,
  type HealthUnavailableReason,
  type HeartRateReading,
  type HeartRateSample,
  type PermissionValue,
  type RestingSummary,
  type WeightReading,
  type WorkoutRecord,
} from "./core";

type Range = { start: string; end: string };

/** The native plugin, as Capacitor exposes it. Results are checked by createHealthApi, not trusted. */
export type NativeHealthPlugin = {
  getStatus(): Promise<{ available?: unknown; reason?: unknown }>;
  checkPermissions(): Promise<Record<string, unknown> | undefined>;
  requestPermissions(options: { permissions: HealthAlias[] }): Promise<Record<string, unknown> | undefined>;
  readHeartRate(options: Range): Promise<{ samples?: unknown }>;
  heartRateAverage(options: Range): Promise<{ bpm?: unknown; count?: unknown }>;
  readExerciseSessions(options: Range): Promise<{ sessions?: unknown }>;
  readLatestWeight(options: Range): Promise<{ kg?: unknown; time?: unknown; source?: unknown }>;
  readRestingHeartRate(options: Range): Promise<{ samples?: unknown }>;
  writeWorkout(options: WorkoutRecord & { version: number }): Promise<unknown>;
  deleteWorkout(options: { id: string }): Promise<unknown>;
  openSettings(): Promise<unknown>;
};

export type HealthErrorCode = "permission" | "unavailable" | "rate-limit" | "invalid" | "failed";

export class HealthError extends Error {
  readonly code: HealthErrorCode;

  constructor(code: HealthErrorCode, message?: string) {
    super(message || code);
    this.code = code;
  }
}

export type HealthApi = {
  status(): Promise<HealthStatus>;
  permissions(): Promise<HealthPermissions>;
  /** Shows Health Connect's permission screen for these aliases; resolves to the states afterwards. */
  request(aliases: readonly HealthAlias[]): Promise<HealthPermissions>;
  /**
   * Heart rate for the exercise just done: the average of the workout the watch or band is recording or
   * has just finished (when `sessions` may be read), otherwise the newest sample of the last few minutes.
   * Null when Health Connect has neither yet.
   */
  workoutHeartRate(options: { sessions: boolean; now?: Date }): Promise<HeartRateReading | null>;
  latestWeight(now?: Date): Promise<WeightReading | null>;
  restingHeartRate(now?: Date): Promise<RestingSummary | null>;
  /** Workouts that start between the two times, newest first. */
  sessions(start: Date, end: Date): Promise<ExerciseSession[]>;
  /** Writes (or replaces) the records of one exercise; `version` must grow with every rewrite. */
  writeWorkout(record: WorkoutRecord, version: number): Promise<void>;
  deleteWorkout(id: string): Promise<void>;
  openSettings(): Promise<void>;
};

const HOUR = 3_600_000;
const PERMISSION_VALUES = new Set<PermissionValue>(["granted", "denied", "prompt", "prompt-with-rationale"]);
const ERROR_CODES = new Set<HealthErrorCode>(["permission", "unavailable", "rate-limit", "invalid", "failed"]);
const UNAVAILABLE_REASONS = new Set<HealthUnavailableReason>(["android-version", "no-health-connect"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

/** Capacitor rejects with an error carrying the plugin's code ("permission", …); anything else is "failed". */
export function toHealthError(error: unknown): HealthError {
  if (error instanceof HealthError) return error;
  const code = isRecord(error) && typeof error.code === "string" && ERROR_CODES.has(error.code as HealthErrorCode) ? (error.code as HealthErrorCode) : "failed";
  const message = error instanceof Error ? error.message : isRecord(error) && typeof error.message === "string" ? error.message : String(error);
  return new HealthError(code, message);
}

async function call<T>(promise: () => Promise<T>): Promise<T> {
  try {
    return await promise();
  } catch (error) {
    throw toHealthError(error);
  }
}

function toPermissions(value: unknown): HealthPermissions {
  const permissions = noPermissions();
  if (!isRecord(value)) return permissions;
  for (const alias of HEALTH_ALIASES) {
    const state = value[alias];
    if (typeof state === "string" && PERMISSION_VALUES.has(state as PermissionValue)) permissions[alias] = state as PermissionValue;
  }
  return permissions;
}

function toSamples(value: unknown): HeartRateSample[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => (isRecord(item) && typeof item.bpm === "number" && Number.isFinite(item.bpm) && isTime(item.time)
    ? [{ bpm: item.bpm, time: item.time, source: text(item.source) }]
    : []));
}

function toSessions(value: unknown): ExerciseSession[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => (isRecord(item) && isTime(item.start) && isTime(item.end) && typeof item.type === "number"
    ? [{ start: item.start, end: item.end, type: item.type, title: text(item.title), source: text(item.source), own: item.own === true }]
    : []));
}

function range(start: Date, end: Date): Range {
  return { start: start.toISOString(), end: end.toISOString() };
}

export function createHealthApi(plugin: NativeHealthPlugin): HealthApi {
  const sessions = async (start: Date, end: Date) => toSessions((await call(() => plugin.readExerciseSessions(range(start, end)))).sessions);

  return {
    status: async () => {
      try {
        const result = await plugin.getStatus();
        if (result.available === true) return { available: true };
        const reason = typeof result.reason === "string" && UNAVAILABLE_REASONS.has(result.reason as HealthUnavailableReason)
          ? (result.reason as HealthUnavailableReason)
          : "error";
        return { available: false, reason };
      } catch {
        return { available: false, reason: "error" };
      }
    },
    permissions: async () => toPermissions(await call(() => plugin.checkPermissions())),
    request: async (aliases) => toPermissions(await call(() => plugin.requestPermissions({ permissions: [...aliases] }))),
    workoutHeartRate: async ({ sessions: useSessions, now = new Date() }) => {
      if (useSessions) {
        try {
          const session = pickRecentSession(await sessions(new Date(now.getTime() - SESSION_SEARCH_HOURS * HOUR), now), now);
          if (session) {
            const window = sessionWindow(session, now);
            const average = await call(() => plugin.heartRateAverage(window));
            const bpm = usableHeartRate(average.bpm);
            if (bpm !== null && typeof average.count === "number" && average.count > 0) {
              return { kind: "session", bpm, start: window.start, end: window.end, source: session.source, title: session.title };
            }
          }
        } catch (error) {
          // Without the workout permission (or when that read fails) the current heart rate still helps.
          if (toHealthError(error).code === "unavailable") throw toHealthError(error);
        }
      }
      const from = new Date(now.getTime() - FRESH_HEART_RATE_MINUTES * 60_000);
      const samples = toSamples((await call(() => plugin.readHeartRate(range(from, new Date(now.getTime() + 60_000))))).samples);
      const sample = pickCurrentHeartRate(samples, now);
      return sample ? { kind: "current", bpm: sample.bpm, time: sample.time, source: sample.source } : null;
    },
    latestWeight: async (now = new Date()) => {
      const result = await call(() => plugin.readLatestWeight(range(new Date(now.getTime() - WEIGHT_DAYS * 24 * HOUR), now)));
      return typeof result.kg === "number" && Number.isFinite(result.kg) && result.kg > 0 && isTime(result.time)
        ? { kg: result.kg, time: result.time, source: text(result.source) }
        : null;
    },
    restingHeartRate: async (now = new Date()) => {
      const result = await call(() => plugin.readRestingHeartRate(range(new Date(now.getTime() - RESTING_DAYS * 24 * HOUR), now)));
      return restingSummary(toSamples(result.samples), now);
    },
    sessions,
    writeWorkout: async (record, version) => {
      await call(() => plugin.writeWorkout({ ...record, version }));
    },
    deleteWorkout: async (id) => {
      await call(() => plugin.deleteWorkout({ id }));
    },
    openSettings: async () => {
      await call(() => plugin.openSettings());
    },
  };
}

/** Health Connect where there is none (Windows app, browser): every read says so. */
export function unavailableHealthApi(reason: HealthUnavailableReason): HealthApi {
  const fail = async (): Promise<never> => {
    throw new HealthError("unavailable");
  };
  return {
    status: async () => ({ available: false, reason }),
    permissions: async () => noPermissions(),
    request: fail,
    workoutHeartRate: fail,
    latestWeight: fail,
    restingHeartRate: fail,
    sessions: fail,
    writeWorkout: fail,
    deleteWorkout: fail,
    openSettings: fail,
  };
}

declare global {
  interface Window {
    /** Playwright tests put a fake plugin here before the app starts; nothing sets it in the apps. */
    __calorieCompassHealthPlugin?: NativeHealthPlugin;
  }
}

let installed: HealthApi | null = null;

/** Called by src/native/android.ts in the Android app. */
export function installHealthPlugin(plugin: NativeHealthPlugin) {
  installed = createHealthApi(plugin);
}

export function healthApi(): HealthApi {
  if (!installed && typeof window !== "undefined" && window.__calorieCompassHealthPlugin) {
    installed = createHealthApi(window.__calorieCompassHealthPlugin);
  }
  return installed ?? unavailableHealthApi("web");
}
