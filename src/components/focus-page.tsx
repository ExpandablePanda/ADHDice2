import React, { useEffect, useId, useRef, useState } from "react";
import { Clock3 } from "lucide-react";
import {
  type FocusCategory,
  type ActiveFocusSession,
  type HistoricalFocusSession,
  type FocusLabelOptions,
  type FocusType,
  type FocusSubtype,
  DEFAULT_FOCUS_CATEGORY_TITLES,
  DEFAULT_FOCUS_TITLES,
  DEFAULT_PRIMARY_SUBTYPES,
  DEFAULT_SECONDARY_SUBTYPES,
} from "@/lib/types";
import { getDisplayFocusCategories, isSystemCountdownCategoryId, SYSTEM_COUNTDOWN_CATEGORY_ID } from "@/lib/focus-utils";
import { FocusClockRow, FocusClockRowDesktop } from "./focus-clocks";
import { CategoryManager } from "./category-manager";
import { DailyHistoryGallery } from "./focus-history";
import { SessionFinishModal, ManualEntryModal } from "./focus-modals";
import { ModalShell } from "./modal-shell";
import { FocusPillSelect } from "./focus-form-controls";

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
    <div className="relative mt-4 w-[min(14rem,calc(100vw-2rem))] text-left" ref={rootRef}>
      <label className="sr-only" htmlFor={`${listboxId}-input`}>Add a focus timer</label>
      <div className="relative">
        <input
          aria-activedescendant={isOpen && options[safeHighlightedIndex] ? `${listboxId}-option-${options[safeHighlightedIndex].id}` : undefined}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          className="h-9 w-full rounded-full border border-[#e5def8] bg-white px-4 pr-9 text-sm font-medium text-[#2f294a] shadow-[0_8px_22px_rgba(81,61,168,0.08)] outline-none transition placeholder:text-[#938ab8] focus:border-[#b9a9fb] focus:ring-2 focus:ring-[#dcd3ff] dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-white/38 dark:focus:border-[#7f67ff] dark:focus:ring-[#7f67ff]/25"
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
        <svg aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8d82b2]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
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
              className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${index === safeHighlightedIndex ? "bg-[#f1ecff] text-[#6249e8] dark:bg-[#2b214d] dark:text-[#cabfff]" : "text-[#5f5879] hover:bg-[#f8f6fd] dark:text-white/70 dark:hover:bg-white/[0.06]"}`}
              id={`${listboxId}-option-${option.id}`}
              key={option.id}
              onClick={() => selectOption(option)}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlightedIndex(index)}
              role="option"
            >
              {option.kind === "countdown" ? (
                <Clock3 aria-hidden="true" className="h-4 w-4 shrink-0 text-[#7b68ee] dark:text-[#cabfff]" />
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
  history,
  onToggleTimer,
  onSetCountdownTarget,
  onFinishTimer,
  onAdjustTimer,
  onResetTimer,
  onDeleteTimer,
  onLogManual,
  onUpdateHistoryEntry,
  onDeleteHistoryEntry,
  onUpdateCategories,
  onDeleteCategory,
}: {
  categories: FocusCategory[];
  activeSessions: Record<string, ActiveFocusSession>;
  history: HistoricalFocusSession[];
  onToggleTimer: (catId: string, options?: { countdownTargetSeconds?: number | null; mode?: "countdown" | "countup" }) => void;
  onSetCountdownTarget: (catId: string, targetSeconds: number, options?: { start?: boolean }) => void;
  onFinishTimer: (catId: string, data?: { title: string; focusType: FocusType; focusSubtype?: FocusSubtype | null; focusSubtype2?: FocusSubtype | null; notes: string; date: string }) => void;
  onAdjustTimer: (catId: string, deltaSeconds: number) => void;
  onResetTimer: (catId: string) => void;
  onDeleteTimer: (catId: string) => void;
  onLogManual: (data: { categoryId: string | null; title: string; focusType: FocusType; focusSubtype?: FocusSubtype | null; focusSubtype2?: FocusSubtype | null; durationSeconds: number; date: string; notes: string }) => Promise<boolean>;
  onUpdateHistoryEntry: (entryId: string, data: { categoryId: string | null; title: string; focusType: FocusType; focusSubtype?: FocusSubtype | null; focusSubtype2?: FocusSubtype | null; durationSeconds: number; date: string; notes: string }) => Promise<void>;
  onDeleteHistoryEntry: (entryId: string) => Promise<void>;
  onUpdateCategories: (categories: FocusCategory[]) => Promise<boolean>;
  onDeleteCategory: (category: FocusCategory) => Promise<boolean>;
}) {
  const [countdownPickerOpenRequest, setCountdownPickerOpenRequest] = useState(0);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [finishingCatId, setFinishingCatId] = useState<string | null>(null);
  const [finishingDurationSeconds, setFinishingDurationSeconds] = useState(0);
  const [showGoalsEditor, setShowGoalsEditor] = useState(false);
  const userCategories = categories.filter((category) => !isSystemCountdownCategoryId(category.id));
  const displayCategories = getDisplayFocusCategories(categories, activeSessions);

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
  const activeFinishingCategory = finishingCatId ? displayCategories.find(c => c.id === finishingCatId) : null;
  const labelOptions = buildFocusLabelOptions(userCategories, history);
  const activeCategories = displayCategories.filter((category) => Boolean(activeSessions[category.id]));

  return (
    <>
      <section className="pt-8 flex flex-col items-center text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
          Focus Timers
        </p>

        <div className="mt-4 sm:mt-8 flex justify-center gap-4">
          <button
            className="ui-pill-button-light transition hover:-translate-y-0.5 dark:rounded-full dark:bg-white/5 dark:text-[#cabfff]"
            onClick={() => setShowCategoryManager(true)}
            type="button"
          >
            Edit Categories
          </button>
          <button
            className="ui-pill-button-strong-light transition hover:-translate-y-0.5 dark:rounded-full dark:bg-[#cabfff] dark:text-[#1a1431]"
            onClick={() => setShowManualEntry(true)}
            type="button"
          >
            Manual Entry
          </button>
        </div>

        <FocusTimerPicker
          activeSessions={activeSessions}
          categories={userCategories}
          onSelectCountdown={() => {
            setCountdownPickerOpenRequest((current) => current + 1);
            onToggleTimer(SYSTEM_COUNTDOWN_CATEGORY_ID, { mode: "countdown" });
          }}
          onSelect={onToggleTimer}
        />
      </section>

      {activeCategories.length ? <div className="mt-5">
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
        <FocusClockRowDesktop
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
      </div> : null}

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

      {showCategoryManager && (
        <CategoryManager
          categories={userCategories}
          history={history}
          labelOptions={labelOptions}
          onClose={() => setShowCategoryManager(false)}
          onDelete={onDeleteCategory}
          onUpdate={onUpdateCategories}
        />
      )}

      {showManualEntry && (
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
      )}

      {finishingCatId && activeFinishingCategory && activeFinishingSession && (
        <SessionFinishModal
          category={activeFinishingCategory}
          durationSeconds={finishingDurationSeconds}
          labelOptions={labelOptions}
          onCancel={() => setFinishingCatId(null)}
          onConfirm={confirmFinish}
          sessionStartTime={activeFinishingSession.startTime}
        />
      )}

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
    })),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [sortMode, setSortMode] = useState<"alphabetical" | "daily" | "weekly">("alphabetical");

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

    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });

  return (
    <ModalShell className="w-full max-w-4xl max-h-[82vh] overflow-y-auto rounded-[var(--radius-modal)] border p-8 shadow-[var(--shadow-modal)] border-[var(--border-soft)] bg-[var(--surface-elevated)] dark:border-white/10 dark:bg-[#171329]" onClose={onClose}>
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
              onChange={(value) => setSortMode(value as "alphabetical" | "daily" | "weekly")}
              options={[
                { label: "Alphabetical", value: "alphabetical" },
                { label: "Daily Hours", value: "daily" },
                { label: "Weekly Hours", value: "weekly" },
              ]}
              value={sortMode}
            />
          </div>
        </div>

        <div className="mt-6 max-h-[55vh] overflow-y-auto pr-2">
          <div className="space-y-3">
            {sortedCategories.map((category) => {
              const draft = drafts.find((entry) => entry.id === category.id);
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
