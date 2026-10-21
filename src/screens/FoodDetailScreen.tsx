import {
  BarChartIcon,
  HeartFilledIcon,
  HeartIcon,
} from "@radix-ui/react-icons";
import { hasVerifiedNutrients, type Food, type Lang } from "../catalog";
import { MobileScroll } from "../mobile";
import { COPY } from "../app/copy";
import type { Method } from "../app/methods";
import { ResilientImage, label, localizedSlash } from "../app/ui";
import { PortionCalculator } from "../features/PortionPanel";
import { soldByPiece } from "../features/portion";
import { useUserPrefs } from "../features/UserPrefsContext";

export function gradeLabel(grade: string, lang: Lang) {
  const text = COPY[lang];
  const meaning = grade === "A" ? text.gradeA : grade === "B" ? text.gradeB : grade === "C" ? text.gradeC : text.estimate;
  return `${grade} · ${meaning}`;
}

export function FoodDetailScreen({
  lang,
  method,
  food,
  onCompare,
}: {
  lang: Lang;
  method: Method;
  food: Food;
  onCompare: () => void;
}) {
  const text = COPY[lang];
  const prefs = useUserPrefs();
  const favorite = prefs.isFavorite(food.id);
  const kcal = food.kcal;
  const servingKcal = food.servingKcal;
  const preparation = lang === "zh" ? food.preparationZh : food.preparationEn;
  return (
    <MobileScroll className="app-screen mint-screen">
      <main className="page-content detail-pad">
        <div className="food-detail-image">
          <ResilientImage src={food.image} fallback={food.fallbackImage} alt={label(food, lang)} draggable={false} />
          <span className="method-chip">{preparation}</span>
        </div>

        <div className="food-detail-title">
          <div><span>{text.preparation} · {preparation}</span><h1>{label(food, lang)}</h1></div>
          <button type="button" className={favorite ? "favorite-button active" : "favorite-button"} aria-pressed={favorite} aria-label={lang === "zh" ? "收藏" : "Favorite"} title={favorite ? (lang === "zh" ? "已收藏，点击取消" : "Saved; click to remove") : (lang === "zh" ? "加入收藏" : "Add to favorites")} onClick={() => prefs.toggleFavorite(food.id)}>
            {favorite ? <HeartFilledIcon width={20} height={20} /> : <HeartIcon width={20} height={20} />}
          </button>
        </div>

        <section className="energy-card">
          <div><span>{text.per100}</span><strong>{kcal}</strong><small>kcal</small></div>
          <div><span>{soldByPiece({ id: food.id, preparationZh: food.preparationZh, servingGrams: food.servingGrams, kcalPer100: food.kcal }) ? (lang === "zh" ? `每串/个约 ${food.servingGrams} g` : `Per piece ≈ ${food.servingGrams} g`) : `${text.serving} · ${food.servingGrams} g`}</span><strong>{servingKcal}</strong><small>kcal</small></div>
        </section>

        <PortionCalculator lang={lang} food={food} />

        <section className="macro-card">
          {hasVerifiedNutrients(food) ? <>
            <div><span>{lang === "zh" ? "蛋白质" : "Protein"}</span><b>{food.protein} g / 100 g</b></div>
            <div><span>{lang === "zh" ? "碳水化合物" : "Carbohydrate"}</span><b>{food.carbohydrate} g / 100 g</b></div>
            <div><span>{lang === "zh" ? "脂肪" : "Fat"}</span><b>{food.fat} g / 100 g</b></div>
            <div><span>{lang === "zh" ? "膳食纤维" : "Fiber"}</span><b>{food.fiber} g / 100 g</b></div>
          </> : <div className="macro-pending">
            <span>{lang === "zh" ? "蛋白质 · 碳水 · 脂肪 · 纤维" : "Protein · carbs · fat · fiber"}</span>
            <b>{lang === "zh" ? "正在核对，暂不显示" : "Being verified, hidden for now"}</b>
          </div>}
          <div><span>{lang === "zh" ? "品牌/门店" : "Brand/store"}</span><b>{localizedSlash(food.brand, lang)}</b></div>
          <div><span>{lang === "zh" ? "千焦" : "Kilojoules"}</span><b>{Math.round(kcal * 4.184)} kJ</b></div>
          <div><span>{text.dataGrade}</span><b>{gradeLabel(food.grade, lang)}{food.includesBroth ? (lang === "zh" ? " · 含汤" : " · broth included") : food.includesSauce ? (lang === "zh" ? " · 含酱" : " · sauce included") : ""}</b></div>
          {food.noteZh ? <div><span>{text.note}</span><b className="food-note">{lang === "zh" ? food.noteZh : food.noteEn}</b></div> : null}
          <div><span>{text.source}</span><b>{lang === "zh" ? food.sourceZh : food.sourceEn}</b></div>
        </section>

        <div className="action-stack">
          <button className="primary-action" onClick={onCompare}><BarChartIcon width={18} height={18} />{text.addCompare}</button>
        </div>
      </main>
    </MobileScroll>
  );
}
