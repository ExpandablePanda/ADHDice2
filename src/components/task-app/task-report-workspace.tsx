"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { TaskTableChipButton } from "@/components/ui/task-table-primitives";
import type { AchievementProgressModel } from "@/lib/achievement-progress";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  generateTaskReport,
  resolveTaskReportHistoryFetchRange,
  TASK_REPORT_RANGE_OPTIONS,
  type TaskReportCustomRange,
  type TaskReportRangeId,
} from "@/lib/task-report";
import { createEmptyUnifiedReportReadModel, type UnifiedReportReadModel } from "@/lib/unified-report-read-model";

type TaskReportWorkspaceProps = {
  achievementModel: AchievementProgressModel;
  achievementWarning: string | null;
  appVersion: string;
  todayDateKey: string;
  userId: string | null;
};

const REPORT_ACTIVE_CHIP_CLASS = "border-[#ddd2ff] bg-[#6f57f6] text-white dark:border-[#7f67ff] dark:bg-[#7f67ff] dark:text-white";
const REPORT_INACTIVE_CHIP_CLASS = "border border-[#e4deef] bg-[#f4f5f8] text-[#68738c] dark:border-white/10 dark:bg-white/8 dark:text-white/60";
const REPORT_READ_SOURCE_LABEL = "Server-side compact unified report read";

export function TaskReportWorkspace({ achievementModel, achievementWarning, appVersion, todayDateKey, userId }: TaskReportWorkspaceProps) {
  const [rangeId, setRangeId] = useState<TaskReportRangeId>("last7");
  const [customRange, setCustomRange] = useState<TaskReportCustomRange>({ endDateKey: todayDateKey, startDateKey: todayDateKey });
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [readWarning, setReadWarning] = useState<string | null>(null);
  const [reportData, setReportData] = useState<UnifiedReportReadModel>(() => createEmptyUnifiedReportReadModel(todayDateKey, todayDateKey));

  useEffect(() => {
    let cancelled = false;
    async function loadReport() {
      setIsLoading(true);
      setCopyFeedback(null);
      const fetchRange = resolveTaskReportHistoryFetchRange(rangeId, todayDateKey, rangeId === "custom" ? customRange : null);
      if (!userId) {
        if (!cancelled) {
          setReportData(createEmptyUnifiedReportReadModel(fetchRange.startDateKey ?? todayDateKey, fetchRange.endDateKey ?? todayDateKey));
          setReadWarning("Report reads require an active signed-in user.");
          setIsLoading(false);
        }
        return;
      }
      const client = createBrowserSupabaseClient();
      if (!client) {
        if (!cancelled) {
          setReadWarning("Supabase is unavailable for the compact report read.");
          setIsLoading(false);
        }
        return;
      }
      try {
        const { data, error } = await client.functions.invoke<UnifiedReportReadModel>("report-read", {
          body: { endDateKey: fetchRange.endDateKey, startDateKey: fetchRange.startDateKey, todayDateKey },
        });
        if (error) throw new Error(error.message);
        if (!data?.dateRange || !Array.isArray(data.days) || !data.tasks || !data.focus) throw new Error("Compact report read returned an invalid model.");
        if (!cancelled) {
          setReportData(data);
          setReadWarning(null);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error && error.message ? error.message : "Unknown report read error.";
          setReportData(createEmptyUnifiedReportReadModel(fetchRange.startDateKey ?? todayDateKey, fetchRange.endDateKey ?? todayDateKey));
          setReadWarning(`Compact report data failed to load (${message}).`);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadReport();
    return () => { cancelled = true; };
  }, [customRange, rangeId, todayDateKey, userId]);

  const reportMarkdown = useMemo(() => generateTaskReport({
    achievementModel,
    achievementWarning,
    appVersion,
    customRange: rangeId === "custom" ? customRange : null,
    generatedAt: new Date(),
    historySourceLabel: REPORT_READ_SOURCE_LABEL,
    historyWarning: readWarning,
    rangeId,
    reportData,
    todayDateKey,
  }), [achievementModel, achievementWarning, appVersion, customRange, rangeId, readWarning, reportData, todayDateKey]);

  async function handleCopyReport() {
    if (isLoading) return;
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
            <p className="text-sm text-[#6c7792] dark:text-white/58">Generate one unified period report with compact evidence for ChatGPT.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {TASK_REPORT_RANGE_OPTIONS.map((option) => (
              <TaskTableChipButton key={option.id} onClick={() => setRangeId(option.id)} toneClassName={option.id === rangeId ? REPORT_ACTIVE_CHIP_CLASS : REPORT_INACTIVE_CHIP_CLASS}>
                {option.label}
              </TaskTableChipButton>
            ))}
          </div>
          {rangeId === "custom" ? (
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label="Report custom range start" className="h-8 w-[9.5rem] rounded-full border border-[#e4deef] bg-[#f4f5f8] px-3 py-1 text-[13px] text-[#24304a] dark:border-white/10 dark:bg-white/8 dark:text-white" max={customRange.endDateKey || undefined} onChange={(event) => setCustomRange((current) => ({ ...current, startDateKey: event.target.value || current.startDateKey }))} type="date" value={customRange.startDateKey} />
              <input aria-label="Report custom range end" className="h-8 w-[9.5rem] rounded-full border border-[#e4deef] bg-[#f4f5f8] px-3 py-1 text-[13px] text-[#24304a] dark:border-white/10 dark:bg-white/8 dark:text-white" min={customRange.startDateKey || undefined} onChange={(event) => setCustomRange((current) => ({ ...current, endDateKey: event.target.value || current.endDateKey }))} type="date" value={customRange.endDateKey} />
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <TaskTableChipButton className="gap-1.5" disabled={isLoading} onClick={() => { void handleCopyReport(); }} toneClassName={REPORT_ACTIVE_CHIP_CLASS}>
            <Copy className="h-3.5 w-3.5" />
            {isLoading ? "Loading Report..." : "Copy Report"}
          </TaskTableChipButton>
          {copyFeedback ? <p className="text-xs text-[#7b86a0] dark:text-white/52">{copyFeedback}</p> : null}
        </div>
      </div>
      <div className="mt-4 rounded-[1.25rem] border border-[#ece8f8] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-[#120f20]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[#24304a] dark:text-white">Report Preview</p>
          <span className="text-xs text-[#8a93aa] dark:text-white/45">{isLoading ? "Preparing compact report inputs..." : "Selectable Markdown"}</span>
        </div>
        <pre className="adhdice-scrollbar max-h-[70vh] select-text overflow-auto whitespace-pre-wrap rounded-[1rem] border border-[#ece8f8] bg-white px-4 py-3 text-[12.5px] leading-6 text-[#24304a] dark:border-white/10 dark:bg-white/[0.03] dark:text-white">{isLoading ? "Loading server-side report model..." : reportMarkdown}</pre>
      </div>
    </section>
  );
}
