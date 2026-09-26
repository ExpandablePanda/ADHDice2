import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types.ts";
import {
  parseTaskActivitySummaryResponse,
  TaskActivitySummaryError,
  type TaskActivitySummary,
} from "./task-activity-summary.ts";

export type TaskActivitySummaryClient = SupabaseClient<Database>;

export async function fetchTaskActivitySummary(
  client: TaskActivitySummaryClient,
  asOfLogicalDate: string,
): Promise<TaskActivitySummary> {
  try {
    const result = await client.rpc("adhdice_get_task_activity_summary", {
      p_as_of: asOfLogicalDate,
    });
    if (result.error) {
      throw new TaskActivitySummaryError("rpc-failed", result.error.message ?? "Could not load the Task activity summary.");
    }
    return parseTaskActivitySummaryResponse(result.data);
  } catch (error) {
    if (error instanceof TaskActivitySummaryError) throw error;
    throw new TaskActivitySummaryError(
      "rpc-failed",
      error instanceof Error ? error.message : "Could not load the Task activity summary.",
    );
  }
}
