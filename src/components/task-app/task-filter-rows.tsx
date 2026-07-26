"use client";

import { TASK_STATUS_CHIP_STYLES, formatTaskStatusLabel, renderTaskStatusChip, renderTaskStatusGlyph } from "./task-status-ui";
import {
  TASK_TABLE_ACTIVE_LIST_CHIP_CLASS,
  TASK_TABLE_CHIP_BASE_CLASS,
  TASK_TABLE_LIST_CHIP_CLASS,
  TaskTableChipButton,
} from "@/components/ui/task-table-primitives";
import type { TaskEnergy, TaskStatus } from "@/lib/database.types";
import { ArrowDown, ArrowUp, ChevronDown, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { TASK_FILTER_STATUS_OPTIONS } from "@/lib/task-filter-state";
import { formatOptionLabel } from "@/lib/task-label-format";
import { AdhdDropdownPanel } from "@/components/ui-system";
import type { ListSortField, ListSortPreference } from "@/lib/task-list-sort";
import type { TaskTableColumnFilters } from "@/lib/task-ui-state";

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
  includeSteps: boolean;
  hasActiveFilters: boolean;
  isOpen: boolean;
  matchAny: boolean;
  pinnedCount?: number;
  pinnedFilterActive?: boolean;
  routineCount?: number;
  routineFilterActive?: boolean;
  onReset: () => void;
  onTogglePinnedFilter?: () => void;
  onToggleRoutineFilter?: () => void;
  onToggleDuplicateTitleMode: () => void;
  onToggleIncludeSteps: () => void;
  onToggleEnergy: (energy: TaskEnergy) => void;
  onToggleMatchMode: () => void;
  onToggleOpen: () => void;
  onToggleStatusFilter: (status: TaskStatus) => void;
  selectedEnergies: TaskEnergy[];
  selectedStatuses: TaskStatus[];
  statusCounts: Record<TaskStatus, number>;
  tableColumnFilters?: TaskTableColumnFilters;
  onClearTableColumnFilter?: (dimension: "priority" | "repeat" | keyof TaskTableColumnFilters["text"]) => void;
  listSortPreference?: ListSortPreference;
  onListSortPreferenceChange?: (preference: ListSortPreference) => void;
};

const LIST_SORT_OPTIONS: Array<{ label: string; value: ListSortField }> = [
  { label: "Manual", value: "manual" },
  { label: "Due date", value: "due_date" },
  { label: "Status", value: "status" },
  { label: "Priority", value: "priority" },
  { label: "Title", value: "title" },
  { label: "Recently updated", value: "recently_updated" },
  { label: "Streak", value: "streak" },
  { label: "Estimated duration", value: "estimated_duration" },
];

function ListSortFilterControls({
  onChange,
  preference,
}: {
  onChange: (preference: ListSortPreference) => void;
  preference: ListSortPreference;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ left: 8, top: 8 });
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const selectedLabel = LIST_SORT_OPTIONS.find((option) => option.value === preference.field)?.label ?? "Manual";

  const openPanel = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const estimatedPanelHeight = 280;
      const belowTop = rect.bottom + 8;
      setPanelPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 232)),
        top: belowTop + estimatedPanelHeight <= window.innerHeight - 8
          ? belowTop
          : Math.max(8, rect.top - estimatedPanelHeight - 8),
      });
    }
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return;
    const close = () => setIsOpen(false);
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [isOpen]);

  return (
    <>
      <span className="relative shrink-0" ref={triggerRef}>
        <TaskTableChipButton
          aria-expanded={isOpen}
          aria-haspopup="menu"
          className="gap-1.5"
          onClick={() => isOpen ? setIsOpen(false) : openPanel()}
          toneClassName={FILTER_LABEL_CHIP_CLASS}
        >
          Sort: {selectedLabel}
          <ChevronDown className={`h-3.5 w-3.5 transition ${isOpen ? "rotate-180" : ""}`} />
        </TaskTableChipButton>
      </span>
      {preference.field !== "manual" ? (
        <TaskTableChipButton
          aria-label={preference.direction === "asc" ? "Sort descending" : "Sort ascending"}
          className="gap-1.5"
          onClick={() => onChange({ ...preference, direction: preference.direction === "asc" ? "desc" : "asc" })}
          toneClassName={FILTER_LABEL_CHIP_CLASS}
        >
          {preference.direction === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
          {preference.direction === "asc" ? "Ascending" : "Descending"}
        </TaskTableChipButton>
      ) : null}
      {isOpen && typeof document !== "undefined" ? createPortal(
        <div ref={panelRef}>
          <AdhdDropdownPanel
            className="z-[80] max-h-[calc(100vh-1rem)] overflow-y-auto px-2 py-2"
            role="menu"
            style={{ left: panelPosition.left, position: "fixed", top: panelPosition.top }}
            widthClassName="w-[min(14rem,calc(100vw-1rem))]"
          >
            <div className="flex flex-col items-start gap-1">
              {LIST_SORT_OPTIONS.map((option) => (
                <TaskTableChipButton
                  aria-checked={preference.field === option.value}
                  className="w-full justify-start text-left"
                  key={option.value}
                  onClick={() => {
                    onChange({
                      direction: option.value === "manual" ? "asc" : preference.direction,
                      field: option.value,
                    });
                    setIsOpen(false);
                  }}
                  role="menuitemradio"
                  toneClassName={preference.field === option.value ? FILTER_ACTIVE_CHIP_CLASS : FILTER_LABEL_CHIP_CLASS}
                >
                  {option.label}
                </TaskTableChipButton>
              ))}
            </div>
          </AdhdDropdownPanel>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

export function FilterRowsComponent({
  compact = false,
  duplicateTitleMode,
  includeSteps,
  hasActiveFilters,
  isOpen,
  matchAny,
  pinnedCount = 0,
  pinnedFilterActive = false,
  routineCount = 0,
  routineFilterActive = false,
  onReset,
  onTogglePinnedFilter,
  onToggleRoutineFilter,
  onToggleDuplicateTitleMode,
  onToggleIncludeSteps,
  onToggleEnergy,
  onToggleMatchMode,
  onToggleOpen,
  onToggleStatusFilter,
  selectedEnergies,
  selectedStatuses,
  statusCounts,
  tableColumnFilters,
  onClearTableColumnFilter,
  listSortPreference,
  onListSortPreferenceChange,
}: FilterRowsProps) {
  const bucketFilterCount = (pinnedFilterActive ? 1 : 0) + (routineFilterActive ? 1 : 0);
  const tableFilterCount = (tableColumnFilters?.priority.length ? 1 : 0)
    + (tableColumnFilters?.repeat.length ? 1 : 0)
    + Object.values(tableColumnFilters?.text ?? {}).filter((value) => value?.trim()).length;
  const activeFilterCount = selectedStatuses.length + selectedEnergies.length + bucketFilterCount + (duplicateTitleMode ? 1 : 0) + tableFilterCount;
  const searchModeActiveCount = bucketFilterCount + (duplicateTitleMode ? 1 : 0);
  const activeTableColumnFilterChips = [
    ...(tableColumnFilters?.priority.length ? [{ dimension: "priority" as const, label: `Table Priority: ${tableColumnFilters.priority.join(", ")}` }] : []),
    ...(tableColumnFilters?.repeat.length ? [{ dimension: "repeat" as const, label: `Table Repeat: ${tableColumnFilters.repeat.map(formatOptionLabel).join(", ")}` }] : []),
    ...Object.entries(tableColumnFilters?.text ?? {})
      .filter((entry): entry is [keyof TaskTableColumnFilters["text"], string] => Boolean(entry[1]?.trim()))
      .map(([dimension, value]) => ({ dimension, label: `Table ${formatOptionLabel(dimension)}: ${value}` })),
  ];

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
          {onToggleRoutineFilter ? (
            <FilterChip active={routineFilterActive} onClick={onToggleRoutineFilter}>
              Routine{routineCount > 0 ? ` ${routineCount}` : ""}
            </FilterChip>
          ) : null}
          <FilterChip active={duplicateTitleMode} onClick={onToggleDuplicateTitleMode}>Duplicates</FilterChip>
          <FilterChip active={includeSteps} onClick={onToggleIncludeSteps}>Include Steps</FilterChip>
          {listSortPreference && onListSortPreferenceChange ? (
            <ListSortFilterControls onChange={onListSortPreferenceChange} preference={listSortPreference} />
          ) : null}
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
          {activeTableColumnFilterChips.map((filter) => (
            <TaskTableChipButton
              className="gap-1.5"
              key={filter.dimension}
              onClick={() => onClearTableColumnFilter?.(filter.dimension)}
              toneClassName={FILTER_ACTIVE_CHIP_CLASS}
            >
              {filter.label}
              <X className="h-3 w-3" />
            </TaskTableChipButton>
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
                {searchModeActiveCount > 0 ? (
                  <span className="text-xs font-semibold text-[#7c86a2] dark:text-white/50">{searchModeActiveCount} active</span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3">
                {onTogglePinnedFilter ? (
                  <FilterChip active={pinnedFilterActive} onClick={onTogglePinnedFilter}>
                    Pinned{pinnedCount > 0 ? ` ${pinnedCount}` : ""}
                  </FilterChip>
                ) : null}
                {onToggleRoutineFilter ? (
                  <FilterChip active={routineFilterActive} onClick={onToggleRoutineFilter}>
                    Routine{routineCount > 0 ? ` ${routineCount}` : ""}
                  </FilterChip>
                ) : null}
                <FilterChip active={duplicateTitleMode} onClick={onToggleDuplicateTitleMode}>Duplicates</FilterChip>
                <FilterChip active={includeSteps} onClick={onToggleIncludeSteps}>Include Steps</FilterChip>
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
