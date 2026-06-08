import { processLock } from "@supabase/auth-js";
import { createClient, type AuthChangeEvent, type Session } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type BrowserSupabaseClient = ReturnType<typeof createClient<Database>>;
type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;
type BrowserAuthStore = {
  hasSnapshot: boolean;
  lastEvent: AuthChangeEvent;
  lastSession: Session | null;
  listeners: Set<AuthListener>;
  unsubscribe: (() => void) | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __adhdiceSupabaseClient: BrowserSupabaseClient | null | undefined;
  // eslint-disable-next-line no-var
  var __adhdiceSupabaseAuthStore: BrowserAuthStore | undefined;
}

export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  if (!globalThis.__adhdiceSupabaseClient) {
    globalThis.__adhdiceSupabaseClient = createClient<Database>(url, anonKey, {
      auth: {
        // Safari can leave navigator.locks orphaned across reloads in local development.
        lock: processLock,
      },
    });
  }

  return globalThis.__adhdiceSupabaseClient;
}

export function subscribeToBrowserAuth(listener: AuthListener) {
  const client = createBrowserSupabaseClient();
  if (!client) {
    return () => {};
  }

  const store = globalThis.__adhdiceSupabaseAuthStore ?? {
    hasSnapshot: false,
    lastEvent: "INITIAL_SESSION",
    lastSession: null,
    listeners: new Set<AuthListener>(),
    unsubscribe: null,
  };
  globalThis.__adhdiceSupabaseAuthStore = store;
  store.listeners.add(listener);

  if (!store.unsubscribe) {
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      store.hasSnapshot = true;
      store.lastEvent = event;
      store.lastSession = session;
      for (const currentListener of store.listeners) {
        currentListener(event, session);
      }
    });
    store.unsubscribe = () => subscription.unsubscribe();
  }

  if (store.hasSnapshot) {
    queueMicrotask(() => {
      if (store.listeners.has(listener)) {
        listener(store.lastEvent, store.lastSession);
      }
    });
  }

  return () => {
    store.listeners.delete(listener);
  };
}
