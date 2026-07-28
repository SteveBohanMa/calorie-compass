import { useEffect, useMemo, useState, type ComponentProps, type ComponentType, type FormEvent } from "react";
import {
  ArrowLeftIcon,
  BarChartIcon,
  BookmarkIcon,
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  Cross2Icon,
  DashboardIcon,
  GearIcon,
  GlobeIcon,
  HeartIcon,
  HomeIcon,
  LightningBoltIcon,
  MagnifyingGlassIcon,
  MixerHorizontalIcon,
  PersonIcon,
  Pencil2Icon,
  PlusIcon,
  ReaderIcon,
  StopwatchIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import {
  Carousel,
  FlowStack,
  MobileScroll,
  type FlowControls,
  type FlowScreen,
} from "./mobile";
import {
  EXERCISES,
  FOODS,
  estimateWorkout,
  type Food,
  type Lang,
  type PrimaryNutrient,
  type WorkoutResult,
} from "./catalog";
import { MealEditorScreen, PlanScreen, WorkoutEditorScreen } from "./PlanScreens";
import { PlannerProvider } from "./planner";
import { methodFallbackImage } from "./foodIcon";

type IconType = ComponentType<{ width?: number; height?: number }>;

type Method = {
  id: string;
  zh: string;
  en: string;
  image: string;
  tone: "mint" | "lime" | "peach" | "sky";
};

type CustomFood = {
  id: string;
  nameZh: string;
  nameEn: string;
  kcalPer100G: number;
  servingWeightG: number;
  proteinPer100G: number;
  carbohydratePer100G: number;
  fatPer100G: number;
  fiberPer100G: number;
  image: string;
};

type CompareFood = {
  id: string;
  zh: string;
  en: string;
  kcal: number;
  image: string;
  fallbackImage: string;
  custom?: boolean;
};

const CUSTOM_FOODS_KEY = "calorie-compass-v2.5-custom-foods";
const COMPARE_FOODS_KEY = "calorie-compass-v2.5-compare-foods";
const CUSTOM_FOOD_IMAGE = "/assets/food/custom-dish.png";

function readStoredList<T>(key: string): T[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function readCustomFoods() {
  return readStoredList<CustomFood>(CUSTOM_FOODS_KEY);
}

function storeCustomFoods(items: CustomFood[]) {
  window.localStorage.setItem(CUSTOM_FOODS_KEY, JSON.stringify(items));
}

function customToCompareFood(food: CustomFood): CompareFood {
  return {
    id: food.id,
    zh: food.nameZh,
    en: food.nameEn || food.nameZh,
    kcal: food.kcalPer100G,
    image: food.image || CUSTOM_FOOD_IMAGE,
    fallbackImage: CUSTOM_FOOD_IMAGE,
    custom: true,
  };
}

function catalogToCompareFood(food: Food): CompareFood {
  return {
    id: food.id,
    zh: food.zh,
    en: food.en,
    kcal: food.kcal,
    image: food.image,
    fallbackImage: food.fallbackImage,
  };
}

function ResilientImage({ fallback, onError, ...props }: ComponentProps<"img"> & { fallback: string }) {
  const requestedSource = typeof props.src === "string" ? props.src : "";
  const [activeSource, setActiveSource] = useState(fallback || requestedSource);
  useEffect(() => {
    setActiveSource(fallback || requestedSource);
    if (!requestedSource || requestedSource === fallback) return undefined;
    let live = true;
    const image = new Image();
    image.onload = () => { if (live) setActiveSource(requestedSource); };
    image.onerror = () => { if (live) setActiveSource(fallback); };
    image.src = requestedSource;
    return () => { live = false; };
  }, [requestedSource, fallback]);
  const className = [props.className, activeSource === fallback ? "image-fallback" : ""].filter(Boolean).join(" ");
  return <img {...props} src={activeSource} className={className} onError={onError} />;
}


const COPY = {
  zh: {
    appName: "燃卡快查",
    appTag: "轻松查清每一口",
    greeting: "今天想了解什么？",
    greetingSub: "食物摄入与训练消耗分开记录，更清楚也更安心。",
    lookup: "热量快查",
    lookupSub: "按烹饪方式找到食物热量",
    compare: "热量对比",
    myData: "我的数据",
    favorites: "收藏",
    weekly: "每周计划与周报",
    plan: "每周计划",
    report: "本周周报",
    workout: "训练估算",
    converter: "单位换算",
    home: "首页",
    quick: "快查",
    training: "训练",
    planNav: "计划",
    searchHint: "搜索食材或菜品",
    quickAccess: "快速入口",
    convenience: "便利店食品",
    nutrition: "营养来源",
    methods: "选择烹饪方式",
    methodsSub: "先选做法，再挑具体食物",
    popular: "减脂期常用食材优先",
    results: "食物种类",
    allResults: "全部结果",
    per100: "每 100 克",
    serving: "常见一份",
    dataGrade: "数据说明",
    estimate: "通用估算值",
    addCompare: "加入热量对比",
    usedData: "使用此数据",
    detail: "热量详情",
    preparation: "烹饪方式",
    source: "数据来源",
    compareTitle: "热量对比",
    compareHint: "统一按每 100 克比较",
    customTitle: "我的热量数据",
    customHint: "自定义菜品仅保存在当前设备",
    customItem: "自制牛肉卷",
    userData: "用户数据",
    addFood: "添加菜品",
    planHint: "饮食计划与训练计划放在一起管理",
    meals: "饮食计划",
    sessions: "训练计划",
    complete: "完成",
    recorded: "已记录",
    weeklyIntake: "计划饮食摄入",
    weeklyBurn: "计划训练消耗",
    separateNote: "饮食摄入与训练消耗分开显示，不计算热量缺口。",
    workoutTitle: "训练消耗估算",
    weight: "体重（千克）",
    duration: "训练时长（分钟）",
    intensity: "训练强度",
    moderate: "中等强度",
    calculate: "开始估算",
    result: "预计训练消耗",
    resultNote: "估算值仅供记录参考",
    converterTitle: "热量单位换算",
    kcalInput: "千卡（kcal）",
    kjOutput: "千焦（kJ）",
    language: "语言",
    back: "返回",
    open: "打开",
    itemCount: "2 项",
  },
  en: {
    appName: "Calorie Compass",
    appTag: "Know every bite",
    greeting: "What would you like to check?",
    greetingSub: "Food intake and workout expenditure stay separate, clear, and easy to understand.",
    lookup: "Calorie lookup",
    lookupSub: "Find food energy by cooking method",
    compare: "Compare calories",
    myData: "My data",
    favorites: "Favorites",
    weekly: "Weekly plan & report",
    plan: "Weekly plan",
    report: "Weekly report",
    workout: "Workout estimate",
    converter: "Energy converter",
    home: "Home",
    quick: "Lookup",
    training: "Workout",
    planNav: "Plan",
    searchHint: "Search ingredients or dishes",
    quickAccess: "Quick access",
    convenience: "Convenience foods",
    nutrition: "Nutrition sources",
    methods: "Choose a cooking method",
    methodsSub: "Pick a method, then choose the food",
    popular: "Fat-loss staples shown first",
    results: "Food types",
    allResults: "All results",
    per100: "Per 100 g",
    serving: "Typical serving",
    dataGrade: "Data note",
    estimate: "General estimate",
    addCompare: "Add to comparison",
    usedData: "Use this data",
    detail: "Calorie details",
    preparation: "Cooking method",
    source: "Data source",
    compareTitle: "Calorie comparison",
    compareHint: "Compared on the same 100 g basis",
    customTitle: "My calorie data",
    customHint: "Custom dishes stay on this device",
    customItem: "Homemade beef wrap",
    userData: "User-provided",
    addFood: "Add dish",
    planHint: "Keep meal and workout plans together",
    meals: "Meal plan",
    sessions: "Workout plan",
    complete: "Complete",
    recorded: "Recorded",
    weeklyIntake: "Planned food intake",
    weeklyBurn: "Planned workout expenditure",
    separateNote: "Food intake and workout expenditure are shown separately. No calorie deficit is calculated.",
    workoutTitle: "Workout expenditure",
    weight: "Weight (kg)",
    duration: "Duration (minutes)",
    intensity: "Intensity",
    moderate: "Moderate",
    calculate: "Estimate now",
    result: "Estimated expenditure",
    resultNote: "Estimate for record-keeping only",
    converterTitle: "Energy converter",
    kcalInput: "Kilocalories (kcal)",
    kjOutput: "Kilojoules (kJ)",
    language: "Language",
    back: "Back",
    open: "Open",
    itemCount: "2 items",
  },
} as const;

const METHODS: Method[] = [
  { id: "pan", zh: "煎", en: "Pan-sear", image: "/assets/food/method-pan.jpg", tone: "mint" },
  { id: "deep", zh: "炸", en: "Deep-fry", image: "/assets/food/method-deep.jpg", tone: "peach" },
  { id: "stir", zh: "炒", en: "Stir-fry", image: "/assets/food/method-stir.jpg", tone: "lime" },
  { id: "steam", zh: "蒸", en: "Steam", image: "/assets/food/method-steam.jpg", tone: "sky" },
  { id: "boil", zh: "煮", en: "Boil", image: "/assets/food/method-boil.jpg", tone: "mint" },
  { id: "roast", zh: "烤", en: "Roast", image: "/assets/food/method-roast.jpg", tone: "peach" },
  { id: "braise", zh: "炖", en: "Braise", image: "/assets/food/method-braise.jpg", tone: "lime" },
  { id: "simmer", zh: "焖", en: "Simmer", image: "/assets/food/method-simmer.jpg", tone: "sky" },
  { id: "blanch", zh: "白灼", en: "Blanch", image: "/assets/food/method-blanch.jpg", tone: "mint" },
  { id: "raw", zh: "生食", en: "Raw", image: "/assets/food/method-raw.jpg", tone: "lime" },
  { id: "soup", zh: "汤煮", en: "Soup", image: "/assets/food/method-soup.jpg", tone: "sky" },
  { id: "microwave", zh: "微波", en: "Microwave", image: "/assets/food/method-microwave.jpg", tone: "peach" },
];

function label<T extends { zh: string; en: string }>(item: T, lang: Lang) {
  return lang === "zh" ? item.zh : item.en;
}

function localizedSlash(value: string, lang: Lang) {
  const parts = value.split(" / ");
  return parts.length > 1 ? (lang === "zh" ? parts[0] : parts.slice(1).join(" / ")) : value;
}

const METHOD_PREPARATIONS: Record<string, string[]> = {
  pan: ["煎"], deep: ["炸"], stir: ["清炒"], steam: ["蒸"], boil: ["水煮"],
  roast: ["烤", "烘焙"], braise: ["卤"], simmer: ["焖"], blanch: ["白灼"],
  raw: ["生食", "原味"], soup: ["关东煮"], microwave: ["微波"],
};

function foodsForMethod(method: Method) {
  const preparations = METHOD_PREPARATIONS[method.id] ?? [];
  return FOODS.filter((food) => preparations.includes(food.preparationZh));
}

function DesktopInput(props: ComponentProps<"input">) {
  return <input {...props} />;
}

export default function Prototype() {
  const [lang, setLang] = useState<Lang>(() =>
    window.localStorage.getItem("calorie-compass-language") === "en" ? "en" : "zh",
  );

  const updateLanguage = (next: Lang) => {
    window.localStorage.setItem("calorie-compass-language", next);
    setLang(next);
  };

  const initial = useMemo(() => makeHomeScreen(lang, updateLanguage), [lang]);
  return <PlannerProvider><FlowStack key={lang} initial={initial} frameless /></PlannerProvider>;
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
      />
    ),
  };
}

function makeQuickFoodListScreen(lang: Lang, kind: "convenience" | "nutrition"): FlowScreen {
  const text = COPY[lang];
  const method = kind === "convenience" ? METHODS[5] : METHODS[3];
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
  const method = METHODS[0];
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

function AppHeader({ title, lang, flow }: { title: string; lang: Lang; flow: FlowControls }) {
  return (
    <div className="app-header">
      <button className="icon-button back-button" onClick={flow.pop} aria-label={COPY[lang].back}>
        <ArrowLeftIcon width={20} height={20} />
      </button>
      <strong>{title}</strong>
      <span className="header-spacer" />
    </div>
  );
}

function HomeScreen({
  lang,
  setLang,
  onLookup,
  onCompare,
  onMyData,
  onWorkout,
  onConverter,
  onPlan,
}: {
  lang: Lang;
  setLang: (lang: Lang) => void;
  onLookup: () => void;
  onCompare: () => void;
  onMyData: () => void;
  onWorkout: () => void;
  onConverter: () => void;
  onPlan: () => void;
}) {
  const text = COPY[lang];
  return (
    <MobileScroll className="app-screen mint-screen">
      <main className="home-content screen-pad-bottom">
        <div className="brand-row">
          <div className="brand-lockup">
            <span className="brand-mark"><LightningBoltIcon width={18} height={18} /></span>
            <span><strong>{text.appName}</strong><small>{text.appTag}</small></span>
          </div>
          <button
            className="language-button"
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
            aria-label={text.language}
            title={text.language}
          >
            <GlobeIcon width={18} height={18} />
          </button>
        </div>

        <section className="welcome-block">
          <p className="eyebrow">{text.appTag}</p>
          <h1>{text.greeting}</h1>
          <p>{text.greetingSub}</p>
        </section>

        <button className="lookup-hero" onClick={onLookup}>
          <span className="hero-icon"><MagnifyingGlassIcon width={26} height={26} /></span>
          <span className="hero-copy"><strong>{text.lookup}</strong><small>{text.lookupSub}</small></span>
          <ChevronRightIcon width={20} height={20} />
          <span className="hero-orbit orbit-one" />
          <span className="hero-orbit orbit-two" />
        </button>

        <div className="lookup-tools" aria-label={text.quickAccess}>
          <button className="round-tool" onClick={onCompare} aria-label={text.compare} title={text.compare}>
            <BarChartIcon width={20} height={20} />
          </button>
          <button className="round-tool" onClick={onMyData} aria-label={text.myData} title={text.myData}>
            <PersonIcon width={20} height={20} />
          </button>
          <button className="round-tool" onClick={onLookup} aria-label={text.favorites} title={text.favorites}>
            <HeartIcon width={20} height={20} />
          </button>
        </div>

        <div className="mini-grid">
          <button className="feature-card" onClick={onWorkout}>
            <span className="feature-icon lime"><StopwatchIcon width={21} height={21} /></span>
            <strong>{text.workout}</strong>
            <ChevronRightIcon width={17} height={17} />
          </button>
          <button className="feature-card" onClick={onConverter}>
            <span className="feature-icon sky"><MixerHorizontalIcon width={21} height={21} /></span>
            <strong>{text.converter}</strong>
            <ChevronRightIcon width={17} height={17} />
          </button>
        </div>

        <button className="weekly-card" onClick={onPlan}>
          <div className="weekly-heading">
            <span className="feature-icon dark"><CalendarIcon width={21} height={21} /></span>
            <span><strong>{text.weekly}</strong><small>{text.planHint}</small></span>
            <ChevronRightIcon width={18} height={18} />
          </div>
          <div className="weekly-split">
            <span><CalendarIcon width={16} height={16} /><small>{text.plan}</small><b>68%</b></span>
            <span><ReaderIcon width={16} height={16} /><small>{text.report}</small><b>{text.recorded}</b></span>
          </div>
        </button>
      </main>
    </MobileScroll>
  );
}

function LookupScreen({
  lang,
  onMethod,
  onQuick,
  onSearch,
  onCompare,
  onMyData,
}: {
  lang: Lang;
  onMethod: (method: Method) => void;
  onQuick: (kind: "convenience" | "nutrition") => void;
  onSearch: (query: string) => void;
  onCompare: () => void;
  onMyData: () => void;
}) {
  const text = COPY[lang];
  const [query, setQuery] = useState("");
  const quickItems: { label: string; icon: IconType; action: () => void; tone: string }[] = [
    { label: text.convenience, icon: BookmarkIcon, action: () => onQuick("convenience"), tone: "mint" },
    { label: text.nutrition, icon: DashboardIcon, action: () => onQuick("nutrition"), tone: "lime" },
    { label: text.myData, icon: PersonIcon, action: onMyData, tone: "sky" },
    { label: text.compare, icon: BarChartIcon, action: onCompare, tone: "peach" },
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
            {METHODS.map((method) => (
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

function FoodListScreen({
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

function NutritionSourceScreen({ lang, onFood }: { lang: Lang; onFood: (food: Food) => void }) {
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

function FoodDetailScreen({
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
          <button aria-label={text.favorites}><HeartIcon width={20} height={20} /></button>
        </div>

        <section className="energy-card">
          <div><span>{text.per100}</span><strong>{kcal}</strong><small>kcal</small></div>
          <div><span>{text.serving} · {food.servingGrams} g</span><strong>{servingKcal}</strong><small>kcal</small></div>
        </section>

        <section className="macro-card">
          <div><span>{lang === "zh" ? "蛋白质" : "Protein"}</span><b>{food.protein} g / 100 g</b></div>
          <div><span>{lang === "zh" ? "碳水化合物" : "Carbohydrate"}</span><b>{food.carbohydrate} g / 100 g</b></div>
          <div><span>{lang === "zh" ? "脂肪" : "Fat"}</span><b>{food.fat} g / 100 g</b></div>
          <div><span>{lang === "zh" ? "膳食纤维" : "Fiber"}</span><b>{food.fiber} g / 100 g</b></div>
          <div><span>{lang === "zh" ? "品牌/门店" : "Brand/store"}</span><b>{localizedSlash(food.brand, lang)}</b></div>
          <div><span>{lang === "zh" ? "千焦" : "Kilojoules"}</span><b>{Math.round(kcal * 4.184)} kJ</b></div>
          <div><span>{text.dataGrade}</span><b>{food.grade} · {food.includesBroth ? (lang === "zh" ? "含汤" : "broth included") : food.includesSauce ? (lang === "zh" ? "含酱" : "sauce included") : text.estimate}</b></div>
          <div><span>{text.source}</span><b>{lang === "zh" ? food.sourceZh : food.sourceEn}</b></div>
        </section>

        <div className="action-stack">
          <button className="primary-action" onClick={onCompare}><BarChartIcon width={18} height={18} />{text.addCompare}</button>
          <button className="secondary-action"><PlusIcon width={18} height={18} />{text.usedData}</button>
        </div>
      </main>
    </MobileScroll>
  );
}

function CompareScreen({ lang, selectedFoodId }: { lang: Lang; selectedFoodId?: string }) {
  const text = COPY[lang];
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const stored = readStoredList<string>(COMPARE_FOODS_KEY).filter((id) => typeof id === "string");
    const initial = stored.length ? stored : [FOODS[0].id, FOODS[1].id];
    return selectedFoodId && !initial.includes(selectedFoodId) ? [...initial, selectedFoodId] : initial;
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const allFoods = useMemo<CompareFood[]>(() => [
    ...FOODS.map(catalogToCompareFood),
    ...readCustomFoods().map(customToCompareFood),
  ], []);
  const items = selectedIds.map((id) => allFoods.find((food) => food.id === id)).filter((food): food is CompareFood => Boolean(food));
  const max = Math.max(1, ...items.map((item) => item.kcal));
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

  return (
    <MobileScroll className="app-screen mint-screen">
      <main className="page-content detail-pad">
        <div className="page-intro"><h1>{text.compareTitle}</h1><p>{text.compareHint}</p></div>
        <button className="primary-action compare-add-button" onClick={() => setPickerOpen((open) => !open)}>
          {pickerOpen ? <Cross2Icon width={18} height={18} /> : <PlusIcon width={18} height={18} />}
          {pickerOpen ? (lang === "zh" ? "收起选择" : "Close picker") : (lang === "zh" ? "添加对比菜品" : "Add food to compare")}
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
            {!results.length ? <p>{lang === "zh" ? "没有更多匹配菜品" : "No more matching foods"}</p> : null}
          </div>
        </section> : null}
        <section className="comparison-card">
          {items.map((food) => (
            <div className="compare-row" key={food.id}>
              <ResilientImage src={food.image} fallback={food.fallbackImage} alt={label(food, lang)} draggable={false} />
              <div className="compare-main">
                <span><b>{label(food, lang)}</b><em>{food.kcal} kcal</em></span>
                <i><u style={{ width: `${(food.kcal / max) * 100}%` }} /></i>
              </div>
              <button className="compare-remove" onClick={() => setSelectedIds((current) => current.filter((id) => id !== food.id))} aria-label={lang === "zh" ? `移除${food.zh}` : `Remove ${food.en}`}>
                <Cross2Icon width={16} height={16} />
              </button>
            </div>
          ))}
          {!items.length ? <div className="empty-foods">{lang === "zh" ? "请添加至少一道菜品开始对比" : "Add at least one food to start comparing"}</div> : null}
        </section>
        <div className="compare-note"><LightningBoltIcon width={17} height={17} /><span>{text.separateNote}</span></div>
      </main>
    </MobileScroll>
  );
}

function MyDataScreen({ lang }: { lang: Lang }) {
  const text = COPY[lang];
  const [items, setItems] = useState<CustomFood[]>(readCustomFoods);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const emptyDraft = (): CustomFood => ({
    id: "",
    nameZh: "",
    nameEn: "",
    kcalPer100G: 0,
    servingWeightG: 100,
    proteinPer100G: 0,
    carbohydratePer100G: 0,
    fatPer100G: 0,
    fiberPer100G: 0,
    image: CUSTOM_FOOD_IMAGE,
  });
  const [draft, setDraft] = useState<CustomFood>(emptyDraft);

  const openNew = () => {
    setDraft(emptyDraft());
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (food: CustomFood) => {
    setDraft({ ...food });
    setEditingId(food.id);
    setFormOpen(true);
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    const nameZh = draft.nameZh.trim();
    const nameEn = draft.nameEn.trim();
    if (!nameZh && !nameEn) return;
    const nextFood = {
      ...draft,
      id: editingId ?? `custom-${crypto.randomUUID()}`,
      nameZh: nameZh || nameEn,
      nameEn: nameEn || nameZh,
      kcalPer100G: Math.max(0, Number(draft.kcalPer100G) || 0),
      servingWeightG: Math.max(1, Number(draft.servingWeightG) || 100),
    };
    const nextItems = editingId ? items.map((item) => item.id === editingId ? nextFood : item) : [nextFood, ...items];
    setItems(nextItems);
    storeCustomFoods(nextItems);
    setFormOpen(false);
    setEditingId(null);
  };

  const remove = (id: string) => {
    const nextItems = items.filter((item) => item.id !== id);
    setItems(nextItems);
    storeCustomFoods(nextItems);
    const compareIds = readStoredList<string>(COMPARE_FOODS_KEY).filter((item) => item !== id);
    window.localStorage.setItem(COMPARE_FOODS_KEY, JSON.stringify(compareIds));
  };

  const numberField = (key: keyof Pick<CustomFood, "kcalPer100G" | "servingWeightG" | "proteinPer100G" | "carbohydratePer100G" | "fatPer100G" | "fiberPer100G">, labelText: string, step = "0.1") => (
    <label><span>{labelText}</span><DesktopInput required={key === "kcalPer100G" || key === "servingWeightG"} type="number" min={key === "servingWeightG" ? 1 : 0} step={step} value={draft[key]} onChange={(event) => setDraft((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>
  );

  return (
    <MobileScroll className="app-screen mint-screen">
      <main className="page-content detail-pad">
        <div className="page-intro"><h1>{text.customTitle}</h1><p>{text.customHint}</p></div>
        {formOpen ? <form className="custom-editor" onSubmit={save}>
          <div className="custom-editor-heading"><strong>{editingId ? (lang === "zh" ? "修改自定义菜品" : "Edit custom dish") : text.addFood}</strong><button type="button" onClick={() => setFormOpen(false)} aria-label={lang === "zh" ? "关闭" : "Close"}><Cross2Icon width={17} height={17} /></button></div>
          <div className="custom-editor-grid names-grid">
            <label><span>{lang === "zh" ? "中文名称" : "Chinese name"}</span><DesktopInput value={draft.nameZh} onChange={(event) => setDraft((current) => ({ ...current, nameZh: event.target.value }))} placeholder={lang === "zh" ? "例如：自制牛肉卷" : "e.g. 自制牛肉卷"} /></label>
            <label><span>{lang === "zh" ? "英文名称" : "English name"}</span><DesktopInput value={draft.nameEn} onChange={(event) => setDraft((current) => ({ ...current, nameEn: event.target.value }))} placeholder="e.g. Homemade beef wrap" /></label>
          </div>
          <div className="custom-editor-grid">
            {numberField("kcalPer100G", lang === "zh" ? "每 100 克热量（kcal）" : "Calories per 100 g (kcal)", "1")}
            {numberField("servingWeightG", lang === "zh" ? "常见一份（克）" : "Typical serving (g)", "1")}
            {numberField("proteinPer100G", lang === "zh" ? "蛋白质（克/100克）" : "Protein (g/100g)")}
            {numberField("carbohydratePer100G", lang === "zh" ? "碳水（克/100克）" : "Carbs (g/100g)")}
            {numberField("fatPer100G", lang === "zh" ? "脂肪（克/100克）" : "Fat (g/100g)")}
            {numberField("fiberPer100G", lang === "zh" ? "膳食纤维（克/100克）" : "Fiber (g/100g)")}
          </div>
          <button className="primary-action" type="submit"><CheckIcon width={18} height={18} />{lang === "zh" ? "保存菜品" : "Save dish"}</button>
        </form> : <button className="primary-action custom-add-button" onClick={openNew}><PlusIcon width={18} height={18} />{text.addFood}</button>}

        <div className="custom-food-list">
          {items.map((food) => <article className="custom-row" key={food.id}>
            <ResilientImage src={food.image} fallback={CUSTOM_FOOD_IMAGE} alt={label(customToCompareFood(food), lang)} draggable={false} />
            <span><strong>{lang === "zh" ? food.nameZh : food.nameEn}</strong><small>{food.kcalPer100G} kcal / 100 g · {Math.round(food.kcalPer100G * food.servingWeightG / 100)} kcal / {food.servingWeightG} g</small></span>
            <span className="custom-actions">
              <button onClick={() => openEdit(food)} aria-label={lang === "zh" ? "修改" : "Edit"}><Pencil2Icon width={16} height={16} /></button>
              <button className="danger" onClick={() => remove(food.id)} aria-label={lang === "zh" ? "删除" : "Delete"}><TrashIcon width={16} height={16} /></button>
            </span>
          </article>)}
          {!items.length && !formOpen ? <div className="empty-foods custom-empty"><PersonIcon width={22} height={22} /><span>{lang === "zh" ? "还没有自定义菜品，点击上方按钮添加。" : "No custom dishes yet. Use the button above to add one."}</span></div> : null}
        </div>
      </main>
    </MobileScroll>
  );
}

function WorkoutScreen({ lang }: { lang: Lang }) {
  const text = COPY[lang];
  const [action, setAction] = useState(lang === "zh" ? "硬拉" : "Deadlift");
  const [weight, setWeight] = useState("70");
  const [sets, setSets] = useState("4");
  const [reps, setReps] = useState("8");
  const [load, setLoad] = useState("80");
  const [advanced, setAdvanced] = useState(false);
  const [duration, setDuration] = useState("");
  const [tempo, setTempo] = useState("5");
  const [rest, setRest] = useState("120");
  const [rpe, setRpe] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [result, setResult] = useState<WorkoutResult | null>(null);
  const exercise = EXERCISES.find((item) => item.zh === action || item.en === action)
    ?? EXERCISES.find((item) => `${item.zh} ${item.en} ${item.muscleZh} ${item.muscleEn} ${item.equipmentZh} ${item.equipmentEn}`.toLowerCase().includes(action.toLowerCase()))
    ?? EXERCISES[0];

  const chooseExercise = (value: string) => {
    setAction(value);
    const selected = EXERCISES.find((item) => item.zh === value || item.en === value);
    if (selected) {
      setTempo(String(selected.tempo));
      setRest(String(selected.rest));
    }
  };

  const calculate = () => {
    setResult(estimateWorkout({
      exercise,
      bodyWeight: Number(weight),
      sets: Number(sets),
      reps: Number(reps),
      loadKg: Number(load),
      duration: Number(duration) || undefined,
      tempo: Number(tempo) || undefined,
      rest: Number(rest),
      rpe: Number(rpe) || undefined,
      heartRate: Number(heartRate) || undefined,
    }));
  };
  return (
    <MobileScroll className="app-screen mint-screen">
      <main className="page-content detail-pad">
        <div className="page-intro"><h1>{text.workoutTitle}</h1><p>{text.resultNote}</p></div>
        <section className="form-card">
          <label><span>{lang === "zh" ? "动作（可搜索动作、肌群或器械）" : "Exercise (search exercise, muscle, or equipment)"}</span><DesktopInput list="exercise-options" value={action} onChange={(e) => chooseExercise(e.target.value)} /><datalist id="exercise-options">{EXERCISES.map((item) => <option key={item.id} value={lang === "zh" ? item.zh : item.en}>{lang === "zh" ? `${item.muscleZh} · ${item.equipmentZh} · ${item.patternZh}` : `${item.muscleEn} · ${item.equipmentEn} · ${item.patternEn}`}</option>)}</datalist></label>
          <div className="workout-grid">
            <label><span>{text.weight}</span><DesktopInput inputMode="decimal" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} /></label>
            <label><span>{lang === "zh" ? "负重（千克）" : "Load (kg)"}</span><DesktopInput inputMode="decimal" type="number" value={load} onChange={(e) => setLoad(e.target.value)} /></label>
            <label><span>{lang === "zh" ? "组数" : "Sets"}</span><DesktopInput inputMode="numeric" type="number" value={sets} onChange={(e) => setSets(e.target.value)} /></label>
            <label><span>{lang === "zh" ? "每组次数" : "Reps per set"}</span><DesktopInput inputMode="numeric" type="number" value={reps} onChange={(e) => setReps(e.target.value)} /></label>
          </div>
          <div className="exercise-summary"><span>{lang === "zh" ? exercise.muscleZh : exercise.muscleEn}</span><span>{lang === "zh" ? exercise.equipmentZh : exercise.equipmentEn}</span><span>{lang === "zh" ? exercise.patternZh : exercise.patternEn}</span><b>{exercise.met.toFixed(1)} MET</b></div>
          <button className="advanced-button" type="button" onClick={() => setAdvanced(!advanced)}>{advanced ? (lang === "zh" ? "收起高级参数" : "Hide advanced inputs") : (lang === "zh" ? "更多参数：时长、节奏、休息、RPE、心率" : "More: duration, tempo, rest, RPE, heart rate")}</button>
          {advanced ? <div className="advanced-fields workout-grid">
            <label><span>{text.duration}</span><DesktopInput inputMode="numeric" type="number" value={duration} placeholder={lang === "zh" ? "留空则自动推算" : "Leave blank to infer"} onChange={(e) => setDuration(e.target.value)} /></label>
            <label><span>{lang === "zh" ? "每次动作时长（秒）" : "Seconds per rep"}</span><DesktopInput type="number" value={tempo} onChange={(e) => setTempo(e.target.value)} /></label>
            <label><span>{lang === "zh" ? "组间休息（秒）" : "Rest between sets (sec)"}</span><DesktopInput type="number" value={rest} onChange={(e) => setRest(e.target.value)} /></label>
            <label><span>RPE（1–10）</span><DesktopInput type="number" value={rpe} onChange={(e) => setRpe(e.target.value)} /></label>
            <label><span>{lang === "zh" ? "平均心率（次/分）" : "Average heart rate (bpm)"}</span><DesktopInput type="number" value={heartRate} onChange={(e) => setHeartRate(e.target.value)} /></label>
          </div> : null}
        </section>
        <button className="primary-action" onClick={calculate}><LightningBoltIcon width={18} height={18} />{text.calculate}</button>
        {result ? <div className="result-card workout-result-card"><span>{text.result}</span><strong>{result.grossLow}–{result.grossHigh}</strong><small>kcal · {lang === "zh" ? "训练时段总能量" : "total session energy"}</small><div><span><b>{result.netLow}–{result.netHigh}</b><small>{lang === "zh" ? "相对静息额外消耗" : "extra above resting"}</small></span><span><b>{result.duration.toFixed(1)} min</b><small>{result.inferred ? (lang === "zh" ? "按组次、节奏和休息推算" : "inferred from sets, tempo, and rest") : (lang === "zh" ? "使用实填时长" : "using entered duration")}</small></span><span><b>{result.met.toFixed(1)} MET</b><small>{lang === "zh" ? "负重及强度修正后" : "after load/intensity adjustment"}</small></span></div><p>{lang === "zh" ? "RPE 与心率取较强信号，不重复叠加；结果仅供记录参考。" : "RPE and heart rate use the stronger signal without double counting. For record-keeping only."}</p></div> : null}
      </main>
    </MobileScroll>
  );
}

function ConverterScreen({ lang }: { lang: Lang }) {
  const text = COPY[lang];
  const [kcal, setKcal] = useState("200");
  const [kj, setKj] = useState("836.8");
  const formatEnergy = (value: number) => Number.isFinite(value) ? String(Number(value.toFixed(2))) : "";
  const changeKcal = (value: string) => {
    setKcal(value);
    setKj(value === "" ? "" : formatEnergy(Math.max(0, Number(value)) * 4.184));
  };
  const changeKj = (value: string) => {
    setKj(value);
    setKcal(value === "" ? "" : formatEnergy(Math.max(0, Number(value)) / 4.184));
  };
  return (
    <MobileScroll className="app-screen mint-screen">
      <main className="page-content detail-pad">
        <div className="page-intro"><h1>{text.converterTitle}</h1><p>1 kcal = 4.184 kJ</p></div>
        <section className="converter-card">
          <label><span>{lang === "zh" ? "大卡（kcal）" : "Kilocalories (kcal)"}</span><DesktopInput type="number" min="0" step="any" inputMode="decimal" value={kcal} onChange={(e) => changeKcal(e.target.value)} /></label>
          <div className="convert-arrow" aria-hidden="true"><LightningBoltIcon width={20} height={20} /></div>
          <label className="converter-result"><span>{lang === "zh" ? "千焦（kJ）" : "Kilojoules (kJ)"}</span><DesktopInput type="number" min="0" step="any" inputMode="decimal" value={kj} onChange={(e) => changeKj(e.target.value)} /></label>
        </section>
      </main>
    </MobileScroll>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return <div className="section-title"><div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div></div>;
}

function MainNav({
  lang,
  active,
  onHome,
  onLookup,
  onWorkout,
  onPlan,
}: {
  lang: Lang;
  active: "home" | "lookup" | "workout" | "plan";
  onHome: () => void;
  onLookup: () => void;
  onWorkout: () => void;
  onPlan: () => void;
}) {
  const text = COPY[lang];
  const nav: { id: typeof active; label: string; icon: IconType; action: () => void }[] = [
    { id: "home", label: text.home, icon: HomeIcon, action: onHome },
    { id: "lookup", label: text.quick, icon: MagnifyingGlassIcon, action: onLookup },
    { id: "workout", label: text.training, icon: StopwatchIcon, action: onWorkout },
    { id: "plan", label: text.planNav, icon: CalendarIcon, action: onPlan },
  ];
  return (
    <nav className="main-nav">
      {nav.map((item) => {
        const Icon = item.icon;
        return <button key={item.id} className={active === item.id ? "active" : ""} onClick={item.action}><Icon width={20} height={20} /><span>{item.label}</span></button>;
      })}
    </nav>
  );
}
