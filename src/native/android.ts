// Android app (Capacitor, v2.9): connects the platform glue in ./bridge to the native side.
// In the Windows app and in a browser Capacitor reports the "web" platform and nothing happens.
import { App } from "@capacitor/app";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { installHealthPlugin, type NativeHealthPlugin } from "../health/api";
import { APP_RESUMED_EVENT, createAndroidDesktopApi, nativeBack, type NativeFilesPlugin } from "./bridge";

let started = false;

export function setupNativePlatform() {
  if (started) return;
  started = true;
  if (Capacitor.getPlatform() !== "android") return;

  // Lets src/prototype.css adjust details for the phone (tap highlight, bottom navigation spacing).
  document.documentElement.dataset.nativePlatform = "android";

  // Same contract as the Windows preload, so the weekly report and backup export code paths stay shared.
  const files = registerPlugin<NativeFilesPlugin>("CalorieCompassFiles");
  window.calorieCompass = createAndroidDesktopApi(files, () => window.devicePixelRatio || 1);

  // Back button / back gesture: close what is open, then go back a screen, then leave the app
  // running in the background (like Android's own apps) instead of closing it.
  nativeBack.setExit(() => {
    void App.minimizeApp().catch(() => App.exitApp());
  });
  void App.addListener("backButton", () => {
    nativeBack.handleBack();
  });

  // Health Connect (v2.10, Android 14+; the plugin reports older versions as unavailable).
  installHealthPlugin(registerPlugin<NativeHealthPlugin>("CalorieCompassHealth"));
  // Coming back to the app (e.g. after syncing the band in its own app, or after changing permissions in
  // Health Connect): screens that show Health Connect data read it again.
  void App.addListener("resume", () => {
    window.dispatchEvent(new Event(APP_RESUMED_EVENT));
  });
}
