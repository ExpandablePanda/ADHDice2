import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Clock3, Plus } from "lucide-react";
import { AdhdChip } from "@/components/ui-system";
import {
  type FocusCategory,
  type ActiveFocusSession,
  type FocusCounter,
  type FocusCounterHistoryEntry,
  type FocusDailyGoalAdjustment,
  type HistoricalFocusSession,
  type PendingFocusDailySurplus,
  type FocusLabelOptions,
  type FocusType,
  type FocusSubtype,
  DEFAULT_FOCUS_CATEGORY_TITLES,
  DEFAULT_FOCUS_TITLES,
  DEFAULT_PRIMARY_SUBTYPES,
  DEFAULT_SECONDARY_SUBTYPES,
} from "@/lib/types";
import {
  buildFocusGoalPlan,
  formatPriorityLabel,
  getAllocationSummary,
  getEligibleSurplusTargets,
  getWeekdayKey,
  getSurplusOverrideTargets,
  isSleepCategory,
  normalizeCarryoverMode,
  normalizeDistributionMode,
  normalizePriorityLevel,
  OVER_WEEKLY_DAILY_TARGET_REALLOCATION_REASON,
  resolveCountsTowardProductiveGoal,
  WEEKDAY_KEYS,
} from "@/lib/focus-goals";
import { getDisplayFocusCategories, isSystemCountdownCategoryId, SYSTEM_COUNTDOWN_CATEGORY_ID } from "@/lib/focus-utils";
import { classifyFocusSandboxSwipe, getBoundedFocusSandboxPage } from "@/lib/focus-bars";
import { FocusGoalsPanel } from "./focus-goals-panel";
import { FocusBars, FocusBarsErrorBoundary } from "./focus-bars";
import { FocusClockRow, FocusClockRowDesktop } from "./focus-clocks";
import { FocusCounterHistoryCard, FocusCounterRow } from "./focus-counters";
import { CategoryManager } from "./category-manager";
import { DailyHistoryGallery } from "./focus-history";
import { SessionFinishModal, ManualEntryModal } from "./focus-modals";
import { ModalShell } from "./modal-shell";
import { FocusPillSelect } from "./focus-form-controls";
import { CategoryIcon } from "./task-app";
import {
  TASKS_SURFACE_ACTIVE_CHIP_CLASS,
  TASKS_SURFACE_GROUP_CLASS,
  TASKS_SURFACE_INACTIVE_CHIP_CLASS,
} from "./task-app/tasks-surface-switch";

const FOCUS_COUNTER_ICON_OPTIONS = [
  { name: "Hash", label: "Count" },
  { name: "Target", label: "Target" },
  { name: "CheckSquare", label: "Tasks" },
  { name: "Zap", label: "Energy" },
  { name: "Clock3", label: "Time" },
  { name: "BookOpen", label: "Reading" },
  { name: "Brain", label: "Thinking" },
  { name: "Dumbbell", label: "Fitness" },
  { name: "Heart", label: "Health" },
  { name: "Coffee", label: "Break" },
  { name: "Star", label: "Favorite" },
  { name: "Gamepad2", label: "Play" },
  { name: "Code", label: "Code" },
  { name: "Briefcase", label: "Work" },
  { name: "CalendarDays", label: "Schedule" },
  { name: "FileText", label: "Notes" },
  { name: "Palette", label: "Create" },
  { name: "Home", label: "Home" },
  { name: "Headphones", label: "Audio" },
  { name: "Music", label: "Music" },
  { name: "Moon", label: "Night" },
  { name: "Sun", label: "Morning" },
  { name: "Search", label: "Explore" },
  { name: "Layers", label: "Systems" },
  { name: "Server", label: "Backend" },
  { name: "Lock", label: "Secure" },
  { name: "Bolt", label: "Focus" },
  { name: "PieChart", label: "Stats" },
  { name: "Smartphone", label: "Mobile" },
  { name: "ShoppingCart", label: "Shopping" },
  { name: "Film", label: "Film" },
  { name: "Tv", label: "TV" },
  { name: "CirclePlay", label: "Video" },
  { name: "Pen", label: "Write" },
  { name: "Rocket", label: "Launch" },
  { name: "Plane", label: "Travel" },
  { name: "Sparkles", label: "Ideas" },
  { name: "Utensils", label: "Food" },
  { name: "Wifi", label: "Online" },
  { name: "DollarSign", label: "Money" },
] as const;

const FOCUS_TOOLBAR_CHIP_TONE_CLASS = "border-[#e4deef] bg-[var(--surface-elevated)] text-[#68738c] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/60";
const FOCUS_SANDBOX_TAB_ORDER_STORAGE_KEY = "adhdice.focusSandboxTabOrder.v1";
const DEFAULT_FOCUS_SANDBOX_TAB_ORDER = [0, 1] as const;

function readFocusSandboxTabOrder(): number[] {
  if (typeof window === "undefined") return [...DEFAULT_FOCUS_SANDBOX_TAB_ORDER];
  try {
    const stored = JSON.parse(window.localStorage.getItem(FOCUS_SANDBOX_TAB_ORDER_STORAGE_KEY) ?? "null");
    if (Array.isArray(stored) && stored.length === 2 && stored.includes(0) && stored.includes(1)) return stored;
  } catch {
    // Fall through to the approved default order.
  }
  return [...DEFAULT_FOCUS_SANDBOX_TAB_ORDER];
}

function writeFocusSandboxTabOrder(order: number[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FOCUS_SANDBOX_TAB_ORDER_STORAGE_KEY, JSON.stringify(order));
}

function FocusTimerPicker({
  categories,
  activeSessions,
  onSelect,
  onSelectCountdown,
}: {
  categories: FocusCategory[];
  activeSessions: Record<string, ActiveFocusSession>;
  onSelect: (categoryId: string, options?: { countdownTargetSeconds?: number | null; mode?: "countdown" | "countup" }) => void;
  onSelectCountdown: () => void;
}) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const normalizedQuery = query.trim().toLowerCase();
  const categoryOptions = categories
    .filter((category) => !activeSessions[category.id])
    .filter((category) => !normalizedQuery || category.title.toLowerCase().includes(normalizedQuery))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  const options: Array<
    | { id: string; kind: "countdown"; label: string }
    | { id: string; kind: "category"; label: string; category: FocusCategory }
  > = [
    { id: "countdown", kind: "countdown", label: "Countdown" },
    ...categoryOptions.map((category) => ({
      id: category.id,
      kind: "category" as const,
      label: category.title,
      category,
    })),
  ];
  const safeHighlightedIndex = Math.min(highlightedIndex, Math.max(0, options.length - 1));

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const closePicker = () => {
    setQuery("");
    setHighlightedIndex(0);
    setIsOpen(false);
  };

  const selectOption = (option: typeof options[number]) => {
    if (option.kind === "countdown") {
      onSelectCountdown();
    } else {
      onSelect(option.category.id, { mode: "countup" });
    }
    closePicker();
  };

  return (
    <div className="relative w-[min(12rem,calc(100vw-2rem))] text-left" ref={rootRef}>
      <label className="sr-only" htmlFor={`${listboxId}-input`}>Add a focus timer</label>
      <div className={`ui-pill-button-strong-light flex items-center gap-1.5 transition hover:-translate-y-0.5 ${FOCUS_TOOLBAR_CHIP_TONE_CLASS}`}>
        <input
          aria-activedescendant={isOpen && options[safeHighlightedIndex] ? `${listboxId}-option-${options[safeHighlightedIndex].id}` : undefined}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] font-medium leading-none text-inherit outline-none placeholder:text-current placeholder:opacity-55 focus:text-[13px]"
          id={`${listboxId}-input`}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlightedIndex(0);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setIsOpen(true);
              setHighlightedIndex((current) => options.length ? (current + 1) % options.length : 0);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setIsOpen(true);
              setHighlightedIndex((current) => options.length ? (current - 1 + options.length) % options.length : 0);
            } else if (event.key === "Enter" && isOpen && options[safeHighlightedIndex]) {
              event.preventDefault();
              selectOption(options[safeHighlightedIndex]);
            } else if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
          placeholder="Add focus timer..."
          role="combobox"
          type="text"
          value={query}
          />
        <svg aria-hidden="true" className="pointer-events-none h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {isOpen ? (
        <div
          className="adhdice-scrollbar absolute left-0 right-0 z-40 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-[#e7e0f7] bg-white p-2 shadow-[0_18px_45px_rgba(70,50,145,0.16)] dark:border-white/10 dark:bg-[#1b1630] dark:shadow-[0_18px_45px_rgba(0,0,0,0.35)]"
          id={listboxId}
          role="listbox"
        >
          {options.length ? options.map((option, index) => (
            <div
              aria-selected={index === safeHighlightedIndex}
              className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${index === safeHighlightedIndex ? "bg-[#6f57f6] text-white" : "text-[#5f5879] hover:bg-[#f8f6fd] dark:text-white/70 dark:hover:bg-white/[0.06]"}`}
              id={`${listboxId}-option-${option.id}`}
              key={option.id}
              onClick={() => selectOption(option)}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlightedIndex(index)}
              role="option"
            >
              {option.kind === "countdown" ? (
                <Clock3 aria-hidden="true" className={`h-4 w-4 shrink-0 ${index === safeHighlightedIndex ? "text-white" : "text-[#7b68ee] dark:text-[#cabfff]"}`} />
              ) : (
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: option.category.color }} />
              )}
              <span className="truncate">{option.label}</span>
            </div>
          )) : (
            <p className="px-3 py-3 text-center text-sm text-[var(--text-muted)]">
              {normalizedQuery ? "No matching timers" : "All timers are active"}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function FocusPage({
  categories,
  activeSessions,
  counters,
  counterHistory,
  history,
  onAdjustCounter,
  onToggleTimer,
  onSetCountdownTarget,
  onFinishTimer,
  onAdjustTimer,
  onResetTimer,
  onDeleteTimer,
  onCreateCounter,
  onDeleteCounter,
  onLogManual,
  onUpdateCounter,
  onUpdateHistoryEntry,
  onDeleteHistoryEntry,
  onUpdateCategories,
  onDeleteCategory,
  adjustments,
  pendingDailyGoalSurplus,
  onDismissDailyGoalSurplus,
  onSaveDailyGoalAdjustment,
}: {
  categories: FocusCategory[];
  activeSessions: Record<string, ActiveFocusSession>;
  counters: FocusCounter[];
  counterHistory: FocusCounterHistoryEntry[];
  history: HistoricalFocusSession[];
  onAdjustCounter: (counterId: string, direction: 1 | -1) => void;
  onToggleTimer: (catId: string, options?: { countdownTargetSeconds?: number | null; mode?: "countdown" | "countup" }) => Promise<void>;
  onSetCountdownTarget: (catId: string, targetSeconds: number, options?: { start?: boolean }) => void;
  onFinishTimer: (catId: string, data?: { title: string; focusType: FocusType; focusSubtype?: FocusSubtype | null; focusSubtype2?: FocusSubtype | null; notes: string; date: string }) => void;
  onAdjustTimer: (catId: string, deltaSeconds: number) => Promise<boolean>;
  onResetTimer: (catId: string) => Promise<void>;
  onDeleteTimer: (catId: string) => void;
  onCreateCounter: (input: { color: string; goal: number; icon: string; initialValue: number; step: number; title: string }) => void;
  onDeleteCounter: (counterId: string) => void;
  onLogManual: (data: { categoryId: string | null; title: string; focusType: FocusType; focusSubtype?: FocusSubtype | null; focusSubtype2?: FocusSubtype | null; durationSeconds: number; date: string; completionTime?: string; notes: string }) => Promise<boolean>;
  onUpdateCounter: (counterId: string, updates: Partial<Pick<FocusCounter, "color" | "goal" | "icon" | "step" | "title" | "value">>) => void;
  onUpdateHistoryEntry: (entryId: string, data: { categoryId: string | null; title: string; focusType: FocusType; focusSubtype?: FocusSubtype | null; focusSubtype2?: FocusSubtype | null; durationSeconds: number; date: string; completionTime?: string; notes: string }) => Promise<void>;
  onDeleteHistoryEntry: (entryId: string) => Promise<void>;
  onUpdateCategories: (categories: FocusCategory[]) => Promise<boolean>;
  onDeleteCategory: (category: FocusCategory) => Promise<boolean>;
  adjustments: FocusDailyGoalAdjustment[];
  pendingDailyGoalSurplus: PendingFocusDailySurplus | null;
  onDismissDailyGoalSurplus: () => void;
  onSaveDailyGoalAdjustment: (input: { adjustmentDate: string; sourceCategoryId: string; targetCategoryId: string; sourceSessionId?: string | null; reductionSeconds: number; reason?: string }) => Promise<boolean>;
}) {
  const [countdownPickerOpenRequest, setCountdownPickerOpenRequest] = useState(0);
  const [focusSandboxPage, setFocusSandboxPage] = useState(0);
  const [focusSandboxTabOrder, setFocusSandboxTabOrder] = useState<number[]>(readFocusSandboxTabOrder);
  const [draggingFocusSandboxPage, setDraggingFocusSandboxPage] = useState<number | null>(null);
  const suppressFocusSandboxTabClickRef = useRef<number | null>(null);
  const focusSandboxSwipeRef = useRef<{
    cancelled: boolean;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showCounterEditor, setShowCounterEditor] = useState(false);
  const [editingCounterId, setEditingCounterId] = useState<string | null>(null);
  const [finishingCatId, setFinishingCatId] = useState<string | null>(null);
  const [finishingDurationSeconds, setFinishingDurationSeconds] = useState(0);
  const [showGoalsEditor, setShowGoalsEditor] = useState(false);
  const [counterTitle, setCounterTitle] = useState("");
  const [counterColor, setCounterColor] = useState("#6f57f6");
  const [counterIcon, setCounterIcon] = useState("Hash");
  const [counterStep, setCounterStep] = useState("1");
  const [counterGoal, setCounterGoal] = useState("10");
  const [counterValue, setCounterValue] = useState("0");
  const userCategories = categories.filter((category) => !isSystemCountdownCategoryId(category.id));
  const displayCategories = getDisplayFocusCategories(categories, activeSessions);
  const countersById = new Map(counters.map((counter) => [counter.id, counter]));
  const counterIconChoices = useMemo(() => {
    const selected = counterIcon.trim();
    const deduped = new Map<string, { name: string; label: string }>();
    for (const option of FOCUS_COUNTER_ICON_OPTIONS) {
      if (!deduped.has(option.name)) {
        deduped.set(option.name, option);
      }
    }
    if (selected && !deduped.has(selected)) {
      deduped.set(selected, { name: selected, label: "Saved icon" });
    }
    return Array.from(deduped.values());
  }, [counterIcon]);

  const handleFinishClick = (catId: string) => {
    if (isSystemCountdownCategoryId(catId)) {
      return;
    }
    const activeSession = activeSessions[catId];
    const durationSeconds = activeSession
      ? activeSession.accumulatedSeconds + (activeSession.isRunning && activeSession.startTime ? Math.floor((Date.now() - activeSession.startTime) / 1000) : 0)
      : 0;
    setFinishingDurationSeconds(durationSeconds);
    setFinishingCatId(catId);
  };

  const confirmFinish = (data: { title: string; focusType: FocusType; focusSubtype?: FocusSubtype | null; focusSubtype2?: FocusSubtype | null; notes: string; date: string }) => {
    if (finishingCatId) {
      onFinishTimer(finishingCatId, data);
      setFinishingCatId(null);
    }
  };

  const activeFinishingSession = finishingCatId ? activeSessions[finishingCatId] : null;
  const activeFinishingCategory = finishingCatId ? displayCategories.find((category) => category.id === finishingCatId) : null;
  const labelOptions = buildFocusLabelOptions(userCategories, history);
  const activeCategories = displayCategories.filter((category) => Boolean(activeSessions[category.id]));

  const changeFocusSandboxPage = (nextPage: number) => {
    setFocusSandboxPage(getBoundedFocusSandboxPage(nextPage));
  };

  const changeFocusSandboxPageByOffset = (offset: number) => {
    const currentIndex = focusSandboxTabOrder.indexOf(focusSandboxPage);
    const nextIndex = Math.max(0, Math.min(focusSandboxTabOrder.length - 1, currentIndex + offset));
    changeFocusSandboxPage(focusSandboxTabOrder[nextIndex] ?? focusSandboxPage);
  };

  const reorderFocusSandboxTab = (sourcePage: number, targetIndex: number) => {
    setFocusSandboxTabOrder((current) => {
      const sourceIndex = current.indexOf(sourcePage);
      if (sourceIndex < 0 || sourceIndex === targetIndex) return current;
      const next = [...current];
      next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, sourcePage);
      writeFocusSandboxTabOrder(next);
      return next;
    });
  };

  const handleFocusSandboxPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || !(event.target instanceof Element)) return;
    if (event.target.closest("[data-focus-clock-scroll-region]")) return;
    focusSandboxSwipeRef.current = {
      cancelled: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleFocusSandboxPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const swipe = focusSandboxSwipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId || swipe.cancelled) return;
    if (classifyFocusSandboxSwipe(event.clientX - swipe.startX, event.clientY - swipe.startY) === "cancelled") {
      swipe.cancelled = true;
    }
  };

  const clearFocusSandboxSwipe = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    focusSandboxSwipeRef.current = null;
  };

  const handleFocusSandboxPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const swipe = focusSandboxSwipeRef.current;
    if (swipe && swipe.pointerId === event.pointerId && !swipe.cancelled) {
      const deltaX = event.clientX - swipe.startX;
      const intent = classifyFocusSandboxSwipe(deltaX, event.clientY - swipe.startY);
      if (intent === "horizontal") {
        changeFocusSandboxPageByOffset(deltaX < 0 ? 1 : -1);
      }
    }
    clearFocusSandboxSwipe(event);
  };

  const dismissDailyGoalSurplus = () => {
    onDismissDailyGoalSurplus();
  };

  const openCreateCounter = () => {
    setEditingCounterId(null);
    setCounterTitle("");
    setCounterColor("#6f57f6");
    setCounterIcon("Hash");
    setCounterStep("1");
    setCounterGoal("10");
    setCounterValue("0");
    setShowCounterEditor(true);
  };

  const openEditCounter = (counterId: string) => {
    const counter = countersById.get(counterId);
    if (!counter) {
      return;
    }
    setEditingCounterId(counterId);
    setCounterTitle(counter.title);
    setCounterColor(counter.color);
    setCounterIcon(counter.icon);
    setCounterStep(String(counter.step));
    setCounterGoal(String(counter.goal));
    setCounterValue(String(counter.value));
    setShowCounterEditor(true);
  };

  const saveCounter = () => {
    const payload = {
      color: counterColor || "#6f57f6",
      goal: Math.max(1, Number.parseInt(counterGoal, 10) || 10),
      icon: counterIcon.trim() || "Hash",
      initialValue: Number.parseInt(counterValue, 10) || 0,
      step: Math.max(1, Number.parseInt(counterStep, 10) || 1),
      title: counterTitle.trim() || "Counter",
    };

    if (editingCounterId) {
      onUpdateCounter(editingCounterId, {
        color: payload.color,
        goal: payload.goal,
        icon: payload.icon,
        step: payload.step,
        title: payload.title,
        value: payload.initialValue,
      });
    } else {
      onCreateCounter(payload);
    }

    setShowCounterEditor(false);
    setEditingCounterId(null);
  };

  return (
    <>
      <section className="flex flex-col items-center pt-5 text-center sm:pt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
          Focus Timers
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-3 sm:mt-4">
          <button
            className={`ui-pill-button-light transition hover:-translate-y-0.5 ${FOCUS_TOOLBAR_CHIP_TONE_CLASS}`}
            onClick={() => setShowCategoryManager(true)}
            type="button"
          >
            Edit Categories
          </button>
          <button
            className={`ui-pill-button-light transition hover:-translate-y-0.5 ${FOCUS_TOOLBAR_CHIP_TONE_CLASS}`}
            onClick={() => setShowGoalsEditor(true)}
            type="button"
          >
            Edit Goals
          </button>
          <button
            className={`ui-pill-button-strong-light transition hover:-translate-y-0.5 ${FOCUS_TOOLBAR_CHIP_TONE_CLASS}`}
            onClick={() => setShowManualEntry(true)}
            type="button"
          >
            Manual Entry
          </button>
          <FocusTimerPicker
            activeSessions={activeSessions}
            categories={userCategories}
            onSelectCountdown={() => {
              setCountdownPickerOpenRequest((current) => current + 1);
              onToggleTimer(SYSTEM_COUNTDOWN_CATEGORY_ID, { mode: "countdown" });
            }}
            onSelect={onToggleTimer}
          />
          <button
            className={`ui-pill-button-strong-light inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap transition hover:-translate-y-0.5 ${FOCUS_TOOLBAR_CHIP_TONE_CLASS}`}
            onClick={openCreateCounter}
            type="button"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Counter
          </button>
        </div>
      </section>

      <section className="mt-5 min-w-0 overflow-x-clip">
        <div className="mb-3 flex justify-center" data-focus-pager-alignment="centered-sandbox">
          <nav
            aria-label="Focus sandbox pages"
            className={TASKS_SURFACE_GROUP_CLASS}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                changeFocusSandboxPageByOffset(event.key === "ArrowRight" ? 1 : -1);
              }
            }}
          >
            {focusSandboxTabOrder.map((page, visualIndex) => {
              const label = page === 0 ? "Clocks" : "Focus Bars";
              return (
                <span
                  className={draggingFocusSandboxPage === page ? "opacity-60" : undefined}
                  key={page}
                  onDragOver={(event) => {
                    if (draggingFocusSandboxPage === null || draggingFocusSandboxPage === page) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const sourcePage = Number(event.dataTransfer.getData("text/plain"));
                    if ((sourcePage === 0 || sourcePage === 1) && sourcePage !== page) {
                      reorderFocusSandboxTab(sourcePage, visualIndex);
                    }
                    setDraggingFocusSandboxPage(null);
                  }}
                >
                  <AdhdChip
                    aria-description="Drag horizontally to reorder this Focus tab."
                    aria-pressed={focusSandboxPage === page}
                    className="cursor-grab active:cursor-grabbing"
                    draggable
                    onClick={() => {
                      if (suppressFocusSandboxTabClickRef.current === page) {
                        suppressFocusSandboxTabClickRef.current = null;
                        return;
                      }
                      changeFocusSandboxPage(page);
                    }}
                    onDragEnd={() => {
                      setDraggingFocusSandboxPage(null);
                      window.setTimeout(() => {
                        if (suppressFocusSandboxTabClickRef.current === page) suppressFocusSandboxTabClickRef.current = null;
                      }, 120);
                    }}
                    onDragStart={(event) => {
                      suppressFocusSandboxTabClickRef.current = page;
                      setDraggingFocusSandboxPage(page);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(page));
                    }}
                    toneClassName={focusSandboxPage === page ? TASKS_SURFACE_ACTIVE_CHIP_CLASS : TASKS_SURFACE_INACTIVE_CHIP_CLASS}
                  >
                    {label}
                  </AdhdChip>
                </span>
              );
            })}
          </nav>
        </div>

        <div
          className="min-w-0"
          onPointerCancel={clearFocusSandboxSwipe}
          onPointerDown={handleFocusSandboxPointerDown}
          onPointerMove={handleFocusSandboxPointerMove}
          onPointerUp={handleFocusSandboxPointerUp}
        >
          {focusSandboxPage === 0 ? (activeCategories.length || counters.length ? (
            <div className="mx-auto overflow-hidden rounded-[2rem] border border-[#ebe4fb] bg-white/82 shadow-[0_18px_48px_rgba(81,61,168,0.08)] backdrop-blur dark:border-white/10 dark:bg-white/[0.05] sm:max-w-[86rem]">
            {activeCategories.length ? (
              <>
                <div className="sm:hidden">
                  <FocusClockRow
                    activeSessions={activeSessions}
                    autoOpenCountdownRequest={countdownPickerOpenRequest}
                    categories={activeCategories}
                    onAdjust={onAdjustTimer}
                    onDelete={onDeleteTimer}
                    onFinish={handleFinishClick}
                    onReset={onResetTimer}
                    onSetCountdownTarget={onSetCountdownTarget}
                    onToggle={onToggleTimer}
                  />
                  {counters.length ? (
                    <div className="border-t border-[#ece8f8] px-3 dark:border-white/10">
                      <FocusCounterRow
                        counters={counters}
                        embedded
                        onAdjust={onAdjustCounter}
                        onEdit={openEditCounter}
                      />
                    </div>
                  ) : null}
                </div>
                <FocusClockRowDesktop
                  activeSessions={activeSessions}
                  autoOpenCountdownRequest={countdownPickerOpenRequest}
                  categories={activeCategories}
                  embedded
                  onAdjust={onAdjustTimer}
                  onDelete={onDeleteTimer}
                  onFinish={handleFinishClick}
                  onReset={onResetTimer}
                  onSetCountdownTarget={onSetCountdownTarget}
                  onToggle={onToggleTimer}
                />
              </>
            ) : null}
            {!activeCategories.length && counters.length ? (
              <div className="border-t-0 px-3 py-4 sm:px-5">
                <FocusCounterRow
                  counters={counters}
                  embedded
                  onAdjust={onAdjustCounter}
                  onEdit={openEditCounter}
                />
              </div>
            ) : null}
            {activeCategories.length && counters.length ? (
              <div className="hidden border-t border-[#ece8f8] px-5 py-4 dark:border-white/10 sm:block">
                <FocusCounterRow
                  counters={counters}
                  embedded
                  onAdjust={onAdjustCounter}
                  onEdit={openEditCounter}
                />
              </div>
            ) : null}
            </div>
          ) : null) : (
            <div className="mx-auto max-w-4xl rounded-[2rem] border border-[#ebe4fb] bg-white/82 p-3 shadow-[0_18px_48px_rgba(81,61,168,0.08)] backdrop-blur dark:border-white/10 dark:bg-white/[0.05] sm:p-4">
              <FocusBarsErrorBoundary fallback={(
                <div className="rounded-[1.5rem] border border-dashed border-[#ddd4f4] bg-[#fbf9ff] px-5 py-7 text-center text-sm font-medium text-[var(--text-secondary)] dark:border-white/12 dark:bg-white/[0.03]">
                  Focus Bars could not be displayed. Your timers are unchanged; use the pager to return to Clocks.
                </div>
              )}>
                <FocusBars
                  activeSessions={activeSessions}
                  adjustments={adjustments}
                  categories={userCategories}
                  history={history}
                  onAdjust={onAdjustTimer}
                  onFinish={handleFinishClick}
                  onReset={onResetTimer}
                  onToggle={onToggleTimer}
                />
              </FocusBarsErrorBoundary>
            </div>
          )}
        </div>
      </section>

      <FocusGoalsPanel
        activeSessions={activeSessions}
        adjustments={adjustments}
        categories={userCategories}
        history={history}
      />

      <FocusCounterHistoryCard
        countersById={countersById}
        history={counterHistory}
      />

      <div className="mt-6 w-full pb-40 sm:mt-10 sm:pb-44 lg:pb-28">
        <DailyHistoryGallery
          categories={userCategories}
          history={history}
          labelOptions={labelOptions}
          onDeleteEntry={onDeleteHistoryEntry}
          onEditGoals={() => setShowGoalsEditor(true)}
          onUpdateEntry={onUpdateHistoryEntry}
        />
      </div>

      {showCategoryManager ? (
        <CategoryManager
          categories={userCategories}
          history={history}
          labelOptions={labelOptions}
          onClose={() => setShowCategoryManager(false)}
          onDelete={onDeleteCategory}
          onUpdate={onUpdateCategories}
        />
      ) : null}

      {showManualEntry ? (
        <ManualEntryModal
          categories={userCategories}
          labelOptions={labelOptions}
          onClose={() => setShowManualEntry(false)}
          onSave={async (data) => {
            const saved = await onLogManual(data);
            if (saved) {
              setShowManualEntry(false);
            }
            return saved;
          }}
        />
      ) : null}

      {showCounterEditor ? (
        <ModalShell
          className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-hidden rounded-[2rem] border border-[#ece8f8] bg-white shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]"
          label={editingCounterId ? "Edit counter" : "Create counter"}
          onClose={() => {
            setShowCounterEditor(false);
            setEditingCounterId(null);
          }}
        >
          <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
            <div className="shrink-0 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">Focus Counter</p>
              <h3 className="mt-2 text-2xl font-black text-[var(--text-primary)]">{editingCounterId ? "Edit Counter" : "Add Counter"}</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">Counters keep their own activity history and whole-number steps.</p>
            </div>
            <div className="overflow-y-auto px-5 pb-4 sm:px-6">
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">Title</span>
                  <input className="ui-input-light w-full rounded-2xl px-4 py-3 dark:border-white/15 dark:bg-white/10 dark:text-white" onChange={(event) => setCounterTitle(event.target.value)} type="text" value={counterTitle} />
                </label>
                <div className="space-y-4">
                  <div className="rounded-[1.2rem] border border-[#ece8f8] bg-[#fbf9ff] p-3 dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="block text-sm font-semibold text-[var(--text-primary)]">Choose icon</span>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">Selected: {counterIconChoices.find((option) => option.name === counterIcon)?.label ?? counterIcon}</p>
                      </div>
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ddd2ff] bg-white text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.05] dark:text-[#cabfff]" style={{ color: counterColor }}>
                        <CategoryIcon className="h-4.5 w-4.5" name={counterIcon} />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {counterIconChoices.map((option) => {
                        const isSelected = option.name === counterIcon;
                        return (
                          <button
                            aria-label={`Select ${option.label}`}
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${
                              isSelected
                                ? "border-[#cdbdff] bg-[#f1ecff] text-[#6f57f6] shadow-[0_8px_18px_rgba(111,87,246,0.14)] dark:border-[#5e49a0] dark:bg-[#241a42] dark:text-[#cabfff]"
                                : "border-[#e9e2f6] bg-white text-[#756f93] hover:border-[#d8cdfc] hover:bg-[#f8f5ff] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70 dark:hover:border-white/20"
                            }`}
                            key={option.name}
                            onClick={() => setCounterIcon(option.name)}
                            title={option.label}
                            type="button"
                          >
                            <CategoryIcon className="h-3.5 w-3.5" name={option.name} style={{ color: isSelected ? counterColor : undefined }} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <label className="block sm:max-w-[11rem]">
                    <span className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">Color</span>
                    <input className="h-12 w-full rounded-2xl border border-[#ece8f8] bg-white px-3 py-2 dark:border-white/15 dark:bg-white/10" onChange={(event) => setCounterColor(event.target.value)} type="color" value={counterColor} />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">Step</span>
                    <input className="ui-input-light w-full rounded-2xl px-4 py-3 dark:border-white/15 dark:bg-white/10 dark:text-white" inputMode="numeric" onChange={(event) => setCounterStep(event.target.value.replace(/[^0-9-]/g, ""))} type="text" value={counterStep} />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">Ring goal</span>
                    <input className="ui-input-light w-full rounded-2xl px-4 py-3 dark:border-white/15 dark:bg-white/10 dark:text-white" inputMode="numeric" onChange={(event) => setCounterGoal(event.target.value.replace(/[^0-9-]/g, ""))} type="text" value={counterGoal} />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">Current value</span>
                    <input className="ui-input-light w-full rounded-2xl px-4 py-3 dark:border-white/15 dark:bg-white/10 dark:text-white" inputMode="numeric" onChange={(event) => setCounterValue(event.target.value.replace(/[^0-9-]/g, ""))} type="text" value={counterValue} />
                  </label>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-[#ece8f8] px-5 py-4 dark:border-white/10 sm:px-6">
              {editingCounterId ? (
                <button
                  className="rounded-full border border-[#f8d9dc] bg-[#fff1f2] px-4 py-2 text-sm font-semibold text-[#d64b5f] dark:border-[#5a2432] dark:bg-[#2e1820] dark:text-[#ff9fbc]"
                  onClick={() => {
                    onDeleteCounter(editingCounterId);
                    setShowCounterEditor(false);
                    setEditingCounterId(null);
                  }}
                  type="button"
                >
                  Delete
                </button>
              ) : null}
              <button className="ui-pill-button-light dark:rounded-full dark:bg-white/5 dark:text-white" onClick={() => setShowCounterEditor(false)} type="button">
                Cancel
              </button>
              <button className="ui-pill-button-strong-light dark:rounded-full dark:bg-[#cabfff] dark:text-[#1a1431]" onClick={saveCounter} type="button">
                {editingCounterId ? "Save Counter" : "Create Counter"}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {finishingCatId && activeFinishingCategory && activeFinishingSession ? (
        <SessionFinishModal
          category={activeFinishingCategory}
          durationSeconds={finishingDurationSeconds}
          labelOptions={labelOptions}
          onCancel={() => setFinishingCatId(null)}
          onConfirm={confirmFinish}
          sessionStartTime={activeFinishingSession.startTime}
        />
      ) : null}

      {showGoalsEditor ? (
        <CategoryGoalsModal
          categories={userCategories}
          onClose={() => setShowGoalsEditor(false)}
          onSave={async (nextCategories) => {
            const saved = await onUpdateCategories(nextCategories);
            if (saved) {
              setShowGoalsEditor(false);
            }
          }}
        />
      ) : null}

      {pendingDailyGoalSurplus ? (
        <DailySurplusReallocationModal
          adjustments={adjustments}
          categories={userCategories}
          history={history}
          onClose={dismissDailyGoalSurplus}
          onSave={onSaveDailyGoalAdjustment}
          pending={pendingDailyGoalSurplus}
        />
      ) : null}
    </>
  );
}

function buildFocusLabelOptions(
  categories: FocusCategory[],
  history: HistoricalFocusSession[],
): FocusLabelOptions {
  const titles = new Set(DEFAULT_FOCUS_TITLES);
  const types = new Set<string>();
  const primarySubtypes = new Set(DEFAULT_PRIMARY_SUBTYPES);
  const secondarySubtypes = new Set(DEFAULT_SECONDARY_SUBTYPES);

  for (const category of categories) {
    if (DEFAULT_FOCUS_CATEGORY_TITLES.includes(category.title)) {
      continue;
    }

    titles.add(category.title);
    types.add(category.focusType);
    if (category.focusSubtype) {
      primarySubtypes.add(category.focusSubtype);
    }
    if (category.focusSubtype2) {
      secondarySubtypes.add(category.focusSubtype2);
    }
  }

  for (const entry of history) {
    titles.add(entry.title);
    types.add(entry.focusType);
    if (entry.focusSubtype) {
      primarySubtypes.add(entry.focusSubtype);
    }
    if (entry.focusSubtype2) {
      secondarySubtypes.add(entry.focusSubtype2);
    }
  }

  return {
    titles: Array.from(titles).filter(Boolean).sort(),
    types: Array.from(types).filter(Boolean).sort(),
    primarySubtypes: Array.from(primarySubtypes).filter(Boolean).sort(),
    secondarySubtypes: Array.from(secondarySubtypes).filter(Boolean).sort(),
    allSubtypes: Array.from(new Set([...primarySubtypes, ...secondarySubtypes])).filter(Boolean).sort(),
  };
}

function surplusTargetContext(summary: ReturnType<typeof buildFocusGoalPlan>["summaries"][number]) {
  const remainingTodaySeconds = Math.max(0, summary.adjustedTodayTargetSeconds - summary.todayActualSeconds);
  if (summary.weeklyPaceBehindSeconds > 0) {
    return `behind weekly pace by ${formatDurationForGoals(summary.weeklyPaceBehindSeconds)}`;
  }
  if (remainingTodaySeconds <= 0) {
    return summary.adjustedTodayTargetSeconds <= 0 ? "no target left today" : "done today";
  }
  return `${formatDurationForGoals(remainingTodaySeconds)} remaining today · ahead this week`;
}

function allocationInputValue(seconds: number | undefined) {
  if (!seconds) return "";
  return String(Math.round(seconds / 60));
}

function parseAllocationMinutes(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed) * 60;
}

function DailySurplusReallocationModal({
  adjustments,
  categories,
  history,
  onClose,
  onSave,
  pending,
}: {
  adjustments: FocusDailyGoalAdjustment[];
  categories: FocusCategory[];
  history: HistoricalFocusSession[];
  onClose: () => void;
  onSave: (input: { adjustmentDate: string; sourceCategoryId: string; targetCategoryId: string; sourceSessionId?: string | null; reductionSeconds: number; reason?: string }) => Promise<boolean>;
  pending: PendingFocusDailySurplus;
}) {
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);
  const plan = useMemo(() => buildFocusGoalPlan({
    adjustments,
    categories,
    history,
    todayDate: pending.adjustmentDate,
  }), [adjustments, categories, history, pending.adjustmentDate]);
  const sourceSummary = plan.summaries.find((summary) => summary.category.id === pending.sourceCategoryId);
  const eligibleTargets = sourceSummary ? getEligibleSurplusTargets(sourceSummary, plan.summaries) : [];
  const eligibleTargetIds = new Set(eligibleTargets.map((target) => target.category.id));
  const overrideTargets = sourceSummary
    ? getSurplusOverrideTargets(sourceSummary, plan.summaries).filter((target) => !eligibleTargetIds.has(target.summary.category.id))
    : [];
  const reductionSeconds = Math.max(60, Math.ceil(pending.surplusSeconds / 60) * 60);
  const isOverWeeklyShift = pending.reason === OVER_WEEKLY_DAILY_TARGET_REALLOCATION_REASON;
  const allocationSummary = getAllocationSummary(allocations, reductionSeconds);
  const positiveAllocations = Object.entries(allocations).filter(([, seconds]) => seconds > 0);
  const canSave = positiveAllocations.length > 0 && allocationSummary.overallocatedSeconds === 0;

  const renderAllocationRow = (
    summary: ReturnType<typeof buildFocusGoalPlan>["summaries"][number],
    options: { warningLabel?: string | null } = {},
  ) => (
    <div
      className="grid min-w-0 gap-3 rounded-[1rem] border border-[#e9e2f6] bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.04] sm:grid-cols-[minmax(0,1fr)_minmax(6rem,7rem)] sm:items-center"
      key={summary.category.id}
    >
      <div className="min-w-0">
        <p className="truncate font-semibold text-[var(--text-primary)]">
          {summary.category.title} <span className="font-medium text-[var(--text-muted)]">({formatPriorityLabel(summary.priorityLevel)})</span>
        </p>
        <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">{surplusTargetContext(summary)}</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {summary.allowDailySurplusReduction ? "Flexible" : "Protected"} · Today remaining {formatDurationForGoals(Math.max(0, summary.adjustedTodayTargetSeconds - summary.todayActualSeconds))}
        </p>
        {options.warningLabel ? (
          <span className="mt-2 inline-flex rounded-full border border-[#f4d4bb] bg-[#fff7ed] px-2 py-0.5 text-[11px] text-[#9a5a22] dark:border-[#70451f] dark:bg-[#2a1c12] dark:text-[#f4bd82]">
            {options.warningLabel}
          </span>
        ) : null}
      </div>
      <label className="grid min-w-0 gap-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {isOverWeeklyShift ? "Increase" : "Decrease"}
        <div className="flex min-w-0 items-center gap-1.5">
          <input
            className="h-9 w-full min-w-0 rounded-full border border-[#ddd6fb] bg-white px-2.5 text-right text-sm font-bold text-[#1f2642] outline-none focus:border-[#c8bcff] dark:border-white/10 dark:bg-white/8 dark:text-white"
            inputMode="numeric"
            onChange={(event) => setAllocations((current) => ({ ...current, [summary.category.id]: parseAllocationMinutes(event.target.value) }))}
            pattern="[0-9]*"
            type="text"
            value={allocationInputValue(allocations[summary.category.id])}
          />
          <span className="shrink-0 text-xs normal-case tracking-normal text-[var(--text-muted)]">min</span>
        </div>
      </label>
    </div>
  );

  const save = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      for (const [targetCategoryId, reductionSecondsForTarget] of positiveAllocations) {
        const saved = await onSave({
          adjustmentDate: pending.adjustmentDate,
          reason: pending.reason,
          sourceCategoryId: pending.sourceCategoryId,
          targetCategoryId,
          sourceSessionId: pending.sourceSessionId,
          reductionSeconds: reductionSecondsForTarget,
        });
        if (!saved) {
          return;
        }
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalShell className="flex max-h-[min(86dvh,calc(100dvh-6rem))] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-modal)] border border-[var(--border-soft)] bg-[var(--surface-elevated)] shadow-[var(--shadow-modal)] dark:border-white/10 dark:bg-[#171329]" onClose={onClose}>
      <div className="border-b border-[var(--border-soft)] p-6 pb-4 dark:border-white/10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Focus Goals</p>
        <h3 className="mt-2 text-2xl font-black text-[var(--text-primary)]">Reallocate today?</h3>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {isOverWeeklyShift
            ? `${pending.sourceCategoryTitle} is already over its weekly goal. Reallocate today’s ${formatDurationForGoals(reductionSeconds)} ${pending.sourceCategoryTitle} target?`
            : `${pending.sourceCategoryTitle} is over today’s target. Reduce today’s targets across one or more categories.`}
        </p>
        <div className="mt-3 grid gap-2 rounded-[1rem] border border-[#e9e2f6] bg-white/70 p-3 text-sm font-semibold text-[var(--text-secondary)] dark:border-white/10 dark:bg-white/[0.04] sm:grid-cols-3">
          <span>{isOverWeeklyShift ? "Target to shift" : "Surplus to allocate"}: {formatDurationForGoals(reductionSeconds)}</span>
          <span>Allocated: {formatDurationForGoals(allocationSummary.allocatedSeconds)}</span>
          <span className={allocationSummary.overallocatedSeconds > 0 ? "text-[#9a5a22] dark:text-[#f4bd82]" : ""}>
            {allocationSummary.overallocatedSeconds > 0
              ? `Overallocated: ${formatDurationForGoals(allocationSummary.overallocatedSeconds)}`
              : `Remaining: ${formatDurationForGoals(allocationSummary.remainingSeconds)}`}
          </span>
        </div>
      </div>
      <div className="adhdice-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
        <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Suggested targets</p>
          {eligibleTargets.length ? eligibleTargets.map((target) => renderAllocationRow(target)) : (
            <p className="rounded-[1rem] border border-[#f4d4bb] bg-[#fff7ed] p-3 text-sm text-[#9a5a22] dark:border-[#70451f] dark:bg-[#2a1c12] dark:text-[#f4bd82]">
              No lower-priority flexible category has time left today.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Other categories</p>
          {overrideTargets.map((target) => renderAllocationRow(target.summary, { warningLabel: target.warningLabel }))}
        </div>
      </div>
      {allocationSummary.remainingSeconds > 0 && allocationSummary.allocatedSeconds > 0 ? (
        <p className="mt-3 rounded-[1rem] border border-[#f4d4bb] bg-[#fff7ed] p-3 text-sm text-[#9a5a22] dark:border-[#70451f] dark:bg-[#2a1c12] dark:text-[#f4bd82]">
          {isOverWeeklyShift
            ? `Remaining ${formatDurationForGoals(allocationSummary.remainingSeconds)} will stay on ${pending.sourceCategoryTitle} today.`
            : `Remaining ${formatDurationForGoals(allocationSummary.remainingSeconds)} will stay over capacity today.`}
        </p>
      ) : null}
      </div>
      <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--border-soft)] p-6 pt-4 dark:border-white/10">
        <button className="ui-pill-button-light px-4 py-2 font-semibold" onClick={onClose} type="button">
          {isOverWeeklyShift ? "Keep today’s target" : "Leave today over capacity"}
        </button>
        <button
          className="ui-pill-button-strong-light px-4 py-2 font-bold disabled:opacity-50"
          disabled={!canSave || isSaving}
          onClick={() => void save()}
          type="button"
        >
          {isSaving ? "Saving..." : "Reallocate"}
        </button>
      </div>
    </ModalShell>
  );
}

function formatDurationForGoals(seconds: number) {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

function getManualWeekdayAllocationSummary(draft: {
  weeklyHours: string;
  weeklyMinutes: string;
  weekdayTargets: Record<string, { hours: string; minutes: string }>;
}) {
  const weeklyTargetSeconds = hourMinutePartsToSeconds(draft.weeklyHours, draft.weeklyMinutes) ?? 0;
  const allocatedSeconds = WEEKDAY_KEYS.reduce((total, weekday) => (
    total + (hourMinutePartsToSeconds(draft.weekdayTargets[weekday]?.hours ?? "", draft.weekdayTargets[weekday]?.minutes ?? "") ?? 0)
  ), 0);
  return {
    allocatedSeconds,
    overSeconds: Math.max(0, allocatedSeconds - weeklyTargetSeconds),
    remainingSeconds: Math.max(0, weeklyTargetSeconds - allocatedSeconds),
    weeklyTargetSeconds,
  };
}

function formatLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function CategoryGoalsModal({
  categories,
  onClose,
  onSave,
}: {
  categories: FocusCategory[];
  onClose: () => void;
  onSave: (categories: FocusCategory[]) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState(() =>
    categories.map((category) => ({
      id: category.id,
      dailyHours: secondsToHourMinuteParts(category.dailyGoalSeconds).hours,
      dailyMinutes: secondsToHourMinuteParts(category.dailyGoalSeconds).minutes,
      weeklyHours: secondsToHourMinuteParts(category.weeklyGoalSeconds).hours,
      weeklyMinutes: secondsToHourMinuteParts(category.weeklyGoalSeconds).minutes,
      priorityLevel: normalizePriorityLevel(category.priorityLevel),
      targetDistributionMode: normalizeDistributionMode(category.targetDistributionMode),
      weekdayTargets: Object.fromEntries(WEEKDAY_KEYS.map((key) => [key, {
        hours: secondsToHourMinuteParts(category.weekdayTargetSeconds?.[key]).hours,
        minutes: secondsToHourMinuteParts(category.weekdayTargetSeconds?.[key]).minutes,
      }])),
      countTowardProductiveGoal: category.countTowardProductiveGoal ?? null,
      allowDailySurplusReduction: category.allowDailySurplusReduction ?? null,
      weeklySurplusCarryoverMode: normalizeCarryoverMode(category.weeklySurplusCarryoverMode),
    })),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [sortMode, setSortMode] = useState<"alphabetical" | "daily" | "weekly" | "priorityHigh" | "priorityLow">("alphabetical");
  const todayWeekdayKey = getWeekdayKey(formatLocalDateKey(new Date()));

  const updateDraft = (
    id: string,
    field: "dailyHours" | "dailyMinutes" | "weeklyHours" | "weeklyMinutes",
    value: string,
  ) => {
    setDrafts((current) =>
      current.map((draft) => {
        if (draft.id !== id) {
          return draft;
        }

        const nextDraft = { ...draft, [field]: value };
        const dailySeconds = hourMinutePartsToSeconds(nextDraft.dailyHours, nextDraft.dailyMinutes);
        const weeklySeconds = hourMinutePartsToSeconds(nextDraft.weeklyHours, nextDraft.weeklyMinutes);

        if (field === "dailyHours" || field === "dailyMinutes") {
          const weeklyParts = secondsToHourMinuteParts(dailySeconds === null ? null : dailySeconds * 7);
          nextDraft.weeklyHours = weeklyParts.hours;
          nextDraft.weeklyMinutes = weeklyParts.minutes;
        } else {
          const dailyParts = secondsToHourMinuteParts(weeklySeconds === null ? null : weeklySeconds / 7);
          nextDraft.dailyHours = dailyParts.hours;
          nextDraft.dailyMinutes = dailyParts.minutes;
        }

        return nextDraft;
      }),
    );
  };

  const updatePolicyDraft = (id: string, updates: Partial<(typeof drafts)[number]>) => {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...updates } : draft));
  };

  const updateWeekdayDraft = (id: string, weekday: string, field: "hours" | "minutes", value: string) => {
    setDrafts((current) => current.map((draft) => {
      if (draft.id !== id) return draft;
      return {
        ...draft,
        weekdayTargets: {
          ...draft.weekdayTargets,
          [weekday]: {
            ...(draft.weekdayTargets[weekday] ?? { hours: "", minutes: "" }),
            [field]: value,
          },
        },
      };
    }));
  };

  const submit = async () => {
    setIsSaving(true);
    try {
      await onSave(
        categories.map((category) => {
          const draft = drafts.find((entry) => entry.id === category.id);
          return {
            ...category,
            dailyGoalSeconds: hourMinutePartsToSeconds(draft?.dailyHours ?? "", draft?.dailyMinutes ?? ""),
            weeklyGoalSeconds: hourMinutePartsToSeconds(draft?.weeklyHours ?? "", draft?.weeklyMinutes ?? ""),
            priorityLevel: draft?.priorityLevel ?? 3,
            targetDistributionMode: draft?.targetDistributionMode ?? "auto",
            weekdayTargetSeconds: Object.fromEntries(WEEKDAY_KEYS.map((key) => [
              key,
              hourMinutePartsToSeconds(
                draft?.weekdayTargets[key]?.hours ?? "",
                draft?.weekdayTargets[key]?.minutes ?? "",
              ) ?? 0,
            ])),
            countTowardProductiveGoal: draft?.countTowardProductiveGoal ?? null,
            allowDailySurplusReduction: draft?.allowDailySurplusReduction ?? null,
            weeklySurplusCarryoverMode: draft?.weeklySurplusCarryoverMode ?? "off",
          };
        }),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const sortedCategories = [...categories].sort((a, b) => {
    const draftA = drafts.find((entry) => entry.id === a.id);
    const draftB = drafts.find((entry) => entry.id === b.id);

    if (sortMode === "daily") {
      const dailyDiff =
        (hourMinutePartsToSeconds(draftB?.dailyHours ?? "", draftB?.dailyMinutes ?? "") ?? 0) -
        (hourMinutePartsToSeconds(draftA?.dailyHours ?? "", draftA?.dailyMinutes ?? "") ?? 0);
      if (dailyDiff !== 0) {
        return dailyDiff;
      }
    }

    if (sortMode === "weekly") {
      const weeklyDiff =
        (hourMinutePartsToSeconds(draftB?.weeklyHours ?? "", draftB?.weeklyMinutes ?? "") ?? 0) -
        (hourMinutePartsToSeconds(draftA?.weeklyHours ?? "", draftA?.weeklyMinutes ?? "") ?? 0);
      if (weeklyDiff !== 0) {
        return weeklyDiff;
      }
    }

    if (sortMode === "priorityHigh") {
      const priorityDiff = (draftB?.priorityLevel ?? 3) - (draftA?.priorityLevel ?? 3);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
    }

    if (sortMode === "priorityLow") {
      const priorityDiff = (draftA?.priorityLevel ?? 3) - (draftB?.priorityLevel ?? 3);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
    }

    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
  const baseGoalTotals = drafts.reduce(
    (totals, draft) => {
      const category = categories.find((entry) => entry.id === draft.id);
      if (!category) {
        return totals;
      }

      const weeklySeconds = hourMinutePartsToSeconds(draft.weeklyHours, draft.weeklyMinutes) ?? 0;
      const dailySeconds = draft.targetDistributionMode === "manual"
        ? hourMinutePartsToSeconds(
          draft.weekdayTargets[todayWeekdayKey]?.hours ?? "",
          draft.weekdayTargets[todayWeekdayKey]?.minutes ?? "",
        ) ?? 0
        : hourMinutePartsToSeconds(draft.dailyHours, draft.dailyMinutes) ?? 0;
      const draftCategory = {
        ...category,
        countTowardProductiveGoal: draft.countTowardProductiveGoal,
      };
      const isSleep = isSleepCategory(draftCategory);
      const countsTowardProductiveGoal = resolveCountsTowardProductiveGoal(draftCategory);

      if (isSleep) {
        return {
          ...totals,
          sleepExcludedWeeklySeconds: totals.sleepExcludedWeeklySeconds + weeklySeconds,
        };
      }

      if (!countsTowardProductiveGoal) {
        return {
          ...totals,
          unproductiveExcludedWeeklySeconds: totals.unproductiveExcludedWeeklySeconds + weeklySeconds,
        };
      }

      return {
        ...totals,
        productiveCategoryCount: totals.productiveCategoryCount + (dailySeconds > 0 || weeklySeconds > 0 ? 1 : 0),
        productiveDailySeconds: totals.productiveDailySeconds + dailySeconds,
        productiveWeeklySeconds: totals.productiveWeeklySeconds + weeklySeconds,
      };
    },
    {
      productiveCategoryCount: 0,
      productiveDailySeconds: 0,
      productiveWeeklySeconds: 0,
      sleepExcludedWeeklySeconds: 0,
      unproductiveExcludedWeeklySeconds: 0,
    },
  );

  return (
    <ModalShell className="adhdice-scrollbar w-full max-w-4xl max-h-[82vh] overflow-y-auto rounded-[var(--radius-modal)] border p-8 shadow-[var(--shadow-modal)] border-[var(--border-soft)] bg-[var(--surface-elevated)] dark:border-white/10 dark:bg-[#171329]" onClose={onClose}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Category Goals</p>
            <h3 className="mt-2 text-2xl font-black text-[var(--text-primary)]">Master Goal Editor</h3>
          </div>
          <button
            className="ui-pill-button-light"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-sm text-[var(--text-secondary)]">
            Set daily and weekly goals with hours and minutes. Editing one side auto-fills the other using a 7-day week.
          </p>
          <div className="w-full sm:w-[14rem]">
            <FocusPillSelect
              label="Sort Goals"
              onChange={(value) => setSortMode(value as "alphabetical" | "daily" | "weekly" | "priorityHigh" | "priorityLow")}
              options={[
                { label: "Alphabetical", value: "alphabetical" },
                { label: "Priority 5 to 1", value: "priorityHigh" },
                { label: "Priority 1 to 5", value: "priorityLow" },
                { label: "Daily Hours", value: "daily" },
                { label: "Weekly Hours", value: "weekly" },
              ]}
              value={sortMode}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-2 rounded-[var(--radius-card)] border border-[#e9e2f6] bg-[#fbf9ff] p-3 text-sm dark:border-white/10 dark:bg-white/[0.04] sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Base Daily</p>
            <p className="mt-1 font-black text-[var(--text-primary)]">{formatDurationForGoals(baseGoalTotals.productiveDailySeconds)}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Base Weekly</p>
            <p className="mt-1 font-black text-[var(--text-primary)]">{formatDurationForGoals(baseGoalTotals.productiveWeeklySeconds)}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Productive categories</p>
            <p className="mt-1 font-black text-[var(--text-primary)]">{baseGoalTotals.productiveCategoryCount}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Sleep excluded</p>
            <p className="mt-1 font-black text-[var(--text-primary)]">{formatDurationForGoals(baseGoalTotals.sleepExcludedWeeklySeconds)}/week</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Unproductive excluded</p>
            <p className="mt-1 font-black text-[var(--text-primary)]">{formatDurationForGoals(baseGoalTotals.unproductiveExcludedWeeklySeconds)}/week</p>
          </div>
        </div>

        <div className="adhdice-scrollbar mt-6 max-h-[55vh] overflow-y-auto pr-2">
          <div className="space-y-3">
            {sortedCategories.map((category) => {
              const draft = drafts.find((entry) => entry.id === category.id);
              const manualSummary = draft ? getManualWeekdayAllocationSummary(draft) : null;
              return (
                <div
                  key={category.id}
                  className="grid gap-3 rounded-[var(--radius-card)] border p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.9fr)] md:items-center border-[var(--border-soft)] bg-[var(--surface)] shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none"
                >
                  <div className="min-w-0">
                    <p className="truncate font-black text-[var(--text-primary)]">{category.title}</p>
                    <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">
                      {[category.focusType, category.focusSubtype, category.focusSubtype2].filter(Boolean).join(" / ")}
                    </p>
                  </div>
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider opacity-40">Daily</span>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="px-4 py-3 ui-input-light"
                        inputMode="numeric"
                        onChange={(event) => updateDraft(category.id, "dailyHours", event.target.value)}
                        placeholder="0 hr"
                        value={draft?.dailyHours ?? ""}
                      />
                      <input
                        className="px-4 py-3 ui-input-light"
                        inputMode="numeric"
                        onChange={(event) => updateDraft(category.id, "dailyMinutes", event.target.value)}
                        placeholder="0 min"
                        value={draft?.dailyMinutes ?? ""}
                      />
                    </div>
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider opacity-40">Weekly</span>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="px-4 py-3 ui-input-light"
                        inputMode="numeric"
                        onChange={(event) => updateDraft(category.id, "weeklyHours", event.target.value)}
                        placeholder="0 hr"
                        value={draft?.weeklyHours ?? ""}
                      />
                      <input
                        className="px-4 py-3 ui-input-light"
                        inputMode="numeric"
                        onChange={(event) => updateDraft(category.id, "weeklyMinutes", event.target.value)}
                        placeholder="0 min"
                        value={draft?.weeklyMinutes ?? ""}
                      />
                    </div>
                  </label>
                  <div className="md:col-span-3">
                    <div className="grid gap-3 md:grid-cols-[0.9fr_1fr_1fr]">
                      <FocusPillSelect
                        label="Priority"
                        onChange={(value) => updatePolicyDraft(category.id, { priorityLevel: normalizePriorityLevel(value) })}
                        options={[5, 4, 3, 2, 1].map((priority) => ({ label: formatPriorityLabel(priority), value: String(priority) }))}
                        value={String(draft?.priorityLevel ?? 3)}
                      />
                      <FocusPillSelect
                        label="Distribution"
                        onChange={(value) => updatePolicyDraft(category.id, { targetDistributionMode: normalizeDistributionMode(value) })}
                        options={[
                          { label: "Auto", value: "auto" },
                          { label: "Manual", value: "manual" },
                        ]}
                        value={draft?.targetDistributionMode ?? "auto"}
                      />
                      <FocusPillSelect
                        label="Carryover"
                        onChange={(value) => updatePolicyDraft(category.id, { weeklySurplusCarryoverMode: normalizeCarryoverMode(value) })}
                        options={[
                          { label: "Off", value: "off" },
                          { label: "25%", value: "cap25" },
                          { label: "50%", value: "cap50" },
                          { label: "Full", value: "full" },
                        ]}
                        value={draft?.weeklySurplusCarryoverMode ?? "off"}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className={`rounded-full border px-2 py-1 text-[13px] font-medium leading-none ${draft?.countTowardProductiveGoal === true ? "border-[#cdbdff] bg-[#f1ecff] text-[#5c46d8]" : "border-[#e6def7] bg-white text-[#675b8a]"}`}
                        onClick={() => updatePolicyDraft(category.id, { countTowardProductiveGoal: draft?.countTowardProductiveGoal === true ? false : true })}
                        type="button"
                      >
                        Count toward productive goal
                      </button>
                      <button
                        className={`rounded-full border px-2 py-1 text-[13px] font-medium leading-none ${draft?.allowDailySurplusReduction === true ? "border-[#cdbdff] bg-[#f1ecff] text-[#5c46d8]" : "border-[#e6def7] bg-white text-[#675b8a]"}`}
                        onClick={() => updatePolicyDraft(category.id, { allowDailySurplusReduction: draft?.allowDailySurplusReduction === true ? false : true })}
                        type="button"
                      >
                        Allow daily surplus reduction
                      </button>
                    </div>
                    {draft?.targetDistributionMode === "manual" ? (
                      <div className="mt-3 space-y-3">
                        {manualSummary ? (
                          <div className={`rounded-[1rem] border px-3 py-2 text-sm font-semibold ${
                            manualSummary.overSeconds > 0
                              ? "border-[#f4d4bb] bg-[#fff7ed] text-[#9a5a22] dark:border-[#70451f] dark:bg-[#2a1c12] dark:text-[#f4bd82]"
                              : "border-[#d9d0f2] bg-[#fbf9ff] text-[#675b8a] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/75"
                          }`}>
                            <span>Allocated: {formatDurationForGoals(manualSummary.allocatedSeconds)} / {formatDurationForGoals(manualSummary.weeklyTargetSeconds)}</span>
                            <span className="ml-2">
                              {manualSummary.overSeconds > 0
                                ? `${formatDurationForGoals(manualSummary.overSeconds)} over weekly target`
                                : `${formatDurationForGoals(manualSummary.remainingSeconds)} left to allocate`}
                            </span>
                          </div>
                        ) : null}
                        <div className="grid gap-2 sm:grid-cols-7">
                          {WEEKDAY_KEYS.map((weekday) => (
                            <label className="flex flex-col gap-1" key={weekday}>
                              <span className="text-[11px] font-bold uppercase tracking-wider opacity-40">{weekday}</span>
                              <input
                                className="px-2 py-2 text-sm ui-input-light"
                                inputMode="numeric"
                                onChange={(event) => updateWeekdayDraft(category.id, weekday, "hours", event.target.value)}
                                placeholder="hr"
                                value={draft.weekdayTargets[weekday]?.hours ?? ""}
                              />
                              <input
                                className="px-2 py-2 text-sm ui-input-light"
                                inputMode="numeric"
                                onChange={(event) => updateWeekdayDraft(category.id, weekday, "minutes", event.target.value)}
                                placeholder="min"
                                value={draft.weekdayTargets[weekday]?.minutes ?? ""}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button
            className="px-5 py-3 font-semibold ui-pill-button-light dark:rounded-full dark:bg-white/10 dark:text-white"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="px-6 py-3 font-bold ui-pill-button-strong-light dark:rounded-full dark:bg-[#6f57f6] dark:text-white"
            disabled={isSaving}
            onClick={() => void submit()}
            type="button"
          >
            {isSaving ? "Saving..." : "Save Goal"}
          </button>
        </div>
    </ModalShell>
  );
}

function sanitizeWholeNumberValue(value: string) {
  const trimmed = value.replace(/[^\d]/g, "");
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return parsed;
}

function hourMinutePartsToSeconds(hoursValue: string, minutesValue: string) {
  const hours = sanitizeWholeNumberValue(hoursValue) ?? 0;
  const minutes = sanitizeWholeNumberValue(minutesValue) ?? 0;

  if (!hours && !minutes) {
    return null;
  }

  return (hours * 60 + minutes) * 60;
}

function secondsToHourMinuteParts(seconds?: number | null) {
  if (!seconds) {
    return { hours: "", minutes: "" };
  }

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return {
    hours: hours ? String(hours) : "",
    minutes: minutes ? String(minutes) : "",
  };
}
