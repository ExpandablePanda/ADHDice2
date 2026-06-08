import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type BrowserSupabaseClient = ReturnType<typeof createClient<Database>>;

declare global {
  // eslint-disable-next-line no-var
  var __adhdiceSupabaseClient: BrowserSupabaseClient | null | undefined;
}

export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  if (!globalThis.__adhdiceSupabaseClient) {
    globalThis.__adhdiceSupabaseClient = createClient<Database>(url, anonKey);
  }

  return globalThis.__adhdiceSupabaseClient;
}
