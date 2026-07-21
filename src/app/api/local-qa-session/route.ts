import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  buildLocalQaProfileFixtures,
  LOCAL_QA_SEED_METADATA_KEY,
  LOCAL_QA_SEED_VERSION,
} from "@/lib/local-qa-profile-fixtures";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isLocalHostname(hostname: string) {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return true;
  if (hostname.startsWith("10.") || hostname.startsWith("192.168.")) return true;
  const match = hostname.match(/^172\.(\d{1,2})\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function isAllowedLocalRequest(request: Request) {
  if (process.env.NODE_ENV === "production") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return isLocalHostname(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function requireSeedSuccess(label: string, result: { error: { message: string } | null }) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
}

async function seedLocalQaProfile(client: SupabaseClient<Database>, userId: string, force: boolean, currentMetadata: Record<string, unknown>) {
  if (!force && currentMetadata[LOCAL_QA_SEED_METADATA_KEY] === LOCAL_QA_SEED_VERSION) {
    return false;
  }

  const fixtures = buildLocalQaProfileFixtures(userId);
  requireSeedSuccess("profile", await client.from("adhdice_user_profiles").upsert(fixtures.profile, { onConflict: "user_id" }));
  requireSeedSuccess("lists", await client.from("adhdice_task_lists").upsert(fixtures.lists, { onConflict: "user_id,id" }));
  requireSeedSuccess("tasks", await client.from("adhdice_clean_tasks").upsert(fixtures.tasks, { defaultToNull: false, onConflict: "id" }));
  requireSeedSuccess("list memberships", await client.from("adhdice_task_list_manual_memberships").upsert(fixtures.listMemberships, { onConflict: "id" }));
  requireSeedSuccess("task history", await client.from("adhdice_task_history").upsert(fixtures.taskHistory, { onConflict: "id" }));
  requireSeedSuccess("actual time", await client.from("adhdice_task_actual_time_entries").upsert(fixtures.actualTimeEntries, { onConflict: "id" }));
  requireSeedSuccess("focus categories", await client.from("adhdice_focus_categories").upsert(fixtures.focusCategories, { onConflict: "id" }));
  requireSeedSuccess("focus sessions", await client.from("adhdice_focus_sessions").upsert(fixtures.focusSessions, { onConflict: "id" }));
  requireSeedSuccess("notes", await client.from("adhdice_notes").upsert(fixtures.notes, { onConflict: "id" }));

  const metadataResult = await client.auth.updateUser({
    data: { ...currentMetadata, [LOCAL_QA_SEED_METADATA_KEY]: LOCAL_QA_SEED_VERSION },
  });
  if (metadataResult.error) {
    throw new Error(`seed marker: ${metadataResult.error.message}`);
  }
  return true;
}

export async function POST(request: Request) {
  if (!isAllowedLocalRequest(request)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.ADHDICE_LOCAL_QA_EMAIL;
  const password = process.env.ADHDICE_LOCAL_QA_PASSWORD;
  if (!url || !anonKey || !email || !password) {
    return Response.json({ error: "Local QA account is not configured." }, { status: 503 });
  }

  let resetFixtures = false;
  try {
    const body = await request.json() as { resetFixtures?: unknown };
    resetFixtures = body.resetFixtures === true;
  } catch {
    resetFixtures = false;
  }

  const client = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const signInResult = await client.auth.signInWithPassword({ email, password });
    if (signInResult.error || !signInResult.data.session || !signInResult.data.user) {
      return Response.json({ error: "Local QA account could not be authenticated." }, { status: 503 });
    }

    const seeded = await seedLocalQaProfile(
      client,
      signInResult.data.user.id,
      resetFixtures,
      signInResult.data.user.user_metadata ?? {},
    );
    const currentSessionResult = await client.auth.getSession();
    const currentSession = currentSessionResult.data.session ?? signInResult.data.session;

    return Response.json({
      accessToken: currentSession.access_token,
      refreshToken: currentSession.refresh_token,
      seeded,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[local-qa] Could not prepare the local QA profile.", error);
    return Response.json({ error: "Local QA profile could not be prepared." }, { status: 503 });
  }
}
