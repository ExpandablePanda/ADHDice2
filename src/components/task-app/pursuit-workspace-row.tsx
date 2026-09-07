"use client";

import { CheckCircle2, Compass } from "lucide-react";
import { AdhdChip, AdhdIconButton } from "@/components/ui-system";
import { TASK_TABLE_CONTROL_FONT_CLASS, TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS } from "@/components/ui/task-table-primitives";
import type { Pursuit } from "@/lib/database.types";
import {
  formatPursuitAttentionReason,
  formatPursuitLastCompletion,
  formatPursuitTargetLabel,
  type PursuitAttention,
} from "@/lib/pursuit-domain";
import { TASK_TABLE_GRID_ORIGIN_CLASS } from "@/lib/task-table-alignment";

export type PursuitWorkspaceRowProps = {
  attention?: PursuitAttention;
  depth: number;
  onMarkDoneToday: (pursuitId: string) => void;
  onOpen: (pursuitId: string) => void;
  pursuit: Pursuit;
  timezone: string;
};

function statusTone(status: Pursuit["status"]) {
  if (status === "active") return "progress" as const;
  if (status === "paused") return "notDue" as const;
  return "archived" as const;
}

function statusLabel(status: Pursuit["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function summaryLabel(attention?: PursuitAttention) {
  const summary = attention?.completionSummary;
  if (!summary) return "Never done";
  const streak = summary.currentStreak > 0 ? ` · Streak ${summary.currentStreak}` : "";
  return `${formatPursuitLastCompletion(summary)}${streak}`;
}

function targetLabel(attention: PursuitAttention | undefined, timezone: string) {
  return attention?.needsAttention
    ? formatPursuitAttentionReason(attention, timezone)
    : formatPursuitTargetLabel(attention?.nextTargetLogicalDay, attention?.todayKey, timezone);
}

function DoneTodayButton({ attention, onMarkDoneToday, pursuit }: Pick<PursuitWorkspaceRowProps, "attention" | "onMarkDoneToday" | "pursuit">) {
  const completedToday = attention?.completionSummary.completedToday ?? false;
  return (
    <AdhdIconButton
      aria-label={completedToday ? `Clear ${pursuit.title} done today` : `Mark ${pursuit.title} done today`}
      disabled={pursuit.status !== "active"}
      onClick={(event) => {
        event.stopPropagation();
        onMarkDoneToday(pursuit.id);
      }}
      selected={completedToday}
      size="sm"
      title={completedToday ? "Clear done today" : "Mark done today"}
      tone="purple"
      variant="rowToolbar"
    >
      <CheckCircle2 />
    </AdhdIconButton>
  );
}

function PursuitTitle({
  attention,
  depth,
  onMarkDoneToday,
  onOpen,
  pursuit,
  showIdentityIcon,
  timezone,
}: PursuitWorkspaceRowProps & { showIdentityIcon: boolean }) {
  return (
    <div className="flex min-w-0 items-start gap-1.5" style={{ paddingLeft: `${Math.min(depth, 8) * 18}px` }}>
      {showIdentityIcon ? <Compass aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#6f57f6] dark:text-[#cabfff]" /> : null}
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1">
          <button
            className={`${TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS} min-w-0 max-w-full appearance-none border-0 bg-transparent p-0 text-left shadow-none outline-none transition hover:text-[#6f57f6] focus-visible:rounded-[0.5rem] focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 dark:hover:text-[#cabfff] dark:focus-visible:ring-[#3b2f68]/90`}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(pursuit.id);
            }}
            type="button"
          >
            <span className="break-words">{pursuit.title}</span>
          </button>
          <DoneTodayButton attention={attention} onMarkDoneToday={onMarkDoneToday} pursuit={pursuit} />
        </div>
        <div className={`${TASK_TABLE_CONTROL_FONT_CLASS} mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] font-medium leading-none text-[#827a97] dark:text-white/52`}>
          <AdhdChip tone="purple">Pursuit</AdhdChip>
          <AdhdChip tone={statusTone(pursuit.status)}>{statusLabel(pursuit.status)}</AdhdChip>
          <span className="truncate">{summaryLabel(attention)}</span>
          <span className="truncate">{targetLabel(attention, timezone)}</span>
        </div>
      </div>
    </div>
  );
}

export function PursuitTableWorkspaceRow({
  attention,
  columns,
  depth,
  gridTemplateColumns,
  onMarkDoneToday,
  onOpen,
  pursuit,
  timezone,
}: PursuitWorkspaceRowProps & { columns: ReadonlyArray<string>; gridTemplateColumns: string }) {
  return (
    <div
      className={`${TASK_TABLE_CONTROL_FONT_CLASS} block w-max min-w-full rounded-[1.15rem] text-center`}
      data-pursuit-row={pursuit.id}
      onClick={() => onOpen(pursuit.id)}
    >
      <div
        className={`${TASK_TABLE_GRID_ORIGIN_CLASS} grid w-max min-w-full items-center gap-0 rounded-[1.15rem] border border-transparent bg-transparent py-0.5 pl-[3px] pr-0 text-center transition hover:shadow-[0_18px_40px_rgba(109,61,208,0.10)] dark:bg-transparent`}
        style={{ gridTemplateColumns }}
      >
        {columns.map((columnId) => {
          if (columnId === "status_icon") {
            return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden" key={`${pursuit.id}-${columnId}`}><Compass aria-label="Pursuit" className="h-4 w-4 text-[#6f57f6] dark:text-[#cabfff]" role="img" /></div>;
          }
          if (columnId === "title") {
            return <div className="flex min-h-full min-w-0 items-center overflow-hidden px-1 text-left" key={`${pursuit.id}-${columnId}`}><PursuitTitle attention={attention} depth={depth} onMarkDoneToday={onMarkDoneToday} onOpen={onOpen} pursuit={pursuit} showIdentityIcon={false} timezone={timezone} /></div>;
          }
          if (columnId === "notes") {
            return <div className="flex min-h-full min-w-0 items-center overflow-hidden px-1 text-left" key={`${pursuit.id}-${columnId}`}><span className="truncate text-xs text-[#827a97] dark:text-white/52">{pursuit.notes?.trim() || "—"}</span></div>;
          }
          if (columnId === "last_done") {
            return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><span className="text-xs text-[#827a97] dark:text-white/52">{summaryLabel(attention)}</span></div>;
          }
          if (columnId === "status") {
            return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><AdhdChip tone={statusTone(pursuit.status)}>{statusLabel(pursuit.status)}</AdhdChip></div>;
          }
          if (columnId === "tags") {
            return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><span className="text-xs text-[#827a97] dark:text-white/52">{attention?.needsAttention ? "Needs attention" : "—"}</span></div>;
          }
          return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><span className="text-xs text-[#aaa4b8] dark:text-white/35">—</span></div>;
        })}
      </div>
    </div>
  );
}

export function PursuitListWorkspaceRow({ attention, depth, onMarkDoneToday, onOpen, pursuit, timezone }: PursuitWorkspaceRowProps) {
  return (
    <article
      className="cursor-pointer rounded-[1.35rem] border border-[#e7e0f7] bg-[#fbfaff] p-3 shadow-[0_12px_30px_rgba(81,61,168,0.04)] dark:border-white/10 dark:bg-white/[0.03]"
      data-pursuit-row={pursuit.id}
      onClick={() => onOpen(pursuit.id)}
      style={{ marginLeft: `${Math.min(depth, 8) * 18}px` }}
    >
      <PursuitTitle attention={attention} depth={0} onMarkDoneToday={onMarkDoneToday} onOpen={onOpen} pursuit={pursuit} showIdentityIcon timezone={timezone} />
    </article>
  );
}
