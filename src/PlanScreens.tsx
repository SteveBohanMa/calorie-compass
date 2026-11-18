import { useEffect, useRef, useState } from "react";
import {
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  PlusIcon,
  ReaderIcon,
  StopwatchIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { FOODS, localizedLabel, type Lang } from "./catalog";
import {
  createEntryId,
  shiftWeekKey,
  startOfWeekKey,
  summarizeWeek,
  toDateKey,
  usePlanner,
  type DayPlan,
  type MealEntry,
  type MealSlot,
  type WorkoutEntry,
} from "./planner";
import { MobileScroll } from "./mobile";
import { draftFor, draftProblems, draftToInput, entryFromDraft, entryToDraft, withCompletion, withHeartRateSource, type DraftField, type WorkoutDraft } from "./workout/draft";
import { EntryHealthNote } from "./health/HealthViews";
import { EXERCISES, GROUPS, findExercise, type Exercise } from "./workout/exercises";
import { WORKOUT_MODEL_VERSION, estimateWorkout, type BodyProfile } from "./workout/model";
import { PROFILE_LIMITS } from "./workout/profile";
import { useProfile } from "./workout/ProfileContext";
import { ProfileCard, WorkoutFields, formatRange } from "./workout/WorkoutScreen";
import { pieceWeight, soldByPiece } from "./features/portion";
import { useUserPrefs } from "./features/UserPrefsContext";

const DAY_NAMES = {
  zh: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

const MEAL_SLOTS: { id: MealSlot; zh: string; en: string }[] = [
  { id: "breakfast", zh: "早餐", en: "Breakfast" },
  { id: "lunch", zh: "午餐", en: "Lunch" },
  { id: "dinner", zh: "晚餐", en: "Dinner" },
  { id: "snack", zh: "加餐", en: "Snack" },
];

function formatWeekRange(weekStart: string, lang: Lang) {
  const start = new Date(`${weekStart}T12:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  return `${start.toLocaleDateString(locale, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(locale, { month: "short", day: "numeric" })}`;
}

function progress(done: number, total: number) {
  return total ? Math.round(done / total * 100) : 0;
}

export function PlanScreen({
  lang,
  onEditMeals,
  onEditWorkouts,
}: {
  lang: Lang;
  onEditMeals: (weekStart: string, date: string) => void;
  onEditWorkouts: (weekStart: string, date: string) => void;
}) {
  const { getWeek } = usePlanner();
  const [weekStart, setWeekStart] = useState(startOfWeekKey);
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [exportState, setExportState] = useState("");
  const reportRef = useRef<HTMLElement>(null);
  const week = getWeek(weekStart);
  const summary = summarizeWeek(week);
  const selectedDay = week.days.find((day) => day.date === selectedDate) ?? week.days[0];
  const mealPercent = progress(summary.mealCompleted, summary.mealTotal);
  const workoutPercent = progress(summary.workoutCompleted, summary.workoutTotal);

  const changeWeek = (offset: number) => {
    const next = shiftWeekKey(weekStart, offset);
    setWeekStart(next);
    setSelectedDate(next);
  };

  const exportReport = () => {
    const node = reportRef.current;
    if (!node) return;
    node.scrollIntoView({ block: "center", behavior: "auto" });
    setExportState(lang === "zh" ? "正在生成…" : "Preparing…");
    window.setTimeout(async () => {
      const rect = node.getBoundingClientRect();
      if (!window.calorieCompass?.exportReport) {
        setExportState(lang === "zh" ? "请在 Windows 应用中导出" : "Export is available in the Windows app");
        return;
      }
      const result = await window.calorieCompass.exportReport({
        x: Math.max(0, Math.floor(rect.x)),
        y: Math.max(0, Math.floor(rect.y)),
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height),
      }, `燃卡快查-周报-${weekStart}.png`);
      const where = result.filePath ? (lang === "zh" ? `：${result.filePath}` : `: ${result.filePath}`) : "";
      setExportState(result.saved
        ? (lang === "zh" ? `图片已保存${where}` : `Image saved${where}`)
        : (result.canceled ? "" : (lang === "zh" ? "导出失败" : "Export failed")));
    }, 80);
  };

  return (
    <MobileScroll className="app-screen mint-screen">
      <main className="page-content detail-pad plan-page">
        <div className="page-intro"><h1>{lang === "zh" ? "每周计划与周报" : "Weekly plan & report"}</h1><p>{lang === "zh" ? "按天编辑食谱与训练，周报自动汇总" : "Edit meals and workouts by day; the report updates automatically"}</p></div>

        <div className="week-switcher">
          <button onClick={() => changeWeek(-1)} aria-label={lang === "zh" ? "上一周" : "Previous week"}><ChevronLeftIcon /></button>
          <strong>{formatWeekRange(weekStart, lang)}</strong>
          <button onClick={() => changeWeek(1)} aria-label={lang === "zh" ? "下一周" : "Next week"}><ChevronRightIcon /></button>
        </div>

        <div className="day-tabs" aria-label={lang === "zh" ? "选择日期" : "Select day"}>
          {week.days.map((day, index) => (
            <button key={day.date} className={selectedDay.date === day.date ? "active" : ""} onClick={() => setSelectedDate(day.date)}>
              <span>{DAY_NAMES[lang][index]}</span><b>{Number(day.date.slice(-2))}</b>
            </button>
          ))}
        </div>

        <section className="daily-edit-card">
          <div className="daily-edit-heading">
            <div><small>{selectedDay.date}</small><strong>{DAY_NAMES[lang][week.days.findIndex((day) => day.date === selectedDay.date)]}</strong></div>
            <span>{selectedDay.meals.reduce((total, item) => total + item.kcal, 0).toFixed(0)} kcal {lang === "zh" ? "摄入" : "intake"}</span>
          </div>
          <button onClick={() => onEditMeals(weekStart, selectedDay.date)}><CalendarIcon /><span><strong>{lang === "zh" ? "编辑每日食谱" : "Edit daily meals"}</strong><small>{selectedDay.meals.length ? `${selectedDay.meals.length} ${lang === "zh" ? "项" : "items"}` : (lang === "zh" ? "尚未添加" : "No items yet")}</small></span><ChevronRightIcon /></button>
          <button onClick={() => onEditWorkouts(weekStart, selectedDay.date)}><StopwatchIcon /><span><strong>{lang === "zh" ? "编辑训练动作" : "Edit workouts"}</strong><small>{selectedDay.workouts.length ? `${selectedDay.workouts.length} ${lang === "zh" ? "项" : "items"}` : (lang === "zh" ? "尚未添加" : "No items yet")}</small></span><ChevronRightIcon /></button>
        </section>

        <section className="plan-group">
          <div className="plan-card green"><span className="feature-icon lime"><CalendarIcon /></span><div><small>{lang === "zh" ? "饮食条目" : "Meal items"}</small><strong>{summary.mealCompleted} / {summary.mealTotal || 0} {lang === "zh" ? "完成" : "done"}</strong><i><u style={{ width: `${mealPercent}%` }} /></i></div><b>{mealPercent}%</b></div>
          <div className="plan-card blue"><span className="feature-icon sky"><StopwatchIcon /></span><div><small>{lang === "zh" ? "训练动作" : "Workout items"}</small><strong>{summary.workoutCompleted} / {summary.workoutTotal || 0} {lang === "zh" ? "完成" : "done"}</strong><i><u style={{ width: `${workoutPercent}%` }} /></i></div><b>{workoutPercent}%</b></div>
        </section>

        <button className="secondary-action export-report-button" onClick={exportReport}><DownloadIcon />{lang === "zh" ? "导出本周周报图片" : "Export weekly report image"}</button>
        {exportState ? <p className="export-status" role="status">{exportState}</p> : null}

        <section className="report-card weekly-export-card" ref={reportRef} data-testid="weekly-report-card">
          <div className="report-top"><span><ReaderIcon /></span><strong>{lang === "zh" ? "本周周报" : "Weekly report"}</strong><b>{formatWeekRange(weekStart, lang)}</b></div>
          <div className="report-stats"><span><small>{lang === "zh" ? "计划饮食摄入" : "Food intake"}</small><strong>{summary.intake.toLocaleString()}</strong><em>kcal</em></span><span><small>{lang === "zh" ? "训练额外消耗" : "Extra workout energy"}</small><strong>{summary.burn.toLocaleString()}</strong><em>kcal</em></span></div>
          <div className="report-days">
            {summary.days.map((day, index) => <div key={day.date}><span>{DAY_NAMES[lang][index]}</span><b>{day.intake}</b><small>{lang === "zh" ? "摄入" : "in"}</small><b>{day.burn}</b><small>{lang === "zh" ? "消耗" : "out"}</small></div>)}
          </div>
          <p>{lang === "zh" ? "饮食摄入与训练消耗分开显示，不计算热量缺口。训练消耗为估算中间值，不含静息代谢。" : "Food intake and workout expenditure are shown separately. Workout energy is the estimated midpoint, excluding resting metabolism."}</p>
        </section>
      </main>
    </MobileScroll>
  );
}

function dayFor(getDay: DayPlan | undefined, date: string): DayPlan {
  return getDay ?? { date, meals: [], workouts: [] };
}

export function MealEditorScreen({ lang, weekStart, date }: { lang: Lang; weekStart: string; date: string }) {
  const { getWeek, updateDay } = usePlanner();
  const day = dayFor(getWeek(weekStart).days.find((item) => item.date === date), date);

  const addMeal = () => {
    const food = FOODS[0];
    const entry: MealEntry = { id: createEntryId("meal"), slot: "breakfast", foodId: food.id, nameZh: food.zh, nameEn: food.en, grams: food.servingGrams, kcalPer100G: food.kcal, kcal: food.servingKcal, completed: false };
    updateDay(weekStart, date, (current) => ({ ...current, meals: [...current.meals, entry] }));
  };

  const patchMeal = (id: string, patch: Partial<MealEntry>) => updateDay(weekStart, date, (current) => ({ ...current, meals: current.meals.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  const removeMeal = (id: string) => updateDay(weekStart, date, (current) => ({ ...current, meals: current.meals.filter((item) => item.id !== id) }));

  return <MobileScroll className="app-screen mint-screen"><main className="page-content detail-pad editor-page">
    <div className="page-intro"><h1>{lang === "zh" ? "每日食谱" : "Daily meals"}</h1><p>{date} · {lang === "zh" ? "按重量自动计算热量" : "Calories update from portion weight"}</p></div>
    <div className="editor-list">
      {day.meals.map((item) => <MealEditorCard key={item.id} lang={lang} item={item} patchMeal={patchMeal} removeMeal={removeMeal} />)}
      {!day.meals.length ? <div className="editor-empty">{lang === "zh" ? "还没有食物，点击下方按钮开始添加。" : "No foods yet. Add the first one below."}</div> : null}
    </div>
    <button className="primary-action" onClick={addMeal}><PlusIcon />{lang === "zh" ? "添加食物" : "Add food"}</button>
  </main></MobileScroll>;
}

function positive(text: string) {
  const value = Number(text);
  return text.trim() !== "" && Number.isFinite(value) && value > 0 ? value : null;
}

/** A number field that keeps what is typed and only reports values above 0; it follows outside changes. */
function PositiveNumberField({ label, value, step, min, onCommit }: { label: string; value: number; step: string; min: string; onCommit: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  const parsed = positive(text);
  useEffect(() => {
    // Only overwrite the text when the stored value really differs from it (e.g. the other field changed it).
    setText((current) => (positive(current) === value ? current : String(value)));
  }, [value]);
  return (
    <label className={parsed === null ? "invalid" : undefined}>
      <span>{label}</span>
      <input type="number" inputMode="decimal" min={min} step={step} value={text} aria-invalid={parsed === null || undefined} onChange={(event) => {
        setText(event.target.value);
        const next = positive(event.target.value);
        if (next !== null) onCommit(next);
      }} />
    </label>
  );
}

function MealEditorCard({ lang, item, patchMeal, removeMeal }: { lang: Lang; item: MealEntry; patchMeal: (id: string, patch: Partial<MealEntry>) => void; removeMeal: (id: string) => void }) {
  // Entries saved before v2.6 may point at foods that are hidden now; keep them visible and editable.
  const isRetired = !FOODS.some((food) => food.id === item.foodId);
  const selectFood = (foodId: string) => {
    const food = FOODS.find((candidate) => candidate.id === foodId) ?? FOODS[0];
    const kcal = Math.round(food.kcal * item.grams) / 100;
    // A piece weight belongs to the food it was chosen for.
    patchMeal(item.id, { foodId: food.id, nameZh: food.zh, nameEn: food.en, kcalPer100G: food.kcal, kcal, pieceGrams: undefined });
  };
  const changeGrams = (value: number) => {
    const grams = Math.min(3000, Math.max(1, value));
    patchMeal(item.id, { grams, kcal: Math.round(item.kcalPer100G * grams) / 100 });
  };
  const { portions } = useUserPrefs();
  const catalogFood = FOODS.find((food) => food.id === item.foodId);
  const portion = catalogFood ? { id: catalogFood.id, preparationZh: catalogFood.preparationZh, servingGrams: catalogFood.servingGrams, kcalPer100: catalogFood.kcal } : null;
  const perPiece = portion && soldByPiece(portion) ? item.pieceGrams ?? pieceWeight(portion, portions) : null;
  return <section className="editor-card">
    <div className="editor-card-top"><label className="check-control"><input type="checkbox" checked={item.completed} onChange={(event) => patchMeal(item.id, { completed: event.target.checked })} /><span><CheckIcon /></span>{lang === "zh" ? "已完成" : "Done"}</label><button className="delete-button" onClick={() => removeMeal(item.id)} aria-label={lang === "zh" ? "删除食物" : "Delete food"}><TrashIcon /></button></div>
    <label><span>{lang === "zh" ? "餐次" : "Meal"}</span><select value={item.slot} onChange={(event) => patchMeal(item.id, { slot: event.target.value as MealSlot })}>{MEAL_SLOTS.map((slot) => <option key={slot.id} value={slot.id}>{localizedLabel(slot, lang)}</option>)}</select></label>
    <label><span>{lang === "zh" ? "食物" : "Food"}</span><select value={item.foodId} onChange={(event) => selectFood(event.target.value)}>{isRetired ? <option value={item.foodId} disabled>{localizedLabel({ zh: item.nameZh, en: item.nameEn }, lang)}（{lang === "zh" ? "已下架，请重新选择" : "no longer listed, please choose again"}）</option> : null}{FOODS.map((food) => <option key={food.id} value={food.id}>{localizedLabel(food, lang)} · {food.kcal} kcal/100g</option>)}</select></label>
    <div className="editor-grid">
      {perPiece ? <PositiveNumberField label={lang === "zh" ? `份数（每串/个约 ${perPiece} g）` : `Pieces (≈ ${perPiece} g each)`} min="0.5" step="0.5" value={Math.round(item.grams / perPiece * 100) / 100} onCommit={(pieces) => changeGrams(pieces * perPiece)} /> : null}
      <PositiveNumberField label={lang === "zh" ? "重量（克）" : "Weight (g)"} min="1" step="1" value={item.grams} onCommit={changeGrams} />
      <div className="editor-total"><span>{lang === "zh" ? "本项热量" : "Calories"}</span><strong>{Math.round(item.kcal)}</strong><small>kcal</small></div>
    </div>
  </section>;
}

export function WorkoutEditorScreen({ lang, weekStart, date }: { lang: Lang; weekStart: string; date: string }) {
  const { getWeek, updateDay } = usePlanner();
  const { body } = useProfile();
  const day = dayFor(getWeek(weekStart).days.find((item) => item.date === date), date);

  const replaceWorkout = (entry: WorkoutEntry) => updateDay(weekStart, date, (current) => ({ ...current, workouts: current.workouts.map((item) => item.id === entry.id ? entry : item) }));
  const removeWorkout = (id: string) => updateDay(weekStart, date, (current) => ({ ...current, workouts: current.workouts.filter((item) => item.id !== id) }));
  const addWorkout = () => {
    if (!body) return;
    const exercise = EXERCISES[0];
    const draft = draftFor(exercise);
    const estimate = estimateWorkout(exercise, draftToInput(draft), body);
    const entry = entryFromDraft(createEntryId("workout"), exercise, draft, body.weightKg, estimate);
    updateDay(weekStart, date, (current) => ({ ...current, workouts: [...current.workouts, entry] }));
  };

  return <MobileScroll className="app-screen mint-screen"><main className="page-content detail-pad editor-page">
    <div className="page-intro"><h1>{lang === "zh" ? "每日训练" : "Daily workouts"}</h1><p>{date} · {lang === "zh" ? "每个动作单独估算，周报汇总训练额外消耗" : "Each exercise is estimated separately; the report adds up the extra energy"}</p></div>
    {!body ? <>
      <p className="wk-profile-missing">{lang === "zh" ? "训练估算需要你的身高、体重、年龄和性别。填好后才能添加训练动作。" : "Workout estimates need your height, weight, age and sex. Fill them in to add exercises."}</p>
      <ProfileCard lang={lang} />
    </> : null}
    <div className="editor-list">
      {body ? day.workouts.map((item) => <WorkoutEntryCard key={item.id} lang={lang} date={date} entry={item} body={body} onChange={replaceWorkout} onRemove={removeWorkout} />) : null}
      {body && !day.workouts.length ? <div className="editor-empty">{lang === "zh" ? "还没有训练动作，点击下方按钮开始添加。" : "No workouts yet. Add the first one below."}</div> : null}
    </div>
    {body ? <button className="primary-action" onClick={addWorkout}><PlusIcon />{lang === "zh" ? "添加训练动作" : "Add exercise"}</button> : null}
  </main></MobileScroll>;
}

function validBodyWeight(text: string) {
  const value = Number(text);
  return text.trim() !== "" && Number.isFinite(value) && value >= PROFILE_LIMITS.weightKg.min && value <= PROFILE_LIMITS.weightKg.max ? value : null;
}

function WorkoutEntryCard({ lang, date, entry, body, onChange, onRemove }: { lang: Lang; date: string; entry: WorkoutEntry; body: BodyProfile; onChange: (entry: WorkoutEntry) => void; onRemove: (id: string) => void }) {
  const zh = lang === "zh";
  // The exercise is local state, so changing it is not undone while another field is still invalid.
  const [exerciseId, setExerciseId] = useState(entry.exerciseId);
  const exercise = findExercise(exerciseId);
  const [draft, setDraft] = useState<WorkoutDraft>(() => entryToDraft(entry));
  const [bodyWeight, setBodyWeight] = useState(String(entry.bodyWeight));
  const fromNewerVersion = entry.modelVersion > WORKOUT_MODEL_VERSION;

  const recompute = (nextExercise: Exercise | undefined, nextDraft: WorkoutDraft, weightText: string) => {
    // Keep the last valid numbers while something is being typed; the card says they are not updated.
    const weight = validBodyWeight(weightText);
    if (!nextExercise || weight === null || draftProblems(nextExercise, nextDraft).length) return;
    const estimate = estimateWorkout(nextExercise, draftToInput(nextDraft), { ...body, weightKg: weight });
    // Fields written by a newer app version are kept; every field this version knows is rewritten.
    onChange(withHeartRateSource(entry, { ...entry, ...entryFromDraft(entry.id, nextExercise, nextDraft, weight, estimate, entry.completed) }));
  };
  const changeField = (field: DraftField, value: string) => {
    const next = { ...draft, [field]: value };
    setDraft(next);
    recompute(exercise, next, bodyWeight);
  };
  const changeExercise = (id: string) => {
    const nextExercise = findExercise(id);
    if (!nextExercise || id === exerciseId) return;
    const next = draftFor(nextExercise);
    setExerciseId(id);
    setDraft(next);
    recompute(nextExercise, next, bodyWeight);
  };
  const changeWeight = (value: string) => {
    setBodyWeight(value);
    recompute(exercise, draft, value);
  };

  const extra = { low: entry.burnLow, mid: entry.burnMid, high: entry.burnHigh };
  const top = <div className="editor-card-top"><label className="check-control"><input type="checkbox" checked={entry.completed} onChange={(event) => onChange(withCompletion(entry, event.target.checked))} /><span><CheckIcon /></span>{zh ? "已完成" : "Done"}</label><button className="delete-button" onClick={() => onRemove(entry.id)} aria-label={zh ? "删除训练动作" : "Delete exercise"}><TrashIcon /></button></div>;

  if (fromNewerVersion) {
    // Made by a newer app with a newer model: show it as stored, never recompute it with this older model.
    return <section className="editor-card" data-testid="workout-entry" data-readonly="true">
      {top}
      <div className="wk-entry-readonly"><strong>{localizedLabel({ zh: entry.nameZh || entry.exerciseId, en: entry.nameEn || entry.exerciseId }, lang)}</strong><small>{zh ? "这条记录由更新版本的燃卡快查创建，这里只显示、不重新计算；可以标记完成或删除。" : "Created by a newer version of Calorie Compass. It is shown as saved and not recalculated here; you can mark it done or delete it."}</small></div>
      <div className="wk-entry-result"><span>{zh ? "额外消耗（保存时的估算）" : "Extra energy (as saved)"}</span><strong>{formatRange(extra, lang)} kcal</strong></div>
    </section>;
  }

  const weightInvalid = validBodyWeight(bodyWeight) === null;
  const problems = exercise ? draftProblems(exercise, draft) : [];
  const stale = !exercise || weightInvalid || problems.length > 0;
  const total = entry.totalLow !== null && entry.totalHigh !== null ? { low: entry.totalLow, mid: (entry.totalLow + entry.totalHigh) / 2, high: entry.totalHigh } : null;
  return <section className="editor-card" data-testid="workout-entry">
    {top}
    <label><span>{zh ? "训练动作" : "Exercise"}</span><select value={exerciseId} onChange={(event) => changeExercise(event.target.value)}>
      {!exercise ? <option value={exerciseId} disabled>{localizedLabel({ zh: entry.nameZh || exerciseId, en: entry.nameEn || exerciseId }, lang)}（{zh ? "已下架，请重新选择" : "no longer listed, please choose again"}）</option> : null}
      {GROUPS.map((group) => <optgroup key={group.id} label={zh ? group.zh : group.en}>
        {EXERCISES.filter((candidate) => candidate.group === group.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{localizedLabel(candidate, lang)}</option>)}
      </optgroup>)}
    </select></label>
    {exercise ? <>
      <div className="editor-grid"><label className={weightInvalid ? "invalid" : undefined}><span>{zh ? "体重 kg（这次训练时）" : "Body weight kg (at the time)"}</span><input type="number" min={PROFILE_LIMITS.weightKg.min} max={PROFILE_LIMITS.weightKg.max} step="0.1" value={bodyWeight} aria-invalid={weightInvalid || undefined} onChange={(event) => changeWeight(event.target.value)} /></label></div>
      <WorkoutFields key={exercise.id} lang={lang} exercise={exercise} draft={draft} onChange={changeField} compact problems={problems} />
    </> : <p className="wk-profile-missing">{zh ? "这个动作已不在动作库里，保存的数值不会再重新计算。请选择一个动作重新填写。" : "This exercise is no longer in the library, so the saved numbers are not recalculated. Choose an exercise to enter it again."}</p>}
    <div className={stale ? "wk-entry-result stale" : "wk-entry-result"}>
      <span>{entry.headline === "total" ? (zh ? "额外消耗（不含静息）" : "Extra (excl. resting)") : (zh ? "训练部分（未含组间恢复与静息）" : "Training part (no rest recovery or resting)")}{stale ? <em className="wk-stale-badge">{zh ? "未更新" : "Not updated"}</em> : null}</span>
      <strong>{formatRange(extra, lang)} kcal</strong>
      {total ? <small>{zh ? `含静息代谢 ${formatRange(total, lang)} kcal · 约 ${entry.durationMinutes} 分钟` : `Incl. resting metabolism ${formatRange(total, lang)} kcal · about ${entry.durationMinutes} min`}</small> : null}
      {stale && exercise ? <small>{zh ? "显示的是上次有效输入的结果；把标红的数值改好后会重新计算。" : "These are the numbers from the last valid inputs; fix the highlighted values to recalculate."}</small> : null}
    </div>
    <EntryHealthNote lang={lang} entry={entry} date={date} />
  </section>;
}
