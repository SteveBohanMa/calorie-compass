import {
  ChevronRightIcon,
  HeartIcon,
} from "@radix-ui/react-icons";
import { FOODS, type Food, type Lang } from "../catalog";
import { MobileScroll } from "../mobile";
import { COPY } from "../app/copy";
import { ResilientImage, label } from "../app/ui";
import { useUserPrefs } from "../features/UserPrefsContext";

export function FavoritesScreen({ lang, onFood, onLookup }: { lang: Lang; onFood: (food: Food) => void; onLookup: () => void }) {
  const zh = lang === "zh";
  const prefs = useUserPrefs();
  const foods = prefs.favorites.map((id) => FOODS.find((food) => food.id === id)).filter((food): food is Food => Boolean(food));
  return (
    <MobileScroll className="app-screen mint-screen">
      <main className="page-content detail-pad">
        <div className="page-intro"><h1>{zh ? "我的收藏" : "My favorites"}</h1><p>{zh ? "在食物详情页点心形按钮即可收藏" : "Tap the heart on a food's page to save it here"}</p></div>
        <div className="food-list">
          {foods.map((food, index) => <button className="food-row" key={food.id} onClick={() => onFood(food)}>
            <span className="food-rank">{String(index + 1).padStart(2, "0")}</span>
            <ResilientImage src={food.image} fallback={food.fallbackImage} alt={label(food, lang)} draggable={false} />
            <span className="food-copy"><strong>{label(food, lang)}</strong><small>{zh ? food.preparationZh : food.preparationEn} · {COPY[lang].per100}</small></span>
            <span className="food-kcal"><b>{food.kcal}</b><small>kcal</small></span>
            <ChevronRightIcon width={17} height={17} />
          </button>)}
        </div>
        {!foods.length ? <div className="favorites-empty"><HeartIcon width={22} height={22} /><span>{zh ? "还没有收藏的食物。" : "No favorites yet."}</span><button className="secondary-action" onClick={onLookup}>{zh ? "去热量快查" : "Open calorie lookup"}</button></div> : null}
      </main>
    </MobileScroll>
  );
}
