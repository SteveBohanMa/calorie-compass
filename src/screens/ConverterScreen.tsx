import { useState } from "react";
import {
  LightningBoltIcon,
} from "@radix-ui/react-icons";
import type { Lang } from "../catalog";
import { MobileScroll } from "../mobile";
import { COPY } from "../app/copy";
import { DesktopInput } from "../app/ui";

export function ConverterScreen({ lang }: { lang: Lang }) {
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
