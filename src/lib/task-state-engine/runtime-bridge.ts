import type { Task, TaskHistory } from "@/lib/database.types";
import {
  runTaskStateShadow,
  type TaskStateShadowOptions,
  type TaskStateShadowReport,
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
  __ADHDICE_RUN_TASK_STATE_SHADOW__?: (options?: TaskStateShadowOptions) => TaskStateShadowReport;
  __ADHDICE_LATEST_TASK_STATE_SHADOW__?: TaskStateShadowReport;
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
    skipped: report.taskCountSkipped,
    matches: report.matchCount,
    adapterWarnings: report.adapterWarningCount,
    approvedDifferences: report.approvedSemanticDifferences.length,
    unexpectedDifferences: report.unexpectedDifferences.length,
    proposedHistoryRows: report.proposedHistoryRowCount,
    safetyViolations: report.safetyViolations.length,
    slowestTaskMs: report.slowestTaskTimeMs,
  }]);
  if (Object.keys(report.mismatchCountByField).length > 0) {
    output.info("Differences by field", report.mismatchCountByField);
  }
  if (report.safetyViolations.length > 0) {
    output.warn("Safety violations", report.safetyViolations);
  }
  output.info("Full report stored on window.__ADHDICE_LATEST_TASK_STATE_SHADOW__");
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
    return () => {};
  }

  const run = (options?: TaskStateShadowOptions) => {
    const report = runTaskStateShadow({ ...getSnapshot(), options });
    target.__ADHDICE_LATEST_TASK_STATE_SHADOW__ = report;
    printSummary(report, output);
    return report;
  };
  target.__ADHDICE_RUN_TASK_STATE_SHADOW__ = run;

  return () => {
    if (target.__ADHDICE_RUN_TASK_STATE_SHADOW__ === run) {
      delete target.__ADHDICE_RUN_TASK_STATE_SHADOW__;
      delete target.__ADHDICE_LATEST_TASK_STATE_SHADOW__;
    }
  };
}
