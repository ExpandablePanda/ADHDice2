"use client";

import { useMemo, useState } from "react";
import { AdhdPanel } from "@/components/ui-system/adhd-panel";
import { TaskTableChipButton } from "@/components/ui/task-table-primitives";
import { useRecords } from "@/hooks/useRecords";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import { RECORD_METRICS, type PersistedRecordCurrent, type PersistedRecordEvent, type ProvisionalRecordCandidate, type RecordUnit } from "@/lib/records/types";

type RecordsTabProps = {
  active: boolean;
  client: ReturnType<typeof createBrowserSupabaseClient>;
  logicalDayStart: string;
  timezone: string;
  userId: string | null;
};

function formatValue(value: number, unit: RecordUnit) {
  if (unit !== "seconds") return `${value.toLocaleString()} ${unit}`;
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatPeriod(record: { credited_date?: string; creditedDate?: string; period_end?: string | null; period_start?: string | null; periodEnd?: string | null; periodStart?: string | null }) {
  const start = record.period_start ?? record.periodStart;
  const end = record.period_end ?? record.periodEnd;
  if (start && end && start !== end) return `${start} – ${end}`;
  return start ?? record.credited_date ?? record.creditedDate ?? "—";
}

function RecordGrid({ records, provisional = [] }: { records: PersistedRecordCurrent[]; provisional?: ProvisionalRecordCandidate[] }) {
  if (!records.length && !provisional.length) return <p className="text-sm text-[#817990] dark:text-white/50">No qualifying history is available yet.</p>;
  return (
    <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {records.map((record) => (
        <div className="rounded-lg border border-[#ebe5f4] bg-[#fbfaff] px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.035]" key={`${record.metric_key}:${record.scope_id ?? "global"}`}>
          <dt className="text-xs font-medium text-[#817990] dark:text-white/50">{RECORD_METRICS[record.metric_key].label}</dt>
          <dd className="mt-1 font-semibold text-[#30294d] dark:text-white">{formatValue(record.value, record.unit)}</dd>
          <dd className="mt-0.5 text-xs text-[#9189a2] dark:text-white/40">{formatPeriod(record)}</dd>
        </div>
      ))}
      {provisional.map((record) => (
        <div className="rounded-lg border border-[#ddd3fb] bg-[#f7f4ff] px-3 py-2.5 dark:border-[#6655a8] dark:bg-[#302650]" key={`provisional:${record.candidateIdentity}`}>
          <dt className="text-xs font-medium text-[#6653bb] dark:text-[#d2c8ff]">Provisional · {RECORD_METRICS[record.metricKey].label}</dt>
          <dd className="mt-1 font-semibold text-[#30294d] dark:text-white">{formatValue(record.value, record.unit)}</dd>
          <dd className="mt-0.5 text-xs text-[#817990] dark:text-white/50">{formatPeriod(record)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RecordsTab(props: RecordsTabProps) {
  const records = useRecords(props);
  const [taskQuery, setTaskQuery] = useState("");
  const [showInvalidated, setShowInvalidated] = useState(false);
  const sectionRecords = (section: "tasks" | "streaks" | "focus") => records.currentRecords.filter((record) => RECORD_METRICS[record.metric_key].section === section);
  const sectionProvisional = (section: "tasks" | "focus") => records.provisionalCandidates.filter((record) => RECORD_METRICS[record.metricKey].section === section);
  const perTask = useMemo(() => {
    const grouped = new Map<string, { comeback?: PersistedRecordCurrent; entityType: "Task" | "Step"; streak?: PersistedRecordCurrent; title: string }>();
    for (const record of records.currentRecords.filter((item) => item.scope_kind === "task")) {
      const sourceRows = (record.evidence_snapshot.sourceRows ?? []) as Array<{ entity_kind?: string }>;
      const compactEntityKind = record.evidence_snapshot.entityKind;
      const current = grouped.get(record.scope_id!) ?? { entityType: compactEntityKind === "step" || sourceRows.some((row) => row.entity_kind === "step") ? "Step" : "Task", title: record.title_snapshot ?? "Deleted Task" };
      if (record.metric_key === "task_occurrence_streak") current.streak = record;
      if (record.metric_key === "task_biggest_comeback") current.comeback = record;
      grouped.set(record.scope_id!, current);
    }
    const query = taskQuery.trim().toLowerCase();
    return [...grouped.entries()].filter(([, item]) => item.title.toLowerCase().includes(query)).sort(([, left], [, right]) => left.title.localeCompare(right.title));
  }, [records.currentRecords, taskQuery]);
  const history = records.events.filter((event) => showInvalidated || event.validity_state === "valid");

  if (!props.userId) return <WorkspaceMessage title="Sign in to calculate Records" />;
  if (records.setupRequired) return <div className="space-y-3"><WorkspaceMessage detail="Apply the 7.2.24 Records chunked-reconciliation migration, then return here and refresh. The rest of ADHDice remains available." title="Records setup required" tone="error" /><TaskTableChipButton disabled={records.isRecalculating} onClick={records.refresh}>Refresh Records</TaskTableChipButton></div>;
  if (records.isLoading) return <WorkspaceMessage title={records.progress ?? "Preparing Records"} />;
  return (
    <div className="space-y-4">
      {records.error ? <WorkspaceMessage detail={records.error} title="Records could not refresh" tone="error" /> : null}
      {records.isRecalculating && records.progress ? <WorkspaceMessage title={records.progress} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[#817990] dark:text-white/50">{records.lastCalculatedAt ? `Last calculated ${new Date(records.lastCalculatedAt).toLocaleString()}` : "Not calculated yet"}</p>
        <TaskTableChipButton disabled={records.isRecalculating} onClick={records.refresh}>{records.isRecalculating ? "Refreshing…" : "Refresh Records"}</TaskTableChipButton>
      </div>
      {!records.hasSuccessfulResult ? null : <>
      <AdhdPanel className="!rounded-lg !shadow-none" padding="md" title="Global Task records"><RecordGrid provisional={sectionProvisional("tasks")} records={sectionRecords("tasks")} /></AdhdPanel>
      <AdhdPanel className="!rounded-lg !shadow-none" padding="md" title="Streak records"><RecordGrid records={sectionRecords("streaks")} /></AdhdPanel>
      <AdhdPanel className="!rounded-lg !shadow-none" padding="md" title="Focus records"><RecordGrid provisional={sectionProvisional("focus")} records={sectionRecords("focus")} /></AdhdPanel>
      <AdhdPanel className="!rounded-lg !shadow-none" padding="md" title="Per-task records">
        <label className="mb-3 block text-xs font-medium text-[#817990] dark:text-white/50">Filter by Task title<input className="mt-1 block min-h-10 w-full max-w-sm rounded-lg border border-[#ded7ea] bg-white px-3 text-sm text-[#30294d] outline-none focus:border-[#8c79f6] dark:border-white/15 dark:bg-white/[0.06] dark:text-white" onChange={(event) => setTaskQuery(event.target.value)} placeholder="Search Tasks and Steps" type="search" value={taskQuery} /></label>
        {perTask.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="text-xs text-[#817990] dark:text-white/50"><tr><th className="pb-2">Task</th><th className="pb-2">Type</th><th className="pb-2">Longest streak</th><th className="pb-2">Biggest Comeback</th><th className="pb-2">Evidence date/range</th></tr></thead><tbody>{perTask.map(([taskId, item]) => <tr className="border-t border-[#eee9f5] dark:border-white/10" key={taskId}><td className="py-2 pr-3 font-medium text-[#30294d] dark:text-white">{item.title}</td><td className="py-2 pr-3">{item.entityType}</td><td className="py-2 pr-3">{item.streak ? formatValue(item.streak.value, item.streak.unit) : "—"}</td><td className="py-2 pr-3">{item.comeback ? formatValue(item.comeback.value, item.comeback.unit) : "—"}</td><td className="py-2">{item.comeback ? formatPeriod(item.comeback) : item.streak ? formatPeriod(item.streak) : "—"}</td></tr>)}</tbody></table></div> : <p className="text-sm text-[#817990] dark:text-white/50">No matching per-task records.</p>}
      </AdhdPanel>
      <AdhdPanel className="!rounded-lg !shadow-none" padding="md" title="Record history">
        <div className="mb-3"><TaskTableChipButton aria-pressed={showInvalidated} onClick={() => setShowInvalidated((value) => !value)}>{showInvalidated ? "Hide invalidated" : "Show invalidated"}</TaskTableChipButton></div>
        {history.length ? <ul className="divide-y divide-[#eee9f5] dark:divide-white/10">{history.map((event) => <HistoryItem event={event} key={event.id} />)}</ul> : <p className="text-sm text-[#817990] dark:text-white/50">No record events yet.</p>}
      </AdhdPanel>
      <aside className="rounded-lg border border-[#e8e2f2] bg-[#fbfaff] px-4 py-3 text-xs leading-5 text-[#716a86] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/55">
        Records use the currently available Task History and Focus data. Past hard deletions cannot be reconstructed. Historical recurrence and parent/Step changes were not previously snapshotted, and older rows may use fallback occurrence identity. Record events captured from 7.2.19 onward preserve their evidence snapshot.
      </aside>
      </>}
    </div>
  );
}

function HistoryItem({ event }: { event: PersistedRecordEvent }) {
  return <li className={`py-2.5 text-sm ${event.validity_state === "valid" ? "" : "opacity-55"}`}><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-medium text-[#30294d] dark:text-white">{event.event_kind === "break" ? "Break" : "Tie"} · {RECORD_METRICS[event.metric_key].label}</p><p>{formatValue(event.value, event.unit)}</p></div><p className="mt-0.5 text-xs text-[#817990] dark:text-white/50">{event.title_snapshot ?? "Global"} · {formatPeriod(event)} · {event.event_kind === "tie" ? `First achieved ${new Date(event.first_achieved_at).toLocaleDateString()}` : "First achieved"}{event.validity_state === "valid" ? "" : ` · ${event.validity_state}`}</p></li>;
}

function WorkspaceMessage({ detail, title, tone = "neutral" }: { detail?: string; title: string; tone?: "neutral" | "error" }) {
  return <div className={`rounded-lg border px-4 py-5 ${tone === "error" ? "border-[#f0caca] bg-[#fff7f7] text-[#9c4343] dark:border-[#713b3b] dark:bg-[#301d24] dark:text-[#f0aaaa]" : "border-[#e8e2f2] bg-[#fbfaff] text-[#716a86] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60"}`}><p className="font-semibold">{title}</p>{detail ? <p className="mt-1 text-sm">{detail}</p> : null}</div>;
}
