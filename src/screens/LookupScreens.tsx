import { useState } from "react";
import {
  BarChartIcon,
  BookmarkIcon,
  ChevronRightIcon,
  DashboardIcon,
  HeartIcon,
  MagnifyingGlassIcon,
  PersonIcon,
} from "@radix-ui/react-icons";
import { FOODS, type Food, type Lang, type PrimaryNutrient } from "../catalog";
import { methodFallbackImage } from "../foodIcon";
import { Carousel, MobileScroll } from "../mobile";
import { COPY } from "../app/copy";
import { VISIBLE_METHODS, type Method } from "../app/methods";
import { DesktopInput, ResilientImage, SectionTitle, label, type IconType } from "../app/ui";

export function LookupScreen({
  lang,
  onMethod,
  onQuick,
  onSearch,
  onCompare,
  onMyData,
  onFavorites,
}: {
  lang: Lang;
  onMethod: (method: Method) => void;
  onQuick: (kind: "convenience" | "nutrition") => void;
  onSearch: (query: string) => void;
  onCompare: () => void;
  onMyData: () => void;
  onFavorites: () => void;
}) {
  const text = COPY[lang];
  const [query, setQuery] = useState("");
  const quickItems: { label: string; icon: IconType; action: () => void; tone: string }[] = [
    { label: text.convenience, icon: BookmarkIcon, action: () => onQuick("convenience"), tone: "mint" },
    { label: text.nutrition, icon: DashboardIcon, action: () => onQuick("nutrition"), tone: "lime" },
    { label: text.myData, icon: PersonIcon, action: onMyData, tone: "sky" },
    { label: text.compare, icon: BarChartIcon, action: onCompare, tone: "peach" },
    { label: text.favorites, icon: HeartIcon, action: onFavorites, tone: "mint" },
  ];

  return (
    <MobileScroll className="app-screen mint-screen">
      <main className="page-content">
        <form
          className="search-shell"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch(query);
          }}
        >
          <MagnifyingGlassIcon width={19} height={19} />
          <DesktopInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={text.searchHint}
            aria-label={text.searchHint}
          />
          <button type="submit" aria-label={text.open}><ChevronRightIcon width={18} height={18} /></button>
        </form>

        <section className="section-block">
          <SectionTitle title={text.quickAccess} />
          <Carousel ariaLabel={text.quickAccess} className="quick-carousel" contentClassName="quick-track">
            {quickItems.map((item) => {
              const Icon = item.icon;
              return (
                <button className={`quick-bubble ${item.tone}`} key={item.label} onClick={item.action}>
                  <span><Icon width={21} height={21} /></span>
                  <b>{item.label}</b>
                </button>
              );
            })}
          </Carousel>
        </section>

        <section className="section-block">
          <SectionTitle title={text.methods} subtitle={text.methodsSub} />
          <div className="method-grid">
            {VISIBLE_METHODS.map((method) => (
              <button className={`method-bubble ${method.tone}`} key={method.id} onClick={() => onMethod(method)}>
                <ResilientImage src={method.image} fallback={methodFallbackImage(method.id)} alt={label(method, lang)} draggable={false} />
                <span>{label(method, lang)}</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </MobileScroll>
  );
}

export function FoodListScreen({
  lang,
  method,
  contextTitle,
  foods,
  onFood,
}: {
  lang: Lang;
  method: Method;
  contextTitle?: string;
  foods: Food[];
  onFood: (food: Food) => void;
}) {
  const text = COPY[lang];
  const heroFood = contextTitle ? foods[0] : undefined;
  return (
    <MobileScroll className="app-screen mint-screen">
      <main className="page-content detail-pad">
        <div className="method-hero">
          <ResilientImage src={heroFood?.image ?? method.image} fallback={heroFood?.fallbackImage ?? methodFallbackImage(method.id)} alt={contextTitle ?? label(method, lang)} draggable={false} />
          <div className="method-hero-overlay" />
          <div className="method-hero-copy">
            <span>{contextTitle ? text.quickAccess : text.preparation}</span>
            <strong>{contextTitle ?? label(method, lang)}</strong>
            <small>{contextTitle ? text.allResults : text.popular}</small>
          </div>
        </div>

        {!contextTitle && (method.id === "braise" || method.id === "oden") ? (
          <p className="salt-tip" role="note">{method.id === "oden" ? text.saltOden : text.saltBraise}</p>
        ) : null}

        <SectionTitle title={text.results} subtitle={text.popular} />
        <div className="food-list">
          {foods.map((food, index) => {
            return (
              <button className="food-row" key={food.id} onClick={() => onFood(food)}>
                <span className="food-rank">{String(index + 1).padStart(2, "0")}</span>
                <ResilientImage src={food.image} fallback={food.fallbackImage} alt={label(food, lang)} draggable={false} />
                <span className="food-copy">
                  <strong>{label(food, lang)}{food.isFatLossPopular ? <em className="popular-badge">{lang === "zh" ? "减脂热门" : "Popular"}</em> : null}</strong>
                  <small>{lang === "zh" ? food.preparationZh : food.preparationEn} · {text.per100}</small>
                </span>
                <span className="food-kcal"><b>{food.kcal}</b><small>kcal</small></span>
                <ChevronRightIcon width={17} height={17} />
              </button>
            );
          })}
          {!foods.length ? <div className="empty-foods">{lang === "zh" ? "暂无符合条件的数据" : "No matching records"}</div> : null}
        </div>
      </main>
    </MobileScroll>
  );
}

const NUTRIENT_OPTIONS: { id: PrimaryNutrient; zh: string; en: string }[] = [
  { id: "protein", zh: "蛋白质", en: "Protein" },
  { id: "carbohydrate", zh: "碳水", en: "Carbohydrate" },
  { id: "fat", zh: "脂肪", en: "Fat" },
  { id: "fiber", zh: "膳食纤维", en: "Fiber" },
  { id: "mixed", zh: "综合", en: "Mixed" },
];

export function NutritionSourceScreen({ lang, onFood }: { lang: Lang; onFood: (food: Food) => void }) {
  const [active, setActive] = useState<PrimaryNutrient>("protein");
  const option = NUTRIENT_OPTIONS.find((item) => item.id === active) ?? NUTRIENT_OPTIONS[0];
  const foods = FOODS.filter((food) => food.primaryNutrient === active);
  const heroImage = foods[0]?.image ?? "/assets/food/chicken.jpg";
  const heroFallback = foods[0]?.fallbackImage ?? "/assets/food/chicken.jpg";
  return (
    <MobileScroll className="app-screen mint-screen">
      <main className="page-content detail-pad">
        <div className="method-hero nutrition-hero">
          <ResilientImage src={heroImage} fallback={heroFallback} alt={label(option, lang)} draggable={false} />
          <div className="method-hero-overlay" />
          <div className="method-hero-copy"><span>{lang === "zh" ? "快速入口" : "Quick access"}</span><strong>{lang === "zh" ? "主营养来源" : "Primary nutrition"}</strong><small>{label(option, lang)} · {foods.length} {lang === "zh" ? "种食物" : "foods"}</small></div>
        </div>
        <SectionTitle title={lang === "zh" ? "主营养来源" : "Primary nutrition"} subtitle={lang === "zh" ? "按食物的主要营养贡献分类" : "Grouped by the food's main nutrient contribution"} />
        <div className="nutrient-tabs" role="tablist" aria-label={lang === "zh" ? "主营养来源" : "Primary nutrient"}>
          {NUTRIENT_OPTIONS.map((item) => <button key={item.id} role="tab" aria-selected={active === item.id} className={active === item.id ? "active" : ""} onClick={() => setActive(item.id)}>{label(item, lang)}</button>)}
        </div>
        <div className="food-list">
          {foods.map((food, index) => <button className="food-row" key={food.id} onClick={() => onFood(food)}>
            <span className="food-rank">{String(index + 1).padStart(2, "0")}</span>
            <ResilientImage src={food.image} fallback={food.fallbackImage} alt={label(food, lang)} draggable={false} />
            <span className="food-copy"><strong>{label(food, lang)}{food.isFatLossPopular ? <em className="popular-badge">{lang === "zh" ? "减脂热门" : "Popular"}</em> : null}</strong><small>{label(option, lang)} · {COPY[lang].per100}</small></span>
            <span className="food-kcal"><b>{food.kcal}</b><small>kcal</small></span><ChevronRightIcon width={17} height={17} />
          </button>)}
          {!foods.length ? <div className="empty-foods">{lang === "zh" ? "暂无此分类食物" : "No foods in this category"}</div> : null}
        </div>
      </main>
    </MobileScroll>
  );
}
