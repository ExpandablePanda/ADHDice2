"use client";

import { TASK_STATUS_CHIP_STYLES, formatTaskStatusLabel, renderTaskStatusChip, renderTaskStatusGlyph } from "./task-status-ui";
import {
  TASK_TABLE_ACTIVE_LIST_CHIP_CLASS,
  TASK_TABLE_CHIP_BASE_CLASS,
  TASK_TABLE_LIST_CHIP_CLASS,
  TaskTableChipButton,
} from "@/components/ui/task-table-primitives";
import type { TaskEnergy, TaskStatus } from "@/lib/database.types";
import type { ReactNode } from "react";
import { TASK_FILTER_STATUS_OPTIONS } from "@/lib/task-filter-state";
import { formatOptionLabel } from "@/lib/task-label-format";

const ENERGY_OPTIONS: TaskEnergy[] = ["none", "low", "medium", "high"];
const CHIP_BUTTON_CLASS = "shrink-0 appearance-none bg-transparent p-0 text-left";
const FILTER_LABEL_CHIP_CLASS = TASK_TABLE_LIST_CHIP_CLASS;
const FILTER_ACTIVE_CHIP_CLASS = TASK_TABLE_ACTIVE_LIST_CHIP_CLASS;
const COMPACT_ACTIVE_STATUS_CHIP_STYLES: Record<TaskStatus, string> = {
  pending: "border-[#d96b1c] bg-[#d96b1c] text-white",
  in_progress: "border-[#4473df] bg-[#4473df] text-white",
  delayed: "border-[#7d54d1] bg-[#7d54d1] text-white",
  done: "border-[#119a69] bg-[#119a69] text-white",
  missed: "border-[#d94e67] bg-[#d94e67] text-white",
  did_my_best: "border-[#b28700] bg-[#b28700] text-white",
  complete: "border-[#256947] bg-[#256947] text-white",
  upcoming: "border-[#68738c] bg-[#68738c] text-white",
  not_due: "border-[#3388c9] bg-[#3388c9] text-white",
  archived: "border-[#5e687d] bg-[#5e687d] text-white",
  trashed: "border-[#d94e67] bg-[#d94e67] text-white",
};

function FilterChip({
  active = false,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <TaskTableChipButton onClick={onClick} toneClassName={active ? FILTER_ACTIVE_CHIP_CLASS : FILTER_LABEL_CHIP_CLASS}>
      {children}
    </TaskTableChipButton>
  );
}

function CompactStatusFilterChip({
  count,
  onClick,
  selected,
  status,
}: {
  count: number;
  onClick: () => void;
  selected: boolean;
  status: TaskStatus;
}) {
  const circleBorderClassName = status === "not_due" ? "border-dashed" : "border";

  return (
    <TaskTableChipButton
      className={`transition ${selected ? "" : "opacity-85 hover:opacity-100"}`}
      onClick={onClick}
      toneClassName={selected ? COMPACT_ACTIVE_STATUS_CHIP_STYLES[status] : TASK_STATUS_CHIP_STYLES[status]}
    >
      <span className="inline-flex items-center gap-1 text-inherit">
        <span className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full ${circleBorderClassName} border-current text-current`}>
          <span className="inline-flex scale-[0.8] items-center justify-center">
            {renderTaskStatusGlyph(status, "sm")}
          </span>
        </span>
        <span>{formatTaskStatusLabel(status)}</span>
        <span className="opacity-80">{count}</span>
      </span>
    </TaskTableChipButton>
  );
}

type FilterRowsProps = {
  compact?: boolean;
  duplicateTitleMode: boolean;
  hasActiveFilters: boolean;
  isOpen: boolean;
  matchAny: boolean;
  pinnedCount?: number;
  pinnedFilterActive?: boolean;
  onReset: () => void;
  onTogglePinnedFilter?: () => void;
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
  pinnedCount = 0,
  pinnedFilterActive = false,
  onReset,
  onTogglePinnedFilter,
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
    <div className={`${compact ? "space-y-2" : "mt-5"}`}>
      {compact ? (
        <div className="adhdice-scrollbar flex gap-2 overflow-x-auto pb-0.5">
          <span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${FILTER_LABEL_CHIP_CLASS}`}>
            Filters
            {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </span>
          {hasActiveFilters ? (
            <button
              className={CHIP_BUTTON_CLASS}
              onClick={onReset}
              type="button"
            >
              <span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${FILTER_LABEL_CHIP_CLASS}`}>Reset</span>
            </button>
          ) : null}
          {onTogglePinnedFilter ? (
            <FilterChip active={pinnedFilterActive} onClick={onTogglePinnedFilter}>
              Pinned{pinnedCount > 0 ? ` ${pinnedCount}` : ""}
            </FilterChip>
          ) : null}
          <FilterChip active={duplicateTitleMode} onClick={onToggleDuplicateTitleMode}>Duplicates</FilterChip>
          {TASK_FILTER_STATUS_OPTIONS.map((status) => (
            <CompactStatusFilterChip
              count={statusCounts[status]}
              key={status}
              onClick={() => onToggleStatusFilter(status)}
              selected={selectedStatuses.includes(status)}
              status={status}
            />
          ))}
          <FilterChip active onClick={onToggleMatchMode}>{matchAny ? "OR" : "AND"}</FilterChip>
          {ENERGY_OPTIONS.map((energy) => (
            <FilterChip
              active={selectedEnergies.includes(energy)}
              key={energy}
              onClick={() => onToggleEnergy(energy)}
            >
              {formatOptionLabel(energy)}
            </FilterChip>
          ))}
        </div>
      ) : (
        <button
          className={CHIP_BUTTON_CLASS}
          onClick={onToggleOpen}
          type="button"
        >
          <span className={FILTER_LABEL_CHIP_CLASS}>
            {isOpen ? "Hide Filters" : "Show Filters"}
            {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </span>
        </button>
      )}
      {isOpen && !compact ? (
        <div
          className="mt-3 rounded-[1.2rem] border border-[#efe9ff] bg-white p-4 shadow-[0_18px_36px_rgba(81,61,168,0.12)] dark:border-white/10 dark:bg-[#171328]"
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
                {onTogglePinnedFilter ? (
                  <FilterChip active={pinnedFilterActive} onClick={onTogglePinnedFilter}>
                    Pinned{pinnedCount > 0 ? ` ${pinnedCount}` : ""}
                  </FilterChip>
                ) : null}
                <FilterChip active={duplicateTitleMode} onClick={onToggleDuplicateTitleMode}>Duplicates</FilterChip>
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
                <FilterChip active onClick={onToggleMatchMode}>{matchAny ? "OR" : "AND"}</FilterChip>
                {ENERGY_OPTIONS.map((energy) => (
                  <FilterChip
                    active={selectedEnergies.includes(energy)}
                    key={energy}
                    onClick={() => onToggleEnergy(energy)}
                  >
                    {formatOptionLabel(energy)}
                  </FilterChip>
                ))}
              </div>
            </div>
            {hasActiveFilters && !compact ? (
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
