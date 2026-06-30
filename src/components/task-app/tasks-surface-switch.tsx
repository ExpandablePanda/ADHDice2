"use client";

import { TaskTableChipButton } from "@/components/ui/task-table-primitives";
import type { TasksSurface } from "@/lib/task-ui-state";

export const TASKS_SURFACE_ACTIVE_CHIP_CLASS = "border-[#6f57f6] bg-[#6f57f6] text-white dark:border-[#c9bbff] dark:bg-[#c9bbff] dark:text-[#1a1431]";
export const TASKS_SURFACE_INACTIVE_CHIP_CLASS = "border-[#e4deef] bg-[#fbfaff] text-[#5f6983] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/72";
export const TASKS_SURFACE_GROUP_CLASS = "inline-flex items-center gap-2 rounded-full border border-[#ece8f8] bg-white/88 p-1 shadow-[0_12px_28px_rgba(81,61,168,0.06)] dark:border-white/10 dark:bg-white/[0.04]";

export function TasksSurfaceSwitch({
  onChange,
  value,
}: {
  onChange: (value: TasksSurface) => void;
  value: TasksSurface;
}) {
  return (
    <div className="mt-1 flex justify-center">
      <div className={TASKS_SURFACE_GROUP_CLASS}>
        <TaskTableChipButton
          aria-pressed={value === "tasks"}
          onClick={() => onChange("tasks")}
          toneClassName={value === "tasks" ? TASKS_SURFACE_ACTIVE_CHIP_CLASS : TASKS_SURFACE_INACTIVE_CHIP_CLASS}
        >
          Tasks
        </TaskTableChipButton>
        <TaskTableChipButton
          aria-pressed={value === "paths"}
          onClick={() => onChange("paths")}
          toneClassName={value === "paths" ? TASKS_SURFACE_ACTIVE_CHIP_CLASS : TASKS_SURFACE_INACTIVE_CHIP_CLASS}
        >
          Paths
        </TaskTableChipButton>
      </div>
    </div>
  );
}
