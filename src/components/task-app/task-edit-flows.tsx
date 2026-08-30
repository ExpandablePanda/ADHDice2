"use client";

import type { ComponentProps } from "react";
import { ModalShell } from "../modal-shell";
import { FocusPlannerModalAdapter as FocusPlannerModal, MomentumTaskModal, TaskHistoryModal } from "./task-view-adapters";
import { TaskBatchEditModal } from "./task-batch-edit-modal";

type TaskEditFlowsProps = {
  batchDeleteFlow: {
    count: number;
    onClose: () => void;
    onConfirm: () => void;
    previewTasks: Array<{ id: string; title: string }>;
  } | null;
  batchEditFlow: ComponentProps<typeof TaskBatchEditModal> | null;
  completeFlow: {
    confirmLabel: string;
    description: string;
    modalLabel: string;
    onClose: () => void;
    onConfirm: () => void;
    pending?: boolean;
    taskTitle: string;
    title: string;
  } | null;
  focusPlannerFlow: ComponentProps<typeof FocusPlannerModal> | null;
  momentumFlow: ComponentProps<typeof MomentumTaskModal> | null;
  taskHistoryFlow: ComponentProps<typeof TaskHistoryModal> | null;
};

export function TaskEditFlows({
  batchDeleteFlow,
  batchEditFlow,
  completeFlow,
  focusPlannerFlow,
  momentumFlow,
  taskHistoryFlow,
}: TaskEditFlowsProps) {
  return (
    <>
      {focusPlannerFlow ? <FocusPlannerModal {...focusPlannerFlow} /> : null}
      {batchEditFlow ? <TaskBatchEditModal {...batchEditFlow} /> : null}
      {batchDeleteFlow ? (
        <ModalShell className="w-full max-w-lg rounded-[2rem] border border-[#ece8f8] bg-white p-6 shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]" label="Delete selected tasks" onClose={batchDeleteFlow.onClose}>
          <div className="space-y-5">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[#7a63f7] dark:text-[#c9bbff]">Delete Selected</p>
              <h2 className="mt-2 text-2xl font-black text-[#1f2642] dark:text-white">Delete {batchDeleteFlow.count} task{batchDeleteFlow.count === 1 ? "" : "s"}?</h2>
              <p className="mt-2 text-sm text-[#7d88a1] dark:text-white/55">This removes the selected tasks from your list. This action cannot be undone from the batch bar.</p>
            </div>
            <div className="rounded-[1.2rem] border border-[#ece8f8] bg-[#faf8ff] p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Preview</p>
              <ul className="mt-3 space-y-2 text-sm text-[#38415e] dark:text-white/75">
                {batchDeleteFlow.previewTasks.slice(0, 5).map((task) => (
                  <li key={task.id}>{task.title}</li>
                ))}
                {batchDeleteFlow.previewTasks.length > 5 ? (
                  <li className="text-[#7d88a1] dark:text-white/45">+{batchDeleteFlow.previewTasks.length - 5} more</li>
                ) : null}
              </ul>
            </div>
            <div className="flex justify-end gap-3">
              <button
                className="ui-pill-button-light transition"
                onClick={batchDeleteFlow.onClose}
                type="button"
              >
                Cancel
              </button>
              <button
                className="ui-pill-button-danger-light transition"
                onClick={batchDeleteFlow.onConfirm}
                type="button"
              >
                Delete selected
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
      {completeFlow ? (
        <ModalShell className="w-full max-w-lg rounded-[2rem] border border-[#ece8f8] bg-white p-6 shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]" label={completeFlow.modalLabel} onClose={completeFlow.pending ? undefined : completeFlow.onClose}>
          <div className="space-y-5">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[#256947] dark:text-[#94d0ad]">Complete</p>
              <h2 className="mt-2 text-2xl font-black text-[#1f2642] dark:text-white">{completeFlow.title}</h2>
              <p className="mt-2 text-sm text-[#7d88a1] dark:text-white/55">{completeFlow.description}</p>
            </div>
            <div className="rounded-[1.2rem] border border-[#e4efe8] bg-[#f7fcf8] p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#5b8a6d] dark:text-white/40">Task</p>
              <p className="mt-3 text-sm text-[#38415e] dark:text-white/75">{completeFlow.taskTitle}</p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                className="ui-pill-button-light transition"
                disabled={completeFlow.pending}
                onClick={completeFlow.onClose}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-full border border-[#5d9b76] bg-white px-4 py-2 text-sm font-semibold text-[#256947] transition hover:bg-[#f3fbf5] dark:border-[#44785a] dark:bg-[#13251a] dark:text-[#9ed7b2] dark:hover:bg-[#193222]"
                disabled={completeFlow.pending}
                onClick={completeFlow.onConfirm}
                type="button"
              >
                {completeFlow.pending ? "Completing…" : completeFlow.confirmLabel}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
      {taskHistoryFlow ? <TaskHistoryModal {...taskHistoryFlow} /> : null}
      {momentumFlow ? <MomentumTaskModal {...momentumFlow} /> : null}
    </>
  );
}
