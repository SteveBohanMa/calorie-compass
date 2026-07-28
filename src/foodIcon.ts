import fallbackData from "./food-icon-fallbacks.json";

type IconData = { body: string; width: number; height: number };

const cache = new Map<string, string>();

function iconDataUrl(name: string) {
  const cached = cache.get(name);
  if (cached) return cached;
  const icon = (fallbackData.icons as Record<string, IconData>)[name];
  if (!icon) return "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${icon.width} ${icon.height}">${icon.body}</svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache.set(name, url);
  return url;
}

export function foodFallbackImage(foodId: string) {
  const name = (fallbackData.foodIcons as Record<string, string>)[foodId];
  return iconDataUrl(name);
}

export function methodFallbackImage(methodId: string) {
  const name = (fallbackData.methodIcons as Record<string, string>)[methodId];
  return iconDataUrl(name);
}
