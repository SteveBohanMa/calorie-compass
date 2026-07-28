/// <reference types="vite/client" />

interface Window {
  calorieCompass?: {
    exportReport: (
      rect: { x: number; y: number; width: number; height: number },
      defaultName: string,
    ) => Promise<{ saved: boolean; canceled: boolean; filePath?: string; error?: string }>;
  };
}
