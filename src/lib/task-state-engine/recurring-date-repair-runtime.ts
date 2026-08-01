import type { Task, TaskHistory } from "@/lib/database.types";
import {
  buildRecurringDateRepairReport,
  type RecurringDateRepairReport,
} from "./recurring-date-repair-report.ts";

type RepairSnapshot = {
  tasks: readonly Task[];
  history: readonly TaskHistory[];
  now: string | Date;
  timezone: string;
  rolloverTime: string;
};

export type RecurringDateRepairWindow = {
  __ADHDICE_RECURRING_DATE_REPAIR_REPORT__?: RecurringDateRepairReport;
  __ADHDICE_BUILD_RECURRING_DATE_REPAIR_REPORT__?: () => RecurringDateRepairReport;
};

declare global {
  interface Window {
    __ADHDICE_RECURRING_DATE_REPAIR_REPORT__?: RecurringDateRepairReport;
    __ADHDICE_BUILD_RECURRING_DATE_REPAIR_REPORT__?: () => RecurringDateRepairReport;
  }
}

export function registerRecurringDateRepairReportBridge({
  environment,
  getSnapshot,
  target,
}: {
  environment: string | undefined;
  getSnapshot: () => RepairSnapshot;
  target: RecurringDateRepairWindow;
}) {
  if (environment !== "development") {
    delete target.__ADHDICE_RECURRING_DATE_REPAIR_REPORT__;
    delete target.__ADHDICE_BUILD_RECURRING_DATE_REPAIR_REPORT__;
    return () => {};
  }

  const build = () => {
    const report = buildRecurringDateRepairReport(getSnapshot());
    target.__ADHDICE_RECURRING_DATE_REPAIR_REPORT__ = report;
    return report;
  };
  target.__ADHDICE_BUILD_RECURRING_DATE_REPAIR_REPORT__ = build;
  build();

  return () => {
    if (target.__ADHDICE_BUILD_RECURRING_DATE_REPAIR_REPORT__ === build) {
      delete target.__ADHDICE_BUILD_RECURRING_DATE_REPAIR_REPORT__;
      delete target.__ADHDICE_RECURRING_DATE_REPAIR_REPORT__;
    }
  };
}
