"use client";

import type { ComponentProps } from "react";
import { ManualEntryModal } from "../focus-modals";
import { ModalShell } from "../modal-shell";
import { FocusPlannerModalAdapter as FocusPlannerModal, MomentumTaskModal, TaskHistoryModal } from "./task-view-adapters";
import { TaskBatchEditModal } from "./task-batch-edit-modal";
import { TaskEditorModal } from "./task-editor-modal";

type TaskEditFlowsProps = {
  actualTimeEntryFlow: ({
    initialDurationSeconds?: number;
    initialTitle: string;
    onClose: () => void;
  } & ComponentProps<typeof ManualEntryModal>) | null;
  batchDeleteFlow: {
    count: number;
    onClose: () => void;
    onConfirm: () => void;
    previewTitles: string[];
  } | null;
  batchEditFlow: ComponentProps<typeof TaskBatchEditModal> | null;
  focusPlannerFlow: ComponentProps<typeof FocusPlannerModal> | null;
  momentumFlow: ComponentProps<typeof MomentumTaskModal> | null;
  taskEditorFlow: ComponentProps<typeof TaskEditorModal> | null;
  taskHistoryFlow: ComponentProps<typeof TaskHistoryModal> | null;
};

export function TaskEditFlows({
  actualTimeEntryFlow,
  batchDeleteFlow,
  batchEditFlow,
  focusPlannerFlow,
  momentumFlow,
  taskEditorFlow,
  taskHistoryFlow,
}: TaskEditFlowsProps) {
  return (
    <>
      {focusPlannerFlow ? <FocusPlannerModal {...focusPlannerFlow} /> : null}
      {taskEditorFlow ? <TaskEditorModal {...taskEditorFlow} /> : null}
      {actualTimeEntryFlow ? (
        <ManualEntryModal
          {...actualTimeEntryFlow}
          initialDurationSeconds={actualTimeEntryFlow.initialDurationSeconds}
          initialTitle={actualTimeEntryFlow.initialTitle}
          onClose={actualTimeEntryFlow.onClose}
        />
      ) : null}
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
                {batchDeleteFlow.previewTitles.slice(0, 5).map((title) => (
                  <li key={title}>{title}</li>
                ))}
                {batchDeleteFlow.previewTitles.length > 5 ? (
                  <li className="text-[#7d88a1] dark:text-white/45">+{batchDeleteFlow.previewTitles.length - 5} more</li>
                ) : null}
              </ul>
            </div>
            <div className="flex justify-end gap-3">
              <button
                className="rounded-full border border-[#ddd6fb] bg-white px-5 py-3 text-sm font-semibold text-[#5c6684] transition hover:border-[#c9bcff] hover:text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70 dark:hover:text-[#cabfff]"
                onClick={batchDeleteFlow.onClose}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-full bg-[#f05566] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#df4059]"
                onClick={batchDeleteFlow.onConfirm}
                type="button"
              >
                Delete selected
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
