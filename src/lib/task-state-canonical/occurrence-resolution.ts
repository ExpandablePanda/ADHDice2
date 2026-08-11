import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanonicalTaskOccurrence } from "./types.ts";

export type CanonicalOccurrenceResolutionInput = {
  logicalDate?: string;
  occurrenceId?: string | null;
  occurrenceKey?: string | null;
  scheduledDueOn?: string | null;
};

export type CanonicalOccurrenceResolution = {
  occurrence: CanonicalTaskOccurrence | null;
  error: string | null;
};

/** Resolve an existing server-materialized occurrence; never derive an ID in the browser. */
export async function resolveCanonicalTaskOccurrence(
  client: SupabaseClient,
  userId: string,
  taskId: string,
  input: CanonicalOccurrenceResolutionInput,
): Promise<CanonicalOccurrenceResolution> {
  const result = await client
    .from("adhdice_task_occurrences")
    .select("*")
    .eq("user_id", userId)
    .eq("entity_id", taskId)
    .order("scheduled_due_on", { ascending: false });
  if (result.error) return { occurrence: null, error: result.error.message };

  const rows = (result.data ?? []) as CanonicalTaskOccurrence[];
  const activeRows = rows.filter((row) => row.resolution_state !== "superseded");
  const occurrence = (input.occurrenceId
    ? activeRows.find((row) => row.id === input.occurrenceId)
    : null)
    ?? (input.occurrenceKey
      ? activeRows.find((row) => row.occurrence_key === input.occurrenceKey)
      : null)
    ?? (input.scheduledDueOn
      ? activeRows.find((row) => row.scheduled_due_on === input.scheduledDueOn)
      : null)
    ?? null;
  if (!occurrence) {
    const requested = input.occurrenceKey ?? input.scheduledDueOn ?? input.logicalDate ?? "the requested date";
    return {
      occurrence: null,
      error: `No valid canonical occurrence exists for ${requested}; Delay was not written.`,
    };
  }
  return { occurrence, error: null };
}
