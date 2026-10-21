import { useEffect, useState } from "react";
import { CheckIcon, PlusIcon } from "@radix-ui/react-icons";
import type { Food, Lang } from "../catalog";
import { createEntryId, startOfWeekKey, toDateKey, usePlanner, type MealEntry, type MealSlot } from "../planner";
import { chosenAmount, kcalForGrams, pieceWeight, soldByPiece, type PortionFood } from "./portion";
import { useUserPrefs } from "./UserPrefsContext";
import "./features.css";

export function portionFood(food: Food): PortionFood {
  return { id: food.id, preparationZh: food.preparationZh, servingGrams: food.servingGrams, kcalPer100: food.kcal };
}

const MEAL_SLOTS: { id: MealSlot; zh: string; en: string }[] = [
  { id: "breakfast", zh: "早餐", en: "Breakfast" },
  { id: "lunch", zh: "午餐", en: "Lunch" },
  { id: "dinner", zh: "晚餐", en: "Dinner" },
  { id: "snack", zh: "加餐", en: "Snack" },
];

function guessSlot(now = new Date()): MealSlot {
  const hour = now.getHours();
  if (hour < 10) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

const number = (value: string) => {
  const parsed = Number(value);
  return value.trim() !== "" && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const grams1 = (value: number) => Math.round(value * 10) / 10;

/** The weekly plan accepts up to this many grams per entry (same limit as the meal editor). */
const MAX_MEAL_GRAMS = 3000;

/** Portion calculator on the food detail page: by weight, or by piece for oden (with an editable piece weight). */
export function PortionCalculator({ lang, food }: { lang: Lang; food: Food }) {
  const zh = lang === "zh";
  const prefs = useUserPrefs();
  const item = portionFood(food);
  const byPiece = soldByPiece(item);
  const storedAmount = chosenAmount(item, prefs.portions);
  const storedPiece = pieceWeight(item, prefs.portions);
  const [amountText, setAmountText] = useState(() => String(storedAmount));
  const [pieceText, setPieceText] = useState(() => String(storedPiece));
  const amount = number(amountText);
  const piece = number(pieceText);
  const grams = amount === null || (byPiece && piece === null) ? null : byPiece ? amount * piece! : amount;
  const kcal = grams === null ? null : kcalForGrams(food.kcal, grams);
  const [mealOpen, setMealOpen] = useState(false);

  // Follow changes made elsewhere (the comparison page, an imported backup) unless the text already says the same.
  useEffect(() => {
    setAmountText((current) => (number(current) === storedAmount ? current : String(storedAmount)));
  }, [storedAmount]);
  useEffect(() => {
    setPieceText((current) => (number(current) === storedPiece ? current : String(storedPiece)));
  }, [storedPiece]);

  // Invalid text (empty while retyping) is never saved, so the stored portion is not lost.
  const changeAmount = (value: string) => {
    setAmountText(value);
    const parsed = number(value);
    if (parsed !== null) prefs.setAmount(food.id, parsed);
  };
  const changePiece = (value: string) => {
    setPieceText(value);
    const parsed = number(value);
    if (parsed !== null) prefs.setPieceGrams(food.id, parsed !== food.servingGrams ? parsed : null);
  };

  const macro = (per100: number | null) => (per100 === null || grams === null ? null : grams1(per100 * grams / 100));

  return (
    <section className="portion-card" aria-label={zh ? "份量换算" : "Portion calculator"}>
      <div className="portion-heading"><strong>{zh ? "份量换算" : "Portion calculator"}</strong><small>{byPiece ? (zh ? "关东煮按串/个计，每份重量可改" : "Oden is counted per piece; the piece weight can be changed") : (zh ? "按实际吃的克数计算" : "Uses the grams you actually eat")}</small></div>
      <div className={byPiece ? "portion-inputs two" : "portion-inputs"}>
        <label><span>{byPiece ? (zh ? "份数（串/个）" : "Pieces") : (zh ? "重量（克）" : "Weight (g)")}</span><input name="portion-amount" type="number" inputMode="decimal" min="0" step={byPiece ? "0.5" : "1"} value={amountText} onChange={(event) => changeAmount(event.target.value)} /></label>
        {byPiece ? <label><span>{zh ? "每份约（克）" : "Grams per piece"}</span><input name="portion-piece" type="number" inputMode="decimal" min="0" step="1" value={pieceText} onChange={(event) => changePiece(event.target.value)} /></label> : null}
      </div>
      {grams !== null && kcal !== null ? <div className="portion-result" data-testid="portion-result">
        <div><span>{zh ? "这份热量" : "This portion"}</span><strong>{Math.round(kcal)}</strong><small>kcal · {Math.round(kcal * 4.184)} kJ</small></div>
        <ul>
          <li>{zh ? `重量 ${grams1(grams)} g` : `Weight ${grams1(grams)} g`}</li>
          {macro(food.protein) !== null ? <li>{zh ? `蛋白质 ${macro(food.protein)} g · 碳水 ${macro(food.carbohydrate)} g · 脂肪 ${macro(food.fat)} g` : `Protein ${macro(food.protein)} g · carbs ${macro(food.carbohydrate)} g · fat ${macro(food.fat)} g`}</li> : null}
          {byPiece ? <li>{zh ? `每份重量默认 ${food.servingGrams} g 为估算值，按实际大小改更准` : `The default ${food.servingGrams} g per piece is an estimate; adjust it to the real size`}</li> : null}
        </ul>
      </div> : <p className="portion-invalid">{zh ? "请填写大于 0 的数值" : "Enter a value above 0"}</p>}
      {grams !== null && grams > MAX_MEAL_GRAMS ? <p className="portion-invalid">{zh ? `一次最多记 ${MAX_MEAL_GRAMS} g，请分开记录` : `Up to ${MAX_MEAL_GRAMS} g per entry; split larger amounts`}</p> : null}
      {mealOpen && grams !== null && kcal !== null && grams <= MAX_MEAL_GRAMS
        ? <AddMealForm lang={lang} food={food} grams={grams} pieceGrams={byPiece ? piece : null} onDone={() => setMealOpen(false)} />
        : <button type="button" className="secondary-action use-data-button" disabled={grams === null || grams > MAX_MEAL_GRAMS} onClick={() => setMealOpen(true)}><PlusIcon width={18} height={18} />{zh ? "使用此数据：加入今天的饮食" : "Use this: add to today's meals"}</button>}
    </section>
  );
}

function AddMealForm({ lang, food, grams, pieceGrams, onDone }: { lang: Lang; food: Food; grams: number; pieceGrams: number | null; onDone: () => void }) {
  const zh = lang === "zh";
  const planner = usePlanner();
  const [slot, setSlot] = useState<MealSlot>(() => guessSlot());
  // What was actually added; the confirmation must not follow later edits of the calculator.
  const [added, setAdded] = useState<{ grams: number; slot: MealSlot } | null>(null);
  const add = () => {
    const today = new Date();
    const amount = grams1(grams);
    const entry: MealEntry = {
      id: createEntryId("meal"),
      slot,
      foodId: food.id,
      nameZh: food.zh,
      nameEn: food.en,
      grams: amount,
      kcalPer100G: food.kcal,
      kcal: Math.round(food.kcal * amount) / 100,
      // Kept for every oden item, so the plan keeps counting pieces even if the default weight changes later.
      ...(pieceGrams !== null ? { pieceGrams } : {}),
      completed: true,
    };
    planner.updateDay(startOfWeekKey(today), toDateKey(today), (day) => ({ ...day, meals: [...day.meals, entry] }));
    setAdded({ grams: amount, slot });
  };
  if (added) {
    const slotName = MEAL_SLOTS.find((item) => item.id === added.slot);
    return <div className="meal-added" role="status"><CheckIcon width={16} height={16} /><span>{zh ? `已加入今天的${slotName?.zh}（${added.grams} g），可在每周计划里修改。` : `Added to today's ${slotName?.en.toLowerCase()} (${added.grams} g). Edit it in the weekly plan.`}</span><button type="button" onClick={onDone}>{zh ? "好的" : "OK"}</button></div>;
  }
  return (
    <div className="meal-form">
      <span>{zh ? "加到哪一餐" : "Which meal"}</span>
      <div className="meal-slots" role="radiogroup" aria-label={zh ? "餐次" : "Meal"}>
        {MEAL_SLOTS.map((item) => <button key={item.id} type="button" role="radio" aria-checked={slot === item.id} className={slot === item.id ? "active" : ""} onClick={() => setSlot(item.id)}>{zh ? item.zh : item.en}</button>)}
      </div>
      <div className="meal-form-actions">
        <button type="button" className="primary-action" onClick={add}><CheckIcon width={17} height={17} />{zh ? "加入今天的饮食" : "Add to today"}</button>
        <button type="button" className="secondary-action" onClick={onDone}>{zh ? "取消" : "Cancel"}</button>
      </div>
      <small>{zh ? "记为已吃；在每周计划里可以改成计划中或删除。" : "Saved as eaten; change or delete it in the weekly plan."}</small>
    </div>
  );
}
