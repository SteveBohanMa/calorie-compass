// Health Connect screens (v2.10): the heart-rate strip of the workout estimator, the My Data card, the
// weight offer and the notes in the weekly-plan editor. Nothing renders outside the Android app.
import { useEffect, useState, type ReactNode } from "react";
import { ExternalLinkIcon, HeartIcon, InfoCircledIcon, ReloadIcon } from "@radix-ui/react-icons";
import type { WorkoutEntry } from "../planner";
import { minutesAgo, sourceName, workoutWindow, type HeartRateReading, type Lang } from "./core";
import { HEALTH_COPY } from "./copy";
import { useHealth, type HealthToggle } from "./HealthContext";
import "./health.css";

export type HeartRatePhase = "idle" | "reading" | "filled" | "no-data" | "manual" | "denied" | "error";

/** Re-renders every half minute so "2 minutes ago" stays true while the screen is open. */
function useMinuteClock(active: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return undefined;
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

export function describeReading(reading: HeartRateReading, lang: Lang, now: Date) {
  const text = HEALTH_COPY[lang];
  return reading.kind === "current"
    ? text.hrCurrent(minutesAgo(reading.time, now), sourceName(reading.source, lang))
    : text.hrSession(reading.start, reading.end, sourceName(reading.source, lang));
}

/** The heart-rate strip under the strength fields of the workout estimator. */
export function HeartRateAssist({
  lang,
  connected,
  phase,
  reading,
  error,
  onConnect,
  onRead,
  onOpenSettings,
}: {
  lang: Lang;
  /** Reading heart rate is allowed. */
  connected: boolean;
  phase: HeartRatePhase;
  reading: HeartRateReading | null;
  error: string;
  onConnect: () => void;
  onRead: () => void;
  onOpenSettings: () => void;
}) {
  const text = HEALTH_COPY[lang];
  const now = useMinuteClock(phase === "filled" && reading?.kind === "current");
  const button = (label: string, action: () => void, icon: ReactNode = <ReloadIcon width={13} height={13} />) => (
    <button type="button" className="hc-button" onClick={action}>{icon}{label}</button>
  );

  let body: ReactNode;
  let action: ReactNode = null;
  if (phase === "denied") {
    body = <small className="hc-warn">{text.hrDenied}</small>;
    action = button(text.openSettings, onOpenSettings, <ExternalLinkIcon width={13} height={13} />);
  } else if (!connected) {
    body = <><strong>{text.hrConnectTitle}</strong><small>{text.hrConnectHint}</small></>;
    action = button(text.hrConnect, onConnect, <HeartIcon width={13} height={13} />);
  } else if (phase === "reading") {
    body = <small>{text.hrReading}</small>;
  } else if (phase === "filled" && reading) {
    body = <><strong>{text.hrValue(reading.bpm)}</strong><small>{describeReading(reading, lang, now)}</small></>;
    action = button(text.reread, onRead);
  } else if (phase === "no-data") {
    body = <small className="hc-warn">{text.hrNoData}</small>;
    action = button(text.reread, onRead);
  } else if (phase === "error") {
    body = <small className="hc-warn">{text.hrFailed(error)}</small>;
    action = button(text.reread, onRead);
  } else if (phase === "manual") {
    body = <small>{text.hrManual}</small>;
    action = button(text.readFromBand, onRead);
  } else {
    body = <strong>{text.hrConnectTitle}</strong>;
    action = button(text.readFromBand, onRead);
  }

  return (
    <section className="hc-assist" data-testid="hr-assist" data-phase={connected ? phase : phase === "denied" ? "denied" : "connect"} aria-live="polite">
      <span className="hc-icon"><HeartIcon width={16} height={16} /></span>
      <div>{body}</div>
      {action}
    </section>
  );
}

/** "Health Connect has a newer weight" with update / ignore. */
export function WeightOffer({ lang }: { lang: Lang }) {
  const text = HEALTH_COPY[lang];
  const { weightOffer, acceptWeight, ignoreWeight } = useHealth();
  const [failed, setFailed] = useState(false);
  if (!weightOffer) return null;
  return (
    <div className="hc-offer" role="status" data-testid="weight-offer">
      <span>{text.weightOffer(weightOffer.kg, weightOffer.time, sourceName(weightOffer.source, lang))}</span>
      <div className="hc-offer-actions">
        <button type="button" className="hc-button solid" onClick={() => setFailed(!acceptWeight())}>{text.weightUpdate}</button>
        <button type="button" className="hc-button" onClick={ignoreWeight}>{text.weightIgnore}</button>
      </div>
      {failed ? <small className="hc-warn">{text.weightUpdateFailed}</small> : null}
    </div>
  );
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={on ? "hc-switch on" : "hc-switch"} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

/** The Health Connect card of My Data (Android only). */
export function HealthConnectCard({ lang }: { lang: Lang }) {
  const text = HEALTH_COPY[lang];
  const health = useHealth();
  const [denied, setDenied] = useState<Partial<Record<HealthToggle | "heartRate", boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const { status, settings } = health;
  if (status === null || (!status.available && status.reason === "web")) return null;

  const heading = (
    <div className="backup-heading">
      <span className="feature-icon sky"><HeartIcon width={19} height={19} /></span>
      <div>
        <strong id="health-title">{text.cardTitle}</strong>
        <small>{text.cardIntro}</small>
      </div>
    </div>
  );
  if (!status.available) {
    return (
      <section className="backup-card hc-card" aria-labelledby="health-title" data-testid="health-card">
        {heading}
        <p className="hc-note">{text.unavailable[status.reason]}</p>
      </section>
    );
  }

  const toggle = async (key: HealthToggle, on: boolean) => {
    setBusy(true);
    const ok = await health.setToggle(key, on);
    setBusy(false);
    setDenied((current) => ({ ...current, [key]: on && !ok }));
  };
  const connectHeartRate = async () => {
    setBusy(true);
    const ok = await health.connect("heartRate");
    setBusy(false);
    setDenied((current) => ({ ...current, heartRate: !ok }));
  };
  const on = (key: HealthToggle) => settings[key] && health.allowed(key);
  const writtenCount = Object.values(health.sync).filter((item) => item.state === "written").length;
  const skippedCount = Object.values(health.sync).filter((item) => item.state === "skipped-overlap").length;

  const row = (key: HealthToggle | "heartRate", title: string, hint: string, control: ReactNode, extra?: ReactNode) => (
    <div className="hc-row" data-row={key}>
      <div>
        <strong>{title}</strong>
        <small>{hint}</small>
        {extra}
        {denied[key] ? <small className="hc-warn">{text.denied}</small> : null}
      </div>
      {control}
    </div>
  );

  const weightInfo = on("weight") && health.weight !== undefined
    ? (health.weightOffer
      ? <WeightOffer lang={lang} />
      : <small className="hc-value">{health.weight ? text.weightLatest(Math.round(health.weight.kg * 10) / 10, health.weight.time, sourceName(health.weight.source, lang)) : text.weightNone}</small>)
    : null;
  const restingInfo = on("restingHeartRate") && health.resting !== undefined
    ? <small className="hc-value" data-testid="resting-heart-rate">{health.resting ? text.resting(health.resting.latest.bpm, health.resting.latest.time, health.resting.average) : text.restingNone}</small>
    : null;
  const writeInfo = on("writeBack")
    ? <>
      <small className="hc-value" data-testid="write-back-status">{writtenCount || skippedCount ? text.writeBackCount(writtenCount, skippedCount) : text.writeBackSince}</small>
      {health.syncError ? <small className="hc-warn">{text.writeBackFailed(health.syncError)}</small> : null}
    </>
    : null;

  return (
    <section className="backup-card hc-card" aria-labelledby="health-title" data-testid="health-card" aria-busy={busy || undefined}>
      {heading}
      <div className="hc-rows">
        {row("heartRate", text.rowHeartRate, text.rowHeartRateHint, health.allowed("heartRate")
          ? <span className="hc-on">{text.enabled}</span>
          : <button type="button" className="hc-button" onClick={connectHeartRate}>{text.enable}</button>)}
        {row("weight", text.rowWeight, text.rowWeightHint, <Switch on={on("weight")} label={text.rowWeight} onChange={(next) => void toggle("weight", next)} />, weightInfo)}
        {row("restingHeartRate", text.rowResting, text.rowRestingHint, <Switch on={on("restingHeartRate")} label={text.rowResting} onChange={(next) => void toggle("restingHeartRate", next)} />, restingInfo)}
        {row("writeBack", text.rowWriteBack, text.rowWriteBackHint, <Switch on={on("writeBack")} label={text.rowWriteBack} onChange={(next) => void toggle("writeBack", next)} />, writeInfo)}
      </div>
      <div className="backup-actions">
        <button type="button" className="secondary-action" onClick={health.openSettings}><ExternalLinkIcon width={16} height={16} />{text.managePermissions}</button>
        <button type="button" className="secondary-action" aria-expanded={showPrivacy} onClick={() => setShowPrivacy((open) => !open)}><InfoCircledIcon width={16} height={16} />{text.privacy}</button>
      </div>
      {showPrivacy ? <p className="hc-note">{text.privacyText}</p> : null}
    </section>
  );
}

/** Heart-rate source and write-back state under an exercise in the weekly-plan editor. */
export function EntryHealthNote({ lang, entry, date }: { lang: Lang; entry: WorkoutEntry; date: string }) {
  const text = HEALTH_COPY[lang];
  const health = useHealth();
  const lines: string[] = [];
  if (entry.hrSource === "healthConnect" && entry.avgHr !== null) lines.push(text.entryHr(entry.avgHr));
  if (health.status?.available && health.settings.writeBack && entry.completed) {
    const item = health.sync[entry.id];
    if (item?.state === "written") lines.push(text.entryWritten);
    else if (item?.state === "skipped-overlap") lines.push(text.entrySkipped);
    else if (!workoutWindow(entry, date, new Date())) lines.push(text.entryNoTime);
  }
  if (!lines.length) return null;
  return <p className="hc-entry-note" data-testid="entry-health-note">{lines.join(" · ")}</p>;
}
