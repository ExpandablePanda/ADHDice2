"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import type { Task, TaskStatus } from "@/lib/database.types";
import { formatTaskStatusLabel } from "@/components/task-app/task-status-ui";
import { buildOnTimeHierarchy, isOnTimeTaskEligible } from "@/lib/on-time-planner";
import { TASK_TABLE_INPUT_CLASS, TaskTableChipButton } from "@/components/ui/task-table-primitives";

export function OnTimePlannerPicker({ linkedTaskIds, onAdd, taskDisplayStatusByTaskId, tasks }: {
  linkedTaskIds: ReadonlySet<string>;
  onAdd: (task: Task, hierarchy: string[]) => void;
  taskDisplayStatusByTaskId: Record<string, TaskStatus>;
  tasks: Task[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const options = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tasks.filter((task) => isOnTimeTaskEligible(task, linkedTaskIds)).map((task) => {
      const hierarchy = buildOnTimeHierarchy(task, tasksById);
      const search = [task.title, task.notes, ...task.tags, ...hierarchy].filter(Boolean).join(" ").toLowerCase();
      return { task, hierarchy, search };
    }).filter((option) => !needle || option.search.includes(needle));
  }, [linkedTaskIds, query, tasks, tasksById]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  return <div className="relative" ref={rootRef}>
    <TaskTableChipButton onClick={() => setOpen((current) => !current)}><Plus size={13} /> Add task</TaskTableChipButton>
    {open ? <div className="absolute left-0 top-full z-40 mt-2 w-[min(92vw,28rem)] rounded-[1.2rem] border border-[#e4def2] bg-white p-3 shadow-xl dark:border-white/15 dark:bg-[#201a35]">
      <div className="flex items-center gap-2"><Search size={15} className="text-[#938ab8]" /><input autoFocus className={TASK_TABLE_INPUT_CLASS} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks, notes, or tags" value={query} /><button aria-label="Close task picker" className="p-1 text-[#80799c]" onClick={() => setOpen(false)} type="button"><X size={17} /></button></div>
      <div className="mt-2 max-h-[min(55vh,25rem)] space-y-1 overflow-y-auto">
        {options.length ? options.map(({ task, hierarchy }) => {
          return <button className="block w-full rounded-xl px-3 py-2 text-left hover:bg-[#f6f2ff] dark:hover:bg-white/8" key={task.id} onClick={() => onAdd(task, hierarchy)} type="button">
            <span className="block text-sm font-medium text-[#443d60] dark:text-white/80">{task.title || "Untitled task"}</span>
            <span className="mt-0.5 block text-xs text-[#837b9e] dark:text-white/48">{hierarchy.length ? `${hierarchy.join(" › ")} › ` : ""}{formatTaskStatusLabel(taskDisplayStatusByTaskId[task.id] ?? task.status)} · {task.estimated_minutes ? `${task.estimated_minutes} min manual` : "Time needed"}</span>
          </button>;
        }) : <p className="px-3 py-6 text-center text-sm text-[#837b9e]">No matching tasks</p>}
      </div>
    </div> : null}
  </div>;
}
