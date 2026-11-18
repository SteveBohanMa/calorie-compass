// Form state for the workout estimator and the weekly-plan editor, and conversion to plan entries.
import type { WorkoutEntry } from "../planner";
import type { Exercise } from "./exercises";
import { INPUT_LIMITS, WORKOUT_MODEL_VERSION, estimateWorkout, type BodyProfile, type WorkoutEstimate, type WorkoutInput } from "./model";

/** Every field is kept as the text the user typed; empty optional fields mean "not entered". */
export type WorkoutDraft = {
  load: string;
  sets: string;
  reps: string;
  rest: string;
  tempo: string;
  hold: string;
  minutes: string;
  speed: string;
  grade: string;
  watts: string;
  level: string;
  rpe: string;
  hr: string;
};

export type DraftField = keyof WorkoutDraft;

export function draftFor(exercise: Exercise): WorkoutDraft {
  const blank: WorkoutDraft = { load: "", sets: "", reps: "", rest: "", tempo: "", hold: "", minutes: "", speed: "", grade: "", watts: "", level: "", rpe: "", hr: "" };
  switch (exercise.kind) {
    case "strength":
      return { ...blank, load: String(exercise.defaults.load), sets: String(exercise.defaults.sets), reps: String(exercise.defaults.reps) };
    case "walk":
    case "run":
      return { ...blank, speed: String(exercise.defaults.speedKmh), grade: String(exercise.defaults.gradePct), minutes: String(exercise.defaults.minutes) };
    case "cycle":
    case "row":
      return { ...blank, watts: String(exercise.defaults.watts), minutes: String(exercise.defaults.minutes) };
    case "met":
      return exercise.timeInput === "holds"
        ? { ...blank, sets: "3", hold: "40", level: exercise.defaults.level }
        : { ...blank, minutes: String(exercise.defaults.minutes), level: exercise.defaults.level };
  }
}

function parse(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function draftToInput(draft: WorkoutDraft): WorkoutInput {
  return {
    loadKg: parse(draft.load),
    sets: parse(draft.sets),
    reps: parse(draft.reps),
    restSec: parse(draft.rest) ?? null,
    secPerRep: parse(draft.tempo) ?? null,
    holdSeconds: parse(draft.hold),
    minutes: parse(draft.minutes),
    speedKmh: parse(draft.speed),
    gradePct: parse(draft.grade),
    watts: parse(draft.watts),
    level: draft.level || undefined,
    rpe: parse(draft.rpe) ?? null,
    avgHr: parse(draft.hr) ?? null,
  };
}

type LimitKey = keyof typeof INPUT_LIMITS;

/** Draft field → the model limit it is checked against. */
const FIELD_LIMIT: Partial<Record<DraftField, LimitKey>> = {
  load: "loadKg",
  sets: "sets",
  reps: "reps",
  rest: "restSec",
  tempo: "secPerRep",
  hold: "holdSeconds",
  minutes: "minutes",
  speed: "speedKmh",
  grade: "gradePct",
  watts: "watts",
  rpe: "rpe",
  hr: "avgHr",
};

function outOfRange(field: DraftField, text: string) {
  const key = FIELD_LIMIT[field];
  if (!key) return false;
  const limit = INPUT_LIMITS[key];
  const value = parse(text);
  if (value === undefined) return true;
  return value < limit.min || value > limit.max || (limit.integer && !Number.isInteger(value));
}

/**
 * Fields that are empty when required, not numbers, or outside INPUT_LIMITS (whole numbers where the limit
 * says so). The estimate is only shown when this is empty, so the model never clamps a typed value silently.
 */
export function draftProblems(exercise: Exercise, draft: WorkoutDraft): DraftField[] {
  const problems: DraftField[] = [];
  const required = (field: DraftField) => {
    if (outOfRange(field, draft[field])) problems.push(field);
  };
  const optional = (field: DraftField) => {
    if (draft[field].trim() !== "" && outOfRange(field, draft[field])) problems.push(field);
  };
  switch (exercise.kind) {
    case "strength":
      required("load");
      required("sets");
      required("reps");
      optional("rest");
      optional("tempo");
      optional("rpe");
      optional("hr");
      break;
    case "walk":
    case "run":
      required("speed");
      required("grade");
      required("minutes");
      optional("hr");
      break;
    case "cycle":
    case "row":
      required("watts");
      required("minutes");
      optional("hr");
      break;
    case "met":
      if (exercise.timeInput === "holds") {
        required("sets");
        required("hold");
        optional("rest");
      } else {
        required("minutes");
        if (exercise.hrModel !== "none") optional("hr");
      }
      if (exercise.hrModel !== "none") optional("rpe");
      break;
  }
  return problems;
}

const text = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));

export function entryToDraft(entry: WorkoutEntry): WorkoutDraft {
  return {
    load: text(entry.loadKg),
    sets: text(entry.sets),
    reps: text(entry.reps),
    rest: text(entry.restSec),
    tempo: text(entry.secPerRep),
    hold: text(entry.holdSeconds),
    minutes: text(entry.minutes),
    speed: text(entry.speedKmh),
    grade: text(entry.gradePct),
    watts: text(entry.watts),
    level: entry.level ?? "",
    rpe: text(entry.rpe),
    hr: text(entry.avgHr),
  };
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const optional = (value: number | undefined | null) => (value === undefined || value === null ? null : value);

/** Builds a plan entry from the form and the estimate it produced. */
export function entryFromDraft(id: string, exercise: Exercise, draft: WorkoutDraft, bodyWeight: number, estimate: WorkoutEstimate, completed = false): WorkoutEntry {
  const input = draftToInput(draft);
  const strength = exercise.kind === "strength";
  const holds = exercise.kind === "met" && exercise.timeInput === "holds";
  return {
    id,
    exerciseId: exercise.id,
    nameZh: exercise.zh,
    nameEn: exercise.en,
    bodyWeight,
    sets: estimate.detail.type === "strength" ? estimate.detail.sets : holds ? Math.max(1, Math.round(input.sets ?? 3)) : 0,
    reps: estimate.detail.type === "strength" ? estimate.detail.reps : 0,
    loadKg: strength ? input.loadKg ?? 0 : 0,
    restSec: strength || holds ? optional(input.restSec) : null,
    secPerRep: strength ? optional(input.secPerRep) : null,
    holdSeconds: holds ? optional(input.holdSeconds) : null,
    minutes: !strength && !holds ? optional(input.minutes) : null,
    speedKmh: exercise.kind === "walk" || exercise.kind === "run" ? optional(input.speedKmh) : null,
    gradePct: exercise.kind === "walk" || exercise.kind === "run" ? optional(input.gradePct) : null,
    watts: exercise.kind === "cycle" || exercise.kind === "row" ? optional(input.watts) : null,
    level: exercise.kind === "met" ? input.level ?? exercise.defaults.level : null,
    rpe: optional(input.rpe),
    avgHr: optional(input.avgHr),
    durationMinutes: round1(estimate.sessionMinutes ?? estimate.activeMinutes),
    burnLow: Math.round(estimate.extra.low),
    burnMid: Math.round(estimate.extra.mid),
    burnHigh: Math.round(estimate.extra.high),
    totalLow: estimate.total ? Math.round(estimate.total.low) : null,
    totalHigh: estimate.total ? Math.round(estimate.total.high) : null,
    headline: estimate.headline,
    modelVersion: WORKOUT_MODEL_VERSION,
    completed,
  };
}

/** Recomputes an entry with the current model and the given profile (its own body weight and unknown fields are kept). */
export function recomputeEntry(entry: WorkoutEntry, exercise: Exercise, profile: BodyProfile, draft = entryToDraft(entry)): WorkoutEntry {
  const estimate = estimateWorkout(exercise, draftToInput(draft), { ...profile, weightKg: entry.bodyWeight });
  return { ...entry, ...entryFromDraft(entry.id, exercise, draft, entry.bodyWeight, estimate, entry.completed) };
}

/**
 * Keeps where an entry's heart rate came from (v2.10) in step with an edit: an unchanged heart rate keeps
 * its source, a changed one was typed by the user, and without a heart rate there is no source.
 */
export function withHeartRateSource(previous: WorkoutEntry, next: WorkoutEntry): WorkoutEntry {
  if (next.avgHr === previous.avgHr) return next;
  const { hrSource: _source, hrFrom: _from, hrTo: _to, ...rest } = next;
  return next.avgHr === null ? rest : { ...rest, hrSource: "manual" };
}

/** Ticks an entry done or not; the time it was ticked is what write-back uses when it was not recorded live (v2.10). */
export function withCompletion<T extends { completed: boolean; completedAt?: string }>(entry: T, completed: boolean, now = new Date()): T {
  const { completedAt: _completedAt, ...rest } = entry;
  return (completed ? { ...rest, completed, completedAt: now.toISOString() } : { ...rest, completed }) as T;
}
