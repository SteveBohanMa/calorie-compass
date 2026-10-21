import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Cross2Icon,
  InfoCircledIcon,
  LightningBoltIcon,
  MagnifyingGlassIcon,
  Pencil2Icon,
  PersonIcon,
  PlusIcon,
} from "@radix-ui/react-icons";
import { MobileScroll } from "../mobile";
import { createEntryId, startOfWeekKey, toDateKey, usePlanner } from "../planner";
import { ACTIVITY_RATINGS, FIELD_RULES, NOTE_TEXT, SOURCES, WORKOUT_COPY, type Lang } from "./copy";
import { draftFor, draftProblems, draftToInput, entryFromDraft, type DraftField, type WorkoutDraft } from "./draft";
import {
  EQUIPMENT,
  GROUPS,
  LOAD_MODES,
  findExercise,
  searchExercises,
  type Equipment,
  type Exercise,
  type ExerciseGroup,
} from "./exercises";
import { INPUT_LIMITS, estimateWorkout, headlineRange, levelForRpe, restingKcalPerMinute, type BodyProfile, type EstimateNote, type Range, type Sex, type WorkoutEstimate } from "./model";
import { PROFILE_LIMITS, ageFromBirthYear, birthYearFromAge, type StoredProfile } from "./profile";
import { useProfile } from "./ProfileContext";
import "./workout.css";

const DEFAULT_EXERCISE_ID = "deadlift";

function round(value: number) {
  return Math.round(value);
}

function formatKcal(value: number, lang: Lang) {
  return round(value).toLocaleString(lang === "zh" ? "zh-CN" : "en-US");
}

export function formatRange(range: Range, lang: Lang) {
  return `${formatKcal(range.low, lang)}–${formatKcal(range.high, lang)}`;
}

function formatMinutes(minutes: number) {
  return minutes < 10 ? minutes.toFixed(1) : String(Math.round(minutes));
}

function groupLabel(id: ExerciseGroup, lang: Lang) {
  const group = GROUPS.find((item) => item.id === id);
  return group ? (lang === "zh" ? group.zh : group.en) : id;
}

function equipmentLabel(id: Equipment, lang: Lang) {
  const item = EQUIPMENT.find((candidate) => candidate.id === id);
  return item ? (lang === "zh" ? item.zh : item.en) : id;
}

export function exerciseName(exercise: Exercise, lang: Lang) {
  return lang === "zh" ? exercise.zh : exercise.en;
}

function sexLabel(sex: Sex, lang: Lang, summary = false) {
  const text = WORKOUT_COPY[lang];
  return sex === "male" ? text.male : sex === "female" ? text.female : summary ? text.unspecifiedSummary : text.unspecified;
}

// ---------------------------------------------------------------- Profile

type ProfileForm = { sex: Sex | ""; age: string; height: string; weight: string; activity: string; hrMax: string; vo2max: string };

function toForm(profile: StoredProfile): ProfileForm {
  const value = (number: number | null) => (number === null ? "" : String(number));
  return {
    sex: profile.sex ?? "",
    age: profile.birthYear === null ? "" : String(ageFromBirthYear(profile.birthYear)),
    height: value(profile.heightCm),
    weight: value(profile.weightKg),
    activity: value(profile.activityRating),
    hrMax: value(profile.hrMax),
    vo2max: value(profile.vo2max),
  };
}

function inRange(text: string, min: number, max: number) {
  const number = Number(text);
  return text.trim() !== "" && Number.isFinite(number) && number >= min && number <= max ? number : null;
}

export function ProfileCard({ lang }: { lang: Lang }) {
  const text = WORKOUT_COPY[lang];
  const { profile, body, save } = useProfile();
  const [editing, setEditing] = useState(() => body === null);
  const [form, setForm] = useState<ProfileForm>(() => toForm(profile));
  const [showOptional, setShowOptional] = useState(false);
  const [error, setError] = useState("");

  const update = (key: keyof ProfileForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const age = inRange(form.age, PROFILE_LIMITS.age.min, PROFILE_LIMITS.age.max);
    const height = inRange(form.height, PROFILE_LIMITS.heightCm.min, PROFILE_LIMITS.heightCm.max);
    const weight = inRange(form.weight, PROFILE_LIMITS.weightKg.min, PROFILE_LIMITS.weightKg.max);
    const hrMax = form.hrMax.trim() ? inRange(form.hrMax, PROFILE_LIMITS.hrMax.min, PROFILE_LIMITS.hrMax.max) : null;
    const vo2max = form.vo2max.trim() ? inRange(form.vo2max, PROFILE_LIMITS.vo2max.min, PROFILE_LIMITS.vo2max.max) : null;
    const optionalInvalid = (form.hrMax.trim() && hrMax === null) || (form.vo2max.trim() && vo2max === null);
    if (!form.sex || age === null || height === null || weight === null || optionalInvalid) {
      setError(text.profileInvalid);
      return;
    }
    const saved = save({
      sex: form.sex,
      birthYear: birthYearFromAge(age),
      heightCm: Math.round(height * 10) / 10,
      weightKg: Math.round(weight * 10) / 10,
      activityRating: form.activity === "" ? null : Number(form.activity),
      hrMax: hrMax === null ? null : Math.round(hrMax),
      vo2max: vo2max === null ? null : Math.round(vo2max * 10) / 10,
      updatedAt: "",
    });
    if (!saved) {
      setError(text.saveFailed);
      return;
    }
    setError("");
    setEditing(false);
  };

  if (!editing && body) {
    return (
      <section className="wk-profile" aria-label={text.profileTitle}>
        <span className="feature-icon sky"><PersonIcon width={19} height={19} /></span>
        <div>
          <small>{text.profileTitle}</small>
          <strong>{text.profileSummary(sexLabel(body.sex, lang, true), body.age, body.heightCm, body.weightKg)}</strong>
          <em>{text.rmr(round(restingKcalPerMinute(body) * 1440))}</em>
        </div>
        <button type="button" className="wk-icon-button" onClick={() => { setForm(toForm(profile)); setEditing(true); }} aria-label={text.edit}>
          <Pencil2Icon width={16} height={16} />
        </button>
      </section>
    );
  }

  return (
    <form className="wk-profile-form" onSubmit={submit} aria-label={text.profileTitle} noValidate>
      <div className="wk-profile-form-heading">
        <strong>{text.profileTitle}</strong>
        {body ? <button type="button" className="wk-icon-button" onClick={() => { setEditing(false); setError(""); }} aria-label={text.cancel}><Cross2Icon width={16} height={16} /></button> : null}
      </div>
      {!body ? <p className="wk-muted">{text.profileNeeded}</p> : null}
      <div className="segmented-control" role="radiogroup" aria-label={text.sex}>
        {(["male", "female", "unspecified"] as Sex[]).map((sex) => (
          <button key={sex} type="button" role="radio" aria-checked={form.sex === sex} className={form.sex === sex ? "active" : ""} onClick={() => update("sex", sex)}>
            {sexLabel(sex, lang)}
          </button>
        ))}
      </div>
      <div className="wk-form-grid three">
        <label><span>{text.age}</span><input name="age" type="number" inputMode="numeric" min={PROFILE_LIMITS.age.min} max={PROFILE_LIMITS.age.max} step="1" value={form.age} onChange={(event) => update("age", event.target.value)} /></label>
        <label><span>{text.height}</span><input name="height" type="number" inputMode="decimal" min={PROFILE_LIMITS.heightCm.min} max={PROFILE_LIMITS.heightCm.max} step="0.1" value={form.height} onChange={(event) => update("height", event.target.value)} /></label>
        <label><span>{text.weight}</span><input name="weight" type="number" inputMode="decimal" min={PROFILE_LIMITS.weightKg.min} max={PROFILE_LIMITS.weightKg.max} step="0.1" value={form.weight} onChange={(event) => update("weight", event.target.value)} /></label>
      </div>
      <button type="button" className="wk-link-button" onClick={() => setShowOptional((open) => !open)} aria-expanded={showOptional}>
        {showOptional ? <ChevronUpIcon width={14} height={14} /> : <ChevronDownIcon width={14} height={14} />}{text.optionalTitle}
      </button>
      {showOptional ? <div className="wk-optional">
        <label><span>{text.activity}</span>
          <select name="activity" value={form.activity} onChange={(event) => update("activity", event.target.value)}>
            <option value="">{text.activityUnset}</option>
            {ACTIVITY_RATINGS.map((rating) => <option key={rating.value} value={rating.value}>{lang === "zh" ? rating.zh : rating.en}</option>)}
          </select>
        </label>
        <div className="wk-form-grid">
          <label><span>{text.hrMax}</span><input name="hrMax" type="number" inputMode="numeric" min={PROFILE_LIMITS.hrMax.min} max={PROFILE_LIMITS.hrMax.max} step="1" value={form.hrMax} onChange={(event) => update("hrMax", event.target.value)} /></label>
          <label><span>{text.vo2max}</span><input name="vo2max" type="number" inputMode="decimal" min={PROFILE_LIMITS.vo2max.min} max={PROFILE_LIMITS.vo2max.max} step="0.1" value={form.vo2max} onChange={(event) => update("vo2max", event.target.value)} /></label>
        </div>
        <p className="wk-muted">{text.optionalHint}</p>
      </div> : null}
      {error ? <p className="wk-error" role="alert">{error}</p> : null}
      <button type="submit" className="primary-action wk-save"><CheckIcon width={17} height={17} />{text.save}</button>
    </form>
  );
}

// ---------------------------------------------------------------- Exercise picker

function ExercisePicker({ lang, selectedId, onSelect }: { lang: Lang; selectedId: string; onSelect: (exercise: Exercise) => void }) {
  const text = WORKOUT_COPY[lang];
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<ExerciseGroup | "all">("all");
  const [equipment, setEquipment] = useState<Equipment | "all">("all");
  const results = searchExercises(query, group, equipment);
  return (
    <section className="wk-picker">
      <div className="search-shell compact-search">
        <MagnifyingGlassIcon width={18} height={18} />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.searchExercise} aria-label={text.searchExercise} />
      </div>
      <div className="wk-chips" role="group" aria-label={text.bodyPart}>
        {[{ id: "all" as const, zh: text.all, en: text.all }, ...GROUPS].map((item) => (
          <button key={item.id} type="button" aria-pressed={group === item.id} className={group === item.id ? "active" : ""} onClick={() => setGroup(item.id)}>{lang === "zh" ? item.zh : item.en}</button>
        ))}
      </div>
      <div className="wk-chips" role="group" aria-label={text.equipment}>
        {[{ id: "all" as const, zh: text.all, en: text.all }, ...EQUIPMENT].map((item) => (
          <button key={item.id} type="button" aria-pressed={equipment === item.id} className={equipment === item.id ? "active" : ""} onClick={() => setEquipment(item.id)}>{lang === "zh" ? item.zh : item.en}</button>
        ))}
      </div>
      <div className="wk-picker-list">
        {results.map((exercise) => (
          <button key={exercise.id} type="button" className={exercise.id === selectedId ? "selected" : ""} onClick={() => onSelect(exercise)}>
            <span>
              <strong>{exerciseName(exercise, lang)}</strong>
              <small>{groupLabel(exercise.group, lang)} · {equipmentLabel(exercise.equipment, lang)} · {lang === "zh" ? exercise.musclesZh : exercise.musclesEn}</small>
            </span>
            {exercise.id === selectedId ? <CheckIcon width={16} height={16} /> : null}
          </button>
        ))}
        {!results.length ? <p>{text.noMatch}</p> : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Inputs

export function WorkoutFields({
  lang,
  exercise,
  draft,
  onChange,
  compact = false,
  problems = [],
}: {
  lang: Lang;
  exercise: Exercise;
  draft: WorkoutDraft;
  onChange: (field: DraftField, value: string) => void;
  compact?: boolean;
  problems?: DraftField[];
}) {
  const text = WORKOUT_COPY[lang];
  const [advanced, setAdvanced] = useState(() => Boolean(draft.rest || draft.tempo || draft.rpe || draft.hr));
  const field = (key: DraftField, label: string, options: { placeholder?: string; step?: string; numeric?: boolean } = {}) => (
    <label key={key} className={problems.includes(key) ? "invalid" : undefined}>
      <span>{label}</span>
      <input
        name={key}
        aria-invalid={problems.includes(key) || undefined}
        type="number"
        inputMode={options.numeric ? "numeric" : "decimal"}
        min="0"
        step={options.step ?? "any"}
        value={draft[key]}
        placeholder={options.placeholder}
        onChange={(event) => onChange(key, event.target.value)}
      />
    </label>
  );
  const gridClass = compact ? "editor-grid" : "wk-form-grid";

  let main: ReactElement;
  let hint: string | undefined;
  if (exercise.kind === "strength") {
    const mode = LOAD_MODES[exercise.loadMode];
    hint = exercise.noteZh || exercise.noteEn ? `${lang === "zh" ? mode.hintZh : mode.hintEn}；${lang === "zh" ? exercise.noteZh ?? "" : exercise.noteEn ?? ""}`.replace(/；$/, "") : (lang === "zh" ? mode.hintZh : mode.hintEn);
    main = (
      <div className={`${gridClass} three`}>
        {field("load", lang === "zh" ? mode.zh : mode.en)}
        {field("sets", text.sets, { numeric: true, step: "1" })}
        {field("reps", exercise.sides === 2 || exercise.loadMode === "perDumbbell" ? text.repsPerSide : text.reps, { numeric: true, step: "1" })}
      </div>
    );
  } else if (exercise.kind === "walk" || exercise.kind === "run") {
    hint = lang === "zh" ? exercise.noteZh : exercise.noteEn;
    main = <div className={`${gridClass} three`}>{field("speed", text.speed)}{field("grade", text.grade)}{field("minutes", text.minutes)}</div>;
  } else if (exercise.kind === "cycle" || exercise.kind === "row") {
    hint = `${lang === "zh" ? exercise.noteZh ?? "" : exercise.noteEn ?? ""} ${text.wattsHint}`.trim();
    main = <div className={gridClass}>{field("watts", text.watts, { numeric: true, step: "1" })}{field("minutes", text.minutes)}</div>;
  } else {
    hint = lang === "zh" ? exercise.noteZh : exercise.noteEn;
    // For resistance-type sessions an entered RPE picks the intensity (see the model), so show that choice.
    const rpe = draft.rpe.trim() === "" ? NaN : Number(draft.rpe);
    const rpeLevel = exercise.hrModel === "collins" && Number.isFinite(rpe) && rpe >= INPUT_LIMITS.rpe.min && rpe <= INPUT_LIMITS.rpe.max ? levelForRpe(exercise, rpe) : null;
    const activeLevel = rpeLevel?.id ?? (draft.level || exercise.defaults.level);
    main = (
      <>
        {exercise.levels.length > 1 ? (
          <div className="wk-level" role="radiogroup" aria-label={text.level}>
            <span>{text.level}</span>
            <div className="segmented-control">
              {exercise.levels.map((level) => (
                <button key={level.id} type="button" role="radio" aria-checked={activeLevel === level.id} disabled={rpeLevel !== null} className={activeLevel === level.id ? "active" : ""} onClick={() => onChange("level", level.id)}>
                  {lang === "zh" ? level.zh : level.en}
                </button>
              ))}
            </div>
            {rpeLevel ? <small className="wk-level-note">{text.rpeSetsLevel(rpe, lang === "zh" ? rpeLevel.zh : rpeLevel.en)}</small> : null}
          </div>
        ) : null}
        {exercise.timeInput === "holds"
          ? <div className={gridClass}>{field("sets", text.holdSets, { numeric: true, step: "1" })}{field("hold", text.holdSeconds, { numeric: true, step: "1" })}</div>
          : <div className={gridClass}>{field("minutes", text.minutes)}</div>}
      </>
    );
  }

  const holds = exercise.kind === "met" && exercise.timeInput === "holds";
  const rpeApplies = exercise.kind === "strength" || (exercise.kind === "met" && exercise.hrModel !== "none");
  const hrApplies = !(exercise.kind === "met" && exercise.hrModel === "none");
  const advancedLabel = exercise.kind === "strength" ? text.advancedStrength : holds ? text.advancedHolds : rpeApplies ? text.advancedCardioRpe : text.advancedCardio;

  return (
    <div className={compact ? "wk-fields compact" : "wk-fields"}>
      {main}
      {hint ? <p className="wk-hint">{hint}</p> : null}
      {hrApplies || rpeApplies || holds ? (
        <button type="button" className="advanced-button wk-advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced((open) => !open)}>
          {advanced ? text.hideAdvanced : advancedLabel}
        </button>
      ) : null}
      {advanced ? (
        <div className={`wk-advanced ${gridClass}`}>
          {exercise.kind === "strength" ? <>
            {field("rest", text.rest, { placeholder: text.restPlaceholder, numeric: true, step: "1" })}
            {field("tempo", text.tempo, { placeholder: text.tempoPlaceholder })}
            {field("rpe", text.rpeStrength, { placeholder: text.rpeStrengthPlaceholder, step: "0.5" })}
            {field("hr", text.hr, { placeholder: text.hrStrengthPlaceholder, numeric: true, step: "1" })}
            <p className="wk-rules"><InfoCircledIcon width={14} height={14} /><span>{text.advancedRules}</span></p>
          </> : holds ? <>
            {field("rest", text.rest, { placeholder: text.restPlaceholder, numeric: true, step: "1" })}
            <p className="wk-rules"><InfoCircledIcon width={14} height={14} /><span>{text.holdsRules}</span></p>
          </> : <>
            {rpeApplies ? field("rpe", text.rpeCardio, { placeholder: text.rpeCardioPlaceholder, step: "0.5" }) : null}
            {hrApplies ? field("hr", text.hr, { placeholder: text.hrCardioPlaceholder, numeric: true, step: "1" }) : null}
          </>}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Result

function componentLabel(key: WorkoutEstimate["components"][number]["key"], estimate: WorkoutEstimate, lang: Lang) {
  const text = WORKOUT_COPY[lang];
  switch (key) {
    case "during": return text.componentDuring;
    case "between": return text.componentBetween;
    case "post": return text.componentPost;
    case "exercise": return text.componentExercise;
    case "epoc": return text.componentEpoc;
    case "resting": return estimate.sessionMinutes !== null ? text.componentResting(formatMinutes(estimate.sessionMinutes)) : text.componentRestingUnknown;
  }
}

function BasisLines({ lang, exercise, estimate, body }: { lang: Lang; exercise: Exercise; estimate: WorkoutEstimate; body: BodyProfile }) {
  const text = WORKOUT_COPY[lang];
  const perMinute = restingKcalPerMinute(body);
  const lines: string[] = [];
  const detail = estimate.detail;
  const hr = estimate.heartRate;
  const hrLine = () => {
    if (!hr?.used || hr.heartRateKcal === undefined || hr.modelKcal === undefined) return;
    if (hr.method === "collins") {
      lines.push(text.basisHrCollins({
        percent: round(hr.percentMax), hrMax: round(hr.hrMax), hrMaxMeasured: hr.hrMaxMeasured,
        percentVo2: (0.582 * hr.percentMax - 1.7911).toFixed(1), vo2max: (hr.vo2max ?? 0).toFixed(1), vo2Measured: Boolean(hr.vo2maxMeasured),
        hrKcal: round(hr.heartRateKcal), modelKcal: round(hr.modelKcal), weight: round(hr.weight * 100),
        strength: detail.type === "strength", assumedRest: detail.type === "strength" ? detail.assumedRestSec : null, withRpe: Boolean(estimate.rpe?.used),
      }));
    } else {
      const withRpe = Boolean(estimate.rpe?.used && estimate.rpe.reserveFraction !== undefined);
      lines.push(text.basisHrKeytel(round(hr.heartRateKcal), round(hr.modelKcal), round(hr.weight * 100), withRpe));
    }
  };
  if (detail.type === "strength") {
    const reps = detail.sides === 2 ? `2 × ${detail.reps}` : `${detail.reps}`;
    lines.push(text.basisWork(reps, detail.rangeM.toFixed(2), detail.externalLoadKg.toFixed(1), detail.bodyMassMovedKg.toFixed(1), formatKcal(detail.workPerSetKgM, lang), detail.mechanicalKcalPerSet.toFixed(2)));
    const percent = (value: number) => (value * 100).toFixed(1).replace(/\.0$/, "");
    lines.push(text.basisEfficiency(percent(detail.efficiency.low), percent(detail.efficiency.high), (detail.efficiency.mid * 100).toFixed(1)));
    lines.push(text.basisFactors(detail.tempoFactor.toFixed(2), detail.rpeFactor.toFixed(2)));
    const seconds = detail.setSeconds < 10 ? detail.setSeconds.toFixed(1) : String(round(detail.setSeconds));
    lines.push(text.basisSplit(seconds, round(detail.duringShare * 100), detail.recoveredInRest === null ? null : round(detail.recoveredInRest * 100), detail.restSec));
    hrLine();
  } else {
    if (detail.equation === "acsm-walk") lines.push(text.basisWalk((detail.equationNetVo2PerKg ?? 0).toFixed(1)));
    else if (detail.equation === "acsm-run") lines.push(text.basisRun((detail.equationNetVo2PerKg ?? 0).toFixed(1)));
    else if (detail.equation === "acsm-cycle") lines.push(text.basisCycle);
    else if (exercise.kind === "row" && detail.met !== undefined) lines.push(text.basisRow(detail.met.toFixed(1), detail.code ?? "", (detail.effectiveMassKg ?? body.weightKg).toFixed(1)));
    else if (detail.met !== undefined) lines.push(text.basisMet(detail.met.toFixed(1), detail.code ?? ""));
    // Equation-based activities subtract the person's own resting uptake, not 3.5 mL/kg/min.
    if (detail.equation !== "compendium" || exercise.kind === "row") lines.push(text.basisAcsmResting(detail.restingVo2PerKg.toFixed(2)));
    if (estimate.rpe?.used && estimate.rpe.reserveFraction !== undefined && estimate.rpe.rpeKcalPerMinute !== undefined) {
      lines.push(text.basisRpe(estimate.rpe.value, round(estimate.rpe.reserveFraction * 100), estimate.rpe.rpeKcalPerMinute.toFixed(1), round((estimate.rpe.weight ?? 0) * 100)));
    }
    hrLine();
    lines.push(text.basisPerMinute(detail.netKcalPerMinute.toFixed(1)));
    if (exercise.kind === "met" && exercise.hrModel === "collins") lines.push(text.basisEpocResistance(round(detail.epocFraction * 100)));
    else lines.push(text.basisEpoc(round(detail.epocFraction * 100), round((estimate.relativeIntensity ?? 0) * 100)));
  }
  lines.push(text.basisResting(round(perMinute * 1440), perMinute.toFixed(2)));
  lines.push(text.basisOxygen);
  return (
    <div className="wk-basis">
      <ul>{lines.map((line) => <li key={line}>{line}</li>)}</ul>
      <p className="wk-muted">{text.rangeNote}</p>
      <strong>{text.sources}</strong>
      <ul className="wk-sources">{SOURCES.map((source) => <li key={source.en}>{lang === "zh" ? source.zh : source.en}</li>)}</ul>
    </div>
  );
}

/** Notes that mean an input was not used or the result needs care. */
const WARN_NOTES = new Set<EstimateNote>(["near-max", "weight-bias", "hr-above-max", "hr-too-low", "hr-window-short", "no-work"]);

export function EstimateCard({
  lang,
  exercise,
  estimate,
  body,
  onAddToPlan,
  status,
  stale = false,
  showBasis: showBasisProp,
  onToggleBasis,
}: {
  lang: Lang;
  exercise: Exercise;
  estimate: WorkoutEstimate;
  body: BodyProfile;
  onAddToPlan?: () => void;
  status?: string;
  /** The inputs changed and are invalid: this is the last valid result, shown dimmed. */
  stale?: boolean;
  showBasis?: boolean;
  onToggleBasis?: () => void;
}) {
  const text = WORKOUT_COPY[lang];
  const [ownShowBasis, setOwnShowBasis] = useState(false);
  const showBasis = showBasisProp ?? ownShowBasis;
  const toggleBasis = onToggleBasis ?? (() => setOwnShowBasis((open) => !open));
  const headline = headlineRange(estimate);
  const notes = estimate.notes.filter((note) => note !== "between-excluded" && note !== "resting-excluded");
  const between = estimate.components.find((part) => part.key === "between");
  const levelName = (id?: string) => {
    if (exercise.kind !== "met" || !id) return "";
    const level = exercise.levels.find((candidate) => candidate.id === id);
    return level ? (lang === "zh" ? level.zh : level.en) : "";
  };
  const singleSet = estimate.detail.type === "strength" && estimate.detail.sets === 1;
  const assumedRest = estimate.detail.type === "strength" ? estimate.detail.assumedRestSec : null;

  return (
    <section className={stale ? "wk-result stale" : "wk-result"} data-testid="workout-result" data-stale={stale || undefined}>
      <div className="wk-headline" aria-live="polite" aria-atomic="true">
        <span className="wk-result-label">{estimate.headline === "total" ? text.headlineTotal : text.headlineTraining}</span>
        <strong className="wk-result-value">{formatRange(headline, lang)} <small>kcal</small></strong>
        <small className="wk-result-sub">{stale ? text.stale : text.kjLine(round(headline.low * 4.184), round(headline.high * 4.184), round(headline.mid))}</small>
      </div>

      <div className="wk-breakdown">
        {estimate.components.map((part) => {
          if (part.key === "between" && singleSet) return null;
          const value = !part.included ? text.notIncluded : part.kcal.high < 0.5 ? text.underOne : `${formatRange(part.kcal, lang)} kcal`;
          return (
            <div key={part.key} className={part.included ? "" : "excluded"} data-component={part.key}>
              <span>{componentLabel(part.key, estimate, lang)}</span>
              <b>{value}</b>
            </div>
          );
        })}
      </div>

      <div className="wk-facts">
        {estimate.headline === "total" && estimate.total ? <span>{text.extraLine(round(estimate.extra.low), round(estimate.extra.high))}</span> : null}
        {/* The per-set figure is the work model alone, so it is left out once heart rate has corrected the session. */}
        {estimate.perSet && !singleSet && !estimate.heartRate?.used ? <span>{text.perSet(round(estimate.perSet.low), round(estimate.perSet.high))}</span> : null}
        {estimate.kind === "strength" ? <span>{estimate.sessionMinutes !== null ? text.sessionTime(formatMinutes(estimate.sessionMinutes)) : text.activeTime(formatMinutes(estimate.activeMinutes))}</span> : null}
      </div>

      <ul className="wk-notes">
        {estimate.notes.includes("between-excluded") && between ? <li className="warn" data-note="between-excluded">{text.betweenExcluded(formatRange(between.kcal, lang))}</li> : null}
        {estimate.notes.includes("resting-excluded") ? <li className="warn" data-note="resting-excluded">{NOTE_TEXT[lang]["resting-excluded"]}</li> : null}
        {estimate.heartRate?.used ? <li>{estimate.heartRate.method === "keytel" ? text.hrUsedKeytel(round(estimate.heartRate.weight * 100), round(estimate.heartRate.percentMax)) : text.hrUsedCollins(round(estimate.heartRate.weight * 100), round(estimate.heartRate.percentMax))}</li> : null}
        {estimate.rpe?.used && estimate.rpe.factor !== undefined && estimate.detail.type === "strength" ? <li>{text.rpeStrengthUsed(estimate.rpe.value, estimate.rpe.factor.toFixed(2))}</li> : null}
        {estimate.rpe?.used && estimate.rpe.reserveFraction !== undefined ? <li>{text.rpeCardioUsed(estimate.rpe.value, round(estimate.rpe.reserveFraction * 100), round((estimate.rpe.weight ?? 0) * 100))}</li> : null}
        {estimate.rpe?.used && estimate.rpe.factor === undefined && estimate.rpe.reserveFraction === undefined && estimate.rpe.levelId ? <li>{text.rpeLevelUsed(estimate.rpe.value, levelName(estimate.rpe.levelId))}</li> : null}
        {notes.map((note) => (
          <li key={note} className={WARN_NOTES.has(note) ? "warn" : ""} data-note={note}>
            {note === "hr-assumed-rest" && assumedRest !== null ? text.hrAssumedRest(assumedRest) : NOTE_TEXT[lang][note]}
          </li>
        ))}
      </ul>

      {onAddToPlan && !stale && estimate.extra.mid > 0 ? <button type="button" className="primary-action wk-add" onClick={onAddToPlan}><PlusIcon width={17} height={17} />{text.addToPlan}</button> : null}
      {status && !stale ? <p className="wk-status" role="status">{status}</p> : null}

      <button type="button" className="wk-link-button" aria-expanded={showBasis} onClick={toggleBasis}>
        {showBasis ? <ChevronUpIcon width={14} height={14} /> : <ChevronDownIcon width={14} height={14} />}{showBasis ? text.hideBasis : text.basis}
      </button>
      {showBasis ? <BasisLines lang={lang} exercise={exercise} estimate={estimate} body={body} /> : null}
    </section>
  );
}

// ---------------------------------------------------------------- Screen

export function WorkoutScreen({ lang }: { lang: Lang }) {
  const text = WORKOUT_COPY[lang];
  const { body } = useProfile();
  const planner = usePlanner();
  const [exercise, setExercise] = useState<Exercise>(() => findExercise(DEFAULT_EXERCISE_ID)!);
  const [draft, setDraft] = useState<WorkoutDraft>(() => draftFor(findExercise(DEFAULT_EXERCISE_ID)!));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [showBasis, setShowBasis] = useState(false);

  const problems = useMemo(() => draftProblems(exercise, draft), [exercise, draft]);
  const fresh = useMemo(() => (body && !problems.length ? estimateWorkout(exercise, draftToInput(draft), body) : null), [exercise, draft, body, problems]);
  // While a field is being retyped, keep showing the last valid result (dimmed) instead of collapsing the card.
  const [lastValid, setLastValid] = useState<WorkoutEstimate | null>(null);
  useEffect(() => {
    if (fresh) setLastValid(fresh);
  }, [fresh]);
  const shown = fresh ?? (lastValid && lastValid.exerciseId === exercise.id ? lastValid : null);

  const choose = (next: Exercise) => {
    setPickerOpen(false);
    if (next.id === exercise.id) return;
    setExercise(next);
    setDraft(draftFor(next));
    setStatus("");
  };

  const change = (field: DraftField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setStatus("");
  };

  const addToPlan = () => {
    if (!body || !fresh) return;
    const today = new Date();
    const date = toDateKey(today);
    const entry = entryFromDraft(createEntryId("workout"), exercise, draft, body.weightKg, fresh);
    planner.updateDay(startOfWeekKey(today), date, (day) => ({ ...day, workouts: [...day.workouts, entry] }));
    setStatus(text.added(today.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" })));
  };

  return (
    <MobileScroll className="app-screen mint-screen">
      <main className="page-content detail-pad wk-page">
        <div className="page-intro"><h1>{text.title}</h1><p>{text.intro}</p></div>
        <ProfileCard lang={lang} />

        <section className={`wk-card ${body ? "" : "disabled"}`} inert={!body}>
          <div className="wk-exercise">
            <div>
              <strong>{exerciseName(exercise, lang)}</strong>
              <small>{groupLabel(exercise.group, lang)} · {equipmentLabel(exercise.equipment, lang)} · {lang === "zh" ? exercise.musclesZh : exercise.musclesEn}</small>
            </div>
            <button type="button" className="secondary-action wk-change" onClick={() => setPickerOpen((open) => !open)} aria-expanded={pickerOpen}>
              {pickerOpen ? <Cross2Icon width={15} height={15} /> : <LightningBoltIcon width={15} height={15} />}{pickerOpen ? text.closePicker : text.changeExercise}
            </button>
          </div>
          {pickerOpen ? <ExercisePicker lang={lang} selectedId={exercise.id} onSelect={choose} /> : null}
          <WorkoutFields key={exercise.id} lang={lang} exercise={exercise} draft={draft} onChange={change} problems={problems} />
          {body ? <p className="wk-muted wk-weight-line">{text.bodyWeightFrom(body.weightKg)}</p> : null}
        </section>

        {body && problems.length ? <p className="wk-incomplete" role="status">{text.incomplete(problems.map((field) => FIELD_RULES[lang][field]))}</p> : null}
        {body && shown ? <EstimateCard lang={lang} exercise={exercise} estimate={shown} body={body} onAddToPlan={addToPlan} status={status} stale={!fresh} showBasis={showBasis} onToggleBasis={() => setShowBasis((open) => !open)} /> : null}
      </main>
    </MobileScroll>
  );
}
