// Body profile used by the workout estimator. Pure helpers; storage lives in userData.ts.
import type { BodyProfile, Sex } from "./model";

export type StoredProfile = {
  sex: Sex | null;
  /** Stored as a birth year so the age stays right over time. */
  birthYear: number | null;
  heightCm: number | null;
  weightKg: number | null;
  /** Jackson 1990 physical activity rating, 0–7 (optional). */
  activityRating: number | null;
  /** Measured VO2max in mL/kg/min (optional). */
  vo2max: number | null;
  /** Measured maximal heart rate in bpm (optional). */
  hrMax: number | null;
  updatedAt: string;
};

export const PROFILE_LIMITS = {
  age: { min: 14, max: 100 },
  heightCm: { min: 120, max: 230 },
  weightKg: { min: 30, max: 300 },
  activityRating: { min: 0, max: 7 },
  vo2max: { min: 10, max: 90 },
  hrMax: { min: 100, max: 230 },
} as const;

export type ProfileField = "sex" | "age" | "heightCm" | "weightKg";

export function emptyProfile(): StoredProfile {
  return { sex: null, birthYear: null, heightCm: null, weightKg: null, activityRating: null, vo2max: null, hrMax: null, updatedAt: "" };
}

function within(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

export function ageFromBirthYear(birthYear: number, now = new Date()) {
  return now.getFullYear() - birthYear;
}

export function birthYearFromAge(age: number, now = new Date()) {
  return now.getFullYear() - Math.round(age);
}

/** Cleans a stored or imported profile; null when the value is not a profile at all. */
export function sanitizeProfile(value: unknown, now = new Date()): StoredProfile | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const sex = record.sex === "male" || record.sex === "female" || record.sex === "unspecified" ? record.sex : null;
  const year = now.getFullYear();
  const birthYear = within(record.birthYear, year - PROFILE_LIMITS.age.max, year - PROFILE_LIMITS.age.min);
  const rating = within(record.activityRating, PROFILE_LIMITS.activityRating.min, PROFILE_LIMITS.activityRating.max);
  return {
    sex,
    birthYear: birthYear === null ? null : Math.round(birthYear),
    heightCm: within(record.heightCm, PROFILE_LIMITS.heightCm.min, PROFILE_LIMITS.heightCm.max),
    weightKg: within(record.weightKg, PROFILE_LIMITS.weightKg.min, PROFILE_LIMITS.weightKg.max),
    activityRating: rating === null ? null : Math.round(rating),
    vo2max: within(record.vo2max, PROFILE_LIMITS.vo2max.min, PROFILE_LIMITS.vo2max.max),
    hrMax: within(record.hrMax, PROFILE_LIMITS.hrMax.min, PROFILE_LIMITS.hrMax.max),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
  };
}

export function missingProfileFields(profile: StoredProfile): ProfileField[] {
  const missing: ProfileField[] = [];
  if (!profile.sex) missing.push("sex");
  if (profile.birthYear === null) missing.push("age");
  if (profile.heightCm === null) missing.push("heightCm");
  if (profile.weightKg === null) missing.push("weightKg");
  return missing;
}

/** The model's input, or null while a required field is missing. `weightKg` can override the stored weight. */
export function toBodyProfile(profile: StoredProfile, weightKg?: number, now = new Date()): BodyProfile | null {
  if (missingProfileFields(profile).length) return null;
  const weight = within(weightKg, PROFILE_LIMITS.weightKg.min, PROFILE_LIMITS.weightKg.max) ?? profile.weightKg!;
  return {
    sex: profile.sex!,
    age: ageFromBirthYear(profile.birthYear!, now),
    heightCm: profile.heightCm!,
    weightKg: weight,
    activityRating: profile.activityRating,
    vo2max: profile.vo2max,
    hrMax: profile.hrMax,
  };
}

/** True when every field the estimator needs is present. */
export function isProfileComplete(profile: StoredProfile) {
  return missingProfileFields(profile).length === 0;
}
