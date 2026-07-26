import { useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import type { UserProfile as DbUserProfile } from "@/lib/database.types";
import type { createBrowserSupabaseClient } from "@/lib/supabase";

export type UserProfile = {
  avatarSrc: string;
  created: boolean;
  displayName: string;
  email: string;
  logoSrc: string | null;
};

export const PROFILE_STORAGE_KEY = "adhdice-profile";
export const PROFILE_MEDIA_SESSION_KEY_PREFIX = "adhdice-profile-media";
export const PROFILE_MEDIA_COLUMNS = "avatar_src,logo_src";
export const WORKSPACE_PROFILE_COLUMNS = "user_id,display_name,accent_color,day_start_time,timezone,focus_alarm_enabled,focus_alarm_interval_minutes,level,low_stim_mode,xp,points,theme_preference,tokens,free_roll_bank,created_at,updated_at";

export type WorkspaceProfileRow = Pick<
  DbUserProfile,
  | "user_id"
  | "display_name"
  | "accent_color"
  | "day_start_time"
  | "timezone"
  | "focus_alarm_enabled"
  | "focus_alarm_interval_minutes"
  | "level"
  | "low_stim_mode"
  | "xp"
  | "points"
  | "theme_preference"
  | "tokens"
  | "free_roll_bank"
  | "created_at"
  | "updated_at"
>;

type ProfileMediaRow = Pick<DbUserProfile, "avatar_src" | "logo_src">;
type ProfileMediaClient = NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
type ProfileMediaRequestState = {
  inFlightByUserId: Map<string, Promise<UserProfile>>;
  loadedUserIds: Set<string>;
};

declare global {
  var __adhdiceProfileMediaRequestState: ProfileMediaRequestState | undefined;
}

export const DEFAULT_PROFILE: UserProfile = {
  avatarSrc: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
  created: false,
  displayName: "Andrew Schaffer",
  email: "andrew@adhdice.app",
  logoSrc: "/logo.png",
};

let cachedProfileSnapshot: UserProfile = DEFAULT_PROFILE;
let cachedProfileUserId: string | null = null;
let activeProfileUserId: string | null = null;

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

function getProfileStorageKey(userId: string) {
  return `${PROFILE_STORAGE_KEY}:${userId}`;
}

function logProfileCache(message: string, userId: string) {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[profile-cache] ${message} userId=${userId}.`);
  }
}

function isProfileMediaCacheField(key: string, value: unknown) {
  const normalizedKey = key.replace(/[^a-z]/gi, "").toLowerCase();
  return normalizedKey === "avatarsrc"
    || normalizedKey === "logosrc"
    || (typeof value === "string" && value.startsWith("data:"));
}

function stripProfileMediaFromPersistentCache(profile: Record<string, unknown>) {
  let removedMedia = false;
  const persistentProfile = Object.fromEntries(
    Object.entries(profile).filter(([key, value]) => {
      const isMedia = isProfileMediaCacheField(key, value);
      removedMedia ||= isMedia;
      return !isMedia;
    }),
  );
  return { persistentProfile, removedMedia };
}

function writePersistentProfile(userId: string, profile: Record<string, unknown>) {
  try {
    const { persistentProfile } = stripProfileMediaFromPersistentCache(profile);
    window.localStorage.setItem(getProfileStorageKey(userId), JSON.stringify(persistentProfile));
    return true;
  } catch {
    logProfileCache("persistent write skipped", userId);
    return false;
  }
}

export function setActiveProfileUserId(userId: string | null) {
  if (activeProfileUserId === userId) return;
  activeProfileUserId = userId;
  cachedProfileUserId = null;
  cachedProfileSnapshot = DEFAULT_PROFILE;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PROFILE_STORAGE_KEY));
  }
}

function readStoredProfile() {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  if (!activeProfileUserId) return DEFAULT_PROFILE;

  if (cachedProfileUserId === activeProfileUserId) {
    return cachedProfileSnapshot;
  }

  const storageKey = getProfileStorageKey(activeProfileUserId);
  let saved: string | null;
  try {
    saved = window.localStorage.getItem(storageKey);
  } catch {
    logProfileCache("persistent read unavailable", activeProfileUserId);
    cachedProfileSnapshot = DEFAULT_PROFILE;
    cachedProfileUserId = activeProfileUserId;
    return cachedProfileSnapshot;
  }
  if (!saved) {
    cachedProfileSnapshot = DEFAULT_PROFILE;
    cachedProfileUserId = activeProfileUserId;
    return cachedProfileSnapshot;
  }

  try {
    const parsed = JSON.parse(saved) as Record<string, unknown>;
    const { persistentProfile, removedMedia } = stripProfileMediaFromPersistentCache(parsed);
    if (removedMedia) {
      writePersistentProfile(activeProfileUserId, persistentProfile);
    }
    const nextProfile = { ...DEFAULT_PROFILE, ...persistentProfile } as UserProfile;
    nextProfile.logoSrc = normalizeLogoSrc(nextProfile.logoSrc);
    if (profilesEqual(cachedProfileSnapshot, nextProfile)) {
      cachedProfileUserId = activeProfileUserId;
      return cachedProfileSnapshot;
    }
    cachedProfileSnapshot = nextProfile;
    cachedProfileUserId = activeProfileUserId;
    return cachedProfileSnapshot;
  } catch {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      logProfileCache("invalid persistent entry could not be removed", activeProfileUserId);
    }
    cachedProfileSnapshot = DEFAULT_PROFILE;
    cachedProfileUserId = activeProfileUserId;
    return cachedProfileSnapshot;
  }
}

function getProfileMediaRequestState() {
  if (!globalThis.__adhdiceProfileMediaRequestState) {
    globalThis.__adhdiceProfileMediaRequestState = { inFlightByUserId: new Map(), loadedUserIds: new Set() };
  }
  return globalThis.__adhdiceProfileMediaRequestState;
}

function getProfileMediaSessionKey(userId: string) {
  return `${PROFILE_MEDIA_SESSION_KEY_PREFIX}:${userId}`;
}

function getProfileMediaSessionCacheKey(userId: string) {
  return `${getProfileMediaSessionKey(userId)}:cache`;
}

function logProfileMedia(message: string, userId: string) {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[profile-media] ${message} userId=${userId}.`);
  }
}

export function isCompatibleProfileMediaSource(value: string | null | undefined) {
  return value === null
    || value === undefined
    || value === ""
    || value.startsWith("data:")
    || /^https?:\/\//i.test(value);
}

export function markProfileMediaCachedForSession(userId: string) {
  if (typeof window === "undefined" || activeProfileUserId !== userId) return;
  getProfileMediaRequestState().loadedUserIds.add(userId);
  try {
    const profile = readStoredProfile();
    window.sessionStorage.setItem(getProfileMediaSessionCacheKey(userId), JSON.stringify({
      avatarSrc: profile.avatarSrc,
      logoSrc: profile.logoSrc,
    }));
    window.sessionStorage.setItem(getProfileMediaSessionKey(userId), "loaded");
  } catch {
    // Keep the in-memory request de-duplication if session storage is unavailable.
  }
}

function restoreProfileMediaFromSessionCache(userId: string): UserProfile | null {
  if (activeProfileUserId !== userId) return null;
  try {
    if (window.sessionStorage.getItem(getProfileMediaSessionKey(userId)) !== "loaded") return null;
    const saved = window.sessionStorage.getItem(getProfileMediaSessionCacheKey(userId));
    if (!saved) return null;
    const media = JSON.parse(saved) as { avatarSrc?: unknown; logoSrc?: unknown };
    if (
      typeof media.avatarSrc !== "string"
      || !isCompatibleProfileMediaSource(media.avatarSrc)
      || (typeof media.logoSrc !== "string" && media.logoSrc !== null)
      || !isCompatibleProfileMediaSource(media.logoSrc as string | null)
    ) {
      return null;
    }
    const profile = {
      ...readStoredProfile(),
      avatarSrc: media.avatarSrc,
      logoSrc: normalizeLogoSrc(media.logoSrc) || DEFAULT_PROFILE.logoSrc,
    };
    saveProfile(profile, userId);
    return profile;
  } catch {
    return null;
  }
}

function applyProfileMedia(media: ProfileMediaRow | null, userId: string) {
  if (activeProfileUserId !== userId) {
    logProfileMedia("stale-user result discarded", userId);
    return readStoredProfile();
  }
  const current = readStoredProfile();
  const next: UserProfile = {
    ...current,
    avatarSrc: media?.avatar_src || DEFAULT_PROFILE.avatarSrc,
    logoSrc: normalizeLogoSrc(media?.logo_src) || DEFAULT_PROFILE.logoSrc,
  };
  saveProfile(next, userId);
  return next;
}

export async function loadProfileMedia(client: ProfileMediaClient, userId: string): Promise<UserProfile> {
  if (typeof window === "undefined") return DEFAULT_PROFILE;

  const requestState = getProfileMediaRequestState();
  if (requestState.loadedUserIds.has(userId)) {
    logProfileMedia("completed request reused from in-memory session cache", userId);
    return readStoredProfile();
  }
  const sessionCachedProfile = restoreProfileMediaFromSessionCache(userId);
  if (sessionCachedProfile) {
    requestState.loadedUserIds.add(userId);
    logProfileMedia("completed request restored from browser session cache", userId);
    return sessionCachedProfile;
  }
  const existingRequest = requestState.inFlightByUserId.get(userId);
  if (existingRequest) {
    logProfileMedia("joined existing request", userId);
    return existingRequest;
  }

  logProfileMedia("media request started", userId);
  const request = client
    .from("adhdice_user_profiles")
    .select(PROFILE_MEDIA_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) {
        logProfileMedia("media request failed and left retryable", userId);
        return readStoredProfile();
      }
      if (activeProfileUserId !== userId) {
        logProfileMedia("stale-user result discarded", userId);
        return readStoredProfile();
      }
      const profile = applyProfileMedia(data as ProfileMediaRow | null, userId);
      markProfileMediaCachedForSession(userId);
      logProfileMedia("media request completed successfully", userId);
      return profile;
    }, () => {
      logProfileMedia("media request failed and left retryable", userId);
      return readStoredProfile();
    })
    .finally(() => {
      requestState.inFlightByUserId.delete(userId);
    });

  requestState.inFlightByUserId.set(userId, request);
  return request;
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

export function saveProfile(profile: UserProfile, userId = activeProfileUserId) {
  if (typeof window === "undefined" || !userId || activeProfileUserId !== userId) {
    return { memoryUpdated: false, persistentCacheWritten: false };
  }
  const memoryUpdated = cachedProfileUserId !== userId || !profilesEqual(cachedProfileSnapshot, profile);
  cachedProfileSnapshot = profile;
  cachedProfileUserId = userId;
  const persistentCacheWritten = writePersistentProfile(userId, profile);
  window.dispatchEvent(new Event(PROFILE_STORAGE_KEY));
  return { memoryUpdated, persistentCacheWritten };
}

export function buildProfileSnapshot(
  profileRow: {
    avatar_src?: string | null;
    display_name: string | null;
    logo_src?: string | null;
  } | null,
  user: User,
): UserProfile {
  const fallbackName = user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    DEFAULT_PROFILE.displayName;

  const storedProfile = readStoredProfile();
  return {
    avatarSrc: profileRow?.avatar_src === undefined
      ? storedProfile.avatarSrc
      : profileRow.avatar_src || DEFAULT_PROFILE.avatarSrc,
    created: Boolean(profileRow),
    displayName: profileRow?.display_name || fallbackName,
    email: user.email || DEFAULT_PROFILE.email,
    logoSrc: profileRow?.logo_src === undefined
      ? storedProfile.logoSrc
      : normalizeLogoSrc(profileRow.logo_src) || DEFAULT_PROFILE.logoSrc,
  };
}
