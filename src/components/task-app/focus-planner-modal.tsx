"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { ModalShell } from "../modal-shell";
import { isTaskUrgent } from "@/lib/task-buckets";
import { isDueToday } from "@/lib/task-cockpit";
import type { Task } from "@/lib/database.types";
import { formatTaskMetaLine } from "@/lib/task-formatting";

type FocusPlannerStep = 0 | 1 | 2;

function EmptyTaskState({ text }: { text: string }) {
  return (
    <div className="rounded-[1.25rem] border border-dashed px-4 py-5 text-sm border-[#ddd6f9] bg-[#faf8ff] text-[#7b84a0] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55">
      {text}
    </div>
  );
}

type FocusPlannerModalProps = {
  draftIds: string[];
  onClose: () => void;
  onFinish: () => void;
  onSetDraftIds: (ids: string[]) => void;
  onStepChange: (step: FocusPlannerStep) => void;
  step: FocusPlannerStep;
  tasks: Task[];
};

export function FocusPlannerModalComponent({
  draftIds,
  onClose,
  onFinish,
  onSetDraftIds,
  onStepChange,
  step,
  tasks,
}: FocusPlannerModalProps) {
  const [search, setSearch] = useState("");
  const prompts = [
    "What tasks must be done today?",
    "What tasks are causing you stress?",
    "One task if you had nothing else to do?",
  ] as const;
  const filtered = tasks.filter((task) => {
    const matchesSearch = search.trim().length === 0 || task.title.toLowerCase().includes(search.trim().toLowerCase());
    const matchesStep = step === 0
      ? isDueToday(task.due_on) || isTaskUrgent(task)
      : step === 1
        ? isTaskUrgent(task) || task.energy === "high"
        : true;
    return matchesSearch && matchesStep;
  });

  return (
    <ModalShell className="w-full max-w-[42rem] rounded-[2rem] border p-5 border-[#ece8f8] bg-white shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]" label="New task wizard" onClose={onClose}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[#7b63f7] dark:text-[#c9bbff]">Step {step + 1} of 3</p>
        <button aria-label="Close" className="text-2xl text-[#8e97af] dark:text-white/55" onClick={onClose} type="button">×</button>
      </div>
      <h2 className="mt-4 text-3xl font-black text-[#1f2746] dark:text-white">{prompts[step]}</h2>
      <label className="mt-5 flex items-center gap-3 rounded-[1.3rem] px-4 py-3 bg-[#faf8ff] dark:bg-white/8">
        <Search className="h-5 w-5 text-[#7b63f7] dark:text-[#c9bbff]" />
        <input
          className="w-full bg-transparent outline-none text-[#24304b] placeholder:text-[#9aa2bb] dark:text-white dark:placeholder:text-white/35"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search tasks..."
          value={search}
        />
      </label>
      <div className="adhdice-scrollbar mt-4 max-h-[24rem] overflow-y-auto rounded-[1.5rem] border border-[#ece8f8] bg-[#fcfbff] dark:border-white/10 dark:bg-white/[0.03]">
        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyTaskState text="No tasks match this step yet." />
          </div>
        ) : null}
        {filtered.map((task) => {
          const checked = draftIds.includes(task.id);
          return (
            <label className="flex cursor-pointer items-center gap-3 border-b px-4 py-4 last:border-b-0 border-[#ece8f8] dark:border-white/10" key={task.id}>
              <input
                checked={checked}
                className="h-5 w-5 rounded"
                onChange={() => onSetDraftIds(checked ? draftIds.filter((id) => id !== task.id) : [...draftIds, task.id])}
                type="checkbox"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold text-[#24304b] dark:text-white">{task.title}</p>
                <p className="mt-1 text-sm text-[#7b84a0] dark:text-white/55">{formatTaskMetaLine(task)}</p>
              </div>
            </label>
          );
        })}
      </div>
      <button
        className="mt-5 w-full rounded-[1.25rem] px-5 py-4 text-lg font-bold bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]"
        onClick={() => {
          if (step === 2) {
            onFinish();
            return;
          }
          onStepChange((step + 1) as FocusPlannerStep);
        }}
        type="button"
      >
        {step === 2 ? "Finish" : "Next Question"}
      </button>
    </ModalShell>
  );
}
