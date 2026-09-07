"use client";

import { Infinity as InfinityIcon, Sparkles } from "lucide-react";
import { AdhdChip, AdhdIconButton } from "@/components/ui-system";
import type { Pursuit } from "@/lib/database.types";
import { formatPursuitAttentionReason, formatPursuitLastActivity, type PursuitAttention } from "@/lib/pursuit-domain";

export type PursuitWorkspaceRowProps = {
  attention?: PursuitAttention;
  depth: number;
  onLogActivity: (pursuitId: string) => void;
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

function PursuitTitle({ attention, depth, onOpen, pursuit, timezone }: Omit<PursuitWorkspaceRowProps, "onLogActivity">) {
  return (
    <div className="flex min-w-0 items-start gap-2" style={{ paddingLeft: `${Math.min(depth, 8) * 18}px` }}>
      <InfinityIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#6f57f6] dark:text-[#cabfff]" />
      <div className="min-w-0">
        <button
          className="block max-w-full text-left text-sm font-semibold text-[#3f3855] hover:text-[#6f57f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9a8ff] dark:text-white/86 dark:hover:text-[#cabfff]"
          onClick={() => onOpen(pursuit.id)}
          type="button"
        >
          <span className="break-words">{pursuit.title}</span>
        </button>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-[#827a97] dark:text-white/52">
          <AdhdChip tone="purple">Pursuit</AdhdChip>
          <AdhdChip tone={statusTone(pursuit.status)}>{statusLabel(pursuit.status)}</AdhdChip>
          {attention ? <span>{formatPursuitAttentionReason(attention)}</span> : null}
          <span>· {attention?.activityCount ?? 0} session{attention?.activityCount === 1 ? "" : "s"}</span>
        </div>
        <p className="mt-1 truncate text-xs text-[#9690a8] dark:text-white/42">
          {attention ? formatPursuitLastActivity(attention, timezone) : "No activity yet"}
          {pursuit.revisit_interval_days === null ? " · No automatic target" : ` · Target ${pursuit.revisit_interval_days} days`}
        </p>
      </div>
    </div>
  );
}

export function PursuitTableWorkspaceRow({
  attention,
  columns,
  depth,
  gridTemplateColumns,
  onLogActivity,
  onOpen,
  pursuit,
  timezone,
}: PursuitWorkspaceRowProps & {
  columns: ReadonlyArray<string>;
  gridTemplateColumns: string;
}) {
  return (
    <div className="w-max min-w-full cursor-pointer rounded-[1.15rem] border border-transparent bg-[#fbfaff] py-1.5 dark:bg-white/[0.03]" data-pursuit-row={pursuit.id} onClick={() => onOpen(pursuit.id)}>
      <div className="grid w-max min-w-full items-center gap-0 pl-[3px] pr-0 text-center" style={{ gridTemplateColumns: `${gridTemplateColumns} 2.5rem` }}>
        {columns.map((columnId) => {
          if (columnId === "status_icon") {
            return (
              <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden" key={`${pursuit.id}-${columnId}`}>
                <InfinityIcon aria-label="Pursuit" className="h-4 w-4 text-[#6f57f6] dark:text-[#cabfff]" role="img" />
              </div>
            );
          }
          if (columnId === "title") {
            return (
              <div className="flex min-h-full min-w-0 items-center overflow-hidden px-1 text-left" key={`${pursuit.id}-${columnId}`}>
                <PursuitTitle attention={attention} depth={depth} onOpen={onOpen} pursuit={pursuit} timezone={timezone} />
              </div>
            );
          }
          if (columnId === "notes") {
            return (
              <div className="flex min-h-full min-w-0 items-center overflow-hidden px-1 text-left" key={`${pursuit.id}-${columnId}`}>
                <span className="truncate text-xs text-[#827a97] dark:text-white/52">{pursuit.notes?.trim() || "—"}</span>
              </div>
            );
          }
          if (columnId === "last_done") {
            return (
              <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}>
                <span className="text-xs text-[#827a97] dark:text-white/52">{attention?.lastActivityAt ? formatPursuitLastActivity(attention, timezone) : "—"}</span>
              </div>
            );
          }
          if (columnId === "status") {
            return (
              <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}>
                <AdhdChip tone={statusTone(pursuit.status)}>{statusLabel(pursuit.status)}</AdhdChip>
              </div>
            );
          }
          if (columnId === "tags") {
            return (
              <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}>
                <span className="text-xs text-[#827a97] dark:text-white/52">{attention?.needsAttention ? "Needs attention" : "—"}</span>
              </div>
            );
          }
          return (
            <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1" key={`${pursuit.id}-${columnId}`}>
              <span className="text-xs text-[#aaa4b8] dark:text-white/35">—</span>
            </div>
          );
        })}
        <div className="flex min-h-full min-w-0 items-center justify-center overflow-hidden px-1">
          <AdhdIconButton aria-label={`Log activity for ${pursuit.title}`} onClick={(event) => { event.stopPropagation(); onLogActivity(pursuit.id); }} size="sm" tone="purple" variant="rowToolbar">
            <Sparkles />
          </AdhdIconButton>
        </div>
      </div>
    </div>
  );
}

export function PursuitListWorkspaceRow({ attention, depth, onLogActivity, onOpen, pursuit, timezone }: PursuitWorkspaceRowProps) {
  return (
    <article className="cursor-pointer rounded-[1.35rem] border border-[#e7e0f7] bg-[#fbfaff] p-4 shadow-[0_12px_30px_rgba(81,61,168,0.04)] dark:border-white/10 dark:bg-white/[0.03]" data-pursuit-row={pursuit.id} onClick={() => onOpen(pursuit.id)} style={{ marginLeft: `${Math.min(depth, 8) * 18}px` }}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <PursuitTitle attention={attention} depth={0} onOpen={onOpen} pursuit={pursuit} timezone={timezone} />
        <AdhdIconButton aria-label={`Log activity for ${pursuit.title}`} onClick={(event) => { event.stopPropagation(); onLogActivity(pursuit.id); }} size="sm" tone="purple" variant="rowToolbar">
          <Sparkles />
        </AdhdIconButton>
      </div>
    </article>
  );
}
