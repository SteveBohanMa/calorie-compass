// Small shared UI pieces for the app screens.
import { useEffect, useState, type ComponentProps, type ComponentType } from "react";
import {
  ArrowLeftIcon,
  CalendarIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  StopwatchIcon,
} from "@radix-ui/react-icons";
import type { Lang } from "../catalog";
import type { FlowControls } from "../mobile";
import { NativeBackFlow } from "../native/NativeBack";
import { COPY } from "./copy";

export type IconType = ComponentType<{ width?: number; height?: number }>;

export function ResilientImage({ fallback, onError, ...props }: ComponentProps<"img"> & { fallback: string }) {
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

export function label<T extends { zh: string; en: string }>(item: T, lang: Lang) {
  return lang === "zh" ? item.zh : item.en;
}

export function localizedSlash(value: string, lang: Lang) {
  const parts = value.split(" / ");
  return parts.length > 1 ? (lang === "zh" ? parts[0] : parts.slice(1).join(" / ")) : value;
}

export function DesktopInput(props: ComponentProps<"input">) {
  return <input {...props} />;
}

export function AppHeader({ title, lang, flow }: { title: string; lang: Lang; flow: FlowControls }) {
  return (
    <div className="app-header">
      <NativeBackFlow flow={flow} />
      <button className="icon-button back-button" onClick={flow.pop} aria-label={COPY[lang].back}>
        <ArrowLeftIcon width={20} height={20} />
      </button>
      <strong>{title}</strong>
      <span className="header-spacer" />
    </div>
  );
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return <div className="section-title"><div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div></div>;
}

export function MainNav({
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
