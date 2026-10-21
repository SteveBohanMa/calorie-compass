import {
  BarChartIcon,
  CalendarIcon,
  ChevronRightIcon,
  GlobeIcon,
  HeartIcon,
  LightningBoltIcon,
  MagnifyingGlassIcon,
  MixerHorizontalIcon,
  PersonIcon,
  ReaderIcon,
  StopwatchIcon,
} from "@radix-ui/react-icons";
import type { Lang } from "../catalog";
import { MobileScroll } from "../mobile";
import { startOfWeekKey, summarizeWeek, usePlanner } from "../planner";
import { COPY } from "../app/copy";

export function HomeScreen({
  lang,
  setLang,
  onLookup,
  onCompare,
  onMyData,
  onWorkout,
  onConverter,
  onPlan,
  onFavorites,
}: {
  lang: Lang;
  setLang: (lang: Lang) => void;
  onLookup: () => void;
  onCompare: () => void;
  onMyData: () => void;
  onWorkout: () => void;
  onConverter: () => void;
  onPlan: () => void;
  onFavorites: () => void;
}) {
  const text = COPY[lang];
  const { getWeek } = usePlanner();
  const weekSummary = summarizeWeek(getWeek(startOfWeekKey()));
  const weekItems = weekSummary.mealTotal + weekSummary.workoutTotal;
  const weekDone = weekSummary.mealCompleted + weekSummary.workoutCompleted;
  const planValue = weekItems ? `${Math.round(weekDone / weekItems * 100)}%` : (lang === "zh" ? "未安排" : "Not set");
  const reportValue = weekItems ? (lang === "zh" ? `${weekItems} 项记录` : `${weekItems} entries`) : (lang === "zh" ? "暂无记录" : "No entries");
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
          <button className="round-tool" onClick={onFavorites} aria-label={text.favorites} title={text.favorites}>
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
            <span><CalendarIcon width={16} height={16} /><small>{text.plan}</small><b>{planValue}</b></span>
            <span><ReaderIcon width={16} height={16} /><small>{text.report}</small><b>{reportValue}</b></span>
          </div>
        </button>
      </main>
    </MobileScroll>
  );
}
