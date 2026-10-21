import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  ArchiveIcon,
  CheckIcon,
  Cross2Icon,
  DownloadIcon,
  InfoCircledIcon,
  Pencil2Icon,
  PersonIcon,
  PlusIcon,
  TrashIcon,
  UploadIcon,
} from "@radix-ui/react-icons";
import type { Lang } from "../catalog";
import { MobileScroll } from "../mobile";
import { usePlanner } from "../planner";
import {
  CUSTOM_FOOD_IMAGE,
  MAX_BACKUP_BYTES,
  applyBackup,
  backupFileName,
  createBackupWithReport,
  parseBackup,
  serializeBackup,
  type BackupError,
  type BackupFile,
  type BackupSummary,
  type CustomFood,
} from "../userData";
import { COPY } from "../app/copy";
import { COMPARE_FOODS_KEY, customToCompareFood, readCustomFoods, readStoredList, storeCustomFoods } from "../app/foodStore";
import { DesktopInput, ResilientImage, label } from "../app/ui";
import { useUserPrefs } from "../features/UserPrefsContext";
import { useProfile } from "../workout/ProfileContext";

const BACKUP_ERROR_TEXT: Record<Lang, Record<BackupError | "too-large", string>> = {
  zh: {
    "invalid-json": "无法读取：这个文件不是有效的备份文件。",
    "not-a-backup": "这不是燃卡快查导出的备份文件。",
    "unsupported-version": "这个备份来自更新版本的燃卡快查，请先升级软件再导入。",
    "invalid-data": "备份内容不完整或已损坏，没有导入任何数据。",
    "too-large": "文件超过 5 MB，不是有效的备份文件。",
  },
  en: {
    "invalid-json": "This file could not be read as a backup.",
    "not-a-backup": "This is not a Calorie Compass backup file.",
    "unsupported-version": "This backup comes from a newer Calorie Compass. Please update the app first.",
    "invalid-data": "The backup is incomplete or damaged. Nothing was imported.",
    "too-large": "The file is larger than 5 MB and is not a valid backup.",
  },
};

function describeBackup(summary: BackupSummary, lang: Lang) {
  const base = lang === "zh"
    ? `自定义菜品 ${summary.customFoods} 道 · 对比列表 ${summary.compareFoods} 项 · 每周计划 ${summary.weeks} 周（饮食 ${summary.mealEntries} 条、训练 ${summary.workoutEntries} 条）${summary.profile ? " · 身体数据" : ""}${summary.favorites ? ` · 收藏 ${summary.favorites} 项` : ""}${summary.portions ? ` · 份量设置 ${summary.portions} 项` : ""}`
    : `${summary.customFoods} custom dishes · ${summary.compareFoods} compared foods · ${summary.weeks} planned weeks (${summary.mealEntries} meals, ${summary.workoutEntries} workouts)${summary.profile ? " · body data" : ""}${summary.favorites ? ` · ${summary.favorites} favorites` : ""}${summary.portions ? ` · ${summary.portions} saved portions` : ""}`;
  if (!summary.legacyWorkouts) return base;
  return lang === "zh"
    ? `${base}。另有 ${summary.legacyWorkouts} 条旧版（v2.8 之前）训练记录，按新算法要求不再导入。`
    : `${base}. ${summary.legacyWorkouts} workout entries from before v2.8 will not be imported (the new model replaces them).`;
}

function skippedNote(summary: BackupSummary, lang: Lang) {
  if (!summary.skipped) return "";
  return lang === "zh" ? `另有 ${summary.skipped} 条记录无法读取，已跳过。` : `${summary.skipped} unreadable entries were skipped.`;
}

export function MyDataScreen({ lang }: { lang: Lang }) {
  const text = COPY[lang];
  const zh = lang === "zh";
  const planner = usePlanner();
  const profileStore = useProfile();
  const userPrefs = useUserPrefs();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [backupStatus, setBackupStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pendingImport, setPendingImport] = useState<{ backup: BackupFile; summary: BackupSummary; fileName: string } | null>(null);
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

  const exportBackup = async () => {
    setPendingImport(null);
    const failed = { tone: "error" as const, text: zh ? "导出失败，请重试。" : "Export failed. Please try again." };
    try {
      const { backup, summary } = createBackupWithReport(window.localStorage);
      const json = serializeBackup(backup);
      const note = skippedNote(summary, lang);
      if (window.calorieCompass?.exportBackup) {
        const result = await window.calorieCompass.exportBackup(json, backupFileName());
        if (result.canceled) return;
        setBackupStatus(result.saved
          ? { tone: "ok", text: (zh ? `备份已保存：${result.filePath}` : `Backup saved: ${result.filePath}`) + (note ? ` ${note}` : "") }
          : failed);
        return;
      }
      const fileName = backupFileName(new Date(), "ascii");
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      setBackupStatus({ tone: "ok", text: (zh ? `已下载备份文件：${fileName}` : `Backup downloaded: ${fileName}`) + (note ? ` ${note}` : "") });
    } catch {
      setBackupStatus(failed);
    }
  };

  const readImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPendingImport(null);
    if (file.size > MAX_BACKUP_BYTES) {
      setBackupStatus({ tone: "error", text: BACKUP_ERROR_TEXT[lang]["too-large"] });
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setBackupStatus({ tone: "error", text: BACKUP_ERROR_TEXT[lang]["invalid-json"] });
      return;
    }
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      setBackupStatus({ tone: "error", text: BACKUP_ERROR_TEXT[lang][parsed.error] });
      return;
    }
    setBackupStatus(null);
    setPendingImport({ backup: parsed.backup, summary: parsed.summary, fileName: file.name });
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    try {
      applyBackup(window.localStorage, pendingImport.backup);
    } catch {
      setPendingImport(null);
      setBackupStatus({ tone: "error", text: zh ? "导入失败：无法写入本机存储，原有数据没有改变。" : "Import failed: this device's storage could not be written. Your data was not changed." });
      return;
    }
    planner.reloadFromStorage();
    profileStore.reload();
    userPrefs.reload();
    setItems(readCustomFoods());
    setFormOpen(false);
    setEditingId(null);
    setPendingImport(null);
    setBackupStatus({ tone: "ok", text: zh ? "导入完成，数据已恢复。" : "Import complete. Your data has been restored." });
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

        <section className="backup-card" aria-labelledby="backup-title">
          <div className="backup-heading">
            <span className="feature-icon sky"><ArchiveIcon width={19} height={19} /></span>
            <div>
              <strong id="backup-title">{zh ? "数据备份" : "Data backup"}</strong>
              <small>{zh ? "把自定义菜品、对比列表、每周计划、身体数据、收藏和份量设置导出成一个文件；换电脑或重装后可以导入恢复。" : "Save your custom dishes, comparison list, weekly plans, body data, favorites and portion settings to one file, then import it after reinstalling or on another computer."}</small>
            </div>
          </div>
          <div className="backup-actions">
            <button className="secondary-action backup-export-button" onClick={exportBackup}><DownloadIcon width={17} height={17} />{zh ? "导出备份" : "Export backup"}</button>
            <button className="secondary-action backup-import-button" onClick={() => importInputRef.current?.click()}><UploadIcon width={17} height={17} />{zh ? "导入备份" : "Import backup"}</button>
            <input ref={importInputRef} className="backup-file-input" type="file" accept=".json,application/json" onChange={readImportFile} hidden />
          </div>
          {pendingImport ? <div className="backup-confirm" role="group" aria-labelledby="backup-confirm-text">
            <p id="backup-confirm-text"><InfoCircledIcon width={16} height={16} /><span>{zh ? `即将导入「${pendingImport.fileName}」：` : `Ready to import "${pendingImport.fileName}":`}<b>{describeBackup(pendingImport.summary, lang)}</b>{skippedNote(pendingImport.summary, lang)}{zh ? "导入会替换本机上的这些数据。如需保留当前数据，请先导出一份备份。" : "This replaces the same data on this device. Export a backup first if you want to keep it."}</span></p>
            <div className="backup-actions">
              <button className="primary-action backup-confirm-button" onClick={confirmImport}><CheckIcon width={17} height={17} />{zh ? "确认导入" : "Import now"}</button>
              <button className="secondary-action backup-cancel-button" onClick={() => setPendingImport(null)}>{zh ? "取消" : "Cancel"}</button>
            </div>
          </div> : null}
          {backupStatus ? <p className={`backup-status ${backupStatus.tone}`} role="status">{backupStatus.text}</p> : null}
        </section>
      </main>
    </MobileScroll>
  );
}
