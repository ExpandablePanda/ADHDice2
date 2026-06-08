import React, { useMemo, useState } from "react";
import { ModalShell } from "./modal-shell";
import { type FocusCategory, type HistoricalFocusSession, type FocusLabelOptions, type FocusSubtype, type FocusType } from "@/lib/types";
import { formatDuration, formatLocalDate } from "@/lib/utils";

type TimeScope = "daily" | "weekly" | "monthly";

type ScopeRange = {
  start: string;
  end: string;
  label: string;
  heading: string;
};

type GoalRow = {
  category: FocusCategory;
  actualSeconds: number;
  goalSeconds: number;
  alignmentScore: number;
};

type StatEntry = {
  label: string;
  seconds: number;
};

function todayLocalISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftLocalISODate(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

function startOfMonthISO(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(1);
  return formatLocalDate(date);
}

function endOfMonthISO(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  date.setMonth(date.getMonth() + 1, 0);
  return formatLocalDate(date);
}

function daysInMonthForISO(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function shiftScopeDate(scope: TimeScope, iso: string, direction: number) {
  if (scope === "daily") {
    return shiftLocalISODate(iso, direction);
  }

  if (scope === "weekly") {
    return shiftLocalISODate(iso, direction * 7);
  }

  const date = new Date(`${iso}T12:00:00`);
  date.setMonth(date.getMonth() + direction, 1);
  return formatLocalDate(date);
}

function formatMonthLabel(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${iso}T12:00:00`));
}

function getScopeRange(scope: TimeScope, currentDate: string): ScopeRange {
  if (scope === "daily") {
    return {
      start: currentDate,
      end: currentDate,
      label: currentDate,
      heading: "Daily History",
    };
  }

  if (scope === "weekly") {
    const start = shiftLocalISODate(currentDate, -6);
    return {
      start,
      end: currentDate,
      label: `${start} - ${currentDate}`,
      heading: "Weekly History",
    };
  }

  return {
    start: startOfMonthISO(currentDate),
    end: endOfMonthISO(currentDate),
    label: formatMonthLabel(currentDate),
    heading: "Monthly History",
  };
}

function toStatEntries(stats: Record<string, number>) {
  return Object.entries(stats)
    .filter(([, seconds]) => seconds > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { sensitivity: "base" }))
    .map(([label, seconds]) => ({ label, seconds }));
}

function getGoalSeconds(category: FocusCategory, scope: TimeScope, currentDate: string) {
  if (scope === "daily") {
    return category.dailyGoalSeconds ?? 0;
  }

  if (scope === "weekly") {
    return category.weeklyGoalSeconds ?? (category.dailyGoalSeconds ? category.dailyGoalSeconds * 7 : 0);
  }

  const daysInMonth = daysInMonthForISO(currentDate);
  if (category.dailyGoalSeconds) {
    return category.dailyGoalSeconds * daysInMonth;
  }
  if (category.weeklyGoalSeconds) {
    return Math.round((category.weeklyGoalSeconds / 7) * daysInMonth);
  }
  return 0;
}

function getAlignmentScore(actualSeconds: number, goalSeconds: number) {
  if (goalSeconds <= 0) {
    return 0;
  }

  const upperBound = Math.max(actualSeconds, goalSeconds);
  if (upperBound <= 0) {
    return 0;
  }

  return Math.min(actualSeconds, goalSeconds) / upperBound;
}

function getHeroStatus(goalRows: GoalRow[]) {
  if (goalRows.length === 0) {
    return {
      eyebrow: "Goal status",
      headline: "Add category goals to shape this view",
      accentClass: "text-[var(--text-primary)]",
      toneClass: "border-[var(--border-soft)] bg-[var(--surface-elevated)] dark:border-white/10 dark:bg-white/[0.03]",
    };
  }

  const averageScore = goalRows.reduce((sum, row) => sum + row.alignmentScore, 0) / goalRows.length;
  if (averageScore >= 0.8) {
    return {
      eyebrow: "Goal status",
      headline: "Mostly aligned with your goals",
      accentClass: "text-[var(--success)]",
      toneClass: "border-[rgba(35,162,108,0.16)] bg-[#f4fbf7] dark:border-[#2d5b49] dark:bg-[#18261f]",
    };
  }

  if (averageScore >= 0.5) {
    return {
      eyebrow: "Goal status",
      headline: "Your goals are mixed, but the pattern is clear",
      accentClass: "text-[var(--accent)]",
      toneClass: "border-[#ddd2ff] bg-[#f7f4ff] dark:border-[#42306f] dark:bg-[#1c1830]",
    };
  }

  return {
    eyebrow: "Goal status",
    headline: "A few categories drifted off track",
    accentClass: "text-[var(--warning)]",
    toneClass: "border-[#ffd8be] bg-[#fff4ea] dark:border-[#65401d] dark:bg-[#2d2015]",
  };
}

function formatGoalPair(actualSeconds: number, goalSeconds: number) {
  return `${formatDuration(actualSeconds)} / ${formatDuration(goalSeconds)}`;
}

function formatEntriesHeading(scope: TimeScope, range: ScopeRange) {
  if (scope === "daily") {
    return `All Entries For ${range.start}`;
  }
  if (scope === "weekly") {
    return `All Entries For ${range.start} - ${range.end}`;
  }
  return `All Entries For ${range.label}`;
}

export function DailyHistoryGallery({
  categories,
  history,
  labelOptions,
  onDeleteEntry,
  onUpdateEntry,
}: {
  categories: FocusCategory[];
  history: HistoricalFocusSession[];
  labelOptions: FocusLabelOptions;
  onDeleteEntry: (entryId: string) => Promise<void>;
  onUpdateEntry: (entryId: string, data: { categoryId: string | null; title: string; focusType: FocusType; focusSubtype?: FocusSubtype | null; focusSubtype2?: FocusSubtype | null; durationSeconds: number; date: string; notes: string }) => Promise<void>;
}) {
  const [scope, setScope] = useState<TimeScope>("daily");
  const [currentDate, setCurrentDate] = useState(todayLocalISO());
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingEntry, setSavingEntry] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const range = useMemo(() => getScopeRange(scope, currentDate), [scope, currentDate]);

  const derived = useMemo(() => {
    const scopedSessions = history.filter((session) => session.date >= range.start && session.date <= range.end);
    const sessionsByDate = [...scopedSessions].sort((a, b) => {
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      return b.id.localeCompare(a.id);
    });

    const totalSeconds = scopedSessions.reduce((sum, session) => sum + session.durationSeconds, 0);
    const typeStats = scopedSessions.reduce((acc, session) => {
      acc[session.focusType] = (acc[session.focusType] || 0) + session.durationSeconds;
      return acc;
    }, {} as Record<string, number>);

    const subtypeStats = scopedSessions.reduce((acc, session) => {
      if (session.focusSubtype) {
        acc[session.focusSubtype] = (acc[session.focusSubtype] || 0) + session.durationSeconds;
      }
      return acc;
    }, {} as Record<string, number>);

    const titleStats = scopedSessions.reduce((acc, session) => {
      acc[session.title] = (acc[session.title] || 0) + session.durationSeconds;
      return acc;
    }, {} as Record<string, number>);

    const actualByCategory = scopedSessions.reduce((acc, session) => {
      if (!session.categoryId) {
        return acc;
      }
      acc[session.categoryId] = (acc[session.categoryId] || 0) + session.durationSeconds;
      return acc;
    }, {} as Record<string, number>);

    const goalRows = categories
      .map((category) => {
        const goalSeconds = getGoalSeconds(category, scope, currentDate);
        if (goalSeconds <= 0) {
          return null;
        }
        const actualSeconds = actualByCategory[category.id] ?? 0;
        return {
          category,
          actualSeconds,
          goalSeconds,
          alignmentScore: getAlignmentScore(actualSeconds, goalSeconds),
        } satisfies GoalRow;
      })
      .filter((row): row is GoalRow => row !== null)
      .sort((a, b) => {
        if (a.alignmentScore !== b.alignmentScore) {
          return a.alignmentScore - b.alignmentScore;
        }
        const diff = Math.abs(b.actualSeconds - b.goalSeconds) - Math.abs(a.actualSeconds - a.goalSeconds);
        if (diff !== 0) {
          return diff;
        }
        return a.category.title.localeCompare(b.category.title, undefined, { sensitivity: "base" });
      });

    const heroRows = goalRows.slice(0, 3);
    const bestAligned = goalRows.length > 0 ? [...goalRows].sort((a, b) => b.alignmentScore - a.alignmentScore || a.category.title.localeCompare(b.category.title, undefined, { sensitivity: "base" }))[0] : null;
    const worstAligned = goalRows[0] ?? null;
    const topCategory = Object.entries(actualByCategory)
      .map(([categoryId, seconds]) => ({ category: categories.find((item) => item.id === categoryId), seconds }))
      .filter((item): item is { category: FocusCategory; seconds: number } => Boolean(item.category))
      .sort((a, b) => b.seconds - a.seconds || a.category.title.localeCompare(b.category.title, undefined, { sensitivity: "base" }))[0] ?? null;

    const topTitleEntries = toStatEntries(titleStats).slice(0, 3);
    const typeEntries = toStatEntries(typeStats);
    const subtypeEntries = toStatEntries(subtypeStats);

    return {
      scopedSessions,
      sessionsByDate,
      totalSeconds,
      goalRows,
      heroRows,
      bestAligned,
      worstAligned,
      topCategory,
      topTitleEntries,
      typeEntries,
      subtypeEntries,
    };
  }, [categories, currentDate, history, range.end, range.start, scope]);

  const editingEntry = editingId ? history.find((entry) => entry.id === editingId) ?? null : null;

  const [entryDate, setEntryDate] = useState(todayLocalISO());
  const [entryCategoryId, setEntryCategoryId] = useState("__none__");
  const [entryTitle, setEntryTitle] = useState("");
  const [entryType, setEntryType] = useState<FocusType>("Work");
  const [entryPrimarySubtype, setEntryPrimarySubtype] = useState<FocusSubtype>("");
  const [entrySecondarySubtype, setEntrySecondarySubtype] = useState("");
  const [entryHours, setEntryHours] = useState("0");
  const [entryMinutes, setEntryMinutes] = useState("30");
  const [entryNotes, setEntryNotes] = useState("");

  const heroStatus = getHeroStatus(derived.goalRows);

  const openEdit = (entry: HistoricalFocusSession) => {
    setEditingId(entry.id);
    setEntryDate(entry.date);
    setEntryCategoryId(entry.categoryId ?? "__none__");
    setEntryTitle(entry.title);
    setEntryType(entry.focusType);
    setEntryPrimarySubtype(entry.focusSubtype ?? "");
    setEntrySecondarySubtype(entry.focusSubtype2 ?? "");
    setEntryHours(String(Math.floor(entry.durationSeconds / 3600)));
    setEntryMinutes(String(Math.floor((entry.durationSeconds % 3600) / 60)));
    setEntryNotes(entry.notes ?? "");
  };

  const handleCategoryChange = (value: string) => {
    setEntryCategoryId(value);
    if (value === "__none__") {
      return;
    }

    const category = categories.find((item) => item.id === value);
    if (category) {
      setEntryTitle(category.title);
      setEntryType(category.focusType);
      setEntryPrimarySubtype(category.focusSubtype ?? "");
      setEntrySecondarySubtype(category.focusSubtype2 ?? "");
    }
  };

  const saveEdit = async () => {
    if (!editingId || !entryTitle.trim() || !entryType.trim()) {
      return;
    }

    const parsedHours = Number(entryHours);
    const parsedMinutes = Number(entryMinutes);
    const safeHours = Number.isFinite(parsedHours) ? Math.max(0, Math.floor(parsedHours)) : 0;
    const safeMinutes = Number.isFinite(parsedMinutes) ? Math.max(0, Math.floor(parsedMinutes)) : 0;
    const nextSeconds = Math.max(60, (safeHours * 60 + safeMinutes) * 60);
    setSavingEntry(true);
    try {
      await onUpdateEntry(editingId, {
        categoryId: entryCategoryId === "__none__" ? null : entryCategoryId,
        title: entryTitle,
        focusType: entryType,
        focusSubtype: entryPrimarySubtype.trim() || null,
        focusSubtype2: entrySecondarySubtype.trim() || null,
        durationSeconds: nextSeconds,
        date: entryDate,
        notes: entryNotes,
      });
      setEditingId(null);
    } finally {
      setSavingEntry(false);
    }
  };

  const deleteEntry = async (entryId: string) => {
    setDeletingId(entryId);
    try {
      await onDeleteEntry(entryId);
    } finally {
      setDeletingId(null);
    }
  };

  const shiftActivePeriod = (direction: number) => {
    setCurrentDate((current) => shiftScopeDate(scope, current, direction));
  };

  return (
    <div className="w-full max-w-4xl rounded-[var(--radius-modal)] border p-4 sm:p-8 transition-all duration-500 hover:-translate-y-1 border-[var(--border-soft)] bg-[var(--surface-elevated)] shadow-[var(--shadow-modal)] backdrop-blur-[12px] dark:border-white/5 dark:bg-white/[0.03] dark:shadow-[0_32px_64px_rgba(0,0,0,0.3)] dark:backdrop-blur-[16px]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">Stats</p>
            <h2 className="mt-2 text-2xl font-black text-[var(--text-primary)]">{range.heading}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-[var(--border-soft)] bg-[var(--surface-muted)] p-1 dark:border-white/10 dark:bg-white/[0.04]">
              {([
                ["daily", "Daily"],
                ["weekly", "Weekly"],
                ["monthly", "Monthly"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
                    scope === value
                      ? "bg-white text-[var(--accent)] shadow-[0_10px_20px_rgba(111,87,246,0.12)] dark:bg-white/10 dark:text-white"
                      : "text-[var(--text-secondary)]"
                  }`}
                  onClick={() => setScope(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <button className="flex h-9 w-9 shrink-0 items-center justify-center transition hover:bg-white/10 ui-icon-button-light dark:rounded-full dark:bg-white/5 dark:text-white" onClick={() => shiftActivePeriod(-1)} type="button">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <label className="inline-flex h-9 items-center gap-1 px-2 text-sm font-semibold sm:px-3 ui-pill-button-light dark:rounded-full dark:bg-white/5 dark:text-white">
              <span className="hidden sm:inline">Calendar</span>
              <input className="w-32 rounded-md border px-2 py-1 text-xs sm:w-auto ui-input-light dark:border-white/15 dark:bg-white/10 dark:text-white" onChange={(event) => setCurrentDate(event.target.value)} type="date" value={currentDate} />
            </label>
            <button className="flex h-9 w-9 shrink-0 items-center justify-center transition hover:bg-white/10 ui-icon-button-light dark:rounded-full dark:bg-white/5 dark:text-white" onClick={() => shiftActivePeriod(1)} type="button">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        </div>

        <section className={`rounded-[calc(var(--radius-modal)-0.35rem)] border p-5 sm:p-6 shadow-[var(--shadow-card-hover)] ${heroStatus.toneClass}`}>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">{heroStatus.eyebrow}</p>
                <h3 className={`mt-2 text-2xl font-black sm:text-[2rem] ${heroStatus.accentClass}`}>{heroStatus.headline}</h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{range.label}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <MetricChip label="Total time" value={formatDuration(derived.totalSeconds)} />
                <MetricChip label="Top category" value={derived.topCategory ? derived.topCategory.category.title : "No data"} />
                <MetricChip label="Sessions" value={String(derived.scopedSessions.length)} />
                <MetricChip label="Best aligned" value={derived.bestAligned ? derived.bestAligned.category.title : "No goal data"} />
                <MetricChip label="Worst aligned" value={derived.worstAligned ? derived.worstAligned.category.title : "No goal data"} />
              </div>
            </div>

            <div className="rounded-[var(--radius-card)] border border-[var(--border-soft)] bg-[rgba(255,255,255,0.58)] p-4 dark:border-white/10 dark:bg-white/[0.04]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">Category alignment</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">Goal categories ranked from biggest mismatch to strongest alignment.</p>
                </div>
              </div>
              {derived.heroRows.length > 0 ? (
                <div className="space-y-4">
                  {derived.heroRows.map((row) => (
                    <GoalAlignmentRow key={row.category.id} row={row} />
                  ))}
                </div>
              ) : (
                <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--border-soft)] px-4 py-6 text-center text-sm text-[var(--text-secondary)] dark:border-white/10">
                  No category goals are set for this period yet.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[calc(var(--radius-modal)-0.4rem)] border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">Breakdown</p>
          <div className="mt-5 space-y-8">
            <StatSection entries={derived.typeEntries} emptyLabel="Start focusing to see type activity." title="Focus Types" totalSeconds={derived.totalSeconds} color="var(--accent)" />
            <div className="border-t border-[var(--border-soft)] pt-8 dark:border-white/10">
              <StatSection entries={derived.subtypeEntries} emptyLabel="Start focusing to see subtype activity." title="Subtype Breakdown" totalSeconds={derived.totalSeconds} color="var(--success)" />
            </div>
          </div>
        </section>

        <section className="rounded-[calc(var(--radius-modal)-0.4rem)] border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">Highlights</p>
              <h3 className="mt-2 text-xl font-black text-[var(--text-primary)]">Session Titles</h3>
            </div>
            <span className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-1 text-[13px] font-medium text-[var(--text-secondary)] dark:border-white/10 dark:bg-white/[0.05]">
              Top 3
            </span>
          </div>
          <div className="mt-6">
            <StatSection entries={derived.topTitleEntries} emptyLabel="No title data for this period." title="" totalSeconds={derived.totalSeconds} color="var(--warning)" hideTitle />
          </div>
        </section>

        <section className="rounded-[calc(var(--radius-modal)-0.4rem)] border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">Entries</p>
              <h3 className="mt-2 text-xl font-black text-[var(--text-primary)]">{formatEntriesHeading(scope, range)}</h3>
            </div>
            <button
              className="inline-flex items-center justify-center rounded-full border px-3 py-1 text-[13px] font-medium leading-none whitespace-nowrap border-[var(--border-soft)] bg-[var(--surface-muted)] text-[var(--text-secondary)] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/80"
              onClick={() => setShowAllEntries((current) => !current)}
              type="button"
            >
              {showAllEntries ? "Hide entries" : "View all entries"}
            </button>
          </div>

          {showAllEntries ? (
            <div className="mt-5 space-y-3">
              {derived.sessionsByDate.length === 0 ? (
                <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--border-soft)] px-4 py-6 text-center text-sm text-[var(--text-secondary)] dark:border-white/10">
                  No entries in this period.
                </p>
              ) : (
                derived.sessionsByDate.map((entry) => {
                  const category = entry.categoryId ? categories.find((item) => item.id === entry.categoryId) : null;
                  return (
                    <div key={entry.id} className="rounded-[var(--radius-card)] border px-4 py-3 border-[var(--border-soft)] bg-[var(--surface-elevated)] dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-bold text-[var(--text-primary)]">{entry.title} • {formatDuration(entry.durationSeconds)}</p>
                          <p className="mt-1 text-xs text-[var(--text-secondary)]">
                            {formatEntryDateLabel(entry.date, scope)}{entry.createdAt ? ` • Logged ${formatLoggedTime(entry.createdAt)}` : ""}
                            {category ? ` • ${category.title}` : " • One-off session"}
                          </p>
                          <p className="mt-1 text-xs text-[var(--text-secondary)]">
                            {[entry.focusType, entry.focusSubtype, entry.focusSubtype2].filter(Boolean).join(" / ")}
                            {entry.notes ? ` • ${entry.notes}` : ""}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            className="inline-flex items-center justify-center rounded-full border px-3 py-1 text-[13px] font-medium leading-none whitespace-nowrap border-[var(--border-soft)] bg-[var(--surface-muted)] text-[var(--text-secondary)] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/80"
                            onClick={() => openEdit(entry)}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="inline-flex items-center justify-center rounded-full border px-3 py-1 text-[13px] font-medium leading-none whitespace-nowrap border-[#ffd5df] bg-[#fff3f6] text-[#d64f78] dark:border-[#4d2230] dark:bg-[#301520] dark:text-[#ff9fbc]"
                            disabled={deletingId === entry.id}
                            onClick={() => void deleteEntry(entry.id)}
                            type="button"
                          >
                            {deletingId === entry.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : null}
        </section>
      </div>

      {editingEntry ? (
        <ModalShell className="max-h-[82vh] w-full max-w-2xl overflow-y-auto rounded-[var(--radius-modal)] border p-6 shadow-[var(--shadow-modal)] border-[var(--border-soft)] bg-[var(--surface-elevated)] dark:border-white/10 dark:bg-[#171329]">
          <h4 className="text-xl font-black text-[var(--text-primary)]">Edit Focus Entry</h4>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Update duration, date, and labels for this individual entry.</p>
          <p className="mt-2 text-sm font-semibold text-[var(--accent)]">Time logged: {formatLoggedTime(editingEntry.createdAt)}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-semibold">Saved Category</span>
              <select className="h-10 w-full px-3 ui-input-light" value={entryCategoryId} onChange={(event) => handleCategoryChange(event.target.value)}>
                <option value="__none__">No saved category</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.title}</option>)}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-semibold">Title</span>
              <input className="h-10 w-full px-3 ui-input-light" list="history-focus-titles" type="text" value={entryTitle} onChange={(event) => setEntryTitle(event.target.value)} />
              <datalist id="history-focus-titles">{labelOptions.titles.map((option) => <option key={option} value={option} />)}</datalist>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Date</span>
              <input className="h-10 w-full px-3 ui-input-light" type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Hours</span>
              <input className="h-10 w-full px-3 ui-input-light" min={0} type="number" value={entryHours} onChange={(event) => setEntryHours(event.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Minutes</span>
              <input className="h-10 w-full px-3 ui-input-light" max={59} min={0} type="number" value={entryMinutes} onChange={(event) => setEntryMinutes(event.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Type</span>
              <input className="h-10 w-full px-3 ui-input-light" list="history-focus-types" type="text" value={entryType} onChange={(event) => setEntryType(event.target.value as FocusType)} />
              <datalist id="history-focus-types">{labelOptions.types.map((option) => <option key={option} value={option} />)}</datalist>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Subtype</span>
              <input className="h-10 w-full px-3 ui-input-light" list="history-primary-subtypes" type="text" value={entryPrimarySubtype} onChange={(event) => setEntryPrimarySubtype(event.target.value as FocusSubtype)} />
              <datalist id="history-primary-subtypes">{labelOptions.primarySubtypes.map((option) => <option key={option} value={option} />)}</datalist>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Subtype 2</span>
              <input className="h-10 w-full px-3 ui-input-light" list="history-secondary-subtypes" placeholder="Optional" type="text" value={entrySecondarySubtype} onChange={(event) => setEntrySecondarySubtype(event.target.value)} />
              <datalist id="history-secondary-subtypes">{labelOptions.secondarySubtypes.map((option) => <option key={option} value={option} />)}</datalist>
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-semibold">Notes</span>
              <textarea className="min-h-20 w-full px-3 py-2 ui-input-light" value={entryNotes} onChange={(event) => setEntryNotes(event.target.value)} />
            </label>
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <button className="px-4 py-2 text-sm font-semibold ui-pill-button-light dark:rounded-full dark:bg-white/10 dark:text-white" onClick={() => setEditingId(null)} type="button">Cancel</button>
            <button className="px-4 py-2 text-sm font-bold ui-pill-button-strong-light dark:rounded-full dark:bg-[#cabfff] dark:text-[#1a1431]" disabled={savingEntry} onClick={() => void saveEdit()} type="button">{savingEntry ? "Saving..." : "Save Entry"}</button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-[var(--border-soft)] bg-[rgba(255,255,255,0.7)] px-3 py-2 text-left dark:border-white/10 dark:bg-white/[0.05]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-[13px] font-medium text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function GoalAlignmentRow({ row }: { row: GoalRow }) {
  const scaleMax = Math.max(row.actualSeconds, row.goalSeconds, 60);
  const actualPercent = (row.actualSeconds / scaleMax) * 100;
  const goalPercent = (row.goalSeconds / scaleMax) * 100;

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border-soft)] bg-[var(--surface)] p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-black text-[var(--text-primary)]">{row.category.title}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {[row.category.focusType, row.category.focusSubtype, row.category.focusSubtype2].filter(Boolean).join(" / ")}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Actual / Goal</p>
          <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{formatGoalPair(row.actualSeconds, row.goalSeconds)}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
            <span>Actual</span>
            <span>{formatDuration(row.actualSeconds)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[var(--accent-soft)]">
            <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-700" style={{ width: `${Math.min(100, actualPercent)}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
            <span>Goal</span>
            <span>{formatDuration(row.goalSeconds)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[var(--accent-soft)]">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, goalPercent)}%`, backgroundColor: row.category.color }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatSection({
  color,
  emptyLabel,
  entries,
  hideTitle = false,
  title,
  totalSeconds,
}: {
  color: string;
  emptyLabel: string;
  entries: StatEntry[];
  hideTitle?: boolean;
  title: string;
  totalSeconds: number;
}) {
  return (
    <div className="space-y-6">
      {hideTitle ? null : (
        <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-muted)]">{title}</h3>
      )}
      <div className="space-y-5">
        {entries.map(({ label, seconds }) => (
          <div key={label}>
            <div className="mb-2 flex items-center justify-between text-sm font-bold">
              <span className="text-[var(--text-primary)]">{label}</span>
              <span className="text-[var(--accent)]">{formatDuration(seconds)}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--accent-soft)]">
              <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${totalSeconds > 0 ? (seconds / totalSeconds) * 100 : 0}%`, backgroundColor: color }} />
            </div>
          </div>
        ))}
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm italic opacity-30">{emptyLabel}</p>
        ) : null}
      </div>
    </div>
  );
}

function formatEntryDateLabel(date: string, scope: TimeScope) {
  if (scope === "daily") {
    return date;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function formatLoggedTime(value?: string) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
