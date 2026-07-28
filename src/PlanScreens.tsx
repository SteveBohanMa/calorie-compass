import { useRef, useState } from "react";
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
import { EXERCISES, FOODS, estimateWorkout, localizedLabel, type Lang } from "./catalog";
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
      setExportState(result.saved
        ? (lang === "zh" ? "图片已保存" : "Image saved")
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
          <div className="report-stats"><span><small>{lang === "zh" ? "计划饮食摄入" : "Food intake"}</small><strong>{summary.intake.toLocaleString()}</strong><em>kcal</em></span><span><small>{lang === "zh" ? "计划训练消耗" : "Workout expenditure"}</small><strong>{summary.burn.toLocaleString()}</strong><em>kcal</em></span></div>
          <div className="report-days">
            {summary.days.map((day, index) => <div key={day.date}><span>{DAY_NAMES[lang][index]}</span><b>{day.intake}</b><small>{lang === "zh" ? "摄入" : "in"}</small><b>{day.burn}</b><small>{lang === "zh" ? "消耗" : "out"}</small></div>)}
          </div>
          <p>{lang === "zh" ? "饮食摄入与训练消耗分开显示，不计算热量缺口。训练消耗为估算值。" : "Food intake and workout expenditure are shown separately. Workout expenditure is estimated."}</p>
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

function MealEditorCard({ lang, item, patchMeal, removeMeal }: { lang: Lang; item: MealEntry; patchMeal: (id: string, patch: Partial<MealEntry>) => void; removeMeal: (id: string) => void }) {
  const selectFood = (foodId: string) => {
    const food = FOODS.find((candidate) => candidate.id === foodId) ?? FOODS[0];
    const kcal = Math.round(food.kcal * item.grams) / 100;
    patchMeal(item.id, { foodId: food.id, nameZh: food.zh, nameEn: food.en, kcalPer100G: food.kcal, kcal });
  };
  const changeGrams = (value: number) => {
    const grams = Math.min(3000, Math.max(1, value || 1));
    patchMeal(item.id, { grams, kcal: Math.round(item.kcalPer100G * grams) / 100 });
  };
  return <section className="editor-card">
    <div className="editor-card-top"><label className="check-control"><input type="checkbox" checked={item.completed} onChange={(event) => patchMeal(item.id, { completed: event.target.checked })} /><span><CheckIcon /></span>{lang === "zh" ? "已完成" : "Done"}</label><button className="delete-button" onClick={() => removeMeal(item.id)} aria-label={lang === "zh" ? "删除食物" : "Delete food"}><TrashIcon /></button></div>
    <label><span>{lang === "zh" ? "餐次" : "Meal"}</span><select value={item.slot} onChange={(event) => patchMeal(item.id, { slot: event.target.value as MealSlot })}>{MEAL_SLOTS.map((slot) => <option key={slot.id} value={slot.id}>{localizedLabel(slot, lang)}</option>)}</select></label>
    <label><span>{lang === "zh" ? "食物" : "Food"}</span><select value={item.foodId} onChange={(event) => selectFood(event.target.value)}>{FOODS.map((food) => <option key={food.id} value={food.id}>{localizedLabel(food, lang)} · {food.kcal} kcal/100g</option>)}</select></label>
    <div className="editor-grid"><label><span>{lang === "zh" ? "重量（克）" : "Weight (g)"}</span><input type="number" min="1" value={item.grams} onChange={(event) => changeGrams(Number(event.target.value))} /></label><div className="editor-total"><span>{lang === "zh" ? "本项热量" : "Calories"}</span><strong>{Math.round(item.kcal)}</strong><small>kcal</small></div></div>
  </section>;
}

export function WorkoutEditorScreen({ lang, weekStart, date }: { lang: Lang; weekStart: string; date: string }) {
  const { getWeek, updateDay } = usePlanner();
  const day = dayFor(getWeek(weekStart).days.find((item) => item.date === date), date);
  const recalculate = (entry: WorkoutEntry) => {
    const exercise = EXERCISES.find((candidate) => candidate.id === entry.exerciseId) ?? EXERCISES[0];
    const result = estimateWorkout({ exercise, bodyWeight: entry.bodyWeight, sets: entry.sets, reps: entry.reps, loadKg: entry.loadKg, duration: entry.durationMinutes || undefined });
    return { ...entry, nameZh: exercise.zh, nameEn: exercise.en, burnLow: result.grossLow, burnHigh: result.grossHigh };
  };
  const addWorkout = () => {
    const exercise = EXERCISES[0];
    const entry = recalculate({ id: createEntryId("workout"), exerciseId: exercise.id, nameZh: exercise.zh, nameEn: exercise.en, bodyWeight: 70, sets: 4, reps: 8, loadKg: 80, durationMinutes: 0, burnLow: 0, burnHigh: 0, completed: false });
    updateDay(weekStart, date, (current) => ({ ...current, workouts: [...current.workouts, entry] }));
  };
  const patchWorkout = (id: string, patch: Partial<WorkoutEntry>) => updateDay(weekStart, date, (current) => ({ ...current, workouts: current.workouts.map((item) => item.id === id ? recalculate({ ...item, ...patch }) : item) }));
  const removeWorkout = (id: string) => updateDay(weekStart, date, (current) => ({ ...current, workouts: current.workouts.filter((item) => item.id !== id) }));

  return <MobileScroll className="app-screen mint-screen"><main className="page-content detail-pad editor-page">
    <div className="page-intro"><h1>{lang === "zh" ? "每日训练" : "Daily workouts"}</h1><p>{date} · {lang === "zh" ? "每个动作单独估算并计入周报" : "Each exercise is estimated separately"}</p></div>
    <div className="editor-list">
      {day.workouts.map((item) => <section className="editor-card" key={item.id}>
        <div className="editor-card-top"><label className="check-control"><input type="checkbox" checked={item.completed} onChange={(event) => patchWorkout(item.id, { completed: event.target.checked })} /><span><CheckIcon /></span>{lang === "zh" ? "已完成" : "Done"}</label><button className="delete-button" onClick={() => removeWorkout(item.id)}><TrashIcon /></button></div>
        <label><span>{lang === "zh" ? "训练动作" : "Exercise"}</span><select value={item.exerciseId} onChange={(event) => patchWorkout(item.id, { exerciseId: event.target.value })}>{EXERCISES.map((exercise) => <option key={exercise.id} value={exercise.id}>{localizedLabel(exercise, lang)}</option>)}</select></label>
        <div className="editor-grid workout-editor-grid"><label><span>{lang === "zh" ? "体重 kg" : "Body kg"}</span><input type="number" value={item.bodyWeight} onChange={(event) => patchWorkout(item.id, { bodyWeight: Number(event.target.value) })} /></label><label><span>{lang === "zh" ? "负重 kg" : "Load kg"}</span><input type="number" value={item.loadKg} onChange={(event) => patchWorkout(item.id, { loadKg: Number(event.target.value) })} /></label><label><span>{lang === "zh" ? "组数" : "Sets"}</span><input type="number" value={item.sets} onChange={(event) => patchWorkout(item.id, { sets: Number(event.target.value) })} /></label><label><span>{lang === "zh" ? "每组次数" : "Reps"}</span><input type="number" value={item.reps} onChange={(event) => patchWorkout(item.id, { reps: Number(event.target.value) })} /></label><label><span>{lang === "zh" ? "时长（分钟，可选）" : "Minutes (optional)"}</span><input type="number" value={item.durationMinutes || ""} placeholder={lang === "zh" ? "自动推算" : "Auto"} onChange={(event) => patchWorkout(item.id, { durationMinutes: Number(event.target.value) })} /></label><div className="editor-total"><span>{lang === "zh" ? "预计消耗" : "Estimated burn"}</span><strong>{item.burnLow}–{item.burnHigh}</strong><small>kcal</small></div></div>
      </section>)}
      {!day.workouts.length ? <div className="editor-empty">{lang === "zh" ? "还没有训练动作，点击下方按钮开始添加。" : "No workouts yet. Add the first one below."}</div> : null}
    </div>
    <button className="primary-action" onClick={addWorkout}><PlusIcon />{lang === "zh" ? "添加训练动作" : "Add exercise"}</button>
  </main></MobileScroll>;
}
