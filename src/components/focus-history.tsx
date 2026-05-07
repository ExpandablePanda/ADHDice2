import React, { useState } from "react";
import { type FocusCategory, type HistoricalFocusSession, type FocusType, type FocusSubtype, type FocusLabelOptions } from "@/lib/types";
import { formatDuration, formatLocalDate } from "@/lib/utils";
import { ModalShell } from "./modal-shell";

function todayLocalISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  const [currentDate, setCurrentDate] = useState(todayLocalISO());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingEntry, setSavingEntry] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sessionsToday = history.filter((s) => s.date === currentDate);
  const sessionsByDate = [...sessionsToday].sort((a, b) => b.id.localeCompare(a.id));
  const totalSeconds = sessionsToday.reduce((acc, s) => acc + s.durationSeconds, 0);

  const typeStats = sessionsToday.reduce((acc, s) => {
    acc[s.focusType] = (acc[s.focusType] || 0) + s.durationSeconds;
    return acc;
  }, {} as Record<FocusType, number>);

  const subtypeStats = sessionsToday.reduce((acc, s) => {
    if (s.focusSubtype) {
      acc[s.focusSubtype] = (acc[s.focusSubtype] || 0) + s.durationSeconds;
    }
    return acc;
  }, {} as Record<FocusSubtype, number>);

  const titleStats = sessionsToday.reduce((acc, s) => {
    acc[s.title] = (acc[s.title] || 0) + s.durationSeconds;
    return acc;
  }, {} as Record<string, number>);

  const shiftDate = (days: number) => {
    const d = new Date(`${currentDate}T00:00:00`);
    d.setDate(d.getDate() + days);
    setCurrentDate(formatLocalDate(d));
  };

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

  const percent = (seconds: number) => {
    if (totalSeconds <= 0) return 0;
    return (seconds / totalSeconds) * 100;
  };

  return (
    <div className="w-full max-w-4xl rounded-[var(--radius-modal)] border p-4 sm:p-10 transition-all duration-500 hover:-translate-y-1 border-[var(--border-soft)] bg-[var(--surface-elevated)] shadow-[var(--shadow-modal)] backdrop-blur-[12px] dark:border-white/5 dark:bg-white/[0.03] dark:shadow-[0_32px_64px_rgba(0,0,0,0.3)] dark:backdrop-blur-[16px]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-black text-[var(--text-primary)]">Daily History</h2>
        <div className="flex items-center gap-2">
          <button className="flex h-9 w-9 shrink-0 items-center justify-center transition hover:bg-white/10 ui-icon-button-light dark:rounded-full dark:bg-white/5 dark:text-white" onClick={() => shiftDate(-1)} type="button">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <label className="inline-flex h-9 items-center gap-1 px-2 text-sm font-semibold sm:px-3 ui-pill-button-light dark:rounded-full dark:bg-white/5 dark:text-white">
            <span className="hidden sm:inline">Calendar</span>
            <input className="w-32 rounded-md border px-2 py-1 text-xs sm:w-auto ui-input-light dark:border-white/15 dark:bg-white/10 dark:text-white" onChange={(event) => setCurrentDate(event.target.value)} type="date" value={currentDate} />
          </label>
          <button className="flex h-9 w-9 shrink-0 items-center justify-center transition hover:bg-white/10 ui-icon-button-light dark:rounded-full dark:bg-white/5 dark:text-white" onClick={() => shiftDate(1)} type="button">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>

      <div className="mt-10 grid gap-12 md:grid-cols-2">
        <StatSection title="Focus Types" stats={typeStats} percent={percent} color="var(--accent)" />
        <StatSection title="Subtype Breakdown" stats={subtypeStats} percent={percent} color="var(--success)" emptyLabel="Start focusing to see breakdown." />
      </div>

      <div className="mt-10">
        <StatSection title="Session Titles" stats={titleStats} percent={percent} color="var(--warning)" emptyLabel="No title data for this day." />
      </div>

      <div className="mt-12 flex justify-center border-t pt-8">
        <p className="text-lg font-black text-[var(--text-primary)]">Total Focus: <span className="text-[var(--accent)]">{formatDuration(totalSeconds)}</span></p>
      </div>

      <div className="mt-10 border-t pt-8">
        <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-muted)]">All Entries For {currentDate}</h3>
        <div className="mt-5 space-y-3">
          {sessionsByDate.length === 0 ? (
            <p className="py-6 text-center text-sm italic opacity-40">No entries on this date.</p>
          ) : (
            sessionsByDate.map((entry) => {
              const category = entry.categoryId ? categories.find((item) => item.id === entry.categoryId) : null;
              return (
                <div key={entry.id} className="rounded-[var(--radius-card)] border px-4 py-3 border-[var(--border-soft)] bg-[var(--surface-elevated)] dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-[var(--text-primary)]">{entry.title} • {formatDuration(entry.durationSeconds)}</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">Logged {formatLoggedTime(entry.createdAt)}{category ? ` • ${category.title}` : " • One-off session"}</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {[entry.focusType, entry.focusSubtype, entry.focusSubtype2].filter(Boolean).join(" / ")}
                        {entry.notes ? ` • ${entry.notes}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="px-3 py-1 text-xs font-bold ui-pill-button-light dark:rounded-full dark:bg-white/10 dark:text-[#cabfff]"
                        onClick={() => openEdit(entry)}
                        type="button"
                      >
                        Edit
                      </button>
                      <button className="px-3 py-1 text-xs font-bold ui-pill-button-danger-light dark:rounded-full dark:bg-[#431c2a] dark:text-[#ff9fbc]" disabled={deletingId === entry.id} onClick={() => void deleteEntry(entry.id)} type="button">
                        {deletingId === entry.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {editingEntry ? (
          <ModalShell className="w-full max-w-2xl max-h-[82vh] overflow-y-auto rounded-[var(--radius-modal)] border p-6 shadow-[var(--shadow-modal)] border-[var(--border-soft)] bg-[var(--surface-elevated)] dark:border-white/10 dark:bg-[#171329]">
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

function StatSection({
  color,
  emptyLabel = "No activity logged for this day.",
  percent,
  stats,
  title,
}: {
  color: string;
  emptyLabel?: string;
  percent: (seconds: number) => number;
  stats: Record<string, number>;
  title: string;
}) {
  return (
    <div className="space-y-6">
      <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-muted)]">{title}</h3>
      <div className="space-y-5">
        {Object.entries(stats).map(([label, seconds]) => (
          <div key={label} className="group">
            <div className="mb-2 flex items-center justify-between text-sm font-bold">
              <span className="text-[var(--text-primary)]">{label}</span>
              <span className="text-[var(--accent)]">{formatDuration(seconds)}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--accent-soft)]">
              <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${percent(seconds)}%`, backgroundColor: color }} />
            </div>
          </div>
        ))}
        {Object.keys(stats).length === 0 ? (
          <p className="py-8 text-center text-sm italic opacity-30">{emptyLabel}</p>
        ) : null}
      </div>
    </div>
  );
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
