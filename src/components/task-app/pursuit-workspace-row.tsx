"use client";

import { useState } from "react";
import { CalendarDays, Compass, Ellipsis, Footprints, Pencil, Save, X } from "lucide-react";
import { AdhdChip, AdhdDropdownPanel, AdhdIconButton } from "@/components/ui-system";
import {
  formatTaskTableEntryTimestamp,
  TASK_TABLE_CHIP_BASE_CLASS,
  TASK_TABLE_CONTROL_FONT_CLASS,
  TASK_TABLE_INACTIVE_CHIP_CLASS,
  TASK_TABLE_LIST_CHIP_CLASS,
  TASK_TABLE_TAG_CHIP_CLASS,
  TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS,
  TaskCurrentStreakChip,
} from "@/components/ui/task-table-primitives";
import type { Pursuit, PursuitUpdate } from "@/lib/database.types";
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

export function PursuitCompletionControl({
  attention,
  onMarkDoneToday,
  onRemoveCompletionOnLogicalDay,
  pursuit,
  todayKey,
}: Pick<PursuitWorkspaceRowProps, "attention" | "onMarkDoneToday" | "onRemoveCompletionOnLogicalDay" | "pursuit" | "todayKey">) {
  const [isOpen, setIsOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const completedToday = attention?.completionSummary.completedToday ?? false;
  const disabled = pursuit.status !== "active";
  const iconClass = disabled ? MUTED_ICON_CLASS : completedToday ? GREEN_ICON_CLASS : attention?.needsAttention ? YELLOW_ICON_CLASS : undefined;

  return (
    <div className="relative" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <AdhdIconButton
        aria-label={completedToday ? `Clear ${pursuit.title} done today` : `Mark ${pursuit.title} done today`}
        className={iconClass}
        disabled={disabled}
        onClick={() => {
          if (completedToday) {
            onRemoveCompletionOnLogicalDay?.(pursuit.id, todayKey);
            return;
          }
          setIsOpen((current) => !current);
        }}
        aria-pressed={completedToday}
        size="sm"
        title={completedToday ? "Clear done today" : "Mark done today"}
        variant="rowToolbar"
      >
        <Compass />
      </AdhdIconButton>
      {isOpen ? (
        <AdhdDropdownPanel aria-label={`Complete ${pursuit.title}`} className="right-0 top-[calc(100%+0.35rem)] w-64 p-3" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[#4e4865] dark:text-white/80">Mark done today</p>
            <AdhdIconButton aria-label="Close completion note" onClick={() => setIsOpen(false)} size="sm" variant="rowToolbar"><X /></AdhdIconButton>
          </div>
          <textarea
            aria-label="Completion note"
            className="mt-2 min-h-16 w-full resize-y rounded-[0.75rem] border border-[#e5e0f5] bg-white px-2.5 py-2 text-xs text-[#4e4865] outline-none focus:border-[#b9a8ff] focus:ring-2 focus:ring-[#d9d0ff]/45 dark:border-white/15 dark:bg-white/[0.05] dark:text-white/80"
            onChange={(event) => setNotes(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            placeholder="Optional note for today"
            value={notes}
          />
          <button className="mt-2 inline-flex min-h-8 w-full items-center justify-center gap-1.5 rounded-full border border-[#6f57f6] bg-[#6f57f6] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#5f45f0]" onClick={() => { void onMarkDoneToday(pursuit.id, notes); setNotes(""); setIsOpen(false); }} type="button">
            <Compass className="h-3.5 w-3.5" />Confirm completion
          </button>
        </AdhdDropdownPanel>
      ) : null}
    </div>
  );
}

function PursuitQuickMetadata({ onUpdatePursuit, pursuit }: Pick<PursuitWorkspaceRowProps, "onUpdatePursuit" | "pursuit">) {
  const [isOpen, setIsOpen] = useState(false);
  const [tagsDraft, setTagsDraft] = useState((pursuit.tags ?? []).join(", "));
  const [revisitDraft, setRevisitDraft] = useState(pursuit.revisit_interval_days?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);

  if (!onUpdatePursuit) return null;
  const save = async () => {
    const revisitInterval = revisitDraft.trim() ? Number.parseInt(revisitDraft, 10) : null;
    if (revisitInterval !== null && (!Number.isInteger(revisitInterval) || revisitInterval <= 0)) {
      setError("Use a positive whole number or leave blank.");
      return;
    }
    setError(null);
    const result = await onUpdatePursuit(pursuit.id, {
      revisit_interval_days: revisitInterval,
      tags: Array.from(new Set(tagsDraft.split(",").map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean))),
    });
    if (result) setIsOpen(false);
  };

  return (
    <div className="relative">
      <AdhdIconButton aria-expanded={isOpen} aria-label={`Quick metadata for ${pursuit.title}`} onClick={(event) => { event.stopPropagation(); setIsOpen((current) => !current); }} size="sm" title="Quick metadata" variant="rowToolbar"><Ellipsis /></AdhdIconButton>
      {isOpen ? (
        <AdhdDropdownPanel aria-label={`Quick metadata for ${pursuit.title}`} className="right-0 top-[calc(100%+0.35rem)] w-64 p-3" onClick={(event) => event.stopPropagation()}>
          <p className="text-xs font-semibold text-[#4e4865] dark:text-white/80">Quick metadata</p>
          <label className="mt-2 block text-[11px] font-semibold text-[#655d7d] dark:text-white/68">Tags<input className="mt-1 h-8 w-full rounded-[0.7rem] border border-[#e5e0f5] bg-white px-2.5 text-xs text-[#4e4865] outline-none focus:border-[#b9a8ff] dark:border-white/15 dark:bg-white/[0.05] dark:text-white/80" onChange={(event) => setTagsDraft(event.target.value)} value={tagsDraft} /></label>
          <label className="mt-2 block text-[11px] font-semibold text-[#655d7d] dark:text-white/68">Revisit target (days)<input className="mt-1 h-8 w-full rounded-[0.7rem] border border-[#e5e0f5] bg-white px-2.5 text-xs text-[#4e4865] outline-none focus:border-[#b9a8ff] dark:border-white/15 dark:bg-white/[0.05] dark:text-white/80" min="1" onChange={(event) => setRevisitDraft(event.target.value)} type="number" value={revisitDraft} /></label>
          {error ? <p className="mt-2 text-[11px] text-[#a24e67]">{error}</p> : null}
          <button className="mt-2 inline-flex min-h-8 w-full items-center justify-center gap-1.5 rounded-full border border-[#ddd2ff] bg-[#f1ecff] px-3 py-1.5 text-xs font-semibold text-[#6f57f6]" onClick={() => { void save(); }} type="button"><Save className="h-3.5 w-3.5" />Save</button>
        </AdhdDropdownPanel>
      ) : null}
    </div>
  );
}

function PursuitRowActions({ onCreateChildPursuit, onOpen, onOpenCalendar, onUpdatePursuit, pursuit }: Pick<PursuitWorkspaceRowProps, "onCreateChildPursuit" | "onOpen" | "onOpenCalendar" | "onUpdatePursuit" | "pursuit">) {
  return (
    <div className="flex shrink-0 items-center gap-0.5" data-pursuit-row-actions="true" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      {onCreateChildPursuit ? <AdhdIconButton aria-label={`Add child Pursuit to ${pursuit.title}`} onClick={() => onCreateChildPursuit(pursuit.id)} size="sm" title="Add child Pursuit" variant="rowToolbar"><Footprints /></AdhdIconButton> : null}
      {onOpenCalendar ? <AdhdIconButton aria-label={`Open calendar for ${pursuit.title}`} onClick={() => onOpenCalendar(pursuit.id)} size="sm" title="Open calendar" variant="rowToolbar"><CalendarDays /></AdhdIconButton> : null}
      <PursuitQuickMetadata onUpdatePursuit={onUpdatePursuit} pursuit={pursuit} />
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
  const lastDone = attention ? formatPursuitLastCompletionDate(attention.completionSummary, timezone) : "Never done";
  const pursuitTags = pursuit.tags ?? [];
  return (
    <div className={`${TASK_TABLE_CONTROL_FONT_CLASS} relative block w-max min-w-full rounded-[1.15rem] text-center`} data-pursuit-row={pursuit.id} onClick={() => onOpen(pursuit.id)}>
      <div className={`${TASK_TABLE_GRID_ORIGIN_CLASS} grid w-max min-w-full items-center gap-0 rounded-[1.15rem] border border-transparent bg-transparent py-0.5 pl-[3px] pr-0 text-center transition hover:shadow-[0_18px_40px_rgba(109,61,208,0.10)] dark:bg-transparent`} style={{ gridTemplateColumns }}>
        {columns.map((columnId) => {
          if (columnId === "status_icon") return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden" key={`${pursuit.id}-${columnId}`}><PursuitCompletionControl attention={attention} onMarkDoneToday={onMarkDoneToday} onRemoveCompletionOnLogicalDay={onRemoveCompletionOnLogicalDay} pursuit={pursuit} todayKey={todayKey} /></div>;
          if (columnId === "title") return <div className="flex min-h-full min-w-0 items-center overflow-hidden pl-[5px] pr-1 text-left" key={`${pursuit.id}-${columnId}`}><PursuitTitle attention={attention} depth={depth} onMarkDoneToday={onMarkDoneToday} onOpen={onOpen} onRemoveCompletionOnLogicalDay={onRemoveCompletionOnLogicalDay} pursuit={pursuit} showIdentityIcon={false} timezone={timezone} todayKey={todayKey} variant="table" /><PursuitRowActions onCreateChildPursuit={onCreateChildPursuit} onOpen={onOpen} onOpenCalendar={onOpenCalendar} onUpdatePursuit={onUpdatePursuit} pursuit={pursuit} /></div>;
          if (columnId === "due") {
            const hasTarget = Boolean(attention?.nextTargetLogicalDay);
            return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${hasTarget ? attention?.needsAttention ? YELLOW_CHIP_CLASS : TASK_TABLE_LIST_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}`}>{targetLabel(attention, timezone)}</span></div>;
          }
          if (columnId === "repeat") {
            const hasCadence = Boolean(pursuit.revisit_interval_days && pursuit.revisit_interval_days > 0);
            return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${hasCadence ? TASK_TABLE_LIST_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}`}>{formatPursuitRevisitCadence(pursuit.revisit_interval_days)}</span></div>;
          }
          if (columnId === "last_done") return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${attention?.completionSummary.lastCompletedLogicalDay ? GREEN_COMPLETION_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}`}>{lastDone}</span></div>;
          if (columnId === "status") return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><AdhdChip tone={statusTone(pursuit.status)}>{statusLabel(pursuit.status)}</AdhdChip></div>;
          if (columnId === "tags") return <div className="flex min-h-full min-w-0 items-center justify-center gap-2 overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}>{pursuitTags.length > 0 ? pursuitTags.map((tag, index) => <span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${TASK_TABLE_TAG_CHIP_CLASS}`} key={`${pursuit.id}-tag-${tag}-${index}`}>#{tag}</span>) : neutralCell("—")}</div>;
          if (columnId === "date_added") return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${TASK_TABLE_LIST_CHIP_CLASS}`}>{formatTaskTableEntryTimestamp(pursuit.created_at)}</span></div>;
          if (columnId === "streak") return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}>{attention?.completionSummary.currentStreak ? <TaskCurrentStreakChip currentStreak={attention.completionSummary.currentStreak} /> : neutralCell("—")}</div>;
          if (columnId === "notes") return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${pursuit.notes?.trim() ? TASK_TABLE_LIST_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}`}>{pursuit.notes?.trim() ? "Notes" : "No notes"}</span></div>;
          return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}>{neutralCell("—")}</div>;
        })}
      </div>
    </div>
  );
}

export function PursuitListWorkspaceRow({ attention, depth, onCreateChildPursuit, onMarkDoneToday, onOpen, onOpenCalendar, onRemoveCompletionOnLogicalDay, onUpdatePursuit, pursuit, timezone, todayKey }: PursuitWorkspaceRowProps) {
  return (
    <article className="relative cursor-pointer rounded-[1.35rem] border border-[#e7e0f7] bg-[#fbfaff] p-3 shadow-[0_12px_30px_rgba(81,61,168,0.04)] dark:border-white/10 dark:bg-white/[0.03]" data-pursuit-row={pursuit.id} onClick={() => onOpen(pursuit.id)} style={{ marginLeft: `${Math.min(depth, 8) * 18}px` }}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <PursuitTitle attention={attention} depth={0} onMarkDoneToday={onMarkDoneToday} onOpen={onOpen} onRemoveCompletionOnLogicalDay={onRemoveCompletionOnLogicalDay} pursuit={pursuit} showIdentityIcon timezone={timezone} todayKey={todayKey} variant="list" />
        <PursuitRowActions onCreateChildPursuit={onCreateChildPursuit} onOpen={onOpen} onOpenCalendar={onOpenCalendar} onUpdatePursuit={onUpdatePursuit} pursuit={pursuit} />
      </div>
    </article>
  );
}
