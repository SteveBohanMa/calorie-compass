// Android app glue (v2.9). Pure logic only: no Capacitor imports, so the desktop build, the browser
// build and the tests can load this file. src/native/android.ts connects it to Capacitor.

export type SaveResult = { saved: boolean; canceled: boolean; filePath?: string; error?: string };

export type ReportRect = { x: number; y: number; width: number; height: number };

/**
 * The native plugin in android/app/src/main/java/.../CalorieCompassFilesPlugin.java
 * (template: scripts/android/native/). Rectangles are in CSS pixels; `scale` is the device pixel ratio.
 */
export type NativeFilesPlugin = {
  saveBackup(options: { json: string; fileName: string }): Promise<SaveResult>;
  saveReport(options: ReportRect & { scale: number; fileName: string }): Promise<SaveResult>;
};

export type DesktopApi = NonNullable<Window["calorieCompass"]>;

/** Window event sent when the Android app comes back to the foreground (src/native/android.ts). */
export const APP_RESUMED_EVENT = "calorie-compass:resumed";

const UNSAFE_FILE_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f]/g;

/** A file name without path separators or reserved characters that ends in `.extension`. */
export function safeFileName(name: string, extension: string) {
  const suffix = `.${extension}`;
  const cleaned = String(name ?? "")
    .replace(UNSAFE_FILE_CHARACTERS, "-")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .slice(0, 120);
  const base = cleaned || "calorie-compass";
  return base.toLowerCase().endsWith(suffix) ? base : `${base}${suffix}`;
}

function failure(error: unknown): SaveResult {
  return { saved: false, canceled: false, error: error instanceof Error ? error.message : String(error) };
}

function toSaveResult(value: unknown): SaveResult {
  if (!value || typeof value !== "object") return failure("No result from the app");
  const result = value as Partial<SaveResult>;
  return {
    saved: result.saved === true,
    canceled: result.canceled === true,
    ...(typeof result.filePath === "string" ? { filePath: result.filePath } : {}),
    ...(typeof result.error === "string" ? { error: result.error } : {}),
  };
}

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * window.calorieCompass for the Android app: the same contract as the Windows app's preload
 * (desktop/preload.cjs), so the screens keep a single export path. Never throws; failures come back
 * as `{ saved: false, error }` like on Windows.
 */
export function createAndroidDesktopApi(plugin: NativeFilesPlugin, pixelRatio: () => number): DesktopApi {
  return {
    exportReport: async (rect, defaultName) => {
      try {
        const scale = finite(pixelRatio(), 1);
        return toSaveResult(await plugin.saveReport({
          x: Math.max(0, finite(rect.x, 0)),
          y: Math.max(0, finite(rect.y, 0)),
          width: Math.max(1, finite(rect.width, 1)),
          height: Math.max(1, finite(rect.height, 1)),
          scale: scale > 0 ? scale : 1,
          fileName: safeFileName(defaultName, "png"),
        }));
      } catch (error) {
        return failure(error);
      }
    },
    exportBackup: async (json, defaultName) => {
      try {
        return toSaveResult(await plugin.saveBackup({ json, fileName: safeFileName(defaultName, "json") }));
      } catch (error) {
        return failure(error);
      }
    },
  };
}

export type BackTarget = { canGoBack: boolean; pop: () => void };
export type BackOutcome = "overlay" | "pop" | "exit";

export type BackController = {
  /** The screen stack that is showing; set by <NativeBackFlow> in every header and the home footer. */
  setFlow: (flow: BackTarget | null) => void;
  /** Registers something the back button should close first. Returns the unregister function. */
  pushOverlay: (close: () => void, isActive?: () => boolean) => () => void;
  /** What the app does when Android's back button or back gesture is used. */
  handleBack: () => BackOutcome;
  /** Called when there is nothing left to close or pop (the Android app moves to the background). */
  setExit: (exit: () => void) => void;
};

export function createBackController(): BackController {
  let flow: BackTarget | null = null;
  let exit: () => void = () => undefined;
  const overlays: { close: () => void; isActive: () => boolean }[] = [];

  return {
    setFlow: (next) => {
      flow = next;
    },
    pushOverlay: (close, isActive = () => true) => {
      const entry = { close, isActive };
      overlays.push(entry);
      return () => {
        const index = overlays.lastIndexOf(entry);
        if (index >= 0) overlays.splice(index, 1);
      };
    },
    handleBack: () => {
      for (let index = overlays.length - 1; index >= 0; index -= 1) {
        const overlay = overlays[index];
        if (overlay.isActive()) {
          overlay.close();
          return "overlay";
        }
      }
      if (flow?.canGoBack) {
        flow.pop();
        return "pop";
      }
      exit();
      return "exit";
    },
    setExit: (next) => {
      exit = next;
    },
  };
}

/** The app-wide controller used by the Android back button (src/native/android.ts). */
export const nativeBack = createBackController();
