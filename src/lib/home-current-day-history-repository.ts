import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TaskHistory } from "./database.types.ts";
import type { CanonicalTaskHistoryFact } from "./task-state-canonical/types.ts";
import { mapCanonicalTaskHistoryFacts } from "./task-state-canonical/history-projection.ts";

export const HOME_CURRENT_DAY_SUCCESSFUL_OUTCOMES = ["done", "did_my_best", "complete"] as const;

export type HomeCurrentDayHistoryClient = SupabaseClient<Database>;

export async function fetchHomeCurrentDayHistory(
  client: HomeCurrentDayHistoryClient,
  input: { logicalDate: string; ownerId: string },
): Promise<TaskHistory[]> {
  const result = await client
    .from("adhdice_task_history_facts")
    .select("*")
    .eq("user_id", input.ownerId)
    .eq("logical_date", input.logicalDate)
    .in("outcome", [...HOME_CURRENT_DAY_SUCCESSFUL_OUTCOMES])
    .order("entity_id", { ascending: true })
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });

  if (result.error) {
    throw new Error(result.error.message ?? "Could not load today's completions.");
  }

  return mapCanonicalTaskHistoryFacts((result.data ?? []) as CanonicalTaskHistoryFact[]) as TaskHistory[];
}
