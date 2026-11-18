// Device-local Health Connect settings and write-back bookkeeping (v2.10). Not part of backups: they
// describe this phone's Health Connect, and another device has its own.
import { STORAGE_KEYS } from "../userData";
import { sanitizeHealthSettings, sanitizeSyncMap, type HealthSettings, type SyncMap } from "./core";

type Reader = Pick<Storage, "getItem">;
type Writer = Pick<Storage, "setItem">;

function read(storage: Reader, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readHealthSettings(storage: Reader = window.localStorage): HealthSettings {
  return sanitizeHealthSettings(read(storage, STORAGE_KEYS.healthSettings));
}

export function writeHealthSettings(settings: HealthSettings, storage: Writer = window.localStorage) {
  storage.setItem(STORAGE_KEYS.healthSettings, JSON.stringify(settings));
}

export function readSyncMap(storage: Reader = window.localStorage): SyncMap {
  return sanitizeSyncMap(read(storage, STORAGE_KEYS.healthSync));
}

export function writeSyncMap(map: SyncMap, storage: Writer = window.localStorage) {
  storage.setItem(STORAGE_KEYS.healthSync, JSON.stringify(map));
}
