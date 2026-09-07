"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Pencil, Plus, Sparkles } from "lucide-react";
import { ModalShell } from "@/components/modal-shell";
import { AdhdCard, AdhdChip, AdhdIconButton, AdhdPanel } from "@/components/ui-system";
import type { Pursuit, PursuitActivity, PursuitStatus, PursuitUpdate, Task } from "@/lib/database.types";
import {
  canSetPursuitParent,
  formatPursuitAttentionReason,
  formatPursuitLastActivity,
  getPursuitDepth,
  sortPursuitsByAttention,
  sortPursuitsForManagement,
  type PursuitAttention,
} from "@/lib/pursuit-domain";
import type { PursuitActivityInput, PursuitCreateInput } from "@/hooks/usePursuits";

export type PursuitsWorkspaceProps = {
  attentionMap: ReadonlyMap<string, PursuitAttention>;
  error: string | null;
  isLoading: boolean;
  onCreate: (input: PursuitCreateInput) => Promise<Pursuit | null>;
  onLogActivity: (input: PursuitActivityInput) => Promise<PursuitActivity | null>;
  onRefresh: () => Promise<boolean>;
  onUpdate: (pursuitId: string, input: PursuitUpdate) => Promise<Pursuit | null>;
  pursuits: Pursuit[];
  taskOptions: Array<Pick<Task, "id" | "title">>;
  timezone: string;
};

const INPUT_CLASS = "mt-1 w-full rounded-[0.9rem] border border-[#e6e0f4] bg-white px-3 py-2 text-sm text-[#4e4865] outline-none transition focus:border-[#b9a8ff] focus:ring-2 focus:ring-[#d9d0ff]/45 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/80";
const SECONDARY_BUTTON_CLASS = "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-full border border-[#e5def4] bg-white px-3 py-1.5 text-xs font-semibold text-[#6e6686] transition hover:border-[#cfc2fb] hover:text-[#6f57f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9a8ff] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70 dark:hover:border-white/20 dark:hover:text-[#cabfff]";
const PRIMARY_BUTTON_CLASS = "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-full border border-[#6f57f6] bg-[#6f57f6] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#5f45f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9a8ff] dark:border-[#c9bbff] dark:bg-[#c9bbff] dark:text-[#1a1431]";

function formatStatusLabel(status: PursuitStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getStatusTone(status: PursuitStatus) {
  if (status === "active") return "progress" as const;
  if (status === "paused") return "notDue" as const;
  return "archived" as const;
}

export function PursuitsWorkspace({
  attentionMap,
  error,
  isLoading,
  onCreate,
  onLogActivity,
  onRefresh,
  onUpdate,
  pursuits,
  taskOptions,
  timezone,
}: PursuitsWorkspaceProps) {
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [showAllAttention, setShowAllAttention] = useState(false);
  const [editingPursuitId, setEditingPursuitId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loggingPursuitId, setLoggingPursuitId] = useState<string | null>(null);
  const attentionRows = useMemo(() => sortPursuitsByAttention(Array.from(attentionMap.values())), [attentionMap]);
  const visibleAttentionRows = showAllAttention ? attentionRows : attentionRows.slice(0, 3);
  const managementRows = useMemo(() => sortPursuitsForManagement(pursuits), [pursuits]);
  const pursuitsById = useMemo(() => new Map(pursuits.map((pursuit) => [pursuit.id, pursuit])), [pursuits]);
  const editingPursuit = editingPursuitId ? pursuitsById.get(editingPursuitId) ?? null : null;
  const loggingPursuit = loggingPursuitId ? pursuitsById.get(loggingPursuitId) ?? null : null;

  return (
    <AdhdPanel
      className="min-w-0"
      title="Pursuits"
      subtitle="Ongoing interests and skills, with activity-based revisit targets."
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <AdhdChip count={pursuits.length} tone="purple">Tracked</AdhdChip>
          {attentionRows.length > 0 ? <AdhdChip count={attentionRows.length} tone="missed">Needs attention</AdhdChip> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={SECONDARY_BUTTON_CLASS} onClick={() => setIsManagerOpen((current) => !current)} type="button">
            {isManagerOpen ? "Hide manager" : "Manage pursuits"}
          </button>
          <button className={PRIMARY_BUTTON_CLASS} onClick={() => setIsCreating(true)} type="button">
            <Plus className="h-3.5 w-3.5" />
            New Pursuit
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-[0.95rem] border border-[#f1d7de] bg-[#fff5f7] px-3 py-2 text-xs leading-5 text-[#a24e67] dark:border-[#5b2e3b] dark:bg-[#32161d] dark:text-[#ffb5c3]">
          {error}
        </div>
      ) : null}

      {isLoading && pursuits.length === 0 ? (
        <p className="mt-4 text-sm text-[#817993] dark:text-white/55">Loading Pursuits...</p>
      ) : attentionRows.length === 0 ? (
        <div className="mt-4 rounded-[1rem] border border-dashed border-[#ded6f3] bg-[#fbfaff] px-4 py-4 text-sm text-[#766f8d] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/58">
          No active Pursuits need attention right now. Create one or set a revisit target to make it part of this workspace.
        </div>
      ) : (
        <div className="mt-4 grid gap-2">
          {visibleAttentionRows.map((row) => (
            <PursuitAttentionRow
              key={row.pursuit.id}
              onEdit={() => setEditingPursuitId(row.pursuit.id)}
              onLogActivity={() => setLoggingPursuitId(row.pursuit.id)}
              row={row}
              timezone={timezone}
            />
          ))}
          {attentionRows.length > 3 ? (
            <button className="justify-self-start px-1 text-xs font-semibold text-[#6f57f6] hover:underline dark:text-[#c9bbff]" onClick={() => setShowAllAttention((current) => !current)} type="button">
              {showAllAttention ? "Show top 3" : `Show ${attentionRows.length - 3} more`}
            </button>
          ) : null}
        </div>
      )}

      {isManagerOpen ? (
        <div className="mt-5 border-t border-[#eee9f8] pt-4 dark:border-white/10">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[#655d7d] dark:text-white/72">All Pursuits</p>
            <button className={SECONDARY_BUTTON_CLASS} onClick={() => { void onRefresh(); }} type="button">Refresh</button>
          </div>
          {managementRows.length === 0 ? (
            <p className="mt-3 text-sm text-[#817993] dark:text-white/55">No Pursuits yet.</p>
          ) : (
            <div className="mt-3 grid gap-2">
              {managementRows.map((pursuit) => {
                const row = attentionMap.get(pursuit.id);
                const depth = getPursuitDepth(pursuit, pursuitsById);
                return (
                  <AdhdCard className="!rounded-[1rem] !p-3" key={pursuit.id}>
                    <div className="flex min-w-0 items-start justify-between gap-3" style={{ paddingLeft: `${Math.min(depth, 4) * 14}px` }}>
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-[#4b455f] dark:text-white/82">{pursuit.title}</p>
                          <AdhdChip tone={getStatusTone(pursuit.status)}>{formatStatusLabel(pursuit.status)}</AdhdChip>
                        </div>
                        <p className="mt-1 text-xs text-[#827a97] dark:text-white/52">
                          {row ? `${formatPursuitLastActivity(row, timezone)} · ${row.activityCount} session${row.activityCount === 1 ? "" : "s"}` : "No activity yet"}
                          {pursuit.revisit_interval_days === null ? " · No automatic target" : ` · Every ${pursuit.revisit_interval_days} days`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <AdhdIconButton aria-label={`Log activity for ${pursuit.title}`} onClick={() => setLoggingPursuitId(pursuit.id)} size="sm" variant="rowToolbar" tone="purple"><Sparkles /></AdhdIconButton>
                        <AdhdIconButton aria-label={`Edit ${pursuit.title}`} onClick={() => setEditingPursuitId(pursuit.id)} size="sm" variant="rowToolbar"><Pencil /></AdhdIconButton>
                      </div>
                    </div>
                  </AdhdCard>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {isCreating ? (
        <PursuitEditorModal
          key="new-pursuit"
          onClose={() => setIsCreating(false)}
          onCreate={onCreate}
          onUpdate={onUpdate}
          pursuits={pursuits}
          taskOptions={taskOptions}
          timezone={timezone}
        />
      ) : null}
      {editingPursuit ? (
        <PursuitEditorModal
          key={editingPursuit.id}
          onClose={() => setEditingPursuitId(null)}
          onCreate={onCreate}
          onUpdate={onUpdate}
          pursuit={editingPursuit}
          pursuits={pursuits}
          taskOptions={taskOptions}
          timezone={timezone}
        />
      ) : null}
      {loggingPursuit ? (
        <PursuitActivityModal
          onClose={() => setLoggingPursuitId(null)}
          onLogActivity={onLogActivity}
          pursuit={loggingPursuit}
        />
      ) : null}
    </AdhdPanel>
  );
}

function PursuitAttentionRow({
  onEdit,
  onLogActivity,
  row,
  timezone,
}: {
  onEdit: () => void;
  onLogActivity: () => void;
  row: ReturnType<typeof sortPursuitsByAttention>[number];
  timezone: string;
}) {
  return (
    <AdhdCard className="!rounded-[1rem] !p-3" highlighted>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#433d56] dark:text-white/86">{row.pursuit.title}</p>
          <p className="mt-1 text-xs font-medium text-[#765eea] dark:text-[#c9bbff]">{formatPursuitAttentionReason(row)}</p>
          <p className="mt-1 text-xs text-[#827a97] dark:text-white/52">
            {formatPursuitLastActivity(row, timezone)} · {row.activityCount} session{row.activityCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button className={PRIMARY_BUTTON_CLASS} onClick={onLogActivity} type="button"><Sparkles className="h-3.5 w-3.5" />Log Activity</button>
          <AdhdIconButton aria-label={`Edit ${row.pursuit.title}`} onClick={onEdit} size="sm" variant="rowToolbar"><Pencil /></AdhdIconButton>
        </div>
      </div>
    </AdhdCard>
  );
}

export function PursuitEditorModal({
  onClose,
  onCreate,
  onLogActivity,
  onUpdate,
  pursuit = null,
  pursuits,
  taskOptions,
  initialParentTaskId = null,
}: {
  onClose: () => void;
  onCreate: PursuitsWorkspaceProps["onCreate"];
  onLogActivity?: () => void;
  onUpdate: PursuitsWorkspaceProps["onUpdate"];
  pursuit?: Pursuit | null;
  pursuits: Pursuit[];
  taskOptions: Array<Pick<Task, "id" | "title">>;
  initialParentTaskId?: string | null;
  timezone: string;
}) {
  const [title, setTitle] = useState(pursuit?.title ?? "");
  const [notes, setNotes] = useState(pursuit?.notes ?? "");
  const [parentPursuitId, setParentPursuitId] = useState(pursuit?.parent_pursuit_id ?? "");
  const [parentTaskId, setParentTaskId] = useState(pursuit?.parent_task_id ?? initialParentTaskId ?? "");
  const [parentKind, setParentKind] = useState<"none" | "pursuit" | "task">(
    pursuit?.parent_task_id || initialParentTaskId ? "task" : pursuit?.parent_pursuit_id ? "pursuit" : "none",
  );
  const [status, setStatus] = useState<PursuitStatus>(pursuit?.status ?? "active");
  const [revisitInterval, setRevisitInterval] = useState(pursuit?.revisit_interval_days?.toString() ?? "");
  const [isPending, setIsPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const pursuitsById = useMemo(() => new Map(pursuits.map((entry) => [entry.id, entry])), [pursuits]);
  const parentOptions = pursuits.filter((candidate) => (
    candidate.id !== pursuit?.id
    && canSetPursuitParent(pursuits, pursuit?.id ?? "", candidate.id)
  ));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError("Add a title before saving.");
      return;
    }
    const parsedInterval = revisitInterval.trim() ? Number.parseInt(revisitInterval, 10) : null;
    if (parsedInterval !== null && (!Number.isInteger(parsedInterval) || parsedInterval <= 0)) {
      setFormError("Revisit interval must be a positive whole number of days.");
      return;
    }
    if (parentKind === "pursuit" && parentPursuitId && !canSetPursuitParent(pursuits, pursuit?.id ?? "", parentPursuitId)) {
      setFormError("That parent would create a cycle.");
      return;
    }
    setIsPending(true);
    setFormError(null);
    const result = pursuit
      ? await onUpdate(pursuit.id, {
        notes: notes.trim() || null,
        parent_pursuit_id: parentKind === "pursuit" ? parentPursuitId || null : null,
        parent_task_id: parentKind === "task" ? parentTaskId || null : null,
        revisit_interval_days: parsedInterval,
        status,
        title: trimmedTitle,
      })
      : await onCreate({
        notes: notes.trim() || null,
        parent_pursuit_id: parentKind === "pursuit" ? parentPursuitId || null : null,
        parent_task_id: parentKind === "task" ? parentTaskId || null : null,
        revisit_interval_days: parsedInterval,
        title: trimmedTitle,
      });
    setIsPending(false);
    if (result) onClose();
  };

  return (
    <ModalShell className="adhdice-scrollbar max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[2rem] border border-[#ece8f8] bg-white p-5 shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]" label={pursuit ? "Edit Pursuit" : "New Pursuit"} onClose={isPending ? undefined : onClose}>
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#9b92be] dark:text-white/35">Pursuit</p>
            <h2 className="mt-1 text-xl font-semibold text-[#403a54] dark:text-white/88">{pursuit ? "Edit Pursuit" : "Start a Pursuit"}</h2>
          </div>
          {pursuit ? <AdhdChip tone={getStatusTone(status)}>{formatStatusLabel(status)}</AdhdChip> : null}
        </div>
        <label className="text-xs font-semibold text-[#655d7d] dark:text-white/68">Title<input className={INPUT_CLASS} onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
        <label className="text-xs font-semibold text-[#655d7d] dark:text-white/68">Notes<textarea className={`${INPUT_CLASS} min-h-20 resize-y`} onChange={(event) => setNotes(event.target.value)} value={notes} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-[#655d7d] dark:text-white/68">Parent type<select className={INPUT_CLASS} onChange={(event) => {
            const nextKind = event.target.value as "none" | "pursuit" | "task";
            setParentKind(nextKind);
            if (nextKind !== "pursuit") setParentPursuitId("");
            if (nextKind !== "task") setParentTaskId("");
          }} value={parentKind}><option value="none">None</option><option value="pursuit">Pursuit</option><option value="task">Task</option></select></label>
          {parentKind === "pursuit" ? <label className="text-xs font-semibold text-[#655d7d] dark:text-white/68">Parent Pursuit<select className={INPUT_CLASS} onChange={(event) => setParentPursuitId(event.target.value)} value={parentPursuitId}><option value="">Choose a Pursuit</option>{parentOptions.map((candidate) => <option key={candidate.id} value={candidate.id}>{getPursuitDepth(candidate, pursuitsById) > 0 ? "↳ " : ""}{candidate.title}</option>)}</select></label> : null}
          {parentKind === "task" ? <label className="text-xs font-semibold text-[#655d7d] dark:text-white/68">Parent Task<select className={INPUT_CLASS} onChange={(event) => setParentTaskId(event.target.value)} value={parentTaskId}><option value="">Choose a Task</option>{taskOptions.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label> : null}
          <label className="text-xs font-semibold text-[#655d7d] dark:text-white/68">Revisit every (days)<input className={INPUT_CLASS} min="1" onChange={(event) => setRevisitInterval(event.target.value)} placeholder="No target" type="number" value={revisitInterval} /></label>
        </div>
        {pursuit ? <label className="text-xs font-semibold text-[#655d7d] dark:text-white/68">Lifecycle<select className={INPUT_CLASS} onChange={(event) => setStatus(event.target.value as PursuitStatus)} value={status}><option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option></select></label> : null}
        {formError ? <p className="rounded-[0.9rem] bg-[#fff3f5] px-3 py-2 text-xs text-[#a24e67] dark:bg-[#32161d] dark:text-[#ffb5c3]">{formError}</p> : null}
        <div className="flex justify-end gap-2">
          <button className={SECONDARY_BUTTON_CLASS} disabled={isPending} onClick={onClose} type="button">Cancel</button>
          {pursuit && onLogActivity ? <button className={SECONDARY_BUTTON_CLASS} disabled={isPending} onClick={onLogActivity} type="button"><Sparkles className="h-3.5 w-3.5" />Log Activity</button> : null}
          <button className={PRIMARY_BUTTON_CLASS} disabled={isPending} type="submit">{isPending ? "Saving..." : "Save Pursuit"}</button>
        </div>
      </form>
    </ModalShell>
  );
}

export function PursuitActivityModal({
  onClose,
  onLogActivity,
  pursuit,
}: {
  onClose: () => void;
  onLogActivity: PursuitsWorkspaceProps["onLogActivity"];
  pursuit: Pursuit;
}) {
  const [durationMinutes, setDurationMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedMinutes = durationMinutes.trim() ? Number.parseInt(durationMinutes, 10) : null;
    if (parsedMinutes !== null && (!Number.isInteger(parsedMinutes) || parsedMinutes < 0)) {
      setFormError("Duration must be zero or more whole minutes.");
      return;
    }
    setIsPending(true);
    const result = await onLogActivity({
      duration_seconds: parsedMinutes === null ? null : parsedMinutes * 60,
      notes: notes.trim() || null,
      occurred_at: new Date().toISOString(),
      pursuit_id: pursuit.id,
    });
    setIsPending(false);
    if (result) onClose();
  };

  return (
    <ModalShell className="w-full max-w-md rounded-[2rem] border border-[#ece8f8] bg-white p-5 shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]" label={`Log activity for ${pursuit.title}`} onClose={isPending ? undefined : onClose}>
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#9b92be] dark:text-white/35">Activity</p>
          <h2 className="mt-1 text-xl font-semibold text-[#403a54] dark:text-white/88">Log {pursuit.title}</h2>
          <p className="mt-1 text-sm text-[#7d7598] dark:text-white/55">This records engagement now; it does not change any Task.</p>
        </div>
        <label className="text-xs font-semibold text-[#655d7d] dark:text-white/68">Duration (minutes)<input className={INPUT_CLASS} min="0" onChange={(event) => setDurationMinutes(event.target.value)} placeholder="Optional" type="number" value={durationMinutes} /></label>
        <label className="text-xs font-semibold text-[#655d7d] dark:text-white/68">Note<textarea className={`${INPUT_CLASS} min-h-20 resize-y`} onChange={(event) => setNotes(event.target.value)} value={notes} /></label>
        {formError ? <p className="rounded-[0.9rem] bg-[#fff3f5] px-3 py-2 text-xs text-[#a24e67] dark:bg-[#32161d] dark:text-[#ffb5c3]">{formError}</p> : null}
        <div className="flex justify-end gap-2">
          <button className={SECONDARY_BUTTON_CLASS} disabled={isPending} onClick={onClose} type="button">Cancel</button>
          <button className={PRIMARY_BUTTON_CLASS} disabled={isPending} type="submit">{isPending ? "Logging..." : "Log Activity"}</button>
        </div>
      </form>
    </ModalShell>
  );
}
