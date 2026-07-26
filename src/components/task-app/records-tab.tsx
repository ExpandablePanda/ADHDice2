"use client";

import { ChevronDown, ClipboardCheck, Flame, Timer, Trophy, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AdhdCard } from "@/components/ui-system/adhd-card";
import { AdhdIconButton } from "@/components/ui-system/adhd-icon-button";
import { AdhdPanel } from "@/components/ui-system/adhd-panel";
import { TASK_TABLE_CHIP_BASE_CLASS, TASK_TABLE_LIST_CHIP_CLASS, TaskTableChipButton } from "@/components/ui/task-table-primitives";
import { useRecords } from "@/hooks/useRecords";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  DEFAULT_RECORDS_SECTION_EXPANDED_STATE,
  readRecordsSectionExpandedState,
  writeRecordsSectionExpandedState,
  type RecordsSectionExpandedState,
  type RecordsSectionId,
} from "@/lib/records/ui-preferences";
import { RECORD_METRICS, type PersistedRecordCurrent, type PersistedRecordEvent, type ProvisionalRecordCandidate, type RecordMetricKey, type RecordUnit } from "@/lib/records/types";

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

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

type RecordCardModel = {
  category: string;
  change: string;
  creditedDate: string;
  detail: {
    firstAchievedAt?: string;
    period: string;
    scope: string;
    sourceCount: number;
    status: string;
  };
  icon: ReactNode;
  id: string;
  title: string;
  value: string;
};

function matchesRecord(
  left: Pick<PersistedRecordCurrent | PersistedRecordEvent, "metric_key" | "scope_id" | "scope_kind">,
  right: Pick<PersistedRecordCurrent, "metric_key" | "scope_id" | "scope_kind">,
) {
  return left.metric_key === right.metric_key && left.scope_kind === right.scope_kind && left.scope_id === right.scope_id;
}

function getRecordCategory(metricKey: RecordMetricKey) {
  const section = RECORD_METRICS[metricKey].section;
  if (section === "tasks") return { icon: <ClipboardCheck aria-hidden="true" />, label: "Global Tasks" };
  if (section === "streaks") return { icon: <Flame aria-hidden="true" />, label: "Streaks" };
  if (section === "focus") return { icon: <Timer aria-hidden="true" />, label: "Focus" };
  return { icon: <Trophy aria-hidden="true" />, label: "Per-task" };
}

function getSourceCount(evidence: Record<string, unknown>) {
  const sourceRows = evidence.sourceRows;
  if (Array.isArray(sourceRows)) return sourceRows.length;
  const identities = evidence.identities;
  return Array.isArray(identities) ? identities.length : 0;
}

function buildCurrentRecordCard(record: PersistedRecordCurrent, events: PersistedRecordEvent[]): RecordCardModel {
  const previousValue = events
    .filter((event) => event.validity_state === "valid" && matchesRecord(event, record) && event.value < record.value)
    .reduce<number | null>((highest, event) => highest === null ? event.value : Math.max(highest, event.value), null);
  const category = getRecordCategory(record.metric_key);
  const sourceRows = (record.evidence_snapshot.sourceRows ?? []) as Array<{ entity_kind?: string }>;
  const entityKind = record.evidence_snapshot.entityKind === "step" || sourceRows.some((row) => row.entity_kind === "step")
    ? "Step"
    : "Task";
  return {
    category: RECORD_METRICS[record.metric_key].section === "per_task" ? `${category.label} · ${entityKind}` : category.label,
    change: previousValue === null ? "No previous record" : `+${formatValue(record.value - previousValue, record.unit)}`,
    creditedDate: formatDate(record.credited_date),
    detail: {
      firstAchievedAt: record.first_achieved_at,
      period: formatPeriod(record),
      scope: record.title_snapshot ?? "Global",
      sourceCount: getSourceCount(record.evidence_snapshot),
      status: "Current record",
    },
    icon: category.icon,
    id: `${record.metric_key}:${record.scope_id ?? "global"}`,
    title: RECORD_METRICS[record.metric_key].label,
    value: formatValue(record.value, record.unit),
  };
}

function buildProvisionalRecordCard(record: ProvisionalRecordCandidate, currentRecords: PersistedRecordCurrent[]): RecordCardModel {
  const current = currentRecords.find((item) => (
    item.metric_key === record.metricKey
    && item.scope_kind === record.scopeKind
    && item.scope_id === record.scopeId
  ));
  const category = getRecordCategory(record.metricKey);
  return {
    category: category.label,
    change: current && record.value > current.value ? `+${formatValue(record.value - current.value, record.unit)}` : "No previous record",
    creditedDate: formatDate(record.creditedDate),
    detail: {
      period: formatPeriod(record),
      scope: record.titleSnapshot ?? "Global",
      sourceCount: record.evidence.sourceRows.length,
      status: "Provisional record",
    },
    icon: category.icon,
    id: `provisional:${record.candidateIdentity}`,
    title: RECORD_METRICS[record.metricKey].label,
    value: formatValue(record.value, record.unit),
  };
}

function RecordGrid({
  currentRecords,
  events,
  onOpenDetails,
  provisional = [],
  records,
}: {
  currentRecords: PersistedRecordCurrent[];
  events: PersistedRecordEvent[];
  onOpenDetails: (record: RecordCardModel) => void;
  provisional?: ProvisionalRecordCandidate[];
  records: PersistedRecordCurrent[];
}) {
  if (!records.length && !provisional.length) return <p className="text-sm text-[#817990] dark:text-white/50">No qualifying history is available yet.</p>;
  const cards = [
    ...records.map((record) => buildCurrentRecordCard(record, events)),
    ...provisional.map((record) => buildProvisionalRecordCard(record, currentRecords)),
  ];
  return (
    <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" data-record-grid>
      {cards.map((card) => (
        <AdhdCard className="aspect-square min-h-[10.5rem] w-full max-w-[13rem] min-w-0 !rounded-[1rem] !p-0 !shadow-none" interactive key={card.id}>
          <button
            aria-label={`Open details for ${card.title}`}
            className="flex h-full min-h-[10.5rem] w-full min-w-0 flex-col p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8c79f6]"
            onClick={() => onOpenDetails(card)}
            type="button"
          >
            <span className="flex min-w-0 items-start justify-between gap-2">
              <span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${TASK_TABLE_LIST_CHIP_CLASS} max-w-full justify-start overflow-hidden`}>
                <span className="truncate">{card.category}</span>
              </span>
              <span className="h-5 w-5 shrink-0 text-[#7561dc] dark:text-[#c9beff] [&>svg]:h-full [&>svg]:w-full">{card.icon}</span>
            </span>
            <span className="mt-2 line-clamp-3 break-words text-[13px] font-semibold leading-4 text-[#514969] dark:text-white/78" title={card.title}>{card.title}</span>
            <span className="mt-auto break-words pt-2 text-lg font-semibold leading-5 text-[#30294d] dark:text-white">{card.value}</span>
            <span className="mt-1 grid min-w-0 gap-0.5 text-[11px] leading-4 text-[#817990] dark:text-white/50">
              <span className="truncate">Achieved {card.creditedDate}</span>
              <span className="truncate">Change {card.change}</span>
            </span>
          </button>
        </AdhdCard>
      ))}
    </div>
  );
}

function RecordsSection({
  children,
  expanded,
  id,
  onToggle,
  title,
}: {
  children: ReactNode;
  expanded: boolean;
  id: RecordsSectionId;
  onToggle: () => void;
  title: string;
}) {
  const contentId = `records-section-${id}`;
  return (
    <AdhdPanel
      className="!rounded-lg !shadow-none"
      header={(
        <div className="flex min-h-8 items-center justify-between gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#8f86ad] dark:text-white/40">{title}</h2>
          <AdhdIconButton aria-controls={contentId} aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`} onClick={onToggle} size="sm" tone="ghost">
            <ChevronDown className={`transition-transform ${expanded ? "" : "-rotate-90"}`} />
          </AdhdIconButton>
        </div>
      )}
      padding="sm"
    >
      {expanded ? <div className="mt-2" id={contentId}>{children}</div> : null}
    </AdhdPanel>
  );
}

export function RecordsTab(props: RecordsTabProps) {
  const records = useRecords(props);
  const [sectionPreferences, setSectionPreferences] = useState<{ ownerUserId: string | null; state: RecordsSectionExpandedState }>(() => {
    const state = props.userId && typeof window !== "undefined"
      ? readRecordsSectionExpandedState(window.localStorage, props.userId)
      : { ...DEFAULT_RECORDS_SECTION_EXPANDED_STATE };
    return { ownerUserId: props.userId, state };
  });
  const expandedSections = sectionPreferences.ownerUserId === props.userId
    ? sectionPreferences.state
    : props.userId && typeof window !== "undefined"
      ? readRecordsSectionExpandedState(window.localStorage, props.userId)
      : DEFAULT_RECORDS_SECTION_EXPANDED_STATE;
  const [detailRecord, setDetailRecord] = useState<RecordCardModel | null>(null);
  const [taskQuery, setTaskQuery] = useState("");
  const [showInvalidated, setShowInvalidated] = useState(false);
  const sectionRecords = (section: "tasks" | "streaks" | "focus") => records.currentRecords.filter((record) => RECORD_METRICS[record.metric_key].section === section);
  const sectionProvisional = (section: "tasks" | "focus") => records.provisionalCandidates.filter((record) => RECORD_METRICS[record.metricKey].section === section);
  const perTaskRecords = useMemo(() => {
    const grouped = new Map<string, { comeback?: PersistedRecordCurrent; streak?: PersistedRecordCurrent; title: string }>();
    for (const record of records.currentRecords.filter((item) => item.scope_kind === "task")) {
      const current = grouped.get(record.scope_id!) ?? { title: record.title_snapshot ?? "Deleted Task" };
      if (record.metric_key === "task_occurrence_streak") current.streak = record;
      if (record.metric_key === "task_biggest_comeback") current.comeback = record;
      grouped.set(record.scope_id!, current);
    }
    const query = taskQuery.trim().toLowerCase();
    return [...grouped.entries()]
      .filter(([, item]) => item.title.toLowerCase().includes(query))
      .sort(([, left], [, right]) => left.title.localeCompare(right.title))
      .flatMap(([, item]) => [item.streak, item.comeback].filter((record): record is PersistedRecordCurrent => Boolean(record)));
  }, [records.currentRecords, taskQuery]);
  const history = records.events.filter((event) => showInvalidated || event.validity_state === "valid");

  function toggleSection(sectionId: RecordsSectionId) {
    const next = { ...expandedSections, [sectionId]: !expandedSections[sectionId] };
    if (props.userId) writeRecordsSectionExpandedState(window.localStorage, props.userId, next);
    setSectionPreferences({ ownerUserId: props.userId, state: next });
  }

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
      <RecordsSection expanded={expandedSections.global_tasks} id="global_tasks" onToggle={() => toggleSection("global_tasks")} title="Global Task records">
        <RecordGrid currentRecords={records.currentRecords} events={records.events} onOpenDetails={setDetailRecord} provisional={sectionProvisional("tasks")} records={sectionRecords("tasks")} />
      </RecordsSection>
      <RecordsSection expanded={expandedSections.streaks} id="streaks" onToggle={() => toggleSection("streaks")} title="Streak records">
        <RecordGrid currentRecords={records.currentRecords} events={records.events} onOpenDetails={setDetailRecord} records={sectionRecords("streaks")} />
      </RecordsSection>
      <RecordsSection expanded={expandedSections.focus} id="focus" onToggle={() => toggleSection("focus")} title="Focus records">
        <RecordGrid currentRecords={records.currentRecords} events={records.events} onOpenDetails={setDetailRecord} provisional={sectionProvisional("focus")} records={sectionRecords("focus")} />
      </RecordsSection>
      <RecordsSection expanded={expandedSections.per_task} id="per_task" onToggle={() => toggleSection("per_task")} title="Per-task records">
        <label className="mb-3 block text-xs font-medium text-[#817990] dark:text-white/50">Filter by Task title<input className="mt-1 block min-h-10 w-full max-w-sm rounded-lg border border-[#ded7ea] bg-white px-3 text-sm text-[#30294d] outline-none focus:border-[#8c79f6] dark:border-white/15 dark:bg-white/[0.06] dark:text-white" onChange={(event) => setTaskQuery(event.target.value)} placeholder="Search Tasks and Steps" type="search" value={taskQuery} /></label>
        {perTaskRecords.length ? <RecordGrid currentRecords={records.currentRecords} events={records.events} onOpenDetails={setDetailRecord} records={perTaskRecords} /> : <p className="text-sm text-[#817990] dark:text-white/50">No matching per-task records.</p>}
      </RecordsSection>
      <RecordsSection expanded={expandedSections.history} id="history" onToggle={() => toggleSection("history")} title="Record history">
        <div className="mb-3"><TaskTableChipButton aria-pressed={showInvalidated} onClick={() => setShowInvalidated((value) => !value)}>{showInvalidated ? "Hide invalidated" : "Show invalidated"}</TaskTableChipButton></div>
        {history.length ? <ul className="divide-y divide-[#eee9f5] dark:divide-white/10">{history.map((event) => <HistoryItem event={event} key={event.id} />)}</ul> : <p className="text-sm text-[#817990] dark:text-white/50">No record events yet.</p>}
      </RecordsSection>
      <aside className="rounded-lg border border-[#e8e2f2] bg-[#fbfaff] px-4 py-3 text-xs leading-5 text-[#716a86] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/55">
        Records use the currently available Task History and Focus data. Past hard deletions cannot be reconstructed. Historical recurrence and parent/Step changes were not previously snapshotted, and older rows may use fallback occurrence identity. Record events captured from 7.2.19 onward preserve their evidence snapshot.
      </aside>
      </>}
      {detailRecord ? <RecordDetailOverlay onClose={() => setDetailRecord(null)} record={detailRecord} /> : null}
    </div>
  );
}

function RecordDetailOverlay({ onClose, record }: { onClose: () => void; record: RecordCardModel }) {
  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div aria-labelledby="record-detail-title" aria-modal="true" className="fixed inset-0 z-[150] flex items-center justify-center bg-[#f7f3ff]/82 p-4 backdrop-blur-[10px] dark:bg-[#100b1d]/84" onClick={onClose} role="dialog">
      <AdhdPanel className="w-full max-w-md" header={<div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><span className="h-5 w-5 text-[#7561dc] dark:text-[#c9beff] [&>svg]:h-full [&>svg]:w-full">{record.icon}</span><span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${TASK_TABLE_LIST_CHIP_CLASS}`}>{record.category}</span></div><AdhdIconButton aria-label="Close Record details" onClick={onClose} size="sm" tone="ghost"><X /></AdhdIconButton></div>} onClick={(event) => event.stopPropagation()} padding="md" variant="floating">
        <h2 className="mt-4 text-lg font-semibold leading-6 text-[#30294d] dark:text-white" id="record-detail-title">{record.title}</h2>
        <p className="mt-2 text-2xl font-semibold text-[#30294d] dark:text-white">{record.value}</p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-[#817990] dark:text-white/50">Status</dt><dd>{record.detail.status}</dd>
          <dt className="text-[#817990] dark:text-white/50">Date achieved</dt><dd>{record.creditedDate}</dd>
          <dt className="text-[#817990] dark:text-white/50">Change</dt><dd>{record.change}</dd>
          <dt className="text-[#817990] dark:text-white/50">Scope</dt><dd className="min-w-0 break-words">{record.detail.scope}</dd>
          <dt className="text-[#817990] dark:text-white/50">Evidence period</dt><dd className="min-w-0 break-words">{record.detail.period}</dd>
          <dt className="text-[#817990] dark:text-white/50">Evidence items</dt><dd>{record.detail.sourceCount.toLocaleString()}</dd>
          {record.detail.firstAchievedAt ? <><dt className="text-[#817990] dark:text-white/50">First achieved</dt><dd>{new Date(record.detail.firstAchievedAt).toLocaleDateString()}</dd></> : null}
        </dl>
      </AdhdPanel>
    </div>
  );
}

function HistoryItem({ event }: { event: PersistedRecordEvent }) {
  return <li className={`py-2.5 text-sm ${event.validity_state === "valid" ? "" : "opacity-55"}`}><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-medium text-[#30294d] dark:text-white">{event.event_kind === "break" ? "Break" : "Tie"} · {RECORD_METRICS[event.metric_key].label}</p><p>{formatValue(event.value, event.unit)}</p></div><p className="mt-0.5 text-xs text-[#817990] dark:text-white/50">{event.title_snapshot ?? "Global"} · {formatPeriod(event)} · {event.event_kind === "tie" ? `First achieved ${new Date(event.first_achieved_at).toLocaleDateString()}` : "First achieved"}{event.validity_state === "valid" ? "" : ` · ${event.validity_state}`}</p></li>;
}

function WorkspaceMessage({ detail, title, tone = "neutral" }: { detail?: string; title: string; tone?: "neutral" | "error" }) {
  return <div className={`rounded-lg border px-4 py-5 ${tone === "error" ? "border-[#f0caca] bg-[#fff7f7] text-[#9c4343] dark:border-[#713b3b] dark:bg-[#301d24] dark:text-[#f0aaaa]" : "border-[#e8e2f2] bg-[#fbfaff] text-[#716a86] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60"}`}><p className="font-semibold">{title}</p>{detail ? <p className="mt-1 text-sm">{detail}</p> : null}</div>;
}
