"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Compass, Footprints, Pencil, Plus, Save, X } from "lucide-react";
import { ModalShell } from "@/components/modal-shell";
import { AdhdCard, AdhdChip, AdhdDropdownSelect, AdhdIconButton, AdhdPanel } from "@/components/ui-system";
import { TagsQuickPanel } from "./tasks-list-adapter";
import type { Pursuit, PursuitActivity, PursuitStatus, PursuitUpdate, Task } from "@/lib/database.types";
import {
  canSetPursuitParent,
  buildPursuitDescendantRows,
  formatPursuitAttentionReason,
  formatPursuitLastCompletion,
  formatPursuitTargetDate,
  formatPursuitTargetLabel,
  formatPursuitRevisitCadence,
  derivePursuitNextTargetLogicalDay,
  getMostRecentPursuitActivity,
  getPursuitLogicalDay,
  getPursuitDepth,
  sortPursuitsByAttention,
  sortPursuitsForManagement,
  type PursuitAttention,
  type PursuitCompletionSummary,
} from "@/lib/pursuit-domain";
import type { PursuitCreateInput } from "@/hooks/usePursuits";
import { PursuitCompletionControl, PursuitCompletionNotePanel } from "./pursuit-workspace-row";

export type PursuitsWorkspaceProps = {
  activities: PursuitActivity[];
  attentionMap: ReadonlyMap<string, PursuitAttention>;
  dayStartTime: string;
  allTagOptions: string[];
  completionSummaryByPursuitId?: ReadonlyMap<string, PursuitCompletionSummary>;
  error: string | null;
  isLoading: boolean;
  onCreate: (input: PursuitCreateInput) => Promise<Pursuit | null>;
  onMarkCompletedOnLogicalDay: (pursuitId: string, logicalDay: string, notes?: string) => Promise<PursuitActivity | null>;
  onMarkDoneToday: (pursuitId: string, notes?: string) => Promise<PursuitActivity | null>;
  onRefresh: () => Promise<boolean>;
  onRemoveCompletionOnLogicalDay: (pursuitId: string, logicalDay: string) => Promise<boolean>;
  onUpdate: (pursuitId: string, input: PursuitUpdate) => Promise<Pursuit | null>;
  pursuits: Pursuit[];
  taskOptions: Array<Pick<Task, "id" | "title">>;
  todayKey: string;
  timezone: string;
};

const SECONDARY_BUTTON_CLASS = "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-full border border-[#e5def4] bg-white px-3 py-1.5 text-xs font-semibold text-[#6e6686] transition hover:border-[#cfc2fb] hover:text-[#6f57f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9a8ff] disabled:cursor-not-allowed disabled:opacity-55 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70 dark:hover:border-white/20 dark:hover:text-white";
const PRIMARY_BUTTON_CLASS = "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-full border border-[#6f57f6] bg-[#6f57f6] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#5f45f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9a8ff] disabled:cursor-not-allowed disabled:opacity-55";
const INPUT_CLASS = "mt-1 w-full rounded-[0.9rem] border border-[#e6e0f4] bg-white px-3 py-2 text-sm text-[#4e4865] outline-none transition focus:border-[#b9a8ff] focus:ring-2 focus:ring-[#d9d0ff]/45 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/80";
const EMPTY_SUMMARY: PursuitCompletionSummary = {
  bestStreak: 0,
  completedToday: false,
  completedLogicalDays: [],
  currentStreak: 0,
  daysSinceCompletion: null,
  lastCompletedLogicalDay: null,
  totalCompletedDays: 0,
};

function formatStatusLabel(status: PursuitStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getStatusTone(status: PursuitStatus) {
  if (status === "active") return "progress" as const;
  if (status === "paused") return "notDue" as const;
  return "archived" as const;
}

function summaryLines(summary: PursuitCompletionSummary) {
  return `${formatPursuitLastCompletion(summary)} · ${summary.currentStreak} day streak · ${summary.totalCompletedDays} total days`;
}

function shiftMonthKey(monthKey: string, amount: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getMonthDays(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: firstDay.getUTCDay() + dayCount }, (_, index) => {
    if (index < firstDay.getUTCDay()) return null;
    const day = index - firstDay.getUTCDay() + 1;
    return `${monthKey}-${String(day).padStart(2, "0")}`;
  });
}

function formatLogicalDay(logicalDay: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: timezone }).format(new Date(`${logicalDay}T12:00:00Z`));
}

function formatMonthLabel(monthKey: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: timezone }).format(new Date(`${monthKey}-01T12:00:00Z`));
}

export function PursuitsWorkspace({
  activities,
  attentionMap,
  allTagOptions,
  dayStartTime,
  error,
  isLoading,
  onCreate,
  onMarkCompletedOnLogicalDay,
  onMarkDoneToday,
  onRefresh,
  onRemoveCompletionOnLogicalDay,
  onUpdate,
  pursuits,
  taskOptions,
  todayKey,
  timezone,
}: PursuitsWorkspaceProps) {
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [showAllAttention, setShowAllAttention] = useState(false);
  const [editingPursuitId, setEditingPursuitId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const attentionRows = useMemo(() => sortPursuitsByAttention(Array.from(attentionMap.values())), [attentionMap]);
  const visibleAttentionRows = showAllAttention ? attentionRows : attentionRows.slice(0, 3);
  const managementRows = useMemo(() => sortPursuitsForManagement(pursuits), [pursuits]);
  const pursuitsById = useMemo(() => new Map(pursuits.map((pursuit) => [pursuit.id, pursuit])), [pursuits]);
  const completionSummaryByPursuitId = useMemo(
    () => new Map(Array.from(attentionMap.entries()).map(([id, row]) => [id, row.completionSummary])),
    [attentionMap],
  );
  const editingPursuit = editingPursuitId ? pursuitsById.get(editingPursuitId) ?? null : null;
  return (
    <AdhdPanel className="min-w-0" title="Pursuits" subtitle="Ongoing interests and skills, with completion-based revisit targets.">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <AdhdChip count={pursuits.length} tone="purple">Tracked</AdhdChip>
          {attentionRows.length > 0 ? <AdhdChip count={attentionRows.length} tone="missed">Needs attention</AdhdChip> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={SECONDARY_BUTTON_CLASS} onClick={() => setIsManagerOpen((current) => !current)} type="button">{isManagerOpen ? "Hide manager" : "Manage pursuits"}</button>
          <button className={PRIMARY_BUTTON_CLASS} onClick={() => setIsCreating(true)} type="button"><Plus className="h-3.5 w-3.5" />New Pursuit</button>
        </div>
      </div>

      {error ? <div className="mt-3 rounded-[0.95rem] border border-[#f1d7de] bg-[#fff5f7] px-3 py-2 text-xs leading-5 text-[#a24e67] dark:border-[#5b2e3b] dark:bg-[#32161d] dark:text-[#ffb5c3]">{error}</div> : null}
      {isLoading && pursuits.length === 0 ? (
        <p className="mt-4 text-sm text-[#817993] dark:text-white/55">Loading Pursuits...</p>
      ) : attentionRows.length === 0 ? (
        <div className="mt-4 rounded-[1rem] border border-dashed border-[#ded6f3] bg-[#fbfaff] px-4 py-4 text-sm text-[#766f8d] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/58">No active Pursuits need attention right now. Create one or set a revisit target to make it part of this workspace.</div>
      ) : (
        <div className="mt-4 grid gap-2">
          {visibleAttentionRows.map((row) => <PursuitAttentionRow key={row.pursuit.id} onEdit={() => setEditingPursuitId(row.pursuit.id)} onMarkDoneToday={onMarkDoneToday} onRemoveCompletionOnLogicalDay={onRemoveCompletionOnLogicalDay} row={row} timezone={timezone} todayKey={todayKey} />)}
          {attentionRows.length > 3 ? <button className="justify-self-start px-1 text-xs font-semibold text-[#6f57f6] hover:underline dark:text-[#c9bbff]" onClick={() => setShowAllAttention((current) => !current)} type="button">{showAllAttention ? "Show top 3" : `Show ${attentionRows.length - 3} more`}</button> : null}
        </div>
      )}

      {isManagerOpen ? (
        <div className="mt-5 border-t border-[#eee9f8] pt-4 dark:border-white/10">
          <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-[#655d7d] dark:text-white/72">All Pursuits</p><button className={SECONDARY_BUTTON_CLASS} onClick={() => { void onRefresh(); }} type="button">Refresh</button></div>
          {managementRows.length === 0 ? <p className="mt-3 text-sm text-[#817993] dark:text-white/55">No Pursuits yet.</p> : (
            <div className="mt-3 grid gap-2">
              {managementRows.map((pursuit) => {
                const row = attentionMap.get(pursuit.id);
                const depth = getPursuitDepth(pursuit, pursuitsById);
                return (
                  <AdhdCard className="!rounded-[1rem] !p-3" key={pursuit.id}>
                    <div className="flex min-w-0 items-start justify-between gap-3" style={{ paddingLeft: `${Math.min(depth, 4) * 14}px` }}>
                      <div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-2"><button className="truncate text-left text-sm font-medium text-[#4b455f] transition hover:text-[#6f57f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9a8ff] dark:text-white/82 dark:hover:text-[#cabfff]" onClick={() => setEditingPursuitId(pursuit.id)} type="button">{pursuit.title}</button><AdhdChip tone={getStatusTone(pursuit.status)}>{formatStatusLabel(pursuit.status)}</AdhdChip></div><p className="mt-1 text-xs text-[#827a97] dark:text-white/52">{summaryLines(row?.completionSummary ?? EMPTY_SUMMARY)} · {formatPursuitTargetLabel(row?.nextTargetLogicalDay, row?.todayKey, timezone)}</p></div>
                      <div className="flex shrink-0 items-center gap-1"><PursuitCompletionControl attention={row} onMarkDoneToday={onMarkDoneToday} onRemoveCompletionOnLogicalDay={onRemoveCompletionOnLogicalDay} pursuit={pursuit} todayKey={todayKey} /><AdhdIconButton aria-label={`Edit ${pursuit.title}`} onClick={() => setEditingPursuitId(pursuit.id)} size="sm" variant="rowToolbar"><Pencil /></AdhdIconButton></div>
                    </div>
                  </AdhdCard>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {isCreating ? <PursuitEditorModal activities={activities} allTagOptions={allTagOptions} completionSummaryByPursuitId={completionSummaryByPursuitId} completionSummary={EMPTY_SUMMARY} dayStartTime={dayStartTime} initialParentTaskId={null} onClose={() => setIsCreating(false)} onCreate={onCreate} onMarkCompletedOnLogicalDay={onMarkCompletedOnLogicalDay} onMarkDoneToday={onMarkDoneToday} onRemoveCompletionOnLogicalDay={onRemoveCompletionOnLogicalDay} onUpdate={onUpdate} pursuits={pursuits} taskOptions={taskOptions} todayKey={todayKey} timezone={timezone} /> : null}
      {editingPursuit ? <PursuitEditorModal activities={activities} allTagOptions={allTagOptions} completionSummaryByPursuitId={completionSummaryByPursuitId} completionSummary={attentionMap.get(editingPursuit.id)?.completionSummary ?? EMPTY_SUMMARY} dayStartTime={dayStartTime} onClose={() => setEditingPursuitId(null)} onCreate={onCreate} onMarkCompletedOnLogicalDay={onMarkCompletedOnLogicalDay} onMarkDoneToday={onMarkDoneToday} onOpenPursuit={(pursuitId) => setEditingPursuitId(pursuitId)} onRemoveCompletionOnLogicalDay={onRemoveCompletionOnLogicalDay} onUpdate={onUpdate} pursuit={editingPursuit} pursuits={pursuits} taskOptions={taskOptions} todayKey={todayKey} timezone={timezone} /> : null}
    </AdhdPanel>
  );
}

function PursuitAttentionRow({ onEdit, onMarkDoneToday, onRemoveCompletionOnLogicalDay, row, timezone, todayKey }: { onEdit: () => void; onMarkDoneToday: (pursuitId: string, notes?: string) => Promise<PursuitActivity | null>; onRemoveCompletionOnLogicalDay: (pursuitId: string, logicalDay: string) => Promise<boolean>; row: PursuitAttention; timezone: string; todayKey: string }) {
  return (
    <AdhdCard className="!rounded-[1rem] !p-3" highlighted>
      <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><div className="flex min-w-0 items-center gap-1.5"><button className="truncate text-left text-sm font-medium text-[#433d56] transition hover:text-[#6f57f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9a8ff] dark:text-white/86 dark:hover:text-[#cabfff]" onClick={onEdit} type="button">{row.pursuit.title}</button></div><p className="mt-1 text-xs font-medium text-[#765eea] dark:text-[#c9bbff]">{formatPursuitAttentionReason(row, timezone)}</p><p className="mt-1 text-xs text-[#827a97] dark:text-white/52">{summaryLines(row.completionSummary)} · {formatPursuitTargetLabel(row.nextTargetLogicalDay, row.todayKey, timezone)}</p></div><div className="flex shrink-0 items-center gap-1"><PursuitCompletionControl attention={row} onMarkDoneToday={onMarkDoneToday} onRemoveCompletionOnLogicalDay={onRemoveCompletionOnLogicalDay} pursuit={row.pursuit} todayKey={todayKey} /><AdhdIconButton aria-label={`Edit ${row.pursuit.title}`} onClick={onEdit} size="sm" variant="rowToolbar"><Pencil /></AdhdIconButton></div></div>
    </AdhdCard>
  );
}

export function PursuitEditorModal({
  activities = [],
  allTagOptions,
  completionSummaryByPursuitId,
  completionSummary = EMPTY_SUMMARY,
  dayStartTime,
  initialParentPursuitId = null,
  initialParentTaskId = null,
  initialSection = "overview",
  onClose,
  onCreate,
  onMarkCompletedOnLogicalDay,
  onMarkDoneToday,
  onOpenPursuit,
  onRemoveCompletionOnLogicalDay,
  onUpdate,
  pursuit = null,
  pursuits,
  taskOptions,
  todayKey,
  timezone,
}: {
  activities?: PursuitActivity[];
  allTagOptions: string[];
  completionSummaryByPursuitId?: ReadonlyMap<string, PursuitCompletionSummary>;
  completionSummary?: PursuitCompletionSummary;
  dayStartTime: string;
  initialParentPursuitId?: string | null;
  initialParentTaskId?: string | null;
  initialSection?: "overview" | "calendar";
  onClose: () => void;
  onCreate: (input: PursuitCreateInput) => Promise<Pursuit | null>;
  onMarkCompletedOnLogicalDay: (pursuitId: string, logicalDay: string, notes?: string) => Promise<PursuitActivity | null>;
  onMarkDoneToday: (pursuitId: string, notes?: string) => Promise<PursuitActivity | null>;
  onOpenPursuit?: (pursuitId: string) => void;
  onRemoveCompletionOnLogicalDay: (pursuitId: string, logicalDay: string) => Promise<boolean>;
  onUpdate: (pursuitId: string, input: PursuitUpdate) => Promise<Pursuit | null>;
  pursuit?: Pursuit | null;
  pursuits: Pursuit[];
  taskOptions: Array<Pick<Task, "id" | "title">>;
  todayKey: string;
  timezone: string;
}) {
  const [title, setTitle] = useState(pursuit?.title ?? "");
  const [notes, setNotes] = useState(pursuit?.notes ?? "");
  const [tags, setTags] = useState<string[]>(pursuit?.tags ?? []);
  const [parentPursuitId, setParentPursuitId] = useState(pursuit?.parent_pursuit_id ?? initialParentPursuitId ?? "");
  const [parentTaskId, setParentTaskId] = useState(pursuit?.parent_task_id ?? initialParentTaskId ?? "");
  const [parentKind, setParentKind] = useState<"none" | "pursuit" | "task">(initialParentPursuitId || pursuit?.parent_pursuit_id ? "pursuit" : initialParentTaskId || pursuit?.parent_task_id ? "task" : "none");
  const [status, setStatus] = useState<PursuitStatus>(pursuit?.status ?? "active");
  const [revisitInterval, setRevisitInterval] = useState(pursuit?.revisit_interval_days?.toString() ?? "");
  const [isPending, setIsPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"overview" | "calendar">(initialSection);
  const [calendarMonth, setCalendarMonth] = useState(todayKey.slice(0, 7));
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(todayKey);
  const [selectedDayNote, setSelectedDayNote] = useState(() => getMostRecentPursuitActivity(
    activities.filter((activity) => activity.pursuit_id === pursuit?.id && getPursuitLogicalDay(activity.occurred_at, { dayStartTime, timezone }) === todayKey),
  )?.notes ?? "");
  const [childEditorParentId, setChildEditorParentId] = useState<string | null>(null);
  const [nestedPursuitId, setNestedPursuitId] = useState<string | null>(null);
  const [isTagsPanelOpen, setIsTagsPanelOpen] = useState(false);
  const [isCompletionNoteOpen, setIsCompletionNoteOpen] = useState(false);
  const [completionNote, setCompletionNote] = useState("");
  const pursuitsById = useMemo(() => new Map(pursuits.map((entry) => [entry.id, entry])), [pursuits]);
  const parentOptions = pursuits.filter((candidate) => candidate.id !== pursuit?.id && canSetPursuitParent(pursuits, pursuit?.id ?? "", candidate.id));
  const childRows = useMemo(() => pursuit ? buildPursuitDescendantRows(pursuits, pursuit.id) : [], [pursuit, pursuits]);
  const childPursuits = childRows.map(({ pursuit: child }) => child);
  const completedDaySet = useMemo(() => new Set(completionSummary.completedLogicalDays), [completionSummary.completedLogicalDays]);
  const monthDays = useMemo(() => getMonthDays(calendarMonth), [calendarMonth]);
  const nextTargetLogicalDay = pursuit
    ? derivePursuitNextTargetLogicalDay(pursuit, completionSummary, { dayStartTime, timezone })
    : null;
  const selectedDayIsFuture = selectedCalendarDay > todayKey;
  const selectedDayCompleted = completedDaySet.has(selectedCalendarDay);
  const pursuitActivities = useMemo(
    () => activities.filter((activity) => activity.pursuit_id === pursuit?.id),
    [activities, pursuit?.id],
  );
  const handleSelectCalendarDay = (day: string | null) => {
    if (!day) return;
    setSelectedCalendarDay(day);
    setSelectedDayNote(getMostRecentPursuitActivity(
      pursuitActivities.filter((activity) => getPursuitLogicalDay(activity.occurred_at, { dayStartTime, timezone }) === day),
    )?.notes ?? "");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { setFormError("Add a title before saving."); return; }
    const parsedInterval = revisitInterval.trim() ? Number.parseInt(revisitInterval, 10) : null;
    if (parsedInterval !== null && (!Number.isInteger(parsedInterval) || parsedInterval <= 0)) { setFormError("Revisit interval must be a positive whole number of days."); return; }
    if (parentKind === "pursuit" && parentPursuitId && !canSetPursuitParent(pursuits, pursuit?.id ?? "", parentPursuitId)) { setFormError("That parent would create a cycle."); return; }
    setIsPending(true);
    setFormError(null);
    const input = {
      notes: notes.trim() || null,
      parent_pursuit_id: parentKind === "pursuit" ? parentPursuitId || null : null,
      parent_task_id: parentKind === "task" ? parentTaskId || null : null,
      revisit_interval_days: parsedInterval,
      tags,
      title: trimmedTitle,
    } satisfies PursuitCreateInput;
    const result = pursuit ? await onUpdate(pursuit.id, { ...input, status }) : await onCreate(input);
    setIsPending(false);
    if (result) onClose();
  };

  const markSelectedDay = async () => {
    if (!pursuit || selectedDayIsFuture) return;
    setIsPending(true);
    if (selectedDayCompleted) {
      await onRemoveCompletionOnLogicalDay(pursuit.id, selectedCalendarDay);
      setSelectedDayNote("");
    } else {
      await onMarkCompletedOnLogicalDay(pursuit.id, selectedCalendarDay, selectedDayNote);
    }
    setIsPending(false);
  };

  const saveSelectedDayNote = async () => {
    if (!pursuit || !selectedDayCompleted || selectedDayIsFuture) return;
    setIsPending(true);
    await onMarkCompletedOnLogicalDay(pursuit.id, selectedCalendarDay, selectedDayNote);
    setIsPending(false);
  };

  return (
    <ModalShell className="adhdice-scrollbar flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden rounded-none border border-[#ece8f8] bg-white p-4 shadow-[0_30px_80px_rgba(81,61,168,0.18)] sm:h-auto sm:max-h-[calc(100vh-2rem)] sm:rounded-[2.4rem] sm:p-6 dark:border-white/10 dark:bg-[#171328]" label={pursuit ? `Edit Pursuit ${pursuit.title}` : "New Pursuit"} onClose={isPending ? undefined : onClose}>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[#eee9f8] pb-4 dark:border-white/10"><div className="flex min-w-0 items-start gap-3"><div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.9rem] bg-[#f0ebff] text-[#6f57f6] dark:bg-[#2b214c] dark:text-[#cabfff]"><Compass className="h-5 w-5" /></div><div className="min-w-0"><p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#9b92be] dark:text-white/35">Pursuit</p><input aria-label="Pursuit title" className="mt-1 w-full min-w-0 border-0 bg-transparent p-0 text-xl font-semibold text-[#403a54] outline-none placeholder:text-[#b5aec8] focus:ring-0 dark:text-white/88" onChange={(event) => setTitle(event.target.value)} placeholder="Name this Pursuit" value={title} /></div></div><div className="flex shrink-0 items-center gap-1"><AdhdChip tone={getStatusTone(status)}>{formatStatusLabel(status)}</AdhdChip><AdhdIconButton aria-label="Calendar" onClick={() => setActiveSection("calendar")} size="sm" title="Calendar" variant="rowToolbar"><CalendarDays /></AdhdIconButton><AdhdIconButton aria-label="Close" disabled={isPending} onClick={onClose} size="sm" title="Close" variant="rowToolbar"><X /></AdhdIconButton></div></header>

        <div className="adhdice-scrollbar min-h-0 flex-1 overflow-y-auto py-4">
          {activeSection === "overview" ? (
            <div className="grid gap-3 [&>div]:space-y-3 [&>div>section]:!rounded-[1rem] [&>div>section]:!p-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.8fr)]">
              <div className="space-y-4"><section className="rounded-[1.35rem] border border-[#ede7f7] bg-[#fbfaff] p-4 dark:border-white/10 dark:bg-white/[0.04]"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#9b92be] dark:text-white/35">Consistency</p><p className="mt-1 text-sm text-[#827a97] dark:text-white/52">{summaryLines(completionSummary)}</p></div>{pursuit ? <><button className={PRIMARY_BUTTON_CLASS} disabled={status !== "active" || isPending} onClick={() => { if (completionSummary.completedToday) { void onRemoveCompletionOnLogicalDay(pursuit.id, todayKey); } else { setIsCompletionNoteOpen((current) => !current); } }} type="button"><CheckCircle2 className="h-3.5 w-3.5" />{completionSummary.completedToday ? "Clear Done Today" : "Mark Done Today"}</button>{isCompletionNoteOpen && !completionSummary.completedToday ? <PursuitCompletionNotePanel ariaLabel={"Complete " + pursuit.title} className="mt-3 max-w-md" notes={completionNote} onChangeNotes={setCompletionNote} onClose={() => setIsCompletionNoteOpen(false)} onConfirm={async () => { setIsPending(true); try { await onMarkDoneToday(pursuit.id, completionNote); setCompletionNote(""); setIsCompletionNoteOpen(false); } finally { setIsPending(false); } }} pending={isPending} /> : null}</> : null}</div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><SummaryStat label="Last done" value={formatPursuitLastCompletion(completionSummary).replace("Last done ", "")} /><SummaryStat label="Days since" value={completionSummary.daysSinceCompletion === null ? "—" : String(completionSummary.daysSinceCompletion)} /><SummaryStat label="Current streak" value={`${completionSummary.currentStreak} days`} /><SummaryStat label="Best / total" value={`${completionSummary.bestStreak} / ${completionSummary.totalCompletedDays}`} /></div></section><section className="rounded-[1.35rem] border border-[#ede7f7] bg-white p-4 dark:border-white/[0.02]"><div className="flex items-center justify-between gap-3"><p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#9b92be] dark:text-white/35">Notes</p></div><textarea className={`${INPUT_CLASS} min-h-28 resize-y`} onChange={(event) => setNotes(event.target.value)} placeholder="Add notes" value={notes} /></section><section className="rounded-[1.35rem] border border-[#ede7f7] bg-white p-4 dark:border-white/[0.02]"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#9b92be] dark:text-white/35">Tags</p><p className="mt-1 text-xs text-[#827a97] dark:text-white/52">Pursuit-native tags for filtering and context.</p></div><button className={SECONDARY_BUTTON_CLASS} onClick={() => setIsTagsPanelOpen((current) => !current)} type="button">{isTagsPanelOpen ? "Done" : "Edit tags"}</button></div><div className="mt-3 flex flex-wrap gap-2">{tags.length > 0 ? tags.map((tag) => <AdhdChip key={tag} toneClassName="border-[#e8defe] bg-[#f3eeff] text-[#7762f3] dark:border-[#3a2e63] dark:bg-[#21183d] dark:text-[#c7bcff]">#{tag}</AdhdChip>) : <span className="text-sm text-[#8d87a7] dark:text-white/45">No tags on this Pursuit yet.</span>}</div>{isTagsPanelOpen ? <div className="mt-3"><TagsQuickPanel allTagOptions={allTagOptions} entityLabel="Pursuit" onClose={() => setIsTagsPanelOpen(false)} onSave={setTags} tags={tags} /></div> : null}</section><section className="rounded-[1.35rem] border border-[#ede7f7] bg-white p-4 dark:border-white/[0.02]"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#9b92be] dark:text-white/35">Pursuit children</p><p className="mt-1 text-xs text-[#827a97] dark:text-white/52">Keep working on this Pursuit as another Pursuit.</p></div>{pursuit ? <button className={SECONDARY_BUTTON_CLASS} onClick={() => setChildEditorParentId(pursuit.id)} type="button"><Plus className="h-3.5 w-3.5" />Add Pursuit</button> : null}</div>{childPursuits.length > 0 ? <div className="mt-3 space-y-2">{childPursuits.map((child, index) => <div className="flex items-center gap-2 rounded-[0.9rem] bg-[#fbfaff] px-3 py-2 text-sm text-[#4e4865] dark:bg-white/[0.04] dark:text-white/76" key={child.id} style={{ marginLeft: `${Math.min(childRows[index]?.depth ?? 0, 8) * 18}px` }}><button className="flex min-w-0 flex-1 items-center gap-2 text-left transition hover:text-[#6f57f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9a8ff] dark:hover:text-[#cabfff]" onClick={(event) => { event.stopPropagation(); if (pursuitsById.has(child.id)) setNestedPursuitId(child.id); else onOpenPursuit?.(child.id); }} type="button"><Compass className="h-4 w-4 shrink-0 text-[#6f57f6]" /><span className="truncate">{child.title}</span></button><AdhdChip tone={getStatusTone(child.status)}>{formatStatusLabel(child.status)}</AdhdChip><AdhdIconButton aria-label={`Add child Pursuit to ${child.title}`} onClick={(event) => { event.stopPropagation(); setChildEditorParentId(child.id); }} size="sm" title="Add child Pursuit" variant="rowToolbar"><Footprints /></AdhdIconButton></div>)}</div> : <p className="mt-3 text-sm text-[#8d87a7] dark:text-white/45">No Pursuit children yet.</p>}</section></div>
              <div className="space-y-4"><section className="rounded-[1.35rem] border border-[#ede7f7] bg-white p-4 dark:border-white/10 dark:bg-white/[0.02]"><p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#9b92be] dark:text-white/35">Details</p><label className="mt-3 block text-xs font-semibold text-[#655d7d] dark:text-white/68">Lifecycle<AdhdDropdownSelect label="Lifecycle" onChange={setStatus} options={[{ label: "Active", value: "active" }, { label: "Paused", value: "paused" }, { label: "Archived", value: "archived" }]} value={status} /></label><label className="mt-3 block text-xs font-semibold text-[#655d7d] dark:text-white/68">Revisit target (days)<input className={INPUT_CLASS} min="1" onChange={(event) => setRevisitInterval(event.target.value)} placeholder="No target" type="number" value={revisitInterval} /></label><div className="mt-3 rounded-[0.9rem] bg-[#fbfaff] px-3 py-2 dark:bg-white/[0.04]"><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#9b92be] dark:text-white/35">Next target</p><p className="mt-1 text-sm font-semibold text-[#4e4865] dark:text-white/80">{nextTargetLogicalDay ? formatPursuitTargetDate(nextTargetLogicalDay, timezone, todayKey) : "No target"}</p></div><p className="mt-3 rounded-[0.9rem] bg-[#fbfaff] px-3 py-2 text-sm text-[#4e4865] dark:bg-white/[0.04] dark:text-white/75">{formatPursuitRevisitCadence(pursuit?.revisit_interval_days ?? (revisitInterval ? Number.parseInt(revisitInterval, 10) : null))}</p></section><section className="rounded-[1.35rem] border border-[#ede7f7] bg-white p-4 dark:border-white/10 dark:bg-white/[0.02]"><p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#9b92be] dark:text-white/35">Hierarchy</p>{initialParentPursuitId ? <p className="mt-3 rounded-[0.9rem] bg-[#fbfaff] px-3 py-2 text-sm text-[#4e4865] dark:bg-white/[0.04] dark:text-white/75">Pursuit child of {pursuitsById.get(initialParentPursuitId)?.title ?? "another Pursuit"}</p> : <><label className="mt-3 block text-xs font-semibold text-[#655d7d] dark:text-white/68">Parent type<AdhdDropdownSelect disabled={Boolean(initialParentTaskId)} label="Parent type" onChange={(nextKind) => { setParentKind(nextKind); if (nextKind !== "pursuit") setParentPursuitId(""); if (nextKind !== "task") setParentTaskId(""); }} options={[{ label: "None", value: "none" }, { label: "Pursuit", value: "pursuit" }, { label: "Task", value: "task" }]} value={parentKind} /></label>{parentKind === "pursuit" ? <label className="mt-3 block text-xs font-semibold text-[#655d7d] dark:text-white/68">Parent Pursuit<AdhdDropdownSelect label="Parent Pursuit" onChange={setParentPursuitId} options={[{ label: "Choose a Pursuit", value: "" }, ...parentOptions.map((candidate) => ({ label: `${getPursuitDepth(candidate, pursuitsById) > 0 ? "↳ " : ""}${candidate.title}`, value: candidate.id }))]} value={parentPursuitId} /></label> : null}{parentKind === "task" ? <label className="mt-3 block text-xs font-semibold text-[#655d7d] dark:text-white/68">Parent Task<AdhdDropdownSelect label="Parent Task" onChange={setParentTaskId} options={[{ label: "Choose a Task", value: "" }, ...taskOptions.map((task) => ({ label: task.title, value: task.id }))]} value={parentTaskId} /></label> : null}</>}</section></div>
            </div>
          ) : <><PursuitCalendar activities={pursuitActivities} completionSummary={completionSummary} dayStartTime={dayStartTime} disabled={!pursuit || isPending} monthDays={monthDays} monthKey={calendarMonth} onChangeMonth={(amount) => setCalendarMonth((current) => shiftMonthKey(current, amount))} onChangeDayNote={setSelectedDayNote} onSaveSelectedDayNote={() => { void saveSelectedDayNote(); }} onSelectDay={handleSelectCalendarDay} selectedDay={selectedCalendarDay} selectedDayCompleted={selectedDayCompleted} selectedDayIsFuture={selectedDayIsFuture} selectedDayNote={selectedDayNote} onToggleSelectedDay={() => { void markSelectedDay(); }} timezone={timezone} todayKey={todayKey} />
          {formError ? <p className="mt-4 rounded-[0.9rem] bg-[#fff3f5] px-3 py-2 text-xs text-[#a24e67] dark:bg-[#32161d] dark:text-[#ffb5c3]">{formError}</p> : null}</>}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#eee9f8] pt-4 dark:border-white/10"><div className="flex items-center gap-1"><button className={`${SECONDARY_BUTTON_CLASS} ${activeSection === "overview" ? "border-[#cfc2fb] text-[#6f57f6]" : ""}`} onClick={() => setActiveSection("overview")} type="button">Overview</button><button className={`${SECONDARY_BUTTON_CLASS} ${activeSection === "calendar" ? "border-[#cfc2fb] text-[#6f57f6]" : ""}`} onClick={() => setActiveSection("calendar")} type="button"><CalendarDays className="h-3.5 w-3.5" />Calendar</button></div><div className="flex justify-end gap-2"><button className={SECONDARY_BUTTON_CLASS} disabled={isPending} onClick={onClose} type="button">Cancel</button><button className={PRIMARY_BUTTON_CLASS} disabled={isPending} type="submit">{isPending ? "Saving..." : pursuit ? "Save Pursuit" : "Create Pursuit"}</button></div></footer>
      </form>
      {nestedPursuitId ? <PursuitEditorModal activities={activities} allTagOptions={allTagOptions} completionSummary={completionSummaryByPursuitId?.get(nestedPursuitId) ?? EMPTY_SUMMARY} completionSummaryByPursuitId={completionSummaryByPursuitId} dayStartTime={dayStartTime} onClose={() => setNestedPursuitId(null)} onCreate={onCreate} onMarkCompletedOnLogicalDay={onMarkCompletedOnLogicalDay} onMarkDoneToday={onMarkDoneToday} onOpenPursuit={onOpenPursuit} onRemoveCompletionOnLogicalDay={onRemoveCompletionOnLogicalDay} onUpdate={onUpdate} pursuit={pursuitsById.get(nestedPursuitId) ?? null} pursuits={pursuits} taskOptions={taskOptions} todayKey={todayKey} timezone={timezone} /> : null}
      {childEditorParentId ? <PursuitEditorModal activities={activities} allTagOptions={allTagOptions} completionSummary={EMPTY_SUMMARY} completionSummaryByPursuitId={completionSummaryByPursuitId} dayStartTime={dayStartTime} initialParentPursuitId={childEditorParentId} onClose={() => setChildEditorParentId(null)} onCreate={(input) => onCreate({ ...input, parent_pursuit_id: childEditorParentId, parent_task_id: null })} onMarkCompletedOnLogicalDay={onMarkCompletedOnLogicalDay} onMarkDoneToday={onMarkDoneToday} onOpenPursuit={onOpenPursuit} onRemoveCompletionOnLogicalDay={onRemoveCompletionOnLogicalDay} onUpdate={onUpdate} pursuits={pursuits} taskOptions={taskOptions} todayKey={todayKey} timezone={timezone} /> : null}
    </ModalShell>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[0.75rem] bg-[#f7f4ff] px-2.5 py-1.5 dark:bg-white/[0.05]"><p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#9b92be] dark:text-white/35">{label}</p><p className="mt-1 text-sm font-semibold text-[#4e4865] dark:text-white/80">{value}</p></div>;
}

function PursuitCalendar({
  activities,
  completionSummary,
  dayStartTime,
  disabled,
  monthDays,
  monthKey,
  onChangeDayNote,
  onChangeMonth,
  onSaveSelectedDayNote,
  onSelectDay,
  onToggleSelectedDay,
  selectedDay,
  selectedDayCompleted,
  selectedDayIsFuture,
  selectedDayNote,
  timezone,
  todayKey,
}: {
  activities: PursuitActivity[];
  completionSummary: PursuitCompletionSummary;
  dayStartTime: string;
  disabled: boolean;
  monthDays: Array<string | null>;
  monthKey: string;
  onChangeDayNote: (value: string) => void;
  onChangeMonth: (amount: number) => void;
  onSaveSelectedDayNote: () => void;
  onSelectDay: (day: string | null) => void;
  onToggleSelectedDay: () => void;
  selectedDay: string;
  selectedDayCompleted: boolean;
  selectedDayIsFuture: boolean;
  selectedDayNote: string;
  timezone: string;
  todayKey: string;
}) {
  const activityByDay = new Map(
    activities
      .map((activity) => [getPursuitLogicalDay(activity.occurred_at, { dayStartTime, timezone }), activity] as const)
      .sort(([left], [right]) => right.localeCompare(left)),
  );
  const days = [...completionSummary.completedLogicalDays].sort().reverse();
  return (
    <section className="rounded-[1rem] border border-[#ede7f7] bg-white p-3 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#9b92be] dark:text-white/35">Pursuit calendar</p>
          <p className="mt-1 text-sm text-[#827a97] dark:text-white/52">Completed days and their notes in one place.</p>
        </div>
        <div className="flex items-center gap-1">
          <AdhdIconButton aria-label="Previous month" onClick={() => onChangeMonth(-1)} size="sm" variant="rowToolbar"><ChevronLeft /></AdhdIconButton>
          <p className="min-w-32 text-center text-sm font-semibold text-[#4e4865] dark:text-white/80">{formatMonthLabel(monthKey, timezone)}</p>
          <AdhdIconButton aria-label="Next month" onClick={() => onChangeMonth(1)} size="sm" variant="rowToolbar"><ChevronRight /></AdhdIconButton>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9b92be] dark:text-white/35">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {monthDays.map((day, index) => {
          const completed = day ? completionSummary.completedLogicalDays.includes(day) : false;
          const future = day ? day > todayKey : false;
          return (
            <button
              aria-label={day ? `${day}${completed ? " Completed" : ""}` : undefined}
              className={`min-h-10 rounded-[0.7rem] border text-sm transition ${!day ? "cursor-default border-transparent bg-transparent" : completed ? "border-[#b9dfc2] bg-[#eaf8ed] font-semibold text-[#348554] dark:border-[#356944] dark:bg-[#17311e] dark:text-[#a5ddb6]" : "border-[#eee9f8] bg-[#fbfaff] text-[#7d7598] hover:border-[#cfc2fb] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55"} ${day === selectedDay ? "ring-2 ring-[#b9a8ff]" : ""} ${future ? "cursor-default opacity-45" : ""}`}
              disabled={!day || future || disabled}
              key={day ?? `blank-${index}`}
              onClick={() => onSelectDay(day)}
              type="button"
            >
              {day ? day.slice(-2) : null}
            </button>
          );
        })}
      </div>
      <div className="mt-3 rounded-[0.85rem] bg-[#fbfaff] px-3 py-3 dark:bg-white/[0.04]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-[#4e4865] dark:text-white/80">{selectedDay ? formatLogicalDay(selectedDay, timezone) : "Select a day"}</p>
            <p className="mt-1 text-xs text-[#827a97] dark:text-white/52">{selectedDayCompleted ? "Completed" : selectedDayIsFuture ? "Future days are blank" : "No completion"}</p>
          </div>
          <button className={selectedDayCompleted ? SECONDARY_BUTTON_CLASS : PRIMARY_BUTTON_CLASS} disabled={!selectedDay || selectedDayIsFuture || disabled} onClick={onToggleSelectedDay} type="button">{selectedDayCompleted ? "Remove Completion" : "Mark Completed"}</button>
        </div>
        {!selectedDayIsFuture && selectedDay ? (
          <div className="mt-3">
            <label className="block text-[11px] font-semibold text-[#655d7d] dark:text-white/68">Completion note<textarea aria-label="Selected day completion note" className="mt-1 min-h-16 w-full resize-y rounded-[0.75rem] border border-[#e5e0f5] bg-white px-2.5 py-2 text-xs text-[#4e4865] outline-none focus:border-[#b9a8ff] dark:border-white/15 dark:bg-white/[0.05] dark:text-white/80" disabled={disabled} onChange={(event) => onChangeDayNote(event.target.value)} placeholder="Optional note for this day" value={selectedDayNote} /></label>
            {selectedDayCompleted ? <button className="mt-2 inline-flex min-h-8 items-center justify-center gap-1.5 rounded-full border border-[#ddd2ff] bg-[#f1ecff] px-3 py-1.5 text-xs font-semibold text-[#6f57f6]" disabled={disabled} onClick={onSaveSelectedDayNote} type="button"><Save className="h-3.5 w-3.5" />Save note</button> : null}
          </div>
        ) : null}
      </div>
      <div className="mt-4 border-t border-[#eee9f8] pt-3 dark:border-white/10">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#9b92be] dark:text-white/35">Pursuit history</p>
            <p className="mt-1 text-xs text-[#827a97] dark:text-white/52">Chronological completed days and attached notes.</p>
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-right">
            <SummaryStat label="Last done" value={formatPursuitLastCompletion(completionSummary).replace("Last done ", "")} />
            <SummaryStat label="Current streak" value={String(completionSummary.currentStreak)} />
            <SummaryStat label="Best streak" value={String(completionSummary.bestStreak)} />
            <SummaryStat label="Completed days" value={String(completionSummary.totalCompletedDays)} />
          </div>
        </div>
        {days.length === 0 ? <p className="mt-3 rounded-[0.75rem] bg-[#fbfaff] px-3 py-3 text-sm text-[#8d87a7] dark:bg-white/[0.04] dark:text-white/45">No completed days yet.</p> : <div className="mt-3 divide-y divide-[#eee9f8] rounded-[0.75rem] border border-[#eee9f8] dark:divide-white/10 dark:border-white/10">{days.map((day) => <div className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm" key={day}><div><span className="font-semibold text-[#4e4865] dark:text-white/78">{formatLogicalDay(day, timezone)}</span>{activityByDay.get(day)?.notes ? <p className="mt-1 text-xs text-[#827a97] dark:text-white/55">{activityByDay.get(day)?.notes}</p> : null}</div><span className="text-xs font-semibold text-[#348554] dark:text-[#a5ddb6]">Completed</span></div>)}</div>}
      </div>
    </section>
  );
}
