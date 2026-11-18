import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { STORAGE_KEYS, sanitizePlannerState } from "./userData";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export type MealEntry = {
  id: string;
  slot: MealSlot;
  foodId: string;
  nameZh: string;
  nameEn: string;
  grams: number;
  kcalPer100G: number;
  kcal: number;
  /** Oden items (v2.8): grams per piece the user chose when adding it; the editor counts pieces with it. */
  pieceGrams?: number;
  completed: boolean;
};

/**
 * One planned exercise (workout model v2, Calorie Compass v2.8). Inputs are stored so the estimate can be
 * recomputed; burn* is the counted extra energy (above resting metabolism), total* adds resting metabolism
 * when the session length is known. Entries with a higher modelVersion come from a newer app: only id,
 * names, burn*, completed and modelVersion are guaranteed, and they are shown read-only.
 */
export type WorkoutEntry = {
  id: string;
  exerciseId: string;
  nameZh: string;
  nameEn: string;
  /** Body weight used for this entry (kg). */
  bodyWeight: number;
  sets: number;
  reps: number;
  loadKg: number;
  restSec: number | null;
  secPerRep: number | null;
  holdSeconds: number | null;
  minutes: number | null;
  speedKmh: number | null;
  gradePct: number | null;
  watts: number | null;
  level: string | null;
  rpe: number | null;
  avgHr: number | null;
  /** Session minutes when known, otherwise time under load. */
  durationMinutes: number;
  burnLow: number;
  burnMid: number;
  burnHigh: number;
  totalLow: number | null;
  totalHigh: number | null;
  headline: "total" | "training";
  modelVersion: number;
  completed: boolean;
  /** v2.10: when it was recorded on the workout screen (ISO time). Write-back uses it as the end time. */
  recordedAt?: string;
  /** v2.10: when it was ticked as done (ISO time); write-back falls back to it. Removed when unticked. */
  completedAt?: string;
  /** v2.10: where avgHr came from: read from Health Connect, or typed by the user. Absent without a heart rate. */
  hrSource?: "healthConnect" | "manual";
  /** v2.10, Health Connect only: the time the heart rate covers (a single reading has hrFrom = hrTo). ISO times. */
  hrFrom?: string;
  hrTo?: string;
};

export type DayPlan = {
  date: string;
  meals: MealEntry[];
  workouts: WorkoutEntry[];
};

export type WeekPlan = {
  weekStart: string;
  days: DayPlan[];
  updatedAt: string;
};

export type PlannerState = {
  version: 1;
  weeks: Record<string, WeekPlan>;
};

type PlannerContextValue = {
  /** Every stored week by its Monday key (used by the Health Connect write-back, src/health/). */
  weeks: Record<string, WeekPlan>;
  getWeek: (weekStart: string) => WeekPlan;
  updateDay: (weekStart: string, date: string, updater: (day: DayPlan) => DayPlan) => void;
  /** Re-reads the plan from storage, e.g. after a backup was imported. */
  reloadFromStorage: () => void;
};

const STORAGE_KEY = STORAGE_KEYS.planner;
const PlannerContext = createContext<PlannerContextValue | null>(null);

function dateFromKey(key: string) {
  return new Date(`${key}T12:00:00`);
}

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfWeekKey(date = new Date()) {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  const day = next.getDay();
  next.setDate(next.getDate() - (day === 0 ? 6 : day - 1));
  return toDateKey(next);
}

export function shiftWeekKey(weekStart: string, weeks: number) {
  const date = dateFromKey(weekStart);
  date.setDate(date.getDate() + weeks * 7);
  return toDateKey(date);
}

function createWeek(weekStart: string): WeekPlan {
  const start = dateFromKey(weekStart);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date: toDateKey(date), meals: [], workouts: [] };
  });
  return { weekStart, days, updatedAt: new Date().toISOString() };
}

function loadState(): PlannerState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, weeks: {} };
    // Cleaning drops workout entries made before the v2.8 workout model and keeps fields from newer versions.
    return sanitizePlannerState(JSON.parse(raw))?.state ?? { version: 1, weeks: {} };
  } catch {
    return { version: 1, weeks: {} };
  }
}

export function PlannerProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<PlannerState>(loadState);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const getWeek = useCallback((weekStart: string) => state.weeks[weekStart] ?? createWeek(weekStart), [state.weeks]);

  const updateDay = useCallback((weekStart: string, date: string, updater: (day: DayPlan) => DayPlan) => {
    setState((current) => {
      const week = current.weeks[weekStart] ?? createWeek(weekStart);
      const days = week.days.map((day) => day.date === date ? updater(day) : day);
      return {
        version: 1,
        weeks: {
          ...current.weeks,
          [weekStart]: { ...week, days, updatedAt: new Date().toISOString() },
        },
      };
    });
  }, []);

  const reloadFromStorage = useCallback(() => setState(loadState()), []);

  const value = useMemo(() => ({ weeks: state.weeks, getWeek, updateDay, reloadFromStorage }), [state.weeks, getWeek, updateDay, reloadFromStorage]);
  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

export function usePlanner() {
  const context = useContext(PlannerContext);
  if (!context) throw new Error("usePlanner must be used inside PlannerProvider");
  return context;
}

export function createEntryId(prefix: string) {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export function summarizeWeek(week: WeekPlan) {
  const days = week.days.map((day) => ({
    ...day,
    intake: Math.round(day.meals.reduce((total, item) => total + item.kcal, 0)),
    burn: Math.round(day.workouts.reduce((total, item) => total + item.burnMid, 0)),
  }));
  const mealItems = days.flatMap((day) => day.meals);
  const workoutItems = days.flatMap((day) => day.workouts);
  return {
    days,
    intake: days.reduce((total, day) => total + day.intake, 0),
    burn: days.reduce((total, day) => total + day.burn, 0),
    mealCompleted: mealItems.filter((item) => item.completed).length,
    mealTotal: mealItems.length,
    workoutCompleted: workoutItems.filter((item) => item.completed).length,
    workoutTotal: workoutItems.length,
  };
}
