import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

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
  completed: boolean;
};

export type WorkoutEntry = {
  id: string;
  exerciseId: string;
  nameZh: string;
  nameEn: string;
  bodyWeight: number;
  sets: number;
  reps: number;
  loadKg: number;
  durationMinutes: number;
  burnLow: number;
  burnHigh: number;
  completed: boolean;
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

type PlannerState = {
  version: 1;
  weeks: Record<string, WeekPlan>;
};

type PlannerContextValue = {
  getWeek: (weekStart: string) => WeekPlan;
  updateDay: (weekStart: string, date: string, updater: (day: DayPlan) => DayPlan) => void;
};

const STORAGE_KEY = "calorie-compass-v2.4-planner";
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
    const parsed = JSON.parse(raw) as PlannerState;
    if (parsed.version !== 1 || !parsed.weeks) return { version: 1, weeks: {} };
    return parsed;
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

  const value = useMemo(() => ({ getWeek, updateDay }), [getWeek, updateDay]);
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
    burn: Math.round(day.workouts.reduce((total, item) => total + (item.burnLow + item.burnHigh) / 2, 0)),
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
