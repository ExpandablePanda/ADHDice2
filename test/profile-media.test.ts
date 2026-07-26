import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@supabase/supabase-js";
import type { createBrowserSupabaseClient } from "../src/lib/supabase.ts";
import {
  buildProfileSnapshot,
  DEFAULT_PROFILE,
  isCompatibleProfileMediaSource,
  loadProfileMedia,
  markProfileMediaCachedForSession,
  PROFILE_MEDIA_COLUMNS,
  PROFILE_MEDIA_SESSION_KEY_PREFIX,
  PROFILE_STORAGE_KEY,
  saveProfile,
  setActiveProfileUserId,
  WORKSPACE_PROFILE_COLUMNS,
} from "../src/lib/profile-store.ts";

class MemoryStorage {
  private values = new Map<string, string>();

  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

class ThrowingStorage extends MemoryStorage {
  override setItem() { throw new DOMException("The quota has been exceeded", "QuotaExceededError"); }
}

function installProfileMediaWindow(localStorage: MemoryStorage = new MemoryStorage()) {
  const sessionStorage = new MemoryStorage();
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
      dispatchEvent() { return true; },
      localStorage,
      removeEventListener() {},
      sessionStorage,
    },
    writable: true,
  });

  return {
    localStorage,
    restore() {
      Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow, writable: true });
    },
    sessionStorage,
  };
}

function createProfileUser(userId: string) {
  return {
    email: `${userId}@example.test`,
    id: userId,
    user_metadata: { display_name: "Nora" },
  } as User;
}

function createMediaClient(
  load: () => Promise<{ avatar_src: string | null; logo_src: string | null } | null>,
  selectedColumns: string[],
  getError: () => unknown = () => null,
) {
  return {
    from(table: string) {
      assert.equal(table, "adhdice_user_profiles");
      return {
        select(columns: string) {
          selectedColumns.push(columns);
          return {
            eq(column: string, userId: string) {
              assert.equal(column, "user_id");
              assert.ok(userId.length > 0);
              return {
                async maybeSingle() {
                  return { data: await load(), error: getError() };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
}

function resetProfileMediaRequestState() {
  delete (globalThis as typeof globalThis & { __adhdiceProfileMediaRequestState?: unknown }).__adhdiceProfileMediaRequestState;
}

test("workspace profile columns exclude large media while retaining required settings and economy fields", () => {
  assert.equal(WORKSPACE_PROFILE_COLUMNS.includes("avatar_src"), false);
  assert.equal(WORKSPACE_PROFILE_COLUMNS.includes("logo_src"), false);
  for (const field of ["display_name", "accent_color", "day_start_time", "timezone", "focus_alarm_enabled", "focus_alarm_interval_minutes", "level", "low_stim_mode", "xp", "points", "theme_preference", "tokens", "free_roll_bank"]) {
    assert.equal(WORKSPACE_PROFILE_COLUMNS.includes(field), true, field);
  }
});

test("profile media requests deduplicate concurrently and cache the completed session", async () => {
  const browser = installProfileMediaWindow();
  const userId = "media-user";
  setActiveProfileUserId(userId);
  let resolveLoad: ((value: { avatar_src: string; logo_src: string }) => void) | null = null;
  let requestCount = 0;
  const selectedColumns: string[] = [];
  const client = createMediaClient(async () => {
    requestCount += 1;
    return await new Promise((resolve) => { resolveLoad = resolve; });
  }, selectedColumns);

  const first = loadProfileMedia(client, userId);
  const second = loadProfileMedia(client, userId);
  assert.equal(requestCount, 1);
  resolveLoad?.({ avatar_src: "data:image/jpeg;base64,legacy", logo_src: "https://example.test/logo.png" });
  const [firstProfile, secondProfile] = await Promise.all([first, second]);
  assert.equal(firstProfile.avatarSrc, "data:image/jpeg;base64,legacy");
  assert.equal(secondProfile.logoSrc, "https://example.test/logo.png");
  assert.deepEqual(selectedColumns, [PROFILE_MEDIA_COLUMNS]);

  await loadProfileMedia(client, userId);
  assert.equal(requestCount, 1);
  assert.equal(browser.sessionStorage.getItem(`${PROFILE_MEDIA_SESSION_KEY_PREFIX}:${userId}`), "loaded");
  browser.restore();
});

test("profile media reload restores the matching user's session cache without another query", async () => {
  const browser = installProfileMediaWindow();
  const userId = "reload-media-user";
  setActiveProfileUserId(userId);
  let requestCount = 0;
  const client = createMediaClient(async () => {
    requestCount += 1;
    return { avatar_src: "data:image/png;base64,reloaded", logo_src: "https://example.test/reloaded-logo.png" };
  }, []);

  await loadProfileMedia(client, userId);
  setActiveProfileUserId(null);
  resetProfileMediaRequestState();
  setActiveProfileUserId(userId);

  const profile = await loadProfileMedia(client, userId);
  assert.equal(requestCount, 1);
  assert.equal(profile.avatarSrc, "data:image/png;base64,reloaded");
  assert.equal(profile.logoSrc, "https://example.test/reloaded-logo.png");
  browser.restore();
});

test("a legacy session marker without cached media remains reloadable", async () => {
  const browser = installProfileMediaWindow();
  const userId = "legacy-session-marker-user";
  setActiveProfileUserId(userId);
  browser.sessionStorage.setItem(`${PROFILE_MEDIA_SESSION_KEY_PREFIX}:${userId}`, "loaded");
  let requestCount = 0;
  const client = createMediaClient(async () => {
    requestCount += 1;
    return { avatar_src: "data:image/png;base64,fresh", logo_src: null };
  }, []);

  const profile = await loadProfileMedia(client, userId);
  assert.equal(requestCount, 1);
  assert.equal(profile.avatarSrc, "data:image/png;base64,fresh");
  browser.restore();
});

test("one user's session media cache cannot suppress another user's media load", async () => {
  const browser = installProfileMediaWindow();
  const accountA = "session-cache-account-a";
  const accountB = "session-cache-account-b";
  setActiveProfileUserId(accountA);
  const clientA = createMediaClient(async () => ({ avatar_src: "data:image/png;base64,a", logo_src: null }), []);
  await loadProfileMedia(clientA, accountA);

  setActiveProfileUserId(null);
  resetProfileMediaRequestState();
  setActiveProfileUserId(accountB);
  let accountBRequestCount = 0;
  const clientB = createMediaClient(async () => {
    accountBRequestCount += 1;
    return { avatar_src: "data:image/png;base64,b", logo_src: null };
  }, []);

  const profile = await loadProfileMedia(clientB, accountB);
  assert.equal(accountBRequestCount, 1);
  assert.equal(profile.avatarSrc, "data:image/png;base64,b");
  browser.restore();
});

test("profile media compatibility accepts legacy data URLs, remote URLs, and empty values", () => {
  assert.equal(isCompatibleProfileMediaSource("data:image/jpeg;base64,legacy"), true);
  assert.equal(isCompatibleProfileMediaSource("https://example.test/avatar.webp"), true);
  assert.equal(isCompatibleProfileMediaSource("http://example.test/avatar.jpg"), true);
  assert.equal(isCompatibleProfileMediaSource(null), true);
  assert.equal(isCompatibleProfileMediaSource(""), true);
  assert.equal(isCompatibleProfileMediaSource("storage-path/avatar.webp"), false);
});

test("profile saves update the existing local cache without requiring another media request", async () => {
  const browser = installProfileMediaWindow();
  const userId = "saved-media-user";
  setActiveProfileUserId(userId);
  saveProfile({ ...DEFAULT_PROFILE, avatarSrc: "data:image/png;base64,saved", displayName: "Saved", logoSrc: "https://example.test/saved-logo.png" }, userId);
  markProfileMediaCachedForSession(userId);
  let requestCount = 0;
  const client = createMediaClient(async () => {
    requestCount += 1;
    return null;
  }, []);

  const profile = await loadProfileMedia(client, userId);
  assert.equal(profile.avatarSrc, "data:image/png;base64,saved");
  assert.equal(profile.logoSrc, "https://example.test/saved-logo.png");
  assert.equal(requestCount, 0);
  const persisted = browser.localStorage.getItem(`${PROFILE_STORAGE_KEY}:${userId}`) ?? "";
  assert.ok(persisted);
  assert.equal(persisted.includes("avatarSrc"), false);
  assert.equal(persisted.includes("logoSrc"), false);
  assert.equal(persisted.includes("base64,saved"), false);
  browser.restore();
});

test("failed profile media requests remain retryable", async () => {
  const browser = installProfileMediaWindow();
  const userId = "retryable-media-user";
  setActiveProfileUserId(userId);
  let requestCount = 0;
  const client = createMediaClient(async () => {
    requestCount += 1;
    return { avatar_src: "data:image/png;base64,retried", logo_src: null };
  }, [], () => requestCount === 1 ? { message: "temporary failure" } : null);

  await loadProfileMedia(client, userId);
  assert.equal(browser.sessionStorage.getItem(`${PROFILE_MEDIA_SESSION_KEY_PREFIX}:${userId}`), null);
  const profile = await loadProfileMedia(client, userId);
  assert.equal(requestCount, 2);
  assert.equal(profile.avatarSrc, "data:image/png;base64,retried");
  browser.restore();
});

test("current-user media hydration replaces cached fallback for every avatar consumer", async () => {
  const browser = installProfileMediaWindow();
  const userId = "avatar-consumer-user";
  const user = createProfileUser(userId);
  setActiveProfileUserId(userId);
  const before = buildProfileSnapshot({ display_name: "Nora" }, user);
  const client = createMediaClient(async () => ({
    avatar_src: "data:image/png;base64,current-user-avatar",
    logo_src: null,
  }), []);

  await loadProfileMedia(client, userId);
  const after = buildProfileSnapshot({ display_name: "Nora" }, user);
  const expandedHudAvatarSrc = after.avatarSrc;
  const accountButtonAvatarSrc = after.avatarSrc;

  assert.equal(before.avatarSrc, DEFAULT_PROFILE.avatarSrc);
  assert.equal(expandedHudAvatarSrc, "data:image/png;base64,current-user-avatar");
  assert.equal(accountButtonAvatarSrc, expandedHudAvatarSrc);
  browser.restore();
});

test("matching-user in-memory media bootstraps profile consumers without another request", async () => {
  const browser = installProfileMediaWindow();
  const userId = "cached-avatar-user";
  setActiveProfileUserId(userId);
  saveProfile({ ...DEFAULT_PROFILE, avatarSrc: "data:image/png;base64,cached-avatar" }, userId);
  markProfileMediaCachedForSession(userId);
  const profile = buildProfileSnapshot({ display_name: "Nora" }, createProfileUser(userId));

  assert.equal(profile.avatarSrc, "data:image/png;base64,cached-avatar");
  browser.restore();
});

test("a stale account response cannot update the active account cache", async () => {
  const browser = installProfileMediaWindow();
  const accountA = "account-a";
  const accountB = "account-b";
  let resolveA: ((value: { avatar_src: string; logo_src: string | null }) => void) | null = null;
  const clientA = createMediaClient(async () => await new Promise((resolve) => { resolveA = resolve; }), []);
  const clientB = createMediaClient(async () => ({ avatar_src: "data:image/png;base64,b", logo_src: null }), []);

  setActiveProfileUserId(accountA);
  const accountARequest = loadProfileMedia(clientA, accountA);
  setActiveProfileUserId(accountB);
  const accountBProfile = await loadProfileMedia(clientB, accountB);
  resolveA?.({ avatar_src: "data:image/png;base64,a", logo_src: null });
  const staleResult = await accountARequest;

  assert.equal(accountBProfile.avatarSrc, "data:image/png;base64,b");
  assert.equal(staleResult.avatarSrc, "data:image/png;base64,b");
  assert.equal(browser.localStorage.getItem(`${PROFILE_STORAGE_KEY}:${accountA}`), null);
  assert.equal((browser.localStorage.getItem(`${PROFILE_STORAGE_KEY}:${accountB}`) ?? "").includes("base64,b"), false);
  browser.restore();
});

test("saving media only writes the matching active account cache", () => {
  const browser = installProfileMediaWindow();
  setActiveProfileUserId(null);
  setActiveProfileUserId("account-b");
  saveProfile({ ...DEFAULT_PROFILE, avatarSrc: "data:image/png;base64,b" }, "account-a");
  assert.equal(browser.localStorage.getItem(`${PROFILE_STORAGE_KEY}:account-a`), null);
  saveProfile({ ...DEFAULT_PROFILE, avatarSrc: "data:image/png;base64,b" }, "account-b");
  assert.equal((browser.localStorage.getItem(`${PROFILE_STORAGE_KEY}:account-b`) ?? "").includes("base64,b"), false);
  browser.restore();
});

test("legacy cached media is removed while small profile fields are retained", () => {
  const browser = installProfileMediaWindow();
  const userId = "legacy-cache-user";
  browser.localStorage.setItem(`${PROFILE_STORAGE_KEY}:${userId}`, JSON.stringify({
    avatarSrc: "data:image/png;base64,legacy-avatar",
    logo_src: "data:image/png;base64,legacy-logo",
    displayName: "Legacy Nora",
    theme_preference: "dark",
    xp: 42,
  }));
  setActiveProfileUserId(userId);
  const profile = buildProfileSnapshot({ display_name: "Legacy Nora" }, createProfileUser(userId));
  const persisted = JSON.parse(browser.localStorage.getItem(`${PROFILE_STORAGE_KEY}:${userId}`) ?? "{}");

  assert.equal(profile.avatarSrc, DEFAULT_PROFILE.avatarSrc);
  assert.equal(profile.displayName, "Legacy Nora");
  assert.deepEqual(persisted, { displayName: "Legacy Nora", theme_preference: "dark", xp: 42 });
  browser.restore();
});

test("quota-safe profile cache failures retain the current in-memory avatar", () => {
  const browser = installProfileMediaWindow(new ThrowingStorage());
  const userId = "quota-user";
  setActiveProfileUserId(userId);
  const result = saveProfile({ ...DEFAULT_PROFILE, avatarSrc: "data:image/png;base64,authoritative-save", displayName: "Saved" }, userId);
  const profile = buildProfileSnapshot({ display_name: "Saved" }, createProfileUser(userId));

  assert.deepEqual(result, { memoryUpdated: true, persistentCacheWritten: false });
  assert.equal(profile.avatarSrc, "data:image/png;base64,authoritative-save");
  browser.restore();
});
