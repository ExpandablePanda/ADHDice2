"use client";

import { BookOpen, Check, ChevronDown, Search, Trash2 } from "lucide-react";
import { startTransition, useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import type { MouseEvent } from "react";
import type { AgentPlanColumnId } from "@/components/ui/agent-plan";

import type { Task } from "@/lib/database.types";
import type { TaskViewMode } from "@/lib/task-ui-state";

const CHIP_BUTTON_CLASS = "shrink-0 appearance-none bg-transparent p-0 text-left";
const CHIP_SIZE_CLASS = "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold leading-none";
const CHIP_PURPLE_CLASS = `${CHIP_SIZE_CLASS} bg-[#f1ecff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`;
const CHIP_MUTED_CLASS = `${CHIP_SIZE_CLASS} bg-[#f1ecff] text-[#5f6983] dark:bg-[#22193f] dark:text-[#cabfff]`;
const CHIP_ACTIVE_CLASS = `${CHIP_SIZE_CLASS} bg-[#ede8ff] text-[#6f57f6] dark:bg-[#261e49] dark:text-[#cabfff]`;
const CHIP_PRIMARY_CLASS = `${CHIP_SIZE_CLASS} bg-[#6f57f6] text-white dark:bg-[#c9bbff] dark:text-[#1a1431]`;

function TaskChipButton({
  active,
  children,
  onClick,
  tone = "muted",
}: {
  active?: boolean;
  children: ReactNode;
  onClick: () => void;
  tone?: "muted" | "primary" | "purple";
}) {
  const chipClass = active
    ? CHIP_ACTIVE_CLASS
    : tone === "primary"
      ? CHIP_PRIMARY_CLASS
      : tone === "purple"
        ? CHIP_PURPLE_CLASS
        : CHIP_MUTED_CLASS;

  return (
    <button
      aria-pressed={active}
      className={CHIP_BUTTON_CLASS}
      onClick={onClick}
      type="button"
    >
      <span className={chipClass}>
        {children}
      </span>
    </button>
  );
}

function TaskViewsMenu({
  onViewChange,
  view,
}: {
  onViewChange: (view: TaskViewMode) => void;
  view: TaskViewMode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const viewOptions: Array<{ label: string; value: TaskViewMode }> = [
    { label: "List View", value: "list" },
    { label: "Cards", value: "cards" },
    { label: "Matrix", value: "matrix" },
    { label: "Grid", value: "grid" },
  ];

  return (
    <div className="relative">
      <button
        aria-expanded={isOpen}
        className={CHIP_BUTTON_CLASS}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className={`${CHIP_MUTED_CLASS} gap-2`}>
          Views
          <ChevronDown className={`h-4 w-4 transition ${isOpen ? "rotate-180" : ""}`} />
        </span>
      </button>
      {isOpen ? (
        <div className="absolute left-0 top-[calc(100%+0.55rem)] z-30 min-w-40 rounded-[1.25rem] border border-[#ede6ff] bg-white/95 p-2 text-left shadow-[0_20px_60px_rgba(111,87,246,0.16)] backdrop-blur dark:border-white/10 dark:bg-[#1b1530]/95">
          <div className="flex flex-col gap-1">
            {viewOptions.map((option) => (
              <button
                className="appearance-none bg-transparent p-0 text-left"
                key={option.value}
                onClick={() => {
                  onViewChange(option.value);
                  setIsOpen(false);
                }}
                type="button"
              >
                <span className={view === option.value ? CHIP_ACTIVE_CLASS : CHIP_MUTED_CLASS}>
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TaskOperationsHeader({
  actionLabel,
  activeCount,
  archiveCount,
  hideSearch,
  metric,
  onCycleMomentum,
  onOpenArchive,
  onOpenComposer,
  onOpenFocusPlanner,
  onOpenImport,
  onOpenMomentumDetails,
  onOpenTrash,
  onSearchChange,
  onViewChange,
  search,
  selectedBucket,
  trashCount,
  todayCount,
  view,
}: {
  actionLabel: string;
  activeCount: number;
  archiveCount: number;
  hideSearch?: boolean;
  metric: {
    doneTasks: Task[];
    label: string;
    percent: number;
    remainingTasks: Task[];
    summary: string;
    totalCount: number;
  };
  onCycleMomentum: () => void;
  onOpenArchive: () => void;
  onOpenComposer: () => void;
  onOpenFocusPlanner: () => void;
  onOpenImport: () => void;
  onOpenMomentumDetails: () => void;
  onOpenTrash: () => void;
  onSearchChange: (search: string) => void;
  onViewChange: (view: TaskViewMode) => void;
  search: string;
  selectedBucket: string;
  trashCount: number;
  todayCount: number;
  view: TaskViewMode;
}) {
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const [searchDraft, setSearchDraft] = useState(search);

  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleMomentumPressStart = () => {
    clearLongPress();
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      onOpenMomentumDetails();
    }, 450);
  };

  const handleMomentumPressEnd = () => {
    const triggered = longPressTriggeredRef.current;
    clearLongPress();
    if (!triggered) {
      onCycleMomentum();
    }
    longPressTriggeredRef.current = false;
  };

  const handleFocusChipClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenFocusPlanner();
  };

  return (
    <section className="pt-[5px]">
      <div className="flex flex-col gap-4">
        <div className="mt-1 flex justify-center">
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8e88a9] dark:text-white/40">
            Tasks
          </p>
        </div>
        <div className="flex justify-center">
          <div className="flex w-full max-w-[42rem] items-center gap-3">
            <button
              className={CHIP_BUTTON_CLASS}
              onClick={handleFocusChipClick}
              type="button"
            >
              <span className={CHIP_PURPLE_CLASS}>
                {actionLabel}
              </span>
            </button>
            <span className={`${CHIP_SIZE_CLASS} bg-[#fff1f3] text-[#f05566] dark:bg-[#44232f] dark:text-[#ff9eaf]`}>
              {metric.label}
            </span>
            <button
              className="block h-3.5 min-w-[10rem] flex-1 overflow-hidden rounded-full bg-[#e7e3f8] dark:bg-white/10"
              onPointerCancel={clearLongPress}
              onPointerDown={handleMomentumPressStart}
              onPointerLeave={clearLongPress}
              onPointerUp={handleMomentumPressEnd}
              type="button"
            >
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#c5b4ff_0%,#7f6af7_100%)] dark:bg-[linear-gradient(90deg,#cabfff_0%,#8e79ff_100%)]"
                style={{ width: `${Math.max(metric.percent, 8)}%` }}
              />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          {!hideSearch ? (
            <label className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-[0.9rem] border border-[#efe9ff] bg-[#fbfaff] px-3.5 py-1 dark:border-white/10 dark:bg-white/[0.04]">
              <Search className="h-3.5 w-3.5 shrink-0 text-[#6f57f6] dark:text-[#c9bbff]" />
              <input
                className="min-w-0 flex-1 bg-transparent text-[13px] text-[#27304c] outline-none placeholder:text-[#97a0b9] dark:text-white dark:placeholder:text-white/35"
                id="task-search-input"
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setSearchDraft(nextValue);
                  startTransition(() => {
                    onSearchChange(nextValue);
                  });
                }}
                placeholder="Search tasks, or type duplicate:title"
                value={searchDraft}
              />
            </label>
          ) : null}
          {!hideSearch ? (
            <div className="flex flex-wrap items-center gap-3">
              <TaskChipButton onClick={onOpenImport}>
                Import
              </TaskChipButton>
              <TaskChipButton onClick={onOpenComposer} tone="primary">
                New Task
              </TaskChipButton>
              <TaskChipButton active={selectedBucket === "archive"} onClick={() => startTransition(onOpenArchive)}>
                <span className="inline-flex items-center gap-2">
                  <BookOpen className="h-3.5 w-3.5" />
                  Archive
                  <span className="opacity-70">{archiveCount}</span>
                </span>
              </TaskChipButton>
              <TaskChipButton active={selectedBucket === "trash"} onClick={() => startTransition(onOpenTrash)}>
                <span className="inline-flex items-center gap-2">
                  <Trash2 className="h-3.5 w-3.5" />
                  Trash
                  <span className="opacity-70">{trashCount}</span>
                </span>
              </TaskChipButton>
              <TaskViewsMenu onViewChange={onViewChange} view={view} />
            </div>
          ) : null}
        </div>

      </div>
    </section>
  );
}

export function TasksListViewPanel(props: {
  agentPlanNode: ReactNode;
  draggedListColumnId: AgentPlanColumnId | null;
  filterRowsNode: ReactNode;
  archiveCount: number;
  isKeyboardShortcutsMenuOpen: boolean;
  isListColumnMenuOpen: boolean;
  keyboardShortcutsMenuRef: RefObject<HTMLDivElement | null>;
  listColumnLabels: Record<AgentPlanColumnId, string>;
  listColumnMenuRef: RefObject<HTMLDivElement | null>;
  listColumnPickerColumns: AgentPlanColumnId[];
  lists: Array<{ count: number; description: string; id: string; label: string }>;
  listVisibleColumns: AgentPlanColumnId[];
  onOpenListSettings: () => void;
  onOpenArchive: () => void;
  onOpenComposer: () => void;
  onOpenImport: () => void;
  onSelectBucket: (bucket: string) => void;
  onShrinkAllColumns: () => void;
  onReorderListColumns: (columnId: AgentPlanColumnId, targetColumnId: AgentPlanColumnId) => void;
  onSetDraggedListColumnId: (columnId: AgentPlanColumnId | null) => void;
  onSetView: (view: TaskViewMode) => void;
  onToggleKeyboardShortcutsMenu: () => void;
  onToggleListColumn: (columnId: AgentPlanColumnId) => void;
  onToggleListColumnMenu: () => void;
  onOpenTrash: () => void;
  onUpdateSearch: (search: string) => void;
  search: string;
  selectedBucket: string;
  shortcuts: Array<{ action: string; alternateKeys?: string[]; keys: string[] }>;
  trashCount: number;
  view: TaskViewMode;
}) {
  const {
    agentPlanNode,
    archiveCount,
    filterRowsNode,
    isKeyboardShortcutsMenuOpen,
    isListColumnMenuOpen,
    keyboardShortcutsMenuRef,
    listColumnLabels,
    listColumnMenuRef,
    listColumnPickerColumns,
    lists,
    listVisibleColumns,
    onOpenComposer,
    onOpenImport,
    onOpenListSettings,
    onOpenArchive,
    onSelectBucket,
    onShrinkAllColumns,
    onSetView,
    onToggleKeyboardShortcutsMenu,
    onToggleListColumn,
    onToggleListColumnMenu,
    onOpenTrash,
    onUpdateSearch,
    search,
    selectedBucket,
    trashCount,
    view,
  } = props;
  const [searchDraft, setSearchDraft] = useState(search);

  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  return (
    <section className="mt-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-[0.9rem] border border-[#efe9ff] bg-[#fbfaff] px-3.5 py-1 dark:border-white/10 dark:bg-white/[0.04]">
          <Search className="h-3.5 w-3.5 shrink-0 text-[#6f57f6] dark:text-[#c9bbff]" />
          <input
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[#27304c] outline-none placeholder:text-[#97a0b9] dark:text-white dark:placeholder:text-white/35"
            id="task-search-input"
            onChange={(event) => {
              const nextValue = event.target.value;
              setSearchDraft(nextValue);
              startTransition(() => {
                onUpdateSearch(nextValue);
              });
            }}
            placeholder="Search tasks, or type duplicate:title"
            value={searchDraft}
          />
        </label>
        <div className="flex flex-wrap items-start justify-end gap-3">
          <TaskChipButton onClick={onOpenImport}>
            Import
          </TaskChipButton>
          <TaskChipButton onClick={onOpenComposer} tone="primary">
            New Task
          </TaskChipButton>
          <TaskChipButton active={selectedBucket === "archive"} onClick={() => startTransition(onOpenArchive)}>
            <span className="inline-flex items-center gap-2">
              <BookOpen className="h-3.5 w-3.5" />
              Archive
              <span className="opacity-70">{archiveCount}</span>
            </span>
          </TaskChipButton>
          <TaskChipButton active={selectedBucket === "trash"} onClick={() => startTransition(onOpenTrash)}>
            <span className="inline-flex items-center gap-2">
              <Trash2 className="h-3.5 w-3.5" />
              Trash
              <span className="opacity-70">{trashCount}</span>
            </span>
          </TaskChipButton>
          <TaskViewsMenu onViewChange={onSetView} view={view} />
          <div className="relative" ref={listColumnMenuRef}>
            <button
              className={CHIP_BUTTON_CLASS}
              data-list-columns-menu
              onClick={onToggleListColumnMenu}
              type="button"
            >
              <span className={`${CHIP_MUTED_CLASS} gap-2`}>
                Columns
                <ChevronDown className={`h-4 w-4 transition ${isListColumnMenuOpen ? "rotate-180" : ""}`} />
              </span>
            </button>
            {isListColumnMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.55rem)] z-30 w-72 rounded-[1.25rem] border border-[#ede6ff] bg-white/95 p-2 text-left shadow-[0_20px_60px_rgba(111,87,246,0.16)] backdrop-blur dark:border-white/10 dark:bg-[#1b1530]/95">
                <div className="border-b border-[#f0ebfb] px-3 pb-2 dark:border-white/10">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#938ab8] dark:text-white/42">Visible columns</p>
                  <p className="mt-1 text-sm text-[#7d7597] dark:text-white/55">Status and Task stay pinned. Everything else can be shown or hidden here.</p>
                </div>
                <div className="mt-2 space-y-1">
                  {listColumnPickerColumns.map((columnId) => {
                    const isVisible = listVisibleColumns.includes(columnId);

                    return (
                      <button
                        className="flex w-full items-center justify-between rounded-[0.95rem] px-3 py-2 text-sm font-medium text-[#5f6983] transition hover:bg-[#f7f3ff] hover:text-[#6f57f6] dark:text-white/70 dark:hover:bg-white/8 dark:hover:text-[#cabfff]"
                        key={columnId}
                        onClick={() => onToggleListColumn(columnId)}
                        type="button"
                      >
                        <span>{listColumnLabels[columnId]}</span>
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${isVisible ? "border-[#d8cdfc] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]" : "border-[#e6e0f5] bg-white text-transparent dark:border-white/12 dark:bg-white/[0.05]"}`}>
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <TaskChipButton onClick={onShrinkAllColumns}>
            Shrink all
          </TaskChipButton>
          <div className="relative" ref={keyboardShortcutsMenuRef}>
            <button
              className={CHIP_BUTTON_CLASS}
              data-keyboard-shortcuts-menu
              onClick={onToggleKeyboardShortcutsMenu}
              type="button"
            >
              <span className={`${CHIP_MUTED_CLASS} gap-2`}>
                Shortcuts
                <ChevronDown className={`h-4 w-4 transition ${isKeyboardShortcutsMenuOpen ? "rotate-180" : ""}`} />
              </span>
            </button>
            {isKeyboardShortcutsMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.55rem)] z-30 w-72 rounded-[1.25rem] border border-[#ede6ff] bg-white/95 p-2 text-left shadow-[0_20px_60px_rgba(111,87,246,0.16)] backdrop-blur dark:border-white/10 dark:bg-[#1b1530]/95">
                <div className="border-b border-[#f0ebfb] px-3 pb-2 dark:border-white/10">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#938ab8] dark:text-white/42">Table controls</p>
                  <p className="mt-1 text-sm text-[#7d7597] dark:text-white/55">These are the interactions that are actually live on the new table.</p>
                </div>
                <div className="mt-2 space-y-1 px-1">
                  {[
                    { action: "Search tasks", detail: "Use the search bar above" },
                    { action: "Open a task", detail: "Click any row" },
                    { action: "Sort a column", detail: "Click a column title" },
                    { action: "Filter a column", detail: "Use the search field or chips in that menu" },
                    { action: "Reset filters", detail: "Use Clear all filters in the table header" },
                  ].map((item) => (
                    <div className="flex items-start justify-between gap-3 rounded-[0.95rem] px-2 py-2" key={item.action}>
                      <span className="text-sm font-medium text-[#352e55] dark:text-white/82">{item.action}</span>
                      <span className="text-right text-sm text-[#7d7597] dark:text-white/55">{item.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <TaskChipButton onClick={onOpenListSettings}>
            List settings
          </TaskChipButton>
          {filterRowsNode}
        </div>
      </div>
      <div className="adhdice-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
        {lists.map((list) => (
          <button
            aria-pressed={list.id === selectedBucket}
            className={CHIP_BUTTON_CLASS}
            key={list.id}
            onClick={() => {
              startTransition(() => {
                onSelectBucket(list.id);
              });
            }}
            type="button"
          >
            <span className={list.id === selectedBucket ? CHIP_ACTIVE_CLASS : CHIP_MUTED_CLASS}>
              {list.label} <span className="ml-1 opacity-70">{list.count}</span>
            </span>
          </button>
        ))}
      </div>
      {agentPlanNode}
    </section>
  );
}

export function TasksNonListViewPanel({
  contentNode,
  dailyPlanningNode,
  filterRowsNode,
  lists,
  onSelectBucket,
  selectedBucket,
}: {
  contentNode: ReactNode;
  dailyPlanningNode: ReactNode;
  filterRowsNode: ReactNode;
  lists: Array<{ count: number; description: string; id: string; label: string }>;
  onSelectBucket: (bucket: string) => void;
  selectedBucket: string;
}) {
  return (
    <section className="mt-4 grid gap-4 xl:grid-cols-[15.5rem_minmax(0,1fr)]">
      <TaskBucketRail
        lists={lists}
        onSelectBucket={onSelectBucket}
        selectedBucket={selectedBucket}
      />
      <div className="min-w-0">
        {filterRowsNode}
        {dailyPlanningNode}
        {contentNode}
      </div>
    </section>
  );
}

function TaskBucketRail({
  lists,
  onSelectBucket,
  selectedBucket,
}: {
  lists: Array<{ count: number; description: string; id: string; label: string }>;
  onSelectBucket: (bucket: string) => void;
  selectedBucket: string;
}) {
  return (
    <>
      <aside className="hidden h-fit rounded-[1.5rem] border border-[#ece8f8] bg-white/90 p-3 shadow-[0_16px_40px_rgba(81,61,168,0.06)] xl:block dark:border-white/10 dark:bg-white/6">
        <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8e88a9] dark:text-white/35">Lists</p>
        <div className="space-y-1.5">
          {lists.map((list) => {
            const active = list.id === selectedBucket;
            return (
              <button
                aria-pressed={active}
                className={`flex w-full items-center justify-between rounded-[1rem] px-3 py-3 text-left transition ${
                  active
                    ? "bg-[#f3efff] text-[#6f57f6] shadow-[0_10px_24px_rgba(81,61,168,0.08)] dark:bg-[#261e49] dark:text-[#cabfff]"
                    : "text-[#58637f] hover:bg-[#faf8ff] dark:text-white/65 dark:hover:bg-white/[0.04]"
                }`}
                key={list.id}
                onClick={() => {
                  startTransition(() => {
                    onSelectBucket(list.id);
                  });
                }}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{list.label}</span>
                  <span className="mt-0.5 block text-xs opacity-70">{list.description}</span>
                </span>
                <span className="ml-3 shrink-0 rounded-full bg-white px-2 py-1 text-xs font-bold text-[#6f57f6] dark:bg-white/10 dark:text-[#cabfff]">
                  {list.count}
                </span>
              </button>
            );
          })}
        </div>
      </aside>
      <div className="adhdice-scrollbar flex gap-2 overflow-x-auto pb-1 xl:hidden">
        {lists.map((list) => (
          <button
            aria-pressed={list.id === selectedBucket}
            className={CHIP_BUTTON_CLASS}
            key={list.id}
            onClick={() => {
              startTransition(() => {
                onSelectBucket(list.id);
              });
            }}
            type="button"
          >
            <span className={list.id === selectedBucket ? CHIP_ACTIVE_CLASS : CHIP_MUTED_CLASS}>
              {list.label} <span className="ml-1 opacity-70">{list.count}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function HeroMetaCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <article className="rounded-[1rem] border border-[#e7e0fb] bg-white/85 p-3 text-left dark:border-white/10 dark:bg-white/[0.06]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9ca4bf] dark:text-white/35">{label}</p>
      <p className="mt-1 text-xl font-black text-[#1f2744] dark:text-white">{value}</p>
    </article>
  );
}
