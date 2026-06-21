"use client";

import { Pill } from "./task-editor-fields";
import { TASK_STATUS_CHIP_STYLES, renderTaskStatusChip } from "./task-status-ui";
import { TaskTableChipButton } from "@/components/ui/task-table-primitives";
import type { TaskEnergy, TaskStatus } from "@/lib/database.types";
import { TASK_FILTER_STATUS_OPTIONS } from "@/lib/task-filter-state";
import { formatOptionLabel } from "@/lib/task-label-format";

const ENERGY_OPTIONS: TaskEnergy[] = ["none", "low", "medium", "high"];
const CHIP_BUTTON_CLASS = "shrink-0 appearance-none bg-transparent p-0 text-left";
const CHIP_MUTED_CLASS = "inline-flex items-center rounded-full bg-[#f1ecff] px-3 py-1.5 text-xs font-semibold leading-none text-[#5f6983] dark:bg-[#22193f] dark:text-[#cabfff]";

type FilterRowsProps = {
  compact?: boolean;
  duplicateTitleMode: boolean;
  hasActiveFilters: boolean;
  isOpen: boolean;
  matchAny: boolean;
  onReset: () => void;
  onToggleDuplicateTitleMode: () => void;
  onToggleEnergy: (energy: TaskEnergy) => void;
  onToggleMatchMode: () => void;
  onToggleOpen: () => void;
  onToggleStatusFilter: (status: TaskStatus) => void;
  selectedEnergies: TaskEnergy[];
  selectedStatuses: TaskStatus[];
  statusCounts: Record<TaskStatus, number>;
};

export function FilterRowsComponent({
  compact = false,
  duplicateTitleMode,
  hasActiveFilters,
  isOpen,
  matchAny,
  onReset,
  onToggleDuplicateTitleMode,
  onToggleEnergy,
  onToggleMatchMode,
  onToggleOpen,
  onToggleStatusFilter,
  selectedEnergies,
  selectedStatuses,
  statusCounts,
}: FilterRowsProps) {
  const activeFilterCount = selectedStatuses.length + selectedEnergies.length + (duplicateTitleMode ? 1 : 0);

  return (
    <div className={`${compact ? "relative" : "mt-5"}`}>
      <button
        className={CHIP_BUTTON_CLASS}
        onClick={onToggleOpen}
        type="button"
      >
        <span className={CHIP_MUTED_CLASS}>
          {isOpen ? "Hide Filters" : "Show Filters"}
          {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </span>
      </button>
      {isOpen ? (
        <div
          className={`${
            compact
              ? "absolute right-0 top-full z-30 mt-2 w-[min(44rem,calc(100vw-2rem))]"
              : "mt-3"
          } rounded-[1.2rem] border border-[#efe9ff] bg-white p-4 shadow-[0_18px_36px_rgba(81,61,168,0.12)] dark:border-white/10 dark:bg-[#171328]`}
        >
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e88a9] dark:text-white/35">Search modes</p>
                {duplicateTitleMode ? (
                  <span className="text-xs font-semibold text-[#7c86a2] dark:text-white/50">1 active</span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3">
                <Pill onClick={onToggleDuplicateTitleMode} selected={duplicateTitleMode}>Duplicates</Pill>
              </div>
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e88a9] dark:text-white/35">Status</p>
                {selectedStatuses.length > 0 ? (
                  <span className="text-xs font-semibold text-[#7c86a2] dark:text-white/50">{selectedStatuses.length} active</span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3">
                {TASK_FILTER_STATUS_OPTIONS.map((status) => (
                  <TaskTableChipButton
                    className={`transition ${selectedStatuses.includes(status) ? "ring-2 ring-[#6f57f6]/35" : "opacity-85 hover:opacity-100"}`}
                    key={status}
                    onClick={() => onToggleStatusFilter(status)}
                    toneClassName={TASK_STATUS_CHIP_STYLES[status]}
                  >
                    {renderTaskStatusChip(status, { count: statusCounts[status], size: "sm" })}
                  </TaskTableChipButton>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8e88a9] dark:text-white/35">Energy</p>
                {selectedEnergies.length > 0 ? (
                  <span className="text-xs font-semibold text-[#7c86a2] dark:text-white/50">{selectedEnergies.length} active</span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3">
                <Pill onClick={onToggleMatchMode} selected>{matchAny ? "OR" : "AND"}</Pill>
                {ENERGY_OPTIONS.map((energy) => (
                  <Pill
                    key={energy}
                    onClick={() => onToggleEnergy(energy)}
                    selected={selectedEnergies.includes(energy)}
                  >
                    {formatOptionLabel(energy)}
                  </Pill>
                ))}
              </div>
            </div>
            {hasActiveFilters ? (
              <div className="flex justify-end">
                <button
                  className="ui-pill-button-light"
                  onClick={onReset}
                  type="button"
                >
                  Reset Filters
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
