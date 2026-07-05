"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import type { Task, TaskHistory } from "@/lib/database.types";
import type { FocusCategory, HistoricalFocusSession } from "@/lib/types";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { mapTaskHistoryRow } from "@/lib/task-history";
import { mapFocusSessionRow } from "@/hooks/useFocus";
import type { TaskListDefinition } from "@/lib/task-lists";
import {
  generateTaskReport,
  resolveTaskReportHistoryFetchRange,
  TASK_REPORT_DETAIL_OPTIONS,
  TASK_REPORT_RANGE_OPTIONS,
  type TaskReportDetailLevel,
  type TaskReportRangeId,
} from "@/lib/task-report";
import { TASK_TABLE_BODY_VALUE_CLASS, TaskTableChipButton } from "@/components/ui/task-table-primitives";

type TaskReportWorkspaceProps = {
  appVersion: string;
  availableTaskLists: TaskListDefinition[];
  focusCategories: FocusCategory[];
  focusHistory: HistoricalFocusSession[];
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
  focusHistory: HistoricalFocusSession[];
  history: TaskHistory[];
  sourceLabel: string;
  warning: string | null;
};

async function fetchTaskReportHistoryForRange({
  rangeId,
  todayDateKey,
  userId,
}: {
  rangeId: TaskReportRangeId;
  todayDateKey: string;
  userId: string;
}) {
  const client = createBrowserSupabaseClient();
  if (!client) {
    throw new Error("Supabase client is unavailable.");
  }

  const fetchRange = resolveTaskReportHistoryFetchRange(rangeId, todayDateKey);
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
}: {
  rangeId: TaskReportRangeId;
  todayDateKey: string;
  userId: string;
}) {
  const client = createBrowserSupabaseClient();
  if (!client) {
    throw new Error("Supabase client is unavailable.");
  }

  const fetchRange = resolveTaskReportHistoryFetchRange(rangeId, todayDateKey);
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

export function TaskReportWorkspace({
  appVersion,
  availableTaskLists,
  focusCategories,
  focusHistory,
  taskHistory,
  tasks,
  todayDateKey,
  userId,
}: TaskReportWorkspaceProps) {
  const [rangeId, setRangeId] = useState<TaskReportRangeId>("last7");
  const [detailLevel, setDetailLevel] = useState<TaskReportDetailLevel>("summary");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [reportHistoryState, setReportHistoryState] = useState<ReportHistoryState>({
    focusHistory,
    history: taskHistory,
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
            focusHistory,
            history: taskHistory,
            sourceLabel: REPORT_FALLBACK_HISTORY_SOURCE_LABEL,
            warning: "Full selected date range fetch is unavailable without an active signed-in user, so this report is using the loaded workspace task and focus history.",
          });
          setIsLoadingHistory(false);
        }
        return;
      }

      try {
        const [fullHistory, fullFocusHistory] = await Promise.all([
          fetchTaskReportHistoryForRange({
            rangeId,
            todayDateKey,
            userId,
          }),
          fetchFocusReportHistoryForRange({
            rangeId,
            todayDateKey,
            userId,
          }),
        ]);
        if (cancelled) {
          return;
        }
        setReportHistoryState({
          focusHistory: fullFocusHistory,
          history: fullHistory,
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
          focusHistory,
          history: taskHistory,
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
  }, [focusHistory, rangeId, taskHistory, todayDateKey, userId]);

  const reportMarkdown = useMemo(
    () => generateTaskReport({
      appVersion,
      availableTaskLists,
      detailLevel,
      focusCategories,
      focusHistory: reportHistoryState.focusHistory,
      generatedAt: new Date(),
      historySourceLabel: reportHistoryState.sourceLabel,
      historyWarning: reportHistoryState.warning,
      rangeId,
      taskHistory: reportHistoryState.history,
      tasks,
      todayDateKey,
    }),
    [appVersion, availableTaskLists, detailLevel, focusCategories, rangeId, reportHistoryState, tasks, todayDateKey],
  );

  async function handleCopyReport() {
    if (isLoadingHistory) {
      return;
    }
    try {
      await navigator.clipboard.writeText(reportMarkdown);
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
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <TaskTableChipButton className="gap-1.5" disabled={isLoadingHistory} onClick={() => { void handleCopyReport(); }} toneClassName={REPORT_ACTIVE_CHIP_CLASS}>
            <Copy className="h-3.5 w-3.5" />
            {isLoadingHistory ? "Loading Report..." : "Copy Report"}
          </TaskTableChipButton>
          {copyFeedback ? <p className="text-xs text-[#7b86a0] dark:text-white/52">{copyFeedback}</p> : null}
        </div>
      </div>

      <div className="mt-4 rounded-[1.25rem] border border-[#ece8f8] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-[#120f20]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[#24304a] dark:text-white">Report Preview</p>
          <span className="text-xs text-[#8a93aa] dark:text-white/45">{isLoadingHistory ? "Fetching full history..." : "Selectable Markdown"}</span>
        </div>
        <pre className={`${TASK_TABLE_BODY_VALUE_CLASS} adhdice-scrollbar max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-[1rem] border border-[#ece8f8] bg-white px-4 py-3 text-[12.5px] leading-6 select-text dark:border-white/10 dark:bg-white/[0.03]`}>
          {isLoadingHistory ? "Loading full report history for the selected date range..." : reportMarkdown}
        </pre>
      </div>
    </section>
  );
}
