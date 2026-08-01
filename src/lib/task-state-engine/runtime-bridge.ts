import type { Task, TaskHistory } from "@/lib/database.types";
import {
  formatTaskStateShadowReportJson,
  runTaskStateShadow,
  summarizeTaskStateShadowReport,
  type TaskStateShadowOptions,
  type TaskStateShadowReport,
  type TaskStateShadowReviewOptions,
} from "./shadow.ts";

type ShadowSnapshot = {
  tasks: readonly Task[];
  history: readonly TaskHistory[];
  now: string | Date;
  timezone: string;
  rolloverTime: string;
};

type ShadowConsole = Pick<Console, "groupCollapsed" | "groupEnd" | "info" | "table" | "warn">;

export type TaskStateShadowWindow = {
  __ADHDICE_TASK_STATE_ACTIVE_STATUS_AUTHORITY__?: "engine" | "legacy";
  __ADHDICE_RUN_TASK_STATE_SHADOW__?: (options?: TaskStateShadowOptions) => TaskStateShadowReport;
  __ADHDICE_LATEST_TASK_STATE_SHADOW__?: TaskStateShadowReport;
  __ADHDICE_SUMMARIZE_TASK_STATE_SHADOW__?: (
    options?: TaskStateShadowReviewOptions,
  ) => ReturnType<typeof summarizeTaskStateShadowReport> | undefined;
  __ADHDICE_EXPORT_TASK_STATE_SHADOW__?: (
    options?: Pick<TaskStateShadowReviewOptions, "includeTitles">,
  ) => string | undefined;
};

declare global {
  interface Window extends TaskStateShadowWindow {}
}

function printSummary(report: TaskStateShadowReport, output: ShadowConsole) {
  output.groupCollapsed(
    `[ADHDice Task State shadow] ${report.taskCountEvaluated} tasks in ${report.totalExecutionTimeMs.toFixed(1)}ms`,
  );
  output.table([{
    logicalDate: report.logicalDate,
    evaluated: report.taskCountEvaluated,
    excludedLifecycle: report.skippedTasks.excludedLifecycleTaskCount,
    fullySkippedUnsupported: report.skippedTasks.fullySkippedUnsupportedTaskCount,
    skipped: report.taskCountSkipped,
    matches: report.matchCount,
    adapterWarnings: report.adapterWarningCount,
    approvedDifferences: report.approvedSemanticDifferences.length,
    representationOnlyDifferences: report.representationOnlyDifferences.length,
    adapterLimitations: report.adapterLimitations.length,
    legacyDataAnomalies: report.legacyDataAnomalies.length,
    possibleEngineDefects: report.possibleEngineDefectCount,
    proposedHistoryRows: report.proposedHistoryRowCount,
    safetyViolations: report.safetyViolations.length,
    slowestTaskMs: report.slowestTaskTimeMs,
  }]);
  if (Object.keys(report.mismatchCountByField).length > 0) {
    output.info("Differences by field", report.mismatchCountByField);
  }
  output.info("Semantic group summaries", report.semanticGroupSummaries);
  output.info("Possible defect patterns", report.possibleDefectPatterns);
  if (report.safetyViolations.length > 0) {
    output.warn("Safety violations", report.safetyViolations);
  }
  output.info("Review with window.__ADHDICE_SUMMARIZE_TASK_STATE_SHADOW__()");
  output.groupEnd();
}

export function registerTaskStateShadowBridge({
  environment,
  getSnapshot,
  output = console,
  target,
}: {
  environment: string | undefined;
  getSnapshot: () => ShadowSnapshot;
  output?: ShadowConsole;
  target: TaskStateShadowWindow;
}) {
  if (environment !== "development") {
    delete target.__ADHDICE_RUN_TASK_STATE_SHADOW__;
    delete target.__ADHDICE_LATEST_TASK_STATE_SHADOW__;
    delete target.__ADHDICE_SUMMARIZE_TASK_STATE_SHADOW__;
    delete target.__ADHDICE_EXPORT_TASK_STATE_SHADOW__;
    return () => {};
  }

  const run = (options?: TaskStateShadowOptions) => {
    const report = runTaskStateShadow({ ...getSnapshot(), options });
    target.__ADHDICE_LATEST_TASK_STATE_SHADOW__ = report;
    printSummary(report, output);
    return report;
  };
  const summarize = (options?: TaskStateShadowReviewOptions) => {
    const report = target.__ADHDICE_LATEST_TASK_STATE_SHADOW__;
    return report ? summarizeTaskStateShadowReport(report, options) : undefined;
  };
  const exportJson = (options?: Pick<TaskStateShadowReviewOptions, "includeTitles">) => {
    const report = target.__ADHDICE_LATEST_TASK_STATE_SHADOW__;
    return report ? formatTaskStateShadowReportJson(report, options) : undefined;
  };
  target.__ADHDICE_RUN_TASK_STATE_SHADOW__ = run;
  target.__ADHDICE_SUMMARIZE_TASK_STATE_SHADOW__ = summarize;
  target.__ADHDICE_EXPORT_TASK_STATE_SHADOW__ = exportJson;

  return () => {
    if (target.__ADHDICE_RUN_TASK_STATE_SHADOW__ === run) {
      delete target.__ADHDICE_RUN_TASK_STATE_SHADOW__;
      delete target.__ADHDICE_LATEST_TASK_STATE_SHADOW__;
    }
    if (target.__ADHDICE_SUMMARIZE_TASK_STATE_SHADOW__ === summarize) {
      delete target.__ADHDICE_SUMMARIZE_TASK_STATE_SHADOW__;
    }
    if (target.__ADHDICE_EXPORT_TASK_STATE_SHADOW__ === exportJson) {
      delete target.__ADHDICE_EXPORT_TASK_STATE_SHADOW__;
    }
  };
}
