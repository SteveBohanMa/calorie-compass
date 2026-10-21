// App shell: providers and screen navigation. Screens live in src/screens/, shared pieces in src/app/.
import { useMemo, useState } from "react";
import { FOODS, type Food, type Lang } from "./catalog";
import { FlowStack, type FlowScreen } from "./mobile";
import { PlannerProvider } from "./planner";
import { STORAGE_KEYS } from "./userData";
import { COPY } from "./app/copy";
import { METHOD_BY_ID, foodsForMethod, methodForFood, type Method } from "./app/methods";
import { AppHeader, MainNav } from "./app/ui";
import { CompareScreen } from "./screens/CompareScreen";
import { ConverterScreen } from "./screens/ConverterScreen";
import { FavoritesScreen } from "./screens/FavoritesScreen";
import { FoodDetailScreen } from "./screens/FoodDetailScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { FoodListScreen, LookupScreen, NutritionSourceScreen } from "./screens/LookupScreens";
import { MyDataScreen } from "./screens/MyDataScreen";
import { MealEditorScreen, PlanScreen, WorkoutEditorScreen } from "./PlanScreens";
import { UserPrefsProvider } from "./features/UserPrefsContext";
import "./features/features.css";
import { ProfileProvider } from "./workout/ProfileContext";
import { WorkoutScreen } from "./workout/WorkoutScreen";

export default function Prototype() {
  const [lang, setLang] = useState<Lang>(() =>
    window.localStorage.getItem(STORAGE_KEYS.language) === "en" ? "en" : "zh",
  );

  const updateLanguage = (next: Lang) => {
    window.localStorage.setItem(STORAGE_KEYS.language, next);
    setLang(next);
  };

  const initial = useMemo(() => makeHomeScreen(lang, updateLanguage), [lang]);
  return <ProfileProvider><UserPrefsProvider><PlannerProvider><FlowStack key={lang} initial={initial} frameless /></PlannerProvider></UserPrefsProvider></ProfileProvider>;
}

function makeHomeScreen(lang: Lang, setLang: (lang: Lang) => void): FlowScreen {
  return {
    id: "home",
    footerHeight: 86,
    footer: (flow) => (
      <MainNav
        lang={lang}
        active="home"
        onHome={() => undefined}
        onLookup={() => flow.push(makeLookupScreen(lang))}
        onWorkout={() => flow.push(makeWorkoutScreen(lang))}
        onPlan={() => flow.push(makePlanScreen(lang))}
      />
    ),
    render: (flow) => (
      <HomeScreen
        lang={lang}
        setLang={setLang}
        onLookup={() => flow.push(makeLookupScreen(lang))}
        onCompare={() => flow.push(makeCompareScreen(lang))}
        onMyData={() => flow.push(makeMyDataScreen(lang))}
        onWorkout={() => flow.push(makeWorkoutScreen(lang))}
        onConverter={() => flow.push(makeConverterScreen(lang))}
        onPlan={() => flow.push(makePlanScreen(lang))}
        onFavorites={() => flow.push(makeFavoritesScreen(lang))}
      />
    ),
  };
}

function makeLookupScreen(lang: Lang): FlowScreen {
  const text = COPY[lang];
  return {
    id: "lookup",
    headerHeight: 62,
    header: (flow) => <AppHeader title={text.lookup} lang={lang} flow={flow} />,
    render: (flow) => (
      <LookupScreen
        lang={lang}
        onMethod={(method) => flow.push(makeFoodListScreen(lang, method))}
        onQuick={(kind) => flow.push(makeQuickFoodListScreen(lang, kind))}
        onSearch={(query) => flow.push(makeSearchFoodListScreen(lang, query))}
        onCompare={() => flow.push(makeCompareScreen(lang))}
        onMyData={() => flow.push(makeMyDataScreen(lang))}
        onFavorites={() => flow.push(makeFavoritesScreen(lang))}
      />
    ),
  };
}


function makeFavoritesScreen(lang: Lang): FlowScreen {
  const text = COPY[lang];
  return {
    id: "favorites",
    headerHeight: 62,
    header: (flow) => <AppHeader title={text.favorites} lang={lang} flow={flow} />,
    render: (flow) => <FavoritesScreen lang={lang} onFood={(food) => flow.push(makeFoodDetailScreen(lang, methodForFood(food), food))} onLookup={() => flow.push(makeLookupScreen(lang))} />,
  };
}

function makeQuickFoodListScreen(lang: Lang, kind: "convenience" | "nutrition"): FlowScreen {
  const text = COPY[lang];
  const method = kind === "convenience" ? METHOD_BY_ID.roast : METHOD_BY_ID.steam;
  const contextTitle = kind === "convenience" ? text.convenience : text.nutrition;
  return {
    id: `quick-${kind}`,
    headerHeight: 62,
    header: (flow) => <AppHeader title={contextTitle} lang={lang} flow={flow} />,
    render: (flow) => kind === "nutrition"
      ? <NutritionSourceScreen lang={lang} onFood={(food) => flow.push(makeFoodDetailScreen(lang, method, food))} />
      : <FoodListScreen lang={lang} method={method} contextTitle={contextTitle} foods={FOODS.filter((food) => food.category === "convenience")} onFood={(food) => flow.push(makeFoodDetailScreen(lang, method, food))} />,
  };
}

function makeFoodListScreen(lang: Lang, method: Method): FlowScreen {
  const text = COPY[lang];
  return {
    id: `foods-${method.id}`,
    headerHeight: 62,
    header: (flow) => <AppHeader title={text.results} lang={lang} flow={flow} />,
    render: (flow) => (
      <FoodListScreen
        lang={lang}
        method={method}
        foods={foodsForMethod(method)}
        onFood={(food) => flow.push(makeFoodDetailScreen(lang, method, food))}
      />
    ),
  };
}

function makeSearchFoodListScreen(lang: Lang, query: string): FlowScreen {
  const text = COPY[lang];
  const normalized = query.trim().toLowerCase();
  const foods = FOODS.filter((food) => `${food.zh} ${food.en} ${food.aliases}`.toLowerCase().includes(normalized));
  const method = METHOD_BY_ID.pan;
  return {
    id: `search-${normalized}`,
    headerHeight: 62,
    header: (flow) => <AppHeader title={text.results} lang={lang} flow={flow} />,
    render: (flow) => (
      <FoodListScreen
        lang={lang}
        method={method}
        contextTitle={query || text.allResults}
        foods={foods}
        onFood={(food) => flow.push(makeFoodDetailScreen(lang, method, food))}
      />
    ),
  };
}

function makeFoodDetailScreen(lang: Lang, method: Method, food: Food): FlowScreen {
  const text = COPY[lang];
  return {
    id: `food-${food.id}-${method.id}`,
    headerHeight: 62,
    header: (flow) => <AppHeader title={text.detail} lang={lang} flow={flow} />,
    render: (flow) => (
      <FoodDetailScreen
        lang={lang}
        method={method}
        food={food}
        onCompare={() => flow.push(makeCompareScreen(lang, food.id))}
      />
    ),
  };
}

function makeCompareScreen(lang: Lang, selectedFoodId?: string): FlowScreen {
  const text = COPY[lang];
  return {
    id: "compare",
    headerHeight: 62,
    header: (flow) => <AppHeader title={text.compareTitle} lang={lang} flow={flow} />,
    render: () => <CompareScreen lang={lang} selectedFoodId={selectedFoodId} />,
  };
}

function makeMyDataScreen(lang: Lang): FlowScreen {
  const text = COPY[lang];
  return {
    id: "my-data",
    headerHeight: 62,
    header: (flow) => <AppHeader title={text.customTitle} lang={lang} flow={flow} />,
    render: () => <MyDataScreen lang={lang} />,
  };
}

function makePlanScreen(lang: Lang): FlowScreen {
  const text = COPY[lang];
  return {
    id: "plan",
    headerHeight: 62,
    header: (flow) => <AppHeader title={text.weekly} lang={lang} flow={flow} />,
    render: (flow) => <PlanScreen lang={lang} onEditMeals={(weekStart, date) => flow.push(makeMealEditorScreen(lang, weekStart, date))} onEditWorkouts={(weekStart, date) => flow.push(makeWorkoutEditorScreen(lang, weekStart, date))} />,
  };
}

function makeMealEditorScreen(lang: Lang, weekStart: string, date: string): FlowScreen {
  return {
    id: `meal-editor-${date}`,
    headerHeight: 62,
    header: (flow) => <AppHeader title={lang === "zh" ? "编辑每日食谱" : "Edit daily meals"} lang={lang} flow={flow} />,
    render: () => <MealEditorScreen lang={lang} weekStart={weekStart} date={date} />,
  };
}

function makeWorkoutEditorScreen(lang: Lang, weekStart: string, date: string): FlowScreen {
  return {
    id: `workout-editor-${date}`,
    headerHeight: 62,
    header: (flow) => <AppHeader title={lang === "zh" ? "编辑训练动作" : "Edit workout actions"} lang={lang} flow={flow} />,
    render: () => <WorkoutEditorScreen lang={lang} weekStart={weekStart} date={date} />,
  };
}

function makeWorkoutScreen(lang: Lang): FlowScreen {
  const text = COPY[lang];
  return {
    id: "workout",
    headerHeight: 62,
    header: (flow) => <AppHeader title={text.workoutTitle} lang={lang} flow={flow} />,
    render: () => <WorkoutScreen lang={lang} />,
  };
}

function makeConverterScreen(lang: Lang): FlowScreen {
  const text = COPY[lang];
  return {
    id: "converter",
    headerHeight: 62,
    header: (flow) => <AppHeader title={text.converterTitle} lang={lang} flow={flow} />,
    render: () => <ConverterScreen lang={lang} />,
  };
}
