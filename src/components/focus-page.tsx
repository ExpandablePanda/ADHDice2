import React, { useState } from "react";
import { 
  FocusCategory, 
  ActiveFocusSession, 
  HistoricalFocusSession,
  FocusLabelOptions,
  FocusType,
  FocusSubtype,
  DEFAULT_FOCUS_CATEGORY_TITLES,
  DEFAULT_FOCUS_TITLES,
  DEFAULT_PRIMARY_SUBTYPES,
  DEFAULT_SECONDARY_SUBTYPES
} from "./task-app";
import { FocusClockRow, FocusClockRowDesktop } from "./focus-clocks";
import { CategoryManager } from "./category-manager";
import { DailyHistoryGallery } from "./focus-history";
import { SessionFinishModal, ManualEntryModal } from "./focus-modals";
import { ModalShell } from "./modal-shell";

export function FocusPage({
  lightMode,
  categories,
  activeSessions,
  history,
  onToggleTimer,
  onFinishTimer,
  onAdjustTimer,
  onResetTimer,
  onLogManual,
  onUpdateHistoryEntry,
  onDeleteHistoryEntry,
  onUpdateCategories,
  onDeleteCategory,
}: {
  lightMode: boolean;
  categories: FocusCategory[];
  activeSessions: Record<string, ActiveFocusSession>;
  history: HistoricalFocusSession[];
  onToggleTimer: (catId: string) => void;
  onFinishTimer: (catId: string, data?: { title: string; focusType: FocusType; focusSubtype?: FocusSubtype | null; focusSubtype2?: FocusSubtype | null; notes: string }) => void;
  onAdjustTimer: (catId: string, deltaSeconds: number) => void;
  onResetTimer: (catId: string) => void;
  onLogManual: (data: { categoryId: string | null; title: string; focusType: FocusType; focusSubtype?: FocusSubtype | null; focusSubtype2?: FocusSubtype | null; durationSeconds: number; date: string; notes: string }) => Promise<boolean>;
  onUpdateHistoryEntry: (entryId: string, data: { categoryId: string | null; title: string; focusType: FocusType; focusSubtype?: FocusSubtype | null; focusSubtype2?: FocusSubtype | null; durationSeconds: number; date: string; notes: string }) => Promise<void>;
  onDeleteHistoryEntry: (entryId: string) => Promise<void>;
  onUpdateCategories: (categories: FocusCategory[]) => Promise<boolean>;
  onDeleteCategory: (category: FocusCategory) => Promise<boolean>;
}) {
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [finishingCatId, setFinishingCatId] = useState<string | null>(null);
  const [finishingDurationSeconds, setFinishingDurationSeconds] = useState(0);
  const [showGoalsEditor, setShowGoalsEditor] = useState(false);

  const handleFinishClick = (catId: string) => {
    const activeSession = activeSessions[catId];
    const durationSeconds = activeSession
      ? activeSession.accumulatedSeconds + (activeSession.isRunning && activeSession.startTime ? Math.floor((Date.now() - activeSession.startTime) / 1000) : 0)
      : 0;
    setFinishingDurationSeconds(durationSeconds);
    setFinishingCatId(catId);
  };

  const confirmFinish = (data: { title: string; focusType: FocusType; focusSubtype?: FocusSubtype | null; focusSubtype2?: FocusSubtype | null; notes: string }) => {
    if (finishingCatId) {
      onFinishTimer(finishingCatId, data);
      setFinishingCatId(null);
    }
  };

  const activeFinishingSession = finishingCatId ? activeSessions[finishingCatId] : null;
  const activeFinishingCategory = finishingCatId ? categories.find(c => c.id === finishingCatId) : null;
  const labelOptions = buildFocusLabelOptions(categories, history);

  return (
    <>
      <section className="pt-8 flex flex-col items-center text-center">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${lightMode ? "text-[var(--text-muted)]" : "text-white/40"}`}>
          Deep Work Hub
        </p>
        <h1 className={`mt-2 text-[clamp(2.4rem,5vw,4rem)] font-black tracking-tight ${lightMode ? "text-[var(--text-primary)]" : "text-white"}`}>
          Focus Session
        </h1>
        <p className={`mt-1 max-w-3xl text-base ${lightMode ? "text-[var(--text-secondary)]" : "text-white/55"}`}>
          Choose a category and start your flow state. Your time is tracked persistently across all devices.
        </p>

        <div className="mt-8 flex justify-center gap-4">
          <button
            className={`px-6 py-2 text-sm font-bold transition hover:-translate-y-0.5 ${lightMode ? "ui-pill-button-light" : "rounded-full bg-white/5 text-[#cabfff]"}`}
            onClick={() => setShowCategoryManager(true)}
            type="button"
          >
            Edit Categories
          </button>
          <button
            className={`px-6 py-2 text-sm font-bold transition hover:-translate-y-0.5 ${lightMode ? "ui-pill-button-strong-light" : "rounded-full bg-[#cabfff] text-[#1a1431]"}`}
            onClick={() => setShowManualEntry(true)}
            type="button"
          >
            Manual Entry
          </button>
        </div>
      </section>

      <div className="mt-16">
        <FocusClockRow
          activeSessions={activeSessions}
          categories={categories}
          lightMode={lightMode}
          onAdjust={onAdjustTimer}
          onFinish={handleFinishClick}
          onReset={onResetTimer}
          onToggle={onToggleTimer}
        />
        <FocusClockRowDesktop
          activeSessions={activeSessions}
          categories={categories}
          lightMode={lightMode}
          onAdjust={onAdjustTimer}
          onFinish={handleFinishClick}
          onReset={onResetTimer}
          onToggle={onToggleTimer}
        />
      </div>

      <div className="mt-20 flex justify-center">
        <CategoryGoalsSection
          categories={categories}
          history={history}
          lightMode={lightMode}
          onEdit={() => setShowGoalsEditor(true)}
        />
      </div>

      <div className="mt-24 flex justify-center pb-20">
        <DailyHistoryGallery
          categories={categories}
          history={history}
          labelOptions={labelOptions}
          lightMode={lightMode}
          onDeleteEntry={onDeleteHistoryEntry}
          onUpdateEntry={onUpdateHistoryEntry}
        />
      </div>

      {showCategoryManager && (
        <CategoryManager
          categories={categories}
          history={history}
          labelOptions={labelOptions}
          lightMode={lightMode}
          onClose={() => setShowCategoryManager(false)}
          onDelete={onDeleteCategory}
          onUpdate={onUpdateCategories}
        />
      )}

      {showManualEntry && (
        <ManualEntryModal
          categories={categories}
          labelOptions={labelOptions}
          lightMode={lightMode}
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
          lightMode={lightMode}
          onCancel={() => setFinishingCatId(null)}
          onConfirm={confirmFinish}
        />
      )}

      {showGoalsEditor ? (
        <CategoryGoalsModal
          categories={categories}
          lightMode={lightMode}
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

function CategoryGoalsSection({
  categories,
  history,
  lightMode,
  onEdit,
}: {
  categories: FocusCategory[];
  history: HistoricalFocusSession[];
  lightMode: boolean;
  onEdit: () => void;
}) {
  const [sortMode, setSortMode] = useState<"alphabetical" | "daily" | "weekly">("alphabetical");
  const today = todayLocalISO();
  const weeklyDateFloor = shiftLocalISODate(today, -6);

  const actualsByCategory = history.reduce<Record<string, { daily: number; weekly: number }>>((acc, entry) => {
    if (!entry.categoryId) {
      return acc;
    }
    if (!acc[entry.categoryId]) {
      acc[entry.categoryId] = { daily: 0, weekly: 0 };
    }
    if (entry.date === today) {
      acc[entry.categoryId].daily += entry.durationSeconds;
    }
    if (entry.date >= weeklyDateFloor && entry.date <= today) {
      acc[entry.categoryId].weekly += entry.durationSeconds;
    }
    return acc;
  }, {});

  const sortedCategories = [...categories].sort((a, b) => {
    if (sortMode === "daily") {
      const dailyDiff = (actualsByCategory[b.id]?.daily ?? 0) - (actualsByCategory[a.id]?.daily ?? 0);
      if (dailyDiff !== 0) {
        return dailyDiff;
      }
    }

    if (sortMode === "weekly") {
      const weeklyDiff = (actualsByCategory[b.id]?.weekly ?? 0) - (actualsByCategory[a.id]?.weekly ?? 0);
      if (weeklyDiff !== 0) {
        return weeklyDiff;
      }
    }

    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });

  return (
    <section className={`w-full max-w-4xl rounded-[var(--radius-modal)] border p-8 ${lightMode ? "border-[var(--border-soft)] bg-[var(--surface-elevated)] shadow-[var(--shadow-card-hover)]" : "border-white/5 bg-white/[0.03] shadow-[0_24px_60px_rgba(0,0,0,0.25)]"}`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${lightMode ? "text-[var(--text-muted)]" : "text-white/40"}`}>
            Targets
          </p>
          <h2 className={`mt-2 text-2xl font-black ${lightMode ? "text-[var(--text-primary)]" : "text-white"}`}>
            Category Goals
          </h2>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider opacity-40">Sort Goals</span>
            <select
              className={`px-4 py-3 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
              onChange={(event) => setSortMode(event.target.value as "alphabetical" | "daily" | "weekly")}
              value={sortMode}
            >
              <option value="alphabetical">Alphabetical</option>
              <option value="daily">Highest Daily Hours</option>
              <option value="weekly">Highest Weekly Hours</option>
            </select>
          </label>
          <button
            className={`px-4 py-2 text-sm font-bold ${lightMode ? "ui-pill-button-light" : "rounded-full bg-white/10 text-[#cabfff]"}`}
            onClick={onEdit}
            type="button"
          >
            Edit Goals
          </button>
        </div>
      </div>

      <div className="mt-6 max-h-[58vh] space-y-3 overflow-y-auto pr-1">
        {sortedCategories.map((category) => {
          const dailyActual = actualsByCategory[category.id]?.daily ?? 0;
          const weeklyActual = actualsByCategory[category.id]?.weekly ?? 0;
          const dailyGoal = category.dailyGoalSeconds ?? 0;
          const weeklyGoal = category.weeklyGoalSeconds ?? 0;
          return (
          <div
            key={category.id}
            className={`rounded-[var(--radius-card)] border p-4 transition hover:-translate-y-0.5 ${lightMode ? "border-[var(--border-soft)] bg-[var(--surface)] hover:shadow-[var(--shadow-card)]" : "border-white/10 bg-white/[0.03] hover:shadow-[0_14px_28px_rgba(0,0,0,0.35)]"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`font-black ${lightMode ? "text-[var(--text-primary)]" : "text-white"}`}>{category.title}</p>
                <p className={`mt-1 text-xs ${lightMode ? "text-[var(--text-secondary)]" : "text-white/45"}`}>
                  {[category.focusType, category.focusSubtype, category.focusSubtype2].filter(Boolean).join(" / ")}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${lightMode ? "bg-[var(--surface-muted)] text-[var(--text-muted)]" : "bg-white/5 text-white/45"}`}>
                Target
              </span>
            </div>

            <div className="mt-5 space-y-4">
              <GoalVsActualBar
                actualSeconds={dailyActual}
                goalSeconds={dailyGoal}
                label="Daily"
                lightMode={lightMode}
              />
              <GoalVsActualBar
                actualSeconds={weeklyActual}
                goalSeconds={weeklyGoal}
                label="Weekly"
                lightMode={lightMode}
              />
            </div>
          </div>
          );
        })}
      </div>
    </section>
  );
}

function GoalVsActualBar({
  actualSeconds,
  goalSeconds,
  label,
  lightMode,
}: {
  actualSeconds: number;
  goalSeconds: number;
  label: "Daily" | "Weekly";
  lightMode: boolean;
}) {
  const scaleMax = Math.max(actualSeconds, goalSeconds, 60);
  const fillPercent = (actualSeconds / scaleMax) * 100;
  const markerPercent = (goalSeconds / scaleMax) * 100;
  const isAtGoal = goalSeconds > 0 && actualSeconds >= goalSeconds;
  const barColor = isAtGoal
    ? (lightMode ? "#12a876" : "#7de4b8")
    : (lightMode ? "#ea580c" : "#f6b178");

  return (
    <div className={`rounded-[var(--radius-card)] p-4 ${lightMode ? "bg-[var(--surface-muted)]" : "bg-white/[0.04]"}`}>
      <div className="mb-2 flex items-center justify-between">
        <p className={`text-[11px] font-bold uppercase tracking-[0.18em] ${lightMode ? "text-[var(--text-muted)]" : "text-white/40"}`}>
          {label}
        </p>
        <p className={`text-xs font-semibold ${lightMode ? "text-[var(--text-secondary)]" : "text-white/60"}`}>
          {formatGoal(actualSeconds)} / {formatGoal(goalSeconds)}
        </p>
      </div>
      <div className={`relative h-3 overflow-hidden rounded-full ${lightMode ? "bg-[var(--border-soft)]" : "bg-white/10"}`}>
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
          style={{ backgroundColor: barColor, width: `${Math.min(100, fillPercent)}%` }}
        />
        <div
          className={`absolute top-[-2px] h-4 w-[2px] ${lightMode ? "bg-[var(--text-primary)]" : "bg-white"}`}
          style={{ left: `calc(${Math.min(100, markerPercent)}% - 1px)` }}
        />
      </div>
    </div>
  );
}

function CategoryGoalsModal({
  categories,
  lightMode,
  onClose,
  onSave,
}: {
  categories: FocusCategory[];
  lightMode: boolean;
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
    <ModalShell className={`w-full max-w-4xl max-h-[82vh] overflow-y-auto rounded-[var(--radius-modal)] border p-8 shadow-[var(--shadow-modal)] ${lightMode ? "border-[var(--border-soft)] bg-[var(--surface-elevated)]" : "border-white/10 bg-[#171329]"}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${lightMode ? "text-[var(--text-muted)]" : "text-white/35"}`}>Category Goals</p>
            <h3 className={`mt-2 text-2xl font-black ${lightMode ? "text-[var(--text-primary)]" : "text-white"}`}>Master Goal Editor</h3>
          </div>
          <button
            className={`rounded-full px-4 py-2 text-sm font-semibold ${lightMode ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-white/10 text-[#cabfff]"}`}
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className={`text-sm ${lightMode ? "text-[var(--text-secondary)]" : "text-white/55"}`}>
            Set daily and weekly goals with hours and minutes. Editing one side auto-fills the other using a 7-day week.
          </p>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider opacity-40">Sort Goals</span>
            <select
              className={`px-4 py-3 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
              onChange={(event) => setSortMode(event.target.value as "alphabetical" | "daily" | "weekly")}
              value={sortMode}
            >
              <option value="alphabetical">Alphabetical</option>
              <option value="daily">Daily Hours</option>
              <option value="weekly">Weekly Hours</option>
            </select>
          </label>
        </div>

        <div className="mt-6 max-h-[55vh] overflow-y-auto pr-2">
          <div className="space-y-3">
            {sortedCategories.map((category) => {
              const draft = drafts.find((entry) => entry.id === category.id);
              return (
                <div
                  key={category.id}
                  className={`grid gap-3 rounded-[var(--radius-card)] border p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.9fr)] md:items-center ${lightMode ? "border-[var(--border-soft)] bg-[var(--surface)] shadow-[var(--shadow-card)]" : "border-white/10 bg-white/[0.03]"}`}
                >
                  <div className="min-w-0">
                    <p className={`truncate font-black ${lightMode ? "text-[var(--text-primary)]" : "text-white"}`}>{category.title}</p>
                    <p className={`mt-1 truncate text-xs ${lightMode ? "text-[var(--text-secondary)]" : "text-white/45"}`}>
                      {[category.focusType, category.focusSubtype, category.focusSubtype2].filter(Boolean).join(" / ")}
                    </p>
                  </div>
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider opacity-40">Daily</span>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className={`px-4 py-3 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
                        inputMode="numeric"
                        onChange={(event) => updateDraft(category.id, "dailyHours", event.target.value)}
                        placeholder="0 hr"
                        value={draft?.dailyHours ?? ""}
                      />
                      <input
                        className={`px-4 py-3 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
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
                        className={`px-4 py-3 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
                        inputMode="numeric"
                        onChange={(event) => updateDraft(category.id, "weeklyHours", event.target.value)}
                        placeholder="0 hr"
                        value={draft?.weeklyHours ?? ""}
                      />
                      <input
                        className={`px-4 py-3 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
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
            className={`px-5 py-3 font-semibold ${lightMode ? "ui-pill-button-light" : "rounded-full bg-white/10 text-white"}`}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className={`${lightMode ? "ui-pill-button-strong-light" : "rounded-full bg-[#6f57f6] text-white"} px-6 py-3 font-bold`}
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

function todayLocalISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftLocalISODate(isoDate: string, deltaDays: number) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + deltaDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function formatGoal(seconds?: number | null) {
  if (!seconds) {
    return "No goal";
  }

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours && minutes) {
    return `${hours}h ${minutes}m`;
  }
  if (hours) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}
