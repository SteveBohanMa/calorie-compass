const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("calorieCompass", {
  exportReport: (rect, defaultName) => ipcRenderer.invoke("report:export-png", { rect, defaultName }),
});
