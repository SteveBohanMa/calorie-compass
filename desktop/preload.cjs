const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("calorieCompass", {
  exportReport: (rect, defaultName) => ipcRenderer.invoke("report:export-png", { rect, defaultName }),
  exportBackup: (json, defaultName) => ipcRenderer.invoke("backup:export-json", { json, defaultName }),
});
