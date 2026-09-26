import type { RecordsClient } from "../../../src/lib/record-repository.ts";
import { getLogicalDayKey } from "../../../src/lib/logical-day.ts";
import {
  executeRecordsRecalculation,
  type RecordsRecalculationResponse,
  type RecordsRecalculationResult,
} from "../../../src/lib/records/recalculation.ts";
import { buildTaskEvidenceByRecordIdentity } from "../../../src/lib/records/evidence.ts";
import { recordsSourceStateFingerprint, type RecordsSourceState } from "../../../src/lib/records/source-state.ts";
import { loadRecordsFocusSessions, loadRecordsSourceState, loadRecordsTaskHistory, loadRecordsTasks, reconcileRecords } from "../../../src/lib/record-repository.ts";
export type { RecordsRecalculationResponse } from "../../../src/lib/records/recalculation.ts";

export type RecordsRecalculateRequest = Readonly<{
  logicalDayStart: string;
  timezone: string;
}>;

export type RecordsRecalculateResponse = RecordsRecalculationResponse;

const LOGICAL_DAY_START_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const MAX_TIMEZONE_LENGTH = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseRecordsRecalculateRequest(value: unknown): RecordsRecalculateRequest | null {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== "logicalDayStart" && key !== "timezone")) return null;
  if (typeof value.logicalDayStart !== "string" || !LOGICAL_DAY_START_PATTERN.test(value.logicalDayStart)) return null;
  if (typeof value.timezone !== "string" || value.timezone.trim().length === 0 || value.timezone.length > MAX_TIMEZONE_LENGTH) return null;
  return { logicalDayStart: value.logicalDayStart, timezone: value.timezone };
}

function developmentEnvironment() {
  return Deno.env.get("NODE_ENV") === "development";
}

function logSummary(input: {
  elapsedMs: number;
  evaluation: RecordsRecalculationResult["evaluation"];
  focusCount: number;
  historyCount: number;
  logicalDate: string;
  retryCount: number;
  sourceState: RecordsSourceState;
  taskCount: number;
}) {
  if (!developmentEnvironment()) return;
  console.info("[records-recalculate] completed", {
    sourceRows: {
      tasks: input.taskCount,
      taskHistory: input.historyCount,
      focusSessions: input.focusCount,
    },
    evaluator: {
      currentCount: input.evaluation.currentRecords.length,
      eventCount: input.evaluation.events.length,
    },
    retryCount: input.retryCount,
    elapsedMs: input.elapsedMs,
    sourceFingerprint: recordsSourceStateFingerprint(input.sourceState),
    logicalDate: input.logicalDate,
  });
}

export async function runRecordsRecalculation(input: {
  client: RecordsClient;
  now?: () => number;
  request: RecordsRecalculateRequest;
  userId: string;
}): Promise<RecordsRecalculateResponse> {
  const now = input.now ?? Date.now;
  const startedAt = now();
  let loadedSourceCounts = { focusSessions: 0, taskHistory: 0, tasks: 0 };
  const result = await executeRecordsRecalculation({
    getCurrentLogicalDate: () => getLogicalDayKey(new Date(now()), {
      dayStartTime: input.request.logicalDayStart,
      timezone: input.request.timezone,
    }),
    loadSourceState: () => loadRecordsSourceState(input.client),
    loadSources: async () => {
      const tasks = await loadRecordsTasks(input.client, input.userId);
      const taskHistory = await loadRecordsTaskHistory(input.client, input.userId);
      const focusSessions = await loadRecordsFocusSessions(input.client, input.userId);
      loadedSourceCounts = { focusSessions: focusSessions.length, taskHistory: taskHistory.length, tasks: tasks.length };
      return { focusSessions, taskHistory, tasks };
    },
    logicalDayStart: input.request.logicalDayStart,
    reconcile: (evaluation, sourceState) => reconcileRecords(input.client, evaluation, input.request.timezone, input.request.logicalDayStart, sourceState),
    requireSourceState: true,
    timezone: input.request.timezone,
  });
  logSummary({
    elapsedMs: Math.max(0, now() - startedAt),
    evaluation: result.evaluation,
    focusCount: loadedSourceCounts.focusSessions,
    historyCount: loadedSourceCounts.taskHistory,
    logicalDate: result.logicalDate,
    retryCount: result.retryCount,
    sourceState: result.sourceState,
    taskCount: loadedSourceCounts.tasks,
  });
  return {
    currentCount: result.evaluation.currentRecords.length,
    evaluatedAt: result.evaluation.evaluatedAt,
    eventCount: result.evaluation.events.length,
    logicalDate: result.logicalDate,
    provisionalCandidates: result.evaluation.provisionalCandidates,
    retryCount: result.retryCount,
    sourceState: result.sourceState,
    status: "ok",
    taskEvidenceByRecordIdentity: buildTaskEvidenceByRecordIdentity(result.evaluation.currentRecords),
    warnings: result.evaluation.warnings,
  };
}
