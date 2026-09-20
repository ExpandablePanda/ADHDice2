import type { CanonicalTaskStateColumns } from "@/lib/task-state-canonical/types";
import type { Task } from "@/lib/database.types";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import { buildTaskHierarchyAdapter } from "@/lib/task-hierarchy";

type Client = Pick<NonNullable<ReturnType<typeof createBrowserSupabaseClient>>, "rpc">;

export type TaskHierarchyRow = Task & Partial<CanonicalTaskStateColumns>;

export type MoveTaskHierarchyInput = {
  expectedCanonicalRevision?: number | null;
  expectedRevision: number;
  newParentTaskId: string | null;
  newTaskContentFolderId: string | null;
  taskId: string;
};

/** Resolve Folder inheritance from the direct Folder assignment of the root Task.
 * `undefined` means the hierarchy is invalid; `null` is a valid ungrouped root.
 */
export function getRootTaskContentFolderId(tasks: readonly Task[], taskId: string) {
  const hierarchy = buildTaskHierarchyAdapter(tasks);
  if (hierarchy.invalidTaskIds.has(taskId)) return undefined;
  return hierarchy.getParentChain(taskId).at(-1)?.task_content_folder_id ?? null;
}

/**
 * The only browser client door for changing Task hierarchy membership. The
 * database function owns the parent/Folder invariant and returns every
 * committed row changed by the hierarchy move so callers never have to
 * manufacture a local hierarchy projection.
 */
export async function moveTaskHierarchy(
  client: Client,
  input: MoveTaskHierarchyInput,
) {
  const result = await client.rpc("adhdice_move_task_hierarchy", {
    p_expected_canonical_revision: input.expectedCanonicalRevision ?? null,
    p_expected_revision: input.expectedRevision,
    p_new_parent_task_id: input.newParentTaskId,
    p_new_task_content_folder_id: input.newTaskContentFolderId,
    p_task_id: input.taskId,
  });

  return {
    data: (result.data ?? []) as TaskHierarchyRow[],
    error: result.error,
  };
}
