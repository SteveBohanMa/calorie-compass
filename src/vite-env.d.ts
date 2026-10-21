/// <reference types="vite/client" />

type DesktopSaveResult = { saved: boolean; canceled: boolean; filePath?: string; error?: string };

interface Window {
  calorieCompass?: {
    exportReport: (
      rect: { x: number; y: number; width: number; height: number },
      defaultName: string,
    ) => Promise<DesktopSaveResult>;
    exportBackup?: (json: string, defaultName: string) => Promise<DesktopSaveResult>;
  };
}
