"use client";

import { CheckCircle2, Compass } from "lucide-react";
import { AdhdChip, AdhdIconButton } from "@/components/ui-system";
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
import type { Pursuit } from "@/lib/database.types";
import {
  formatPursuitAttentionReason,
  formatPursuitLastCompletionDate,
  formatPursuitRevisitCadence,
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
  variant,
}: PursuitWorkspaceRowProps & { showIdentityIcon: boolean; variant: "list" | "table" }) {
  return (
    <div
      className="flex min-w-0 items-center gap-1.5"
      style={showIdentityIcon ? undefined : { paddingLeft: `${Math.min(depth, 8) * 18}px` }}
    >
      {showIdentityIcon ? <Compass aria-hidden="true" className="h-4 w-4 shrink-0 text-[#6f57f6] dark:text-[#cabfff]" /> : null}
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1">
          <button
            className="min-w-0 max-w-full flex-[0_1_auto] appearance-none border-0 bg-transparent p-0 text-left shadow-none outline-none transition hover:opacity-85 focus-visible:rounded-[0.5rem] focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 dark:focus-visible:ring-[#3b2f68]/90"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(pursuit.id);
            }}
            type="button"
          >
            <p className={`${TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS} min-w-0 whitespace-normal break-normal ${variant === "list" ? "leading-6" : ""}`}>
              {pursuit.title}
            </p>
          </button>
          <DoneTodayButton attention={attention} onMarkDoneToday={onMarkDoneToday} pursuit={pursuit} />
        </div>
      </div>
    </div>
  );
}

function neutralCell(value: string) {
  return <span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${TASK_TABLE_INACTIVE_CHIP_CLASS}`}>{value}</span>;
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
  const lastDone = attention ? formatPursuitLastCompletionDate(attention.completionSummary, timezone) : "Never done";
  const pursuitTags = pursuit.tags ?? [];
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
            return <div className="flex min-h-full min-w-0 items-center overflow-hidden pl-[5px] pr-1 text-left" key={`${pursuit.id}-${columnId}`}><PursuitTitle attention={attention} depth={depth} onMarkDoneToday={onMarkDoneToday} onOpen={onOpen} pursuit={pursuit} showIdentityIcon={false} variant="table" timezone={timezone} /></div>;
          }
          if (columnId === "due") {
            const hasTarget = Boolean(attention?.nextTargetLogicalDay);
            return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${hasTarget ? TASK_TABLE_LIST_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}`}>{hasTarget ? targetLabel(attention, timezone) : "No target"}</span></div>;
          }
          if (columnId === "repeat") {
            const hasCadence = Boolean(pursuit.revisit_interval_days && pursuit.revisit_interval_days > 0);
            return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${hasCadence ? TASK_TABLE_LIST_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}`}>{formatPursuitRevisitCadence(pursuit.revisit_interval_days)}</span></div>;
          }
          if (columnId === "last_done") {
            return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${attention?.completionSummary.lastCompletedLogicalDay ? TASK_TABLE_LIST_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}`}>{lastDone}</span></div>;
          }
          if (columnId === "status") {
            return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><AdhdChip tone={statusTone(pursuit.status)}>{statusLabel(pursuit.status)}</AdhdChip></div>;
          }
          if (columnId === "tags") {
            return <div className="flex min-h-full min-w-0 items-center justify-center gap-2 overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}>{pursuitTags.length > 0 ? pursuitTags.map((tag, index) => <span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${TASK_TABLE_TAG_CHIP_CLASS}`} key={`${pursuit.id}-tag-${tag}-${index}`}>#{tag}</span>) : neutralCell("—")}</div>;
          }
          if (columnId === "date_added") {
            return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${TASK_TABLE_LIST_CHIP_CLASS}`}>{formatTaskTableEntryTimestamp(pursuit.created_at)}</span></div>;
          }
          if (columnId === "streak") {
            return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}>{attention?.completionSummary.currentStreak ? <TaskCurrentStreakChip currentStreak={attention.completionSummary.currentStreak} /> : neutralCell("—")}</div>;
          }
          if (columnId === "notes") {
            return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}><span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${pursuit.notes?.trim() ? TASK_TABLE_LIST_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}`}>{pursuit.notes?.trim() ? "Notes" : "No notes"}</span></div>;
          }
          return <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}>{neutralCell("—")}</div>;
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
      <PursuitTitle attention={attention} depth={0} onMarkDoneToday={onMarkDoneToday} onOpen={onOpen} pursuit={pursuit} showIdentityIcon variant="list" timezone={timezone} />
    </article>
  );
}
