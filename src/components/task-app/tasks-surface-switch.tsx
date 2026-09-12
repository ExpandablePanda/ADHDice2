"use client";

import { AdhdChip } from "@/components/ui-system";
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
    <div className="adhdice-scrollbar adhdice-horizontal-scroll mt-1 flex w-full min-w-0 max-w-full justify-start overflow-x-auto px-1 sm:w-auto sm:justify-center sm:overflow-x-visible sm:px-0">
      <div className={`${TASKS_SURFACE_GROUP_CLASS} w-max min-w-max shrink-0`}>
        <AdhdChip
          aria-pressed={value === "tasks"}
          onClick={() => onChange("tasks")}
          toneClassName={value === "tasks" ? TASKS_SURFACE_ACTIVE_CHIP_CLASS : TASKS_SURFACE_INACTIVE_CHIP_CLASS}
        >
          Tasks
        </AdhdChip>
        <AdhdChip
          aria-pressed={value === "paths"}
          onClick={() => onChange("paths")}
          toneClassName={value === "paths" ? TASKS_SURFACE_ACTIVE_CHIP_CLASS : TASKS_SURFACE_INACTIVE_CHIP_CLASS}
        >
          Paths
        </AdhdChip>
        <AdhdChip
          aria-pressed={value === "report"}
          onClick={() => onChange("report")}
          toneClassName={value === "report" ? TASKS_SURFACE_ACTIVE_CHIP_CLASS : TASKS_SURFACE_INACTIVE_CHIP_CLASS}
        >
          Report
        </AdhdChip>
        <AdhdChip
          aria-pressed={value === "on_time"}
          onClick={() => onChange("on_time")}
          toneClassName={value === "on_time" ? TASKS_SURFACE_ACTIVE_CHIP_CLASS : TASKS_SURFACE_INACTIVE_CHIP_CLASS}
        >
          On-Time
        </AdhdChip>
        <AdhdChip
          aria-pressed={value === "brainstorm"}
          onClick={() => onChange("brainstorm")}
          toneClassName={value === "brainstorm" ? TASKS_SURFACE_ACTIVE_CHIP_CLASS : TASKS_SURFACE_INACTIVE_CHIP_CLASS}
        >
          Brainstorm
        </AdhdChip>
      </div>
    </div>
  );
}
