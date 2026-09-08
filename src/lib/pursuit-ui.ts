import type { AdhdIconButtonTone } from "@/components/ui-system/adhd-icon-button";
import type { Pursuit, PursuitInsert } from "@/lib/database.types";
import type { PursuitAttention } from "@/lib/pursuit-domain";

export type PursuitInlineCreateInput = Pick<PursuitInsert, "parent_pursuit_id" | "parent_task_id" | "title"> & {
  notes: null;
  revisit_interval_days: null;
  tags: string[];
};

export function getPursuitCompletionTone(attention: PursuitAttention | undefined, pursuit: Pick<Pursuit, "status">): AdhdIconButtonTone {
  if (pursuit.status !== "active") return "ghost";
  if (attention?.completionSummary.completedToday) return "success";
  if (attention?.needsAttention) return "warning";
  return "default";
}

export function buildPursuitInlineCreateInput(title: string, parent: { pursuitId?: string | null; taskId?: string | null }): PursuitInlineCreateInput {
  return {
    notes: null,
    parent_pursuit_id: parent.pursuitId ?? null,
    parent_task_id: parent.taskId ?? null,
    revisit_interval_days: null,
    tags: [],
    title: title.trim(),
  };
}
