// Health Connect state of the app (v2.10): availability, permissions, the device-local settings, the
// readings shown in My Data, and write-back, which keeps Health Connect in step with the weekly plan.
// In the Windows app and in a browser healthApi() reports "web" and nothing here does anything.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { usePlanner } from "../planner";
import { APP_RESUMED_EVENT } from "../native/bridge";
import { findExercise } from "../workout/exercises";
import { useProfile } from "../workout/ProfileContext";
import { healthApi, toHealthError, type HealthApi } from "./api";
import {
  FEATURE_PERMISSIONS,
  SESSION_SEARCH_HOURS,
  featureAllowed,
  noPermissions,
  overlappingSession,
  planSync,
  recordFingerprint,
  weightSuggestion,
  workoutRecord,
  type HealthFeature,
  type HealthPermissions,
  type HealthSettings,
  type HealthStatus,
  type Lang,
  type RestingSummary,
  type SyncMap,
  type WeightReading,
  type WorkoutRecord,
} from "./core";
import { HEALTH_COPY } from "./copy";
import { readHealthSettings, readSyncMap, writeHealthSettings, writeSyncMap } from "./storage";

/** Settings that can be switched on and off in My Data. */
export type HealthToggle = "weight" | "restingHeartRate" | "writeBack";

type HealthContextValue = {
  api: HealthApi;
  /** null while it is being checked. */
  status: HealthStatus | null;
  permissions: HealthPermissions;
  settings: HealthSettings;
  allowed: (feature: HealthFeature) => boolean;
  /** Asks for the feature's permissions; resolves to whether it may be used now. */
  connect: (feature: HealthFeature) => Promise<boolean>;
  /** Turns a My Data setting on (asking for permission first) or off. */
  setToggle: (toggle: HealthToggle, on: boolean) => Promise<boolean>;
  openSettings: () => void;
  /** Latest weight in Health Connect (when the weight setting is on), undefined before the first read. */
  weight: WeightReading | null | undefined;
  /** A newer weight than the body data, to offer for an update. */
  weightOffer: WeightReading | null;
  acceptWeight: () => boolean;
  ignoreWeight: () => void;
  resting: RestingSummary | null | undefined;
  sync: SyncMap;
  syncError: string | null;
};

const HealthContext = createContext<HealthContextValue | null>(null);

function safeSettings() {
  try {
    return readHealthSettings();
  } catch {
    return readHealthSettings({ getItem: () => null });
  }
}

function safeSyncMap(): SyncMap {
  try {
    return readSyncMap();
  } catch {
    return {};
  }
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString();
}

export function HealthProvider({ lang, children }: PropsWithChildren<{ lang: Lang }>) {
  const api = useMemo(() => healthApi(), []);
  const { weeks } = usePlanner();
  const { profile, save: saveProfile } = useProfile();
  const [status, setStatus] = useState<HealthStatus | null>(null);
  const [permissions, setPermissions] = useState<HealthPermissions>(noPermissions);
  const [settings, setSettings] = useState<HealthSettings>(safeSettings);
  const [weight, setWeight] = useState<WeightReading | null | undefined>(undefined);
  const [resting, setResting] = useState<RestingSummary | null | undefined>(undefined);
  const [sync, setSync] = useState<SyncMap>(safeSyncMap);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [resumed, setResumed] = useState(0);
  const available = status?.available === true;

  const updateSettings = useCallback((patch: Partial<HealthSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      try {
        writeHealthSettings(next);
      } catch {
        // Browser storage refused: the setting still applies until the app is closed.
      }
      return next;
    });
  }, []);

  // Availability and permissions: at start and whenever the app comes back to the foreground (the user
  // may have changed permissions in Health Connect meanwhile).
  useEffect(() => {
    let active = true;
    void (async () => {
      const next = await api.status();
      let granted: HealthPermissions | null = null;
      if (next.available) {
        try {
          granted = await api.permissions();
        } catch {
          // Permissions stay as they were; the next resume checks again.
        }
      }
      if (!active) return;
      // Both at once, so screens never show "connect" for a moment while permissions are still loading.
      setStatus(next);
      if (granted) setPermissions(granted);
    })();
    return () => {
      active = false;
    };
  }, [api, resumed]);

  useEffect(() => {
    const onResume = () => setResumed((count) => count + 1);
    window.addEventListener(APP_RESUMED_EVENT, onResume);
    return () => window.removeEventListener(APP_RESUMED_EVENT, onResume);
  }, []);

  const allowed = useCallback((feature: HealthFeature) => available && featureAllowed(permissions, feature), [available, permissions]);
  const weightOn = available && settings.weight && featureAllowed(permissions, "weight");
  const restingOn = available && settings.restingHeartRate && featureAllowed(permissions, "restingHeartRate");

  useEffect(() => {
    if (!weightOn) return undefined;
    let active = true;
    api.latestWeight().then((reading) => active && setWeight(reading), () => active && setWeight(null));
    return () => {
      active = false;
    };
  }, [api, weightOn, resumed]);

  useEffect(() => {
    if (!restingOn) return undefined;
    let active = true;
    api.restingHeartRate().then((summary) => active && setResting(summary), () => active && setResting(null));
    return () => {
      active = false;
    };
  }, [api, restingOn, resumed]);

  const connect = useCallback(async (feature: HealthFeature) => {
    if (!available) return false;
    try {
      const granted = await api.request(FEATURE_PERMISSIONS[feature].request);
      setPermissions(granted);
      return featureAllowed(granted, feature);
    } catch {
      return false;
    }
  }, [api, available]);

  const setToggle = useCallback(async (toggle: HealthToggle, on: boolean) => {
    if (!on) {
      updateSettings({ [toggle]: false });
      if (toggle === "weight") setWeight(undefined);
      if (toggle === "restingHeartRate") setResting(undefined);
      return true;
    }
    const ok = featureAllowed(permissions, toggle) || (await connect(toggle));
    if (!ok) return false;
    updateSettings(toggle === "writeBack" ? { writeBack: true, writeBackSince: startOfToday() } : { [toggle]: true });
    return true;
  }, [connect, permissions, updateSettings]);

  const openSettings = useCallback(() => {
    void api.openSettings().catch(() => undefined);
  }, [api]);

  const weightOffer = useMemo(
    () => (weightOn ? weightSuggestion(profile, weight ?? null, settings.ignoredWeightTime) : null),
    [weightOn, profile, weight, settings.ignoredWeightTime],
  );

  const acceptWeight = useCallback(() => {
    if (!weightOffer) return false;
    return saveProfile({ ...profile, weightKg: weightOffer.kg });
  }, [weightOffer, profile, saveProfile]);

  const ignoreWeight = useCallback(() => {
    if (weightOffer) updateSettings({ ignoredWeightTime: weightOffer.time });
  }, [weightOffer, updateSettings]);

  // ---------------------------------------------------------------- write-back

  const writeBackOn = available && settings.writeBack && featureAllowed(permissions, "writeBack");
  const running = useRef(false);
  const again = useRef(false);
  const latest = useRef({ weeks, lang, since: settings.writeBackSince });
  latest.current = { weeks, lang, since: settings.writeBackSince };

  const runSync = useCallback(async () => {
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      do {
        again.current = false;
        const { weeks: plan, lang: titleLang, since } = latest.current;
        const now = new Date();
        const current: { id: string; record: WorkoutRecord | null }[] = [];
        for (const week of Object.values(plan)) {
          for (const day of week.days) {
            for (const entry of day.workouts) {
              current.push({ id: entry.id, record: workoutRecord(entry, day.date, findExercise(entry.exerciseId), titleLang, now) });
            }
          }
        }
        const map = { ...safeSyncMap() };
        const store = () => {
          try {
            writeSyncMap(map);
          } catch {
            // Kept in memory; the next run repeats what was not stored.
          }
          setSync({ ...map });
        };
        for (const op of planSync(current, map, since)) {
          if (op.kind === "forget") {
            delete map[op.id];
          } else if (op.kind === "delete") {
            await api.deleteWorkout(op.id);
            delete map[op.id];
          } else {
            const at = new Date().toISOString();
            const fingerprint = recordFingerprint(op.record);
            if (op.checkOverlap) {
              const end = new Date(op.record.end);
              const sessions = await api.sessions(new Date(end.getTime() - SESSION_SEARCH_HOURS * 3_600_000), end);
              if (overlappingSession(sessions, op.record)) {
                map[op.record.id] = { state: "skipped-overlap", fingerprint, at };
                store();
                continue;
              }
            }
            await api.writeWorkout(op.record, Date.now());
            map[op.record.id] = { state: "written", fingerprint, at };
          }
          store();
        }
        setSync({ ...map });
        setSyncError(null);
      } while (again.current);
    } catch (error) {
      const code = toHealthError(error).code;
      setSyncError(HEALTH_COPY[latest.current.lang].errors[code]);
    } finally {
      running.current = false;
    }
  }, [api]);

  useEffect(() => {
    if (!writeBackOn) return undefined;
    // Waits for the edits to settle (typing into the plan changes it on every key).
    const timer = window.setTimeout(() => void runSync(), 1500);
    return () => window.clearTimeout(timer);
  }, [writeBackOn, weeks, settings.writeBackSince, resumed, runSync]);

  const value = useMemo<HealthContextValue>(() => ({
    api,
    status,
    permissions,
    settings,
    allowed,
    connect,
    setToggle,
    openSettings,
    weight,
    weightOffer,
    acceptWeight,
    ignoreWeight,
    resting,
    sync,
    syncError,
  }), [api, status, permissions, settings, allowed, connect, setToggle, openSettings, weight, weightOffer, acceptWeight, ignoreWeight, resting, sync, syncError]);

  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>;
}

export function useHealth() {
  const context = useContext(HealthContext);
  if (!context) throw new Error("useHealth must be used inside HealthProvider");
  return context;
}
