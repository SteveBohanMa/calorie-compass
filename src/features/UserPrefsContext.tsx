import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from "react";
import { emptyPortionPrefs, readFavorites, readPortionPrefs, writeFavorites, writePortionPrefs, type PortionPrefs } from "../userData";

type UserPrefsValue = {
  favorites: string[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
  portions: PortionPrefs;
  setCompareMode: (mode: PortionPrefs["compareMode"]) => void;
  setAmount: (id: string, amount: number | null) => void;
  setPieceGrams: (id: string, grams: number | null) => void;
  /** Re-reads favorites and portions from storage, e.g. after a backup was imported. */
  reload: () => void;
};

const UserPrefsContext = createContext<UserPrefsValue | null>(null);

function safe<T>(read: () => T, fallback: () => T) {
  try {
    return read();
  } catch {
    return fallback();
  }
}

function withEntry(map: Record<string, number>, id: string, value: number | null) {
  const next = { ...map };
  if (value === null || !Number.isFinite(value) || value <= 0) delete next[id];
  else next[id] = value;
  return next;
}

export function UserPrefsProvider({ children }: PropsWithChildren) {
  const [favorites, setFavorites] = useState<string[]>(() => safe(readFavorites, () => []));
  const [portions, setPortions] = useState<PortionPrefs>(() => safe(readPortionPrefs, emptyPortionPrefs));

  const updatePortions = useCallback((update: (current: PortionPrefs) => PortionPrefs) => {
    setPortions((current) => {
      const next = update(current);
      try {
        writePortionPrefs(next);
      } catch {
        // Storage can be full or blocked; the in-memory value still works for this session.
      }
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [id, ...current];
      try {
        writeFavorites(next);
      } catch {
        // See above.
      }
      return next;
    });
  }, []);

  const value = useMemo<UserPrefsValue>(() => ({
    favorites,
    isFavorite: (id) => favorites.includes(id),
    toggleFavorite,
    portions,
    setCompareMode: (mode) => updatePortions((current) => ({ ...current, compareMode: mode })),
    setAmount: (id, amount) => updatePortions((current) => ({ ...current, amounts: withEntry(current.amounts, id, amount) })),
    setPieceGrams: (id, grams) => updatePortions((current) => ({ ...current, pieceGrams: withEntry(current.pieceGrams, id, grams) })),
    reload: () => {
      setFavorites(safe(readFavorites, () => []));
      setPortions(safe(readPortionPrefs, emptyPortionPrefs));
    },
  }), [favorites, portions, toggleFavorite, updatePortions]);

  return <UserPrefsContext.Provider value={value}>{children}</UserPrefsContext.Provider>;
}

export function useUserPrefs() {
  const context = useContext(UserPrefsContext);
  if (!context) throw new Error("useUserPrefs must be used inside UserPrefsProvider");
  return context;
}
