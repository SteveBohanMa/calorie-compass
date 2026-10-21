import { useEffect, useMemo, useState } from "react";
import {
  Cross2Icon,
  LightningBoltIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@radix-ui/react-icons";
import { FOODS, type Lang } from "../catalog";
import { MobileScroll } from "../mobile";
import { COPY } from "../app/copy";
import { COMPARE_FOODS_KEY, catalogToCompareFood, customToCompareFood, portionOf, readCustomFoods, readStoredList, type CompareFood } from "../app/foodStore";
import { DesktopInput, ResilientImage, label } from "../app/ui";
import { amountToGrams, chosenAmount, kcalForGrams, soldByPiece } from "../features/portion";
import { useUserPrefs } from "../features/UserPrefsContext";

function positiveAmount(text: string) {
  const value = Number(text);
  return text.trim() !== "" && Number.isFinite(value) && value > 0 ? value : null;
}

export function CompareScreen({ lang, selectedFoodId }: { lang: Lang; selectedFoodId?: string }) {
  const text = COPY[lang];
  const zh = lang === "zh";
  const prefs = useUserPrefs();
  const byPortion = prefs.portions.compareMode === "portion";
  const allFoods = useMemo<CompareFood[]>(() => [
    ...FOODS.map(catalogToCompareFood),
    ...readCustomFoods().map(customToCompareFood),
  ], []);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    // Ignore saved ids that no longer exist (e.g. foods hidden in v2.6) so the defaults still appear.
    const known = new Set(allFoods.map((food) => food.id));
    const stored = readStoredList<string>(COMPARE_FOODS_KEY).filter((id) => typeof id === "string" && known.has(id));
    const initial = stored.length ? stored : [FOODS[0].id, FOODS[1].id];
    return selectedFoodId && !initial.includes(selectedFoodId) ? [...initial, selectedFoodId] : initial;
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const items = selectedIds.map((id) => allFoods.find((food) => food.id === id)).filter((food): food is CompareFood => Boolean(food));
  /** The typed amount when it is being edited and not (yet) a valid number; such rows show no number or bar. */
  const invalidDraft = (food: CompareFood) => byPortion && drafts[food.id] !== undefined && positiveAmount(drafts[food.id]) === null;
  const shownKcal = (food: CompareFood) => {
    if (!byPortion) return food.kcal;
    const portion = portionOf(food);
    return kcalForGrams(food.kcal, amountToGrams(portion, chosenAmount(portion, prefs.portions), prefs.portions));
  };
  const max = Math.max(1, ...items.filter((food) => !invalidDraft(food)).map(shownKcal));
  const normalized = query.trim().toLowerCase();
  const results = allFoods.filter((food) => !selectedIds.includes(food.id) && `${food.zh} ${food.en}`.toLowerCase().includes(normalized)).slice(0, 40);

  useEffect(() => {
    window.localStorage.setItem(COMPARE_FOODS_KEY, JSON.stringify(selectedIds));
  }, [selectedIds]);

  const addFood = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current : [...current, id]);
    setQuery("");
    setPickerOpen(false);
  };

  const changeAmount = (food: CompareFood, value: string) => {
    setDrafts((current) => ({ ...current, [food.id]: value }));
    const parsed = positiveAmount(value);
    if (parsed !== null) prefs.setAmount(food.id, parsed);
  };

  return (
    <MobileScroll className="app-screen mint-screen">
      <main className="page-content detail-pad">
        <div className="page-intro"><h1>{text.compareTitle}</h1><p>{byPortion ? (zh ? "按你填写的份量比较（关东煮按串/个）" : "Compared by the portions you enter (oden per piece)") : text.compareHint}</p></div>
        <div className="segmented-control compare-mode" role="radiogroup" aria-label={zh ? "比较方式" : "Compare by"}>
          <button type="button" role="radio" aria-checked={!byPortion} className={!byPortion ? "active" : ""} onClick={() => prefs.setCompareMode("per100")}>{zh ? "每 100 克" : "Per 100 g"}</button>
          <button type="button" role="radio" aria-checked={byPortion} className={byPortion ? "active" : ""} onClick={() => prefs.setCompareMode("portion")}>{zh ? "按实际份量" : "By portion"}</button>
        </div>
        <button className="primary-action compare-add-button" onClick={() => setPickerOpen((open) => !open)}>
          {pickerOpen ? <Cross2Icon width={18} height={18} /> : <PlusIcon width={18} height={18} />}
          {pickerOpen ? (zh ? "收起选择" : "Close picker") : (zh ? "添加对比菜品" : "Add food to compare")}
        </button>
        {pickerOpen ? <section className="compare-picker">
          <div className="search-shell compact-search">
            <MagnifyingGlassIcon width={18} height={18} />
            <DesktopInput autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.searchHint} aria-label={text.searchHint} />
          </div>
          <div className="compare-picker-list">
            {results.map((food) => <button key={food.id} type="button" onClick={() => addFood(food.id)}>
              <ResilientImage src={food.image} fallback={food.fallbackImage} alt={label(food, lang)} draggable={false} />
              <span><strong>{label(food, lang)}</strong><small>{food.kcal} kcal / 100 g{food.custom ? ` · ${text.userData}` : ""}</small></span>
              <PlusIcon width={17} height={17} />
            </button>)}
            {!results.length ? <p>{zh ? "没有更多匹配菜品" : "No more matching foods"}</p> : null}
          </div>
        </section> : null}
        <section className="comparison-card">
          {items.map((food) => {
            const portion = portionOf(food);
            const piece = soldByPiece(portion);
            const amount = chosenAmount(portion, prefs.portions);
            const grams = amountToGrams(portion, amount, prefs.portions);
            const kcal = shownKcal(food);
            const invalid = invalidDraft(food);
            // Show the typed text only while it is invalid or still matches the stored amount (it may change elsewhere).
            const draft = drafts[food.id];
            const amountText = draft !== undefined && (invalid || positiveAmount(draft) === amount) ? draft : String(amount);
            return (
              <div className={invalid ? "compare-row invalid" : "compare-row"} key={food.id} data-testid="compare-row" data-invalid={invalid || undefined}>
                <ResilientImage src={food.image} fallback={food.fallbackImage} alt={label(food, lang)} draggable={false} />
                <div className="compare-main">
                  <span><b>{label(food, lang)}</b><em>{invalid ? (zh ? "请填写份量" : "Enter a portion") : `${Math.round(kcal)} kcal`}</em></span>
                  {invalid ? <i className="empty" /> : <i><u style={{ width: `${(kcal / max) * 100}%` }} /></i>}
                  {byPortion ? <label className="compare-amount">
                    <input type="number" inputMode="decimal" min="0" step={piece ? "0.5" : "1"} value={amountText} aria-invalid={invalid || undefined} onChange={(event) => changeAmount(food, event.target.value)} aria-label={zh ? `${food.zh} 的份量` : `Portion of ${food.en}`} />
                    <span>{piece ? (invalid ? (zh ? "串/个" : "pieces") : zh ? `串/个 ≈ ${Math.round(grams)} g` : `pieces ≈ ${Math.round(grams)} g`) : (zh ? "克" : "g")} · {food.kcal} kcal/100 g</span>
                  </label> : null}
                </div>
                <button className="compare-remove" onClick={() => setSelectedIds((current) => current.filter((id) => id !== food.id))} aria-label={zh ? `移除${food.zh}` : `Remove ${food.en}`}>
                  <Cross2Icon width={16} height={16} />
                </button>
              </div>
            );
          })}
          {!items.length ? <div className="empty-foods">{zh ? "请添加至少一道菜品开始对比" : "Add at least one food to start comparing"}</div> : null}
        </section>
        <div className="compare-note"><LightningBoltIcon width={17} height={17} /><span>{text.separateNote}</span></div>
      </main>
    </MobileScroll>
  );
}
