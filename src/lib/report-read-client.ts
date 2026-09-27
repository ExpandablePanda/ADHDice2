import type { UnifiedReportReadModel } from "@/lib/unified-report-read-model";

export type UnifiedReportReadRequest = {
  endDateKey: string | null;
  startDateKey: string | null;
  todayDateKey: string;
};

export type ReportReadClient = {
  functions: {
    invoke<T>(functionName: string, options: { body: UnifiedReportReadRequest }): Promise<{
      data: T | null;
      error: { message?: string } | null;
    }>;
  };
};

const inFlightReportReads = new Map<string, Promise<UnifiedReportReadModel>>();

function reportReadKey(userId: string, request: UnifiedReportReadRequest) {
  return JSON.stringify([userId, request.startDateKey, request.endDateKey, request.todayDateKey]);
}

export function readUnifiedReport(
  client: ReportReadClient,
  userId: string,
  request: UnifiedReportReadRequest,
) {
  const key = reportReadKey(userId, request);
  const existing = inFlightReportReads.get(key);
  if (existing) return existing;

  const requestPromise = (async () => {
    const { data, error } = await client.functions.invoke<UnifiedReportReadModel>("report-read", { body: request });
    if (error) throw new Error(error.message ?? "Report read failed.");
    if (!data?.dateRange || !Array.isArray(data.days) || !data.tasks || !data.focus) throw new Error("Compact report read returned an invalid model.");
    return data;
  })();
  const trackedPromise = requestPromise.finally(() => {
    if (inFlightReportReads.get(key) === trackedPromise) inFlightReportReads.delete(key);
  });
  inFlightReportReads.set(key, trackedPromise);
  return trackedPromise;
}
