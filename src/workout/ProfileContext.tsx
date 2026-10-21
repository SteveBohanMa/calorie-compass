import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from "react";
import { readProfile, writeProfile } from "../userData";
import type { BodyProfile } from "./model";
import { emptyProfile, toBodyProfile, type StoredProfile } from "./profile";

type ProfileContextValue = {
  profile: StoredProfile;
  /** The model input, or null while a required field is missing. */
  body: BodyProfile | null;
  /** Saves the profile; false when browser storage refused the write (nothing changes then). */
  save: (next: StoredProfile) => boolean;
  /** Re-reads the profile from storage, e.g. after a backup was imported. */
  reload: () => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

function safeRead() {
  try {
    return readProfile();
  } catch {
    return emptyProfile();
  }
}

export function ProfileProvider({ children }: PropsWithChildren) {
  const [profile, setProfile] = useState<StoredProfile>(safeRead);
  const save = useCallback((next: StoredProfile) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    try {
      writeProfile(stamped);
    } catch {
      return false;
    }
    setProfile(stamped);
    return true;
  }, []);
  const reload = useCallback(() => setProfile(safeRead()), []);
  const value = useMemo(() => ({ profile, body: toBodyProfile(profile), save, reload }), [profile, save, reload]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) throw new Error("useProfile must be used inside ProfileProvider");
  return context;
}
