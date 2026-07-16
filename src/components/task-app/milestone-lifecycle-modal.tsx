"use client";

import { useState } from "react";
import { ModalShell } from "@/components/modal-shell";
import { TASK_TABLE_INPUT_CLASS, TaskTableChipButton } from "@/components/ui/task-table-primitives";
import type { Milestone } from "@/lib/database.types";

export type MilestoneLifecycleAction = "abandon" | "complete" | "reverse";

export function MilestoneLifecycleModal({ action, milestone, onCancel, onConfirm, pending }: {
  action: MilestoneLifecycleAction;
  milestone: Milestone;
  onCancel: () => void;
  onConfirm: (reason: string | null) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");
  const title = action === "complete"
    ? "Complete Milestone and award trophy?"
    : action === "reverse" ? "Undo Milestone completion?" : "Abandon Milestone?";
  const confirmLabel = action === "complete" ? "Complete Milestone" : action === "reverse" ? "Undo completion" : "Abandon Milestone";
  return (
    <ModalShell className="w-full max-w-lg rounded-[2rem] border border-[#ece8f8] bg-white p-6 shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]" label={title} onClose={pending ? undefined : onCancel}>
      <h2 className="text-2xl font-semibold text-[#242044] dark:text-white">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-6 text-[#756d92] dark:text-white/60">
        {action === "complete" ? <>
          <p>The task will be permanently completed.</p>
          <p>The locked <span className="capitalize">{milestone.current_tier}</span> trophy will be awarded.</p>
          <p>Aura eligibility depends on the locked target and grace dates.</p>
        </> : action === "reverse" ? <>
          <p>The trophy and aura will be revoked.</p>
          <p>The task will return to its exact pre-completion state.</p>
          <p>The original target and aura window will not reset.</p>
        </> : <p>The task will remain unchanged. This Milestone cannot be reactivated in this release.</p>}
      </div>
      {action === "abandon" ? <textarea aria-label="Optional abandonment reason" className={`${TASK_TABLE_INPUT_CLASS} mt-4 min-h-20`} onChange={(event) => setReason(event.target.value)} placeholder="Optional reason" value={reason} /> : null}
      <div className="mt-6 flex justify-end gap-2">
        <TaskTableChipButton disabled={pending} onClick={onCancel}>Cancel</TaskTableChipButton>
        <TaskTableChipButton disabled={pending} onClick={() => onConfirm(reason.trim() || null)} toneClassName="border-[#6f57f6] bg-[#6f57f6] text-white dark:border-[#7f67ff] dark:bg-[#7f67ff]">{pending ? "Saving…" : confirmLabel}</TaskTableChipButton>
      </div>
    </ModalShell>
  );
}
