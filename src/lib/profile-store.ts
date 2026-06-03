import { useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";

export type UserProfile = {
  avatarSrc: string;
  created: boolean;
  displayName: string;
  email: string;
  logoSrc: string | null;
};

export const PROFILE_STORAGE_KEY = "adhdice-profile";

export const DEFAULT_PROFILE: UserProfile = {
  avatarSrc: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
  created: false,
  displayName: "Andrew Schaffer",
  email: "andrew@adhdice.app",
  logoSrc: "/logo.png",
};

let cachedProfileSnapshot: UserProfile = DEFAULT_PROFILE;

export function normalizeLogoSrc(src: string | null | undefined): string | null {
  if (!src || src.startsWith("data:")) return src ?? null;
  return src.replace(/^\/[^/]+(?=\/logo\.png$)/, "");
}

function profilesEqual(a: UserProfile, b: UserProfile) {
  return (
    a.avatarSrc === b.avatarSrc &&
    a.created === b.created &&
    a.displayName === b.displayName &&
    a.email === b.email &&
    a.logoSrc === b.logoSrc
  );
}

function readStoredProfile() {
  if (typeof window === "undefined") return DEFAULT_PROFILE;

  const saved = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!saved) {
    cachedProfileSnapshot = DEFAULT_PROFILE;
    return cachedProfileSnapshot;
  }

  try {
    const parsed = JSON.parse(saved) as UserProfile;
    parsed.logoSrc = normalizeLogoSrc(parsed.logoSrc);
    const nextProfile = { ...DEFAULT_PROFILE, ...parsed };
    if (profilesEqual(cachedProfileSnapshot, nextProfile)) {
      return cachedProfileSnapshot;
    }
    cachedProfileSnapshot = nextProfile;
    return cachedProfileSnapshot;
  } catch {
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    cachedProfileSnapshot = DEFAULT_PROFILE;
    return cachedProfileSnapshot;
  }
}

function subscribeToProfileStore(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (!event.key || event.key === PROFILE_STORAGE_KEY) {
      onStoreChange();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(PROFILE_STORAGE_KEY, onStoreChange as EventListener);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(PROFILE_STORAGE_KEY, onStoreChange as EventListener);
  };
}

export function useProfileStore() {
  return useSyncExternalStore(subscribeToProfileStore, readStoredProfile, () => DEFAULT_PROFILE);
}

export function saveProfile(profile: UserProfile) {
  if (typeof window === "undefined") return;
  cachedProfileSnapshot = profile;
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  window.dispatchEvent(new Event(PROFILE_STORAGE_KEY));
}

export function buildProfileSnapshot(
  profileRow: {
    avatar_src: string | null;
    display_name: string | null;
    logo_src: string | null;
  } | null,
  user: User,
): UserProfile {
  const fallbackName = user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    DEFAULT_PROFILE.displayName;

  return {
    avatarSrc: profileRow?.avatar_src || DEFAULT_PROFILE.avatarSrc,
    created: Boolean(profileRow),
    displayName: profileRow?.display_name || fallbackName,
    email: user.email || DEFAULT_PROFILE.email,
    logoSrc: normalizeLogoSrc(profileRow?.logo_src) || DEFAULT_PROFILE.logoSrc,
  };
}
