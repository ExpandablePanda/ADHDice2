"use client";

import { useState } from "react";
import { CalendarDays, Compass, Footprints, Pencil, Save, X } from "lucide-react";
import { AdhdChip, AdhdDropdownPanel, AdhdIconButton } from "@/components/ui-system";
import {
  formatTaskTableEntryTimestamp,
  TASK_TABLE_ACTIVE_LIST_CHIP_CLASS,
  TASK_TABLE_CHIP_BASE_CLASS,
  TASK_TABLE_CONTROL_FONT_CLASS,
  TASK_TABLE_INACTIVE_CHIP_CLASS,
  TASK_TABLE_INPUT_CLASS,
  TASK_TABLE_LIST_CHIP_CLASS,
  TASK_TABLE_TAG_CHIP_CLASS,
  TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS,
  TaskCurrentStreakChip,
  TaskTableChipButton,
} from "@/components/ui/task-table-primitives";
import type { Pursuit, PursuitStatus, PursuitUpdate } from "@/lib/database.types";
import { formatPursuitLastCompletionDate, formatPursuitRevisitCadence, formatPursuitTargetDate, type PursuitAttention } from "@/lib/pursuit-domain";
import { TASK_TABLE_GRID_ORIGIN_CLASS } from "@/lib/task-table-alignment";

export type PursuitWorkspaceRowProps = {
  attention?: PursuitAttention;
  depth: number;
  onCreateChildPursuit?: (pursuitId: string) => void;
  onMarkDoneToday: (pursuitId: string, notes?: string) => void | Promise<unknown>;
  onOpen: (pursuitId: string) => void;
  onOpenCalendar?: (pursuitId: string) => void;
  onRemoveCompletionOnLogicalDay?: (pursuitId: string, logicalDay: string) => void | Promise<unknown>;
  onUpdatePursuit?: (pursuitId: string, input: PursuitUpdate) => Promise<Pursuit | null>;
  pursuit: Pursuit;
  timezone: string;
  todayKey: string;
};

export type PursuitQuickEditMode = "due" | "notes" | "repeat" | "status" | "tags";

function statusTone(status: Pursuit["status"]) {
  if (status === "active") return "progress" as const;
  if (status === "paused") return "notDue" as const;
  return "archived" as const;
}

function statusLabel(status: Pursuit["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function targetLabel(attention: PursuitAttention | undefined, timezone: string) {
  return attention?.nextTargetLogicalDay
    ? formatPursuitTargetDate(attention.nextTargetLogicalDay, timezone, attention.todayKey)
    : "No target";
}

const YELLOW_CHIP_CLASS = "border-[#f2df9d] bg-[#fff8dc] text-[#9a7418] dark:border-[#66521d] dark:bg-[#342b12] dark:text-[#f3d38a]";
const GREEN_COMPLETION_CHIP_CLASS = "border-[#b9dfc2] bg-[#eaf8ed] text-[#348554] dark:border-[#356944] dark:bg-[#17311e] dark:text-[#a5ddb6]";
const GREEN_ICON_CLASS = "text-[#3f8b5a] hover:text-[#2f7448] dark:text-[#a5ddb6] dark:hover:text-[#c2f0cc]";
const YELLOW_ICON_CLASS = "text-[#b1811c] hover:text-[#936b10] dark:text-[#f3d38a] dark:hover:text-[#ffe2a1]";
const MUTED_ICON_CLASS = "text-[#9290a0] hover:text-[#777487] dark:text-white/38 dark:hover:text-white/60";
const QUICK_PANEL_SHELL_CLASS = "mt-2.5 rounded-[1.15rem] border border-[#e5def5] bg-[#fbfaff] p-3 text-left shadow-[0_12px_32px_rgba(81,61,168,0.08)] dark:border-white/10 dark:bg-[#1b1530]/80";
const QUICK_PANEL_PRIMARY_CLASS = "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-full border border-[#ddd2ff] bg-[#f1ecff] px-3 py-1.5 text-xs font-semibold text-[#6f57f6] transition hover:bg-[#e7ddff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9a8ff] disabled:cursor-not-allowed disabled:opacity-55 dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]";

export function PursuitCompletionNotePanel({
  ariaLabel,
  className,
  notes,
  onChangeNotes,
  onClose,
  onConfirm,
  pending = false,
}: {
  ariaLabel: string;
  className?: string;
  notes: string;
  onChangeNotes: (notes: string) => void;
  onClose?: () => void;
  onConfirm: () => void | Promise<unknown>;
  pending?: boolean;
}) {
  return (
    <div
      aria-label={ariaLabel}
      className={`${QUICK_PANEL_SHELL_CLASS} ${className ?? ""}`}
      data-pursuit-completion-note-panel="true"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[#4e4865] dark:text-white/80">Mark done today</p>
        {onClose ? <AdhdIconButton aria-label="Close completion note" onClick={onClose} size="sm" variant="rowToolbar"><X /></AdhdIconButton> : null}
      </div>
      <textarea
        aria-label="Completion note"
        className={`${TASK_TABLE_INPUT_CLASS} mt-2 min-h-16 resize-y px-2.5 py-2 text-xs`}
        disabled={pending}
        onChange={(event) => onChangeNotes(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        placeholder="Optional note for today"
        value={notes}
      />
      <button
        className="mt-2 inline-flex min-h-8 w-full items-center justify-center gap-1.5 rounded-full border border-[#6f57f6] bg-[#6f57f6] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#5f45f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9a8ff] disabled:cursor-not-allowed disabled:opacity-55"
        disabled={pending}
        onClick={() => { void onConfirm(); }}
        type="button"
      >
        <Compass className="h-3.5 w-3.5" />{pending ? "Saving..." : "Confirm completion"}
      </button>
    </div>
  );
}

export function PursuitCompletionControl({
  attention,
  onMarkDoneToday,
  onRemoveCompletionOnLogicalDay,
  onRequestCompletionNote,
  pursuit,
  todayKey,
}: Pick<PursuitWorkspaceRowProps, "attention" | "onMarkDoneToday" | "onRemoveCompletionOnLogicalDay" | "pursuit" | "todayKey"> & {
  onRequestCompletionNote?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [isPending, setIsPending] = useState(false);
  const completedToday = attention?.completionSummary.completedToday ?? false;
  const disabled = pursuit.status !== "active";
  const iconClass = disabled ? MUTED_ICON_CLASS : completedToday ? GREEN_ICON_CLASS : attention?.needsAttention ? YELLOW_ICON_CLASS : undefined;

  const confirmCompletion = async () => {
    setIsPending(true);
    try {
      await onMarkDoneToday(pursuit.id, notes);
      setNotes("");
      setIsOpen(false);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="relative" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <AdhdIconButton
        aria-label={completedToday ? `Clear ${pursuit.title} done today` : `Mark ${pursuit.title} done today`}
        aria-expanded={onRequestCompletionNote ? undefined : isOpen}
        aria-pressed={completedToday}
        className={iconClass}
        disabled={disabled}
        onClick={() => {
          if (completedToday) {
            onRemoveCompletionOnLogicalDay?.(pursuit.id, todayKey);
            return;
          }
          if (onRequestCompletionNote) {
            onRequestCompletionNote();
          } else {
            setIsOpen((current) => !current);
          }
        }}
        size="sm"
        title={completedToday ? "Clear done today" : "Mark done today"}
        variant="rowToolbar"
      >
        <Compass />
      </AdhdIconButton>
      {!onRequestCompletionNote && isOpen ? (
        <AdhdDropdownPanel aria-label={`Complete ${pursuit.title}`} className="right-0 top-[calc(100%+0.35rem)] z-30 w-64 p-2.5" onClick={(event) => event.stopPropagation()}>
          <PursuitCompletionNotePanel
            ariaLabel={`Complete ${pursuit.title}`}
            className="border-0 bg-transparent p-0 shadow-none"
            notes={notes}
            onChangeNotes={setNotes}
            onClose={() => setIsOpen(false)}
            onConfirm={confirmCompletion}
            pending={isPending}
          />
        </AdhdDropdownPanel>
      ) : null}
    </div>
  );
}

function normalizeTags(value: string) {
  return Array.from(new Set(value.split(",").map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean)));
}

export function PursuitQuickEditPanel({ mode, onClose, onUpdatePursuit, pursuit }: {
  mode: PursuitQuickEditMode;
  onClose: () => void;
  onUpdatePursuit: (pursuitId: string, input: PursuitUpdate) => Promise<Pursuit | null>;
  pursuit: Pursuit;
}) {
  const [draft, setDraft] = useState(() => mode === "tags" ? (pursuit.tags ?? []).join(", ") : mode === "notes" ? pursuit.notes ?? "" : mode === "status" ? pursuit.status : pursuit.revisit_interval_days?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const label = mode === "tags" ? "Tags" : mode === "notes" ? "Notes" : mode === "status" ? "Lifecycle" : mode === "due" ? "Revisit target" : "Repeat cadence";

  const save = async () => {
    let input: PursuitUpdate;
    if (mode === "tags") {
      input = { tags: normalizeTags(draft) };
    } else if (mode === "notes") {
      input = { notes: draft.trim() || null };
    } else if (mode === "status") {
      input = { status: draft as PursuitStatus };
    } else {
      const revisitInterval = draft.trim() ? Number(draft) : null;
      if (revisitInterval !== null && (!Number.isInteger(revisitInterval) || revisitInterval <= 0)) {
        setError("Use a positive whole number or leave blank.");
        return;
      }
      input = { revisit_interval_days: revisitInterval };
    }
    setError(null);
    setIsSaving(true);
    try {
      const result = await onUpdatePursuit(pursuit.id, input);
      if (result) onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      aria-label={`${label} for ${pursuit.title}`}
      className={QUICK_PANEL_SHELL_CLASS}
      data-pursuit-quick-edit={pursuit.id}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[#4e4865] dark:text-white/80">Edit {label}</p>
        <AdhdIconButton aria-label={`Close ${label} editor`} onClick={onClose} size="sm" variant="rowToolbar"><X /></AdhdIconButton>
      </div>
      {mode === "notes" ? (
        <textarea aria-label={`${label} for ${pursuit.title}`} className={`${TASK_TABLE_INPUT_CLASS} mt-2 min-h-20 resize-y`} onChange={(event) => setDraft(event.target.value)} value={draft} />
      ) : mode === "status" ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(["active", "paused", "archived"] as PursuitStatus[]).map((status) => (
            <AdhdChip key={status} onClick={() => setDraft(status)} selected={draft === status} tone={statusTone(status)}>{statusLabel(status)}</AdhdChip>
          ))}
        </div>
      ) : (
        <label className="mt-2 block text-[11px] font-semibold text-[#655d7d] dark:text-white/68">
          {mode === "tags" ? "Comma-separated tags" : `${label} (days)`}
          <input aria-label={`${label} for ${pursuit.title}`} className={`${TASK_TABLE_INPUT_CLASS} mt-1`} min={mode === "tags" ? undefined : "1"} onChange={(event) => setDraft(event.target.value)} type={mode === "tags" ? "text" : "number"} value={draft} />
        </label>
      )}
      {error ? <p className="mt-2 text-[11px] text-[#a24e67]">{error}</p> : null}
      <div className="mt-2 flex justify-end gap-2">
        <button className={QUICK_PANEL_PRIMARY_CLASS} disabled={isSaving} onClick={() => { void save(); }} type="button"><Save className="h-3.5 w-3.5" />{isSaving ? "Saving..." : "Save"}</button>
      </div>
    </div>
  );
}

function PursuitMetadataButton({ active = false, label, onClick, value, toneClassName }: { active?: boolean; label: string; onClick: () => void; toneClassName?: string; value: string }) {
  return (
    <TaskTableChipButton
      aria-label={`Edit ${label}`}
      className={active ? "ring-2 ring-[#cfc2fb] ring-offset-1 dark:ring-[#6d56d6] dark:ring-offset-[#171328]" : undefined}
      onClick={(event) => { event.stopPropagation(); onClick(); }}
      onPointerDown={(event) => event.stopPropagation()}
      toneClassName={toneClassName ?? (active ? TASK_TABLE_ACTIVE_LIST_CHIP_CLASS : TASK_TABLE_LIST_CHIP_CLASS)}
    >
      {value}
    </TaskTableChipButton>
  );
}

function PursuitRowActions({ onCreateChildPursuit, onOpen, onOpenCalendar, pursuit }: Pick<PursuitWorkspaceRowProps, "onCreateChildPursuit" | "onOpen" | "onOpenCalendar" | "pursuit">) {
  return (
    <div className="flex shrink-0 items-center gap-0.5" data-pursuit-row-actions="true" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      {onCreateChildPursuit ? <AdhdIconButton aria-label={`Add child Pursuit to ${pursuit.title}`} onClick={() => onCreateChildPursuit(pursuit.id)} size="sm" title="Add child Pursuit" variant="rowToolbar"><Footprints /></AdhdIconButton> : null}
      {onOpenCalendar ? <AdhdIconButton aria-label={`Open calendar for ${pursuit.title}`} onClick={() => onOpenCalendar(pursuit.id)} size="sm" title="Open calendar" variant="rowToolbar"><CalendarDays /></AdhdIconButton> : null}
      <AdhdIconButton aria-label={`Edit ${pursuit.title}`} onClick={() => onOpen(pursuit.id)} size="sm" title="Edit Pursuit" variant="rowToolbar"><Pencil /></AdhdIconButton>
    </div>
  );
}

function neutralCell(value: string) {
  return <span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${TASK_TABLE_INACTIVE_CHIP_CLASS}`}>{value}</span>;
}

function PursuitTitle({ attention, depth, onMarkDoneToday, onOpen, onRemoveCompletionOnLogicalDay, pursuit, showIdentityIcon, todayKey, variant }: PursuitWorkspaceRowProps & { showIdentityIcon: boolean; variant: "list" | "table" }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5" style={showIdentityIcon ? undefined : { paddingLeft: `${Math.min(depth, 8) * 18}px` }}>
      {showIdentityIcon ? <PursuitCompletionControl attention={attention} onMarkDoneToday={onMarkDoneToday} onRemoveCompletionOnLogicalDay={onRemoveCompletionOnLogicalDay} pursuit={pursuit} todayKey={todayKey} /> : null}
      <div className="min-w-0">
        <button className="min-w-0 max-w-full appearance-none border-0 bg-transparent p-0 text-left shadow-none outline-none transition hover:opacity-85 focus-visible:rounded-[0.5rem] focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80" onClick={(event) => { event.stopPropagation(); onOpen(pursuit.id); }} type="button">
          <p className={`${TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS} min-w-0 whitespace-normal break-normal ${variant === "list" ? "leading-6" : ""}`}>{pursuit.title}</p>
        </button>
      </div>
    </div>
  );
}

export function PursuitTableWorkspaceRow({ attention, columns, depth, gridTemplateColumns, onCreateChildPursuit, onMarkDoneToday, onOpen, onOpenCalendar, onRemoveCompletionOnLogicalDay, onUpdatePursuit, pursuit, timezone, todayKey }: PursuitWorkspaceRowProps & { columns: ReadonlyArray<string>; gridTemplateColumns: string }) {
  const [activeQuickEdit, setActiveQuickEdit] = useState<PursuitQuickEditMode | null>(null);
  const [completionNoteOpen, setCompletionNoteOpen] = useState(false);
  const [completionNote, setCompletionNote] = useState("");
  const [completionPending, setCompletionPending] = useState(false);
  const lastDone = attention ? formatPursuitLastCompletionDate(attention.completionSummary, timezone) : "Never done";
  const pursuitTags = pursuit.tags ?? [];
  const openQuickEdit = (mode: PursuitQuickEditMode) => {
    setCompletionNoteOpen(false);
    setActiveQuickEdit((current) => current === mode ? null : mode);
  };
  const confirmCompletion = async () => {
    setCompletionPending(true);
    try {
      await onMarkDoneToday(pursuit.id, completionNote);
      setCompletionNote("");
      setCompletionNoteOpen(false);
    } finally {
      setCompletionPending(false);
    }
  };

  return (
    <div className={`${TASK_TABLE_CONTROL_FONT_CLASS} relative block w-max min-w-full rounded-[1.15rem] text-center`} data-pursuit-row={pursuit.id} onClick={() => onOpen(pursuit.id)}>
      <div className={`${TASK_TABLE_GRID_ORIGIN_CLASS} grid w-max min-w-full items-center gap-0 rounded-[1.15rem] border border-transparent bg-transparent py-0.5 pl-[3px] pr-0 text-center transition hover:shadow-[0_18px_40px_rgba(109,61,208,0.10)] dark:bg-transparent`} style={{ gridTemplateColumns }}>
        {columns.map((columnId) => {
          if (columnId === "status_icon") return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden" key={`${pursuit.id}-${columnId}`}><PursuitCompletionControl attention={attention} onMarkDoneToday={onMarkDoneToday} onRemoveCompletionOnLogicalDay={onRemoveCompletionOnLogicalDay} onRequestCompletionNote={() => { setActiveQuickEdit(null); setCompletionNoteOpen((current) => !current); }} pursuit={pursuit} todayKey={todayKey} /></div>;
          if (columnId === "title") return <div className="flex min-h-full min-w-0 items-center overflow-hidden pl-[5px] pr-1 text-left" key={`${pursuit.id}-${columnId}`}><PursuitTitle attention={attention} depth={depth} onMarkDoneToday={onMarkDoneToday} onOpen={onOpen} onRemoveCompletionOnLogicalDay={onRemoveCompletionOnLogicalDay} pursuit={pursuit} showIdentityIcon={false} timezone={timezone} todayKey={todayKey} variant="table" /><PursuitRowActions onCreateChildPursuit={onCreateChildPursuit} onOpen={onOpen} onOpenCalendar={onOpenCalendar} pursuit={pursuit} /></div>;
          if (columnId === "due") {
            const hasTarget = Boolean(attention?.nextTargetLogicalDay);
            return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><PursuitMetadataButton active={activeQuickEdit === "due"} label="Due" onClick={() => openQuickEdit("due")} toneClassName={hasTarget ? attention?.needsAttention ? YELLOW_CHIP_CLASS : TASK_TABLE_LIST_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS} value={targetLabel(attention, timezone)} /></div>;
          }
          if (columnId === "repeat") {
            const hasCadence = Boolean(pursuit.revisit_interval_days && pursuit.revisit_interval_days > 0);
            return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><PursuitMetadataButton active={activeQuickEdit === "repeat"} label="Repeat" onClick={() => openQuickEdit("repeat")} toneClassName={hasCadence ? TASK_TABLE_LIST_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS} value={formatPursuitRevisitCadence(pursuit.revisit_interval_days)} /></div>;
          }
          if (columnId === "last_done") return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${attention?.completionSummary.lastCompletedLogicalDay ? GREEN_COMPLETION_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}`}>{lastDone}</span></div>;
          if (columnId === "status") return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><AdhdChip aria-label="Edit Lifecycle" className={activeQuickEdit === "status" ? "ring-2 ring-[#cfc2fb] ring-offset-1" : undefined} onClick={(event) => { event.stopPropagation(); openQuickEdit("status"); }} onPointerDown={(event) => event.stopPropagation()} tone={statusTone(pursuit.status)}>{statusLabel(pursuit.status)}</AdhdChip></div>;
          if (columnId === "tags") return <div className="flex min-h-full min-w-0 items-center justify-center gap-2 overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><PursuitMetadataButton active={activeQuickEdit === "tags"} label="Tags" onClick={() => openQuickEdit("tags")} toneClassName={pursuitTags.length > 0 ? TASK_TABLE_TAG_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS} value={pursuitTags.length > 0 ? pursuitTags.map((tag) => `#${tag}`).join(" ") : "No tags"} /></div>;
          if (columnId === "date_added") return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${TASK_TABLE_LIST_CHIP_CLASS}`}>{formatTaskTableEntryTimestamp(pursuit.created_at)}</span></div>;
          if (columnId === "streak") return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}>{attention?.completionSummary.currentStreak ? <TaskCurrentStreakChip currentStreak={attention.completionSummary.currentStreak} /> : neutralCell("—")}</div>;
          if (columnId === "notes") return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><PursuitMetadataButton active={activeQuickEdit === "notes"} label="Notes" onClick={() => openQuickEdit("notes")} toneClassName={pursuit.notes?.trim() ? TASK_TABLE_LIST_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS} value={pursuit.notes?.trim() ? "Notes" : "No notes"} /></div>;
          return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}>{neutralCell("—")}</div>;
        })}
      </div>
      {completionNoteOpen ? <PursuitCompletionNotePanel ariaLabel={`Complete ${pursuit.title}`} className="mx-1" notes={completionNote} onChangeNotes={setCompletionNote} onClose={() => setCompletionNoteOpen(false)} onConfirm={confirmCompletion} pending={completionPending} /> : null}
      {activeQuickEdit && onUpdatePursuit ? <PursuitQuickEditPanel mode={activeQuickEdit} onClose={() => setActiveQuickEdit(null)} onUpdatePursuit={onUpdatePursuit} pursuit={pursuit} /> : null}
    </div>
  );
}

export function PursuitListWorkspaceRow({ attention, depth, onCreateChildPursuit, onMarkDoneToday, onOpen, onOpenCalendar, onRemoveCompletionOnLogicalDay, onUpdatePursuit, pursuit, timezone, todayKey }: PursuitWorkspaceRowProps) {
  const [activeQuickEdit, setActiveQuickEdit] = useState<PursuitQuickEditMode | null>(null);
  const pursuitTags = pursuit.tags ?? [];
  const openQuickEdit = (mode: PursuitQuickEditMode) => setActiveQuickEdit((current) => current === mode ? null : mode);
  return (
    <article className="relative cursor-pointer rounded-[1.35rem] border border-[#e7e0f7] bg-[#fbfaff] p-3 shadow-[0_12px_30px_rgba(81,61,168,0.04)] dark:border-white/10 dark:bg-white/[0.03]" data-pursuit-row={pursuit.id} onClick={() => onOpen(pursuit.id)} style={{ marginLeft: `${Math.min(depth, 8) * 18}px` }}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <PursuitTitle attention={attention} depth={0} onMarkDoneToday={onMarkDoneToday} onOpen={onOpen} onRemoveCompletionOnLogicalDay={onRemoveCompletionOnLogicalDay} pursuit={pursuit} showIdentityIcon timezone={timezone} todayKey={todayKey} variant="list" />
        <PursuitRowActions onCreateChildPursuit={onCreateChildPursuit} onOpen={onOpen} onOpenCalendar={onOpenCalendar} pursuit={pursuit} />
      </div>
      {onUpdatePursuit ? <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5" data-pursuit-metadata-row="true" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
        <PursuitMetadataButton active={activeQuickEdit === "due"} label="Due" onClick={() => openQuickEdit("due")} toneClassName={attention?.nextTargetLogicalDay ? TASK_TABLE_LIST_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS} value={targetLabel(attention, timezone)} />
        <PursuitMetadataButton active={activeQuickEdit === "repeat"} label="Repeat" onClick={() => openQuickEdit("repeat")} toneClassName={pursuit.revisit_interval_days ? TASK_TABLE_LIST_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS} value={formatPursuitRevisitCadence(pursuit.revisit_interval_days)} />
        <PursuitMetadataButton active={activeQuickEdit === "tags"} label="Tags" onClick={() => openQuickEdit("tags")} toneClassName={pursuitTags.length > 0 ? TASK_TABLE_TAG_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS} value={pursuitTags.length > 0 ? pursuitTags.map((tag) => `#${tag}`).join(" ") : "No tags"} />
        <PursuitMetadataButton active={activeQuickEdit === "notes"} label="Notes" onClick={() => openQuickEdit("notes")} toneClassName={pursuit.notes?.trim() ? TASK_TABLE_LIST_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS} value={pursuit.notes?.trim() ? "Notes" : "No notes"} />
        <AdhdChip aria-label="Edit Lifecycle" className={activeQuickEdit === "status" ? "ring-2 ring-[#cfc2fb] ring-offset-1" : undefined} onClick={(event) => { event.stopPropagation(); openQuickEdit("status"); }} onPointerDown={(event) => event.stopPropagation()} tone={statusTone(pursuit.status)}>{statusLabel(pursuit.status)}</AdhdChip>
      </div> : null}
      {activeQuickEdit && onUpdatePursuit ? <PursuitQuickEditPanel mode={activeQuickEdit} onClose={() => setActiveQuickEdit(null)} onUpdatePursuit={onUpdatePursuit} pursuit={pursuit} /> : null}
    </article>
  );
}
