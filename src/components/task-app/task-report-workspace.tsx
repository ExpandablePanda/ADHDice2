"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy } from "lucide-react";
import type { Milestone, MilestoneEvent, Task, TaskHistory } from "@/lib/database.types";
import type { FocusCategory, FocusDailyGoalAdjustment, HistoricalFocusSession } from "@/lib/types";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { mapTaskHistoryRow } from "@/lib/task-history";
import { mapFocusDailyGoalAdjustmentRow, mapFocusSessionRow } from "@/hooks/useFocus";
import type { TaskListDefinition, TaskListMembership } from "@/lib/task-lists";
import {
  generateTaskReport,
  resolveTaskReportHistoryFetchRange,
  TASK_REPORT_DETAIL_OPTIONS,
  TASK_REPORT_RANGE_OPTIONS,
  type TaskReportCustomRange,
  type TaskReportDetailLevel,
  type TaskReportRangeId,
} from "@/lib/task-report";
import { buildMilestoneEventOccurredAtRange } from "@/lib/milestones";
import { TASK_TABLE_BODY_VALUE_CLASS, TASK_TABLE_INPUT_CLASS, TaskTableChipButton } from "@/components/ui/task-table-primitives";
import type { AchievementProgressModel } from "@/lib/achievement-progress";
import type { PersistedRecordCurrent, PersistedRecordEvent } from "@/lib/records/types";
import { copyReportMarkdown, type RecordsReportData } from "@/lib/report-presentation";

type TaskReportWorkspaceProps = {
  achievementModel: AchievementProgressModel;
  achievementWarning: string | null;
  appVersion: string;
  availableTaskLists: TaskListDefinition[];
  focusCategories: FocusCategory[];
  focusDailyGoalAdjustments: FocusDailyGoalAdjustment[];
  focusHistory: HistoricalFocusSession[];
  isMembershipProjectionReady: boolean;
  listMembershipsByTaskId: Record<string, TaskListMembership[]>;
  milestones: Milestone[];
  taskHistory: TaskHistory[];
  tasks: Task[];
  todayDateKey: string;
  userId: string | null;
};

const REPORT_ACTIVE_CHIP_CLASS = "border-[#ddd2ff] bg-[#6f57f6] text-white dark:border-[#7f67ff] dark:bg-[#7f67ff] dark:text-white";
const REPORT_INACTIVE_CHIP_CLASS = "border border-[#e4deef] bg-[#f4f5f8] text-[#68738c] dark:border-white/10 dark:bg-white/8 dark:text-white/60";
const REPORT_HISTORY_PAGE_SIZE = 1000;
const REPORT_FULL_HISTORY_SOURCE_LABEL = "Full selected date range fetch";
const REPORT_FALLBACK_HISTORY_SOURCE_LABEL = "Loaded workspace history fallback";

type ReportHistoryState = {
  focusDailyGoalAdjustments: FocusDailyGoalAdjustment[];
  focusHistory: HistoricalFocusSession[];
  history: TaskHistory[];
  milestoneEvents: MilestoneEvent[];
  milestones: Milestone[];
  milestoneWarning: string | null;
  records: RecordsReportData;
  sourceLabel: string;
  warning: string | null;
};

async function fetchTaskReportHistoryForRange({
  rangeId,
  todayDateKey,
  userId,
  customRange,
}: {
  rangeId: TaskReportRangeId;
  todayDateKey: string;
  userId: string;
  customRange?: TaskReportCustomRange | null;
}) {
  const client = createBrowserSupabaseClient();
  if (!client) {
    throw new Error("Supabase client is unavailable.");
  }

  const fetchRange = resolveTaskReportHistoryFetchRange(rangeId, todayDateKey, customRange);
  const fullHistory: TaskHistory[] = [];
  let offset = 0;

  while (true) {
    let query = client
      .from("adhdice_task_history")
      .select("*")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + REPORT_HISTORY_PAGE_SIZE - 1);

    if (fetchRange.startDateKey) {
      query = query.gte("entry_date", fetchRange.startDateKey);
    }
    if (fetchRange.endDateKey) {
      query = query.lte("entry_date", fetchRange.endDateKey);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const batch = (data ?? []).map(mapTaskHistoryRow);
    fullHistory.push(...batch);
    if (batch.length < REPORT_HISTORY_PAGE_SIZE) {
      break;
    }
    offset += REPORT_HISTORY_PAGE_SIZE;
  }

  return fullHistory;
}

async function fetchFocusReportHistoryForRange({
  rangeId,
  todayDateKey,
  userId,
  customRange,
}: {
  rangeId: TaskReportRangeId;
  todayDateKey: string;
  userId: string;
  customRange?: TaskReportCustomRange | null;
}) {
  const client = createBrowserSupabaseClient();
  if (!client) {
    throw new Error("Supabase client is unavailable.");
  }

  const fetchRange = resolveTaskReportHistoryFetchRange(rangeId, todayDateKey, customRange);
  const fullHistory: HistoricalFocusSession[] = [];
  let offset = 0;

  while (true) {
    let query = client
      .from("adhdice_focus_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + REPORT_HISTORY_PAGE_SIZE - 1);

    if (fetchRange.startDateKey) {
      query = query.gte("session_date", fetchRange.startDateKey);
    }
    if (fetchRange.endDateKey) {
      query = query.lte("session_date", fetchRange.endDateKey);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const batch = (data ?? []).map(mapFocusSessionRow);
    fullHistory.push(...batch);
    if (batch.length < REPORT_HISTORY_PAGE_SIZE) {
      break;
    }
    offset += REPORT_HISTORY_PAGE_SIZE;
  }

  return fullHistory;
}

async function fetchFocusDailyGoalAdjustmentsForRange({
  rangeId,
  todayDateKey,
  userId,
  customRange,
}: {
  rangeId: TaskReportRangeId;
  todayDateKey: string;
  userId: string;
  customRange?: TaskReportCustomRange | null;
}) {
  const client = createBrowserSupabaseClient();
  if (!client) {
    throw new Error("Supabase client is unavailable.");
  }

  const fetchRange = resolveTaskReportHistoryFetchRange(rangeId, todayDateKey, customRange);
  const fullAdjustments: FocusDailyGoalAdjustment[] = [];
  let offset = 0;

  while (true) {
    let query = client
      .from("adhdice_focus_daily_goal_adjustments")
      .select("*")
      .eq("user_id", userId)
      .order("adjustment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + REPORT_HISTORY_PAGE_SIZE - 1);

    if (fetchRange.startDateKey) {
      query = query.gte("adjustment_date", fetchRange.startDateKey);
    }
    if (fetchRange.endDateKey) {
      query = query.lte("adjustment_date", fetchRange.endDateKey);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const batch = (data ?? []).map(mapFocusDailyGoalAdjustmentRow);
    fullAdjustments.push(...batch);
    if (batch.length < REPORT_HISTORY_PAGE_SIZE) {
      break;
    }
    offset += REPORT_HISTORY_PAGE_SIZE;
  }

  return fullAdjustments;
}

async function fetchMilestoneReportDataForRange({
  rangeId,
  todayDateKey,
  userId,
  customRange,
}: {
  rangeId: TaskReportRangeId;
  todayDateKey: string;
  userId: string;
  customRange?: TaskReportCustomRange | null;
}) {
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Supabase client is unavailable.");
  const fetchRange = resolveTaskReportHistoryFetchRange(rangeId, todayDateKey, customRange);
  const occurredAtRange = buildMilestoneEventOccurredAtRange(fetchRange);
  const milestoneEvents: MilestoneEvent[] = [];
  let offset = 0;
  while (true) {
    let query = client.from("adhdice_milestone_events").select("*").eq("user_id", userId)
      .order("occurred_at", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + REPORT_HISTORY_PAGE_SIZE - 1);
    // Report dates are local calendar dates. Convert local midnight to UTC only
    // for transport, with an exclusive next-day end boundary.
    if (occurredAtRange.startInclusive) query = query.gte("occurred_at", occurredAtRange.startInclusive);
    if (occurredAtRange.endExclusive) query = query.lt("occurred_at", occurredAtRange.endExclusive);
    const { data, error } = await query;
    if (error) throw error;
    const batch = data ?? [];
    milestoneEvents.push(...batch);
    if (batch.length < REPORT_HISTORY_PAGE_SIZE) break;
    offset += REPORT_HISTORY_PAGE_SIZE;
  }

  let milestonesQuery = client.from("adhdice_milestones").select("*").eq("user_id", userId).eq("status", "completed")
    .not("completion_date_key", "is", null).order("completion_date_key", { ascending: false });
  if (fetchRange.startDateKey) milestonesQuery = milestonesQuery.gte("completion_date_key", fetchRange.startDateKey);
  if (fetchRange.endDateKey) milestonesQuery = milestonesQuery.lte("completion_date_key", fetchRange.endDateKey);
  const { data: milestones, error: milestonesError } = await milestonesQuery;
  if (milestonesError) throw milestonesError;
  return { milestoneEvents, milestones: milestones ?? [] };
}

async function fetchPersistedRecordsReportData(userId: string): Promise<RecordsReportData> {
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Supabase client is unavailable.");

  async function fetchRows<T>(
    table: "adhdice_record_current" | "adhdice_record_events",
    validOnly = false,
  ) {
    const rows: T[] = [];
    let offset = 0;
    while (true) {
      let query = client.from(table).select("*").eq("user_id", userId)
        .order("credited_date", { ascending: false }).order("id", { ascending: false })
        .range(offset, offset + REPORT_HISTORY_PAGE_SIZE - 1);
      if (validOnly) query = query.eq("validity_state", "valid");
      const { data, error } = await query;
      if (error) throw error;
      const batch = (data ?? []) as unknown as T[];
      rows.push(...batch);
      if (batch.length < REPORT_HISTORY_PAGE_SIZE) break;
      offset += REPORT_HISTORY_PAGE_SIZE;
    }
    return rows;
  }

  const [currentRecords, events] = await Promise.all([
    fetchRows<PersistedRecordCurrent>("adhdice_record_current"),
    fetchRows<PersistedRecordEvent>("adhdice_record_events", true),
  ]);
  return { currentRecords, events };
}

export function TaskReportWorkspace({
  achievementModel,
  achievementWarning,
  appVersion,
  availableTaskLists,
  focusCategories,
  focusDailyGoalAdjustments,
  focusHistory,
  isMembershipProjectionReady,
  listMembershipsByTaskId,
  milestones,
  taskHistory,
  tasks,
  todayDateKey,
  userId,
}: TaskReportWorkspaceProps) {
  const [rangeId, setRangeId] = useState<TaskReportRangeId>("last7");
  const [customRange, setCustomRange] = useState<TaskReportCustomRange>({
    endDateKey: todayDateKey,
    startDateKey: todayDateKey,
  });
  const [detailLevel, setDetailLevel] = useState<TaskReportDetailLevel>("summary");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const recordsReportRequestRef = useRef<{ promise: Promise<RecordsReportData>; userId: string } | null>(null);
  const [reportHistoryState, setReportHistoryState] = useState<ReportHistoryState>({
    focusDailyGoalAdjustments,
    focusHistory,
    history: taskHistory,
    milestoneEvents: [],
    milestones,
    milestoneWarning: null,
    records: { currentRecords: [], events: [] },
    sourceLabel: REPORT_FALLBACK_HISTORY_SOURCE_LABEL,
    warning: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadReportHistory() {
      setIsLoadingHistory(true);
      setCopyFeedback(null);

      if (!userId) {
        if (!cancelled) {
          setReportHistoryState({
            focusDailyGoalAdjustments,
            focusHistory,
            history: taskHistory,
            milestoneEvents: [],
            milestones,
            milestoneWarning: "Milestone lifecycle activity is unavailable without an active signed-in user. Earned trophy counts use currently loaded Milestones.",
            records: { currentRecords: [], events: [], warning: "Persisted Records are unavailable without an active signed-in user." },
            sourceLabel: REPORT_FALLBACK_HISTORY_SOURCE_LABEL,
            warning: "Full selected date range fetch is unavailable without an active signed-in user, so this report is using the loaded workspace task and focus history.",
          });
          setIsLoadingHistory(false);
        }
        return;
      }

      try {
        if (recordsReportRequestRef.current?.userId !== userId) {
          recordsReportRequestRef.current = {
            promise: fetchPersistedRecordsReportData(userId)
              .catch((error: unknown) => {
                const message = error instanceof Error && error.message ? error.message : "Unknown fetch error.";
                return { currentRecords: [], events: [], warning: `Persisted Records failed to load (${message}).` };
              }),
            userId,
          };
        }
        const [fullHistory, fullFocusHistory, fullAdjustments, milestoneReportData, recordsReportData] = await Promise.all([
          fetchTaskReportHistoryForRange({
            customRange,
            rangeId,
            todayDateKey,
            userId,
          }),
          fetchFocusReportHistoryForRange({
            customRange,
            rangeId,
            todayDateKey,
            userId,
          }),
          fetchFocusDailyGoalAdjustmentsForRange({
            customRange,
            rangeId,
            todayDateKey,
            userId,
          }),
          fetchMilestoneReportDataForRange({ customRange, rangeId, todayDateKey, userId })
            .then((data) => ({ ...data, warning: null as string | null }))
            .catch((error: unknown) => {
              const message = error instanceof Error && error.message ? error.message : "Unknown fetch error.";
              return {
                milestoneEvents: [],
                milestones,
                warning: `Range-scoped Milestone data failed to load (${message}). Earned trophy counts use currently loaded Milestones; lifecycle activity is unavailable.`,
              };
            }),
          recordsReportRequestRef.current.promise,
        ]);
        if (cancelled) {
          return;
        }
        setReportHistoryState({
          focusDailyGoalAdjustments: fullAdjustments,
          focusHistory: fullFocusHistory,
          history: fullHistory,
          milestoneEvents: milestoneReportData.milestoneEvents,
          milestones: milestoneReportData.milestones,
          milestoneWarning: milestoneReportData.warning,
          records: recordsReportData,
          sourceLabel: REPORT_FULL_HISTORY_SOURCE_LABEL,
          warning: null,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error && error.message
          ? error.message
          : "Unknown fetch error.";
        setReportHistoryState({
          focusDailyGoalAdjustments,
          focusHistory,
          history: taskHistory,
          milestoneEvents: [],
          milestones,
          milestoneWarning: `Range-scoped Milestone data failed to load (${message}). Earned trophy counts use currently loaded Milestones; lifecycle activity is unavailable.`,
          records: { currentRecords: [], events: [], warning: `Persisted Records failed to load (${message}).` },
          sourceLabel: REPORT_FALLBACK_HISTORY_SOURCE_LABEL,
          warning: `Full selected date range fetch failed (${message}). Using the loaded workspace task and focus history instead, so this report may still be limited to the currently loaded records.`,
        });
      } finally {
        if (!cancelled) {
          setIsLoadingHistory(false);
        }
      }
    }

    void loadReportHistory();

    return () => {
      cancelled = true;
    };
  }, [customRange, focusDailyGoalAdjustments, focusHistory, milestones, rangeId, taskHistory, todayDateKey, userId]);

  const isReportLoading = isLoadingHistory || !isMembershipProjectionReady;
  const reportMarkdown = useMemo(
    () => isMembershipProjectionReady ? generateTaskReport({
      achievementModel,
      achievementWarning,
      appVersion,
      availableTaskLists,
      detailLevel,
      focusCategories,
      focusDailyGoalAdjustments: reportHistoryState.focusDailyGoalAdjustments,
      focusHistory: reportHistoryState.focusHistory,
      generatedAt: new Date(),
      historySourceLabel: reportHistoryState.sourceLabel,
      historyWarning: reportHistoryState.warning,
      listMembershipsByTaskId,
      milestoneEvents: reportHistoryState.milestoneEvents,
      milestones: reportHistoryState.milestones,
      milestoneWarning: reportHistoryState.milestoneWarning,
      records: reportHistoryState.records,
      customRange: rangeId === "custom" ? customRange : null,
      rangeId,
      taskHistory: reportHistoryState.history,
      tasks,
      todayDateKey,
    }) : "",
    [achievementModel, achievementWarning, appVersion, availableTaskLists, customRange, detailLevel, focusCategories, isMembershipProjectionReady, listMembershipsByTaskId, rangeId, reportHistoryState, tasks, todayDateKey],
  );

  async function handleCopyReport() {
    if (isReportLoading) {
      return;
    }
    try {
      await copyReportMarkdown(reportMarkdown, navigator.clipboard);
      setCopyFeedback("Report copied.");
    } catch {
      setCopyFeedback("Copy failed. The preview below is still fully selectable.");
    }
  }

  return (
    <section className="mt-4 rounded-[1.5rem] border border-[#ece8f8] bg-white/80 p-4 shadow-[0_20px_60px_rgba(31,39,70,0.08)] dark:border-white/10 dark:bg-[#171327]/80">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div>
            <p className="text-sm font-semibold text-[#24304a] dark:text-white">Report</p>
            <p className="text-sm text-[#6c7792] dark:text-white/58">Generate a copy/paste Markdown summary from your current ADHDice task and history data.</p>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7b86a0] dark:text-white/45">Detail Level</p>
            <div className="flex flex-wrap gap-2">
              {TASK_REPORT_DETAIL_OPTIONS.map((option) => (
                <TaskTableChipButton
                  key={option.id}
                  onClick={() => setDetailLevel(option.id)}
                  toneClassName={option.id === detailLevel ? REPORT_ACTIVE_CHIP_CLASS : REPORT_INACTIVE_CHIP_CLASS}
                >
                  {option.label}
                </TaskTableChipButton>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {TASK_REPORT_RANGE_OPTIONS.map((option) => (
              <TaskTableChipButton
                key={option.id}
                onClick={() => setRangeId(option.id)}
                toneClassName={option.id === rangeId ? REPORT_ACTIVE_CHIP_CLASS : REPORT_INACTIVE_CHIP_CLASS}
              >
                {option.label}
              </TaskTableChipButton>
            ))}
          </div>
          {rangeId === "custom" ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label="Report custom range start"
                className={`${TASK_TABLE_INPUT_CLASS} h-8 w-[9.5rem] rounded-full py-1 text-[13px]`}
                max={customRange.endDateKey || undefined}
                onChange={(event) => setCustomRange((current) => ({ ...current, startDateKey: event.target.value || current.startDateKey }))}
                type="date"
                value={customRange.startDateKey}
              />
              <input
                aria-label="Report custom range end"
                className={`${TASK_TABLE_INPUT_CLASS} h-8 w-[9.5rem] rounded-full py-1 text-[13px]`}
                min={customRange.startDateKey || undefined}
                onChange={(event) => setCustomRange((current) => ({ ...current, endDateKey: event.target.value || current.endDateKey }))}
                type="date"
                value={customRange.endDateKey}
              />
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <TaskTableChipButton className="gap-1.5" disabled={isReportLoading} onClick={() => { void handleCopyReport(); }} toneClassName={REPORT_ACTIVE_CHIP_CLASS}>
            <Copy className="h-3.5 w-3.5" />
            {isReportLoading ? "Loading Report..." : "Copy Report"}
          </TaskTableChipButton>
          {copyFeedback ? <p className="text-xs text-[#7b86a0] dark:text-white/52">{copyFeedback}</p> : null}
        </div>
      </div>

      <div className="mt-4 rounded-[1.25rem] border border-[#ece8f8] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-[#120f20]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[#24304a] dark:text-white">Report Preview</p>
          <span className="text-xs text-[#8a93aa] dark:text-white/45">{isReportLoading ? "Preparing report inputs..." : "Selectable Markdown"}</span>
        </div>
        <pre className={`${TASK_TABLE_BODY_VALUE_CLASS} adhdice-scrollbar max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-[1rem] border border-[#ece8f8] bg-white px-4 py-3 text-[12.5px] leading-6 select-text dark:border-white/10 dark:bg-white/[0.03]`}>
          {isReportLoading ? "Loading full report history and canonical Task/list memberships..." : reportMarkdown}
        </pre>
      </div>
    </section>
  );
}
