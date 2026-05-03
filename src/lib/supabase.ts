import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

let singleton: ReturnType<typeof createClient<Database>> | null = null;

export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  if (!singleton) {
    singleton = createClient<Database>(url, anonKey);
  }

  return singleton;
}
