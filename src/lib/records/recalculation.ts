import type { FocusSession, Task, TaskHistory } from "../database.types.ts";
import { evaluateRecords } from "./evaluator.ts";
import type { RecordTaskEvidenceByRecordIdentity } from "./evidence.ts";
import { recordsSourceStatesMatch, type RecordsSourceState } from "./source-state.ts";
import type { ProvisionalRecordCandidate, RecordsEvaluation, RecordsEvaluationInput } from "./types.ts";

export type RecordsRecalculationSources = Readonly<{
  focusSessions: readonly FocusSession[];
  taskHistory: readonly TaskHistory[];
  tasks: readonly Task[];
}>;

export class RecordsRecalculationSourceChangedError extends Error {
  readonly code = "RECORDS_SOURCE_CHANGED";

  constructor() {
    super("Records source data changed during evaluation; retry required.");
    this.name = "RecordsRecalculationSourceChangedError";
  }
}

export class RecordsRecalculationLogicalDateChangedError extends Error {
  readonly code = "RECORDS_LOGICAL_DATE_CHANGED";

  constructor() {
    super("The Records logical day changed during evaluation; retry required.");
    this.name = "RecordsRecalculationLogicalDateChangedError";
  }
}

export class RecordsRecalculationSourceStateUnavailableError extends Error {
  readonly code = "RECORDS_SOURCE_STATE_UNAVAILABLE";

  constructor() {
    super("Records source state is unavailable; recalculation cannot be certified.");
    this.name = "RecordsRecalculationSourceStateUnavailableError";
  }
}

export type RecordsRecalculationResult = Readonly<{
  evaluation: RecordsEvaluation;
  logicalDate: string;
  retryCount: number;
  sourceState: RecordsSourceState;
}>;

export type RecordsRecalculationResponse = Readonly<{
  currentCount: number;
  evaluatedAt: string;
  eventCount: number;
  logicalDate: string;
  provisionalCandidates: ProvisionalRecordCandidate[];
  retryCount: number;
  sourceState: RecordsSourceState;
  status: "ok";
  taskEvidenceByRecordIdentity: RecordTaskEvidenceByRecordIdentity;
  warnings: string[];
}>;

export type RecordsRecalculationInput = Readonly<{
  evaluate?: (input: RecordsEvaluationInput) => RecordsEvaluation | Promise<RecordsEvaluation>;
  evaluatedAt?: string | (() => string);
  getCurrentLogicalDate: () => string | Promise<string>;
  loadSourceState: () => Promise<RecordsSourceState | null>;
  loadSources: () => Promise<RecordsRecalculationSources>;
  logicalDayStart: string;
  onProgress?: (progress: string) => void;
  reconcile: (evaluation: RecordsEvaluation, sourceState: RecordsSourceState) => Promise<unknown>;
  requireSourceState?: boolean;
  timezone: string;
}>;

function evaluatedAt(input: RecordsRecalculationInput) {
  return typeof input.evaluatedAt === "function"
    ? input.evaluatedAt()
    : input.evaluatedAt ?? new Date().toISOString();
}

function isSourceRace(error: unknown) {
  const detail = error as { code?: string } | null;
  return detail?.code === "40001"
    || error instanceof RecordsRecalculationSourceChangedError;
}

function isLogicalDateRace(error: unknown) {
  const detail = error as { code?: string } | null;
  return error instanceof RecordsRecalculationLogicalDateChangedError
    || detail?.code === "RECORDS_LOGICAL_DATE_CHANGED";
}

async function retryOrThrow(input: RecordsRecalculationInput, attempt: number, error: Error) {
  if (attempt > 0) throw error;
  input.onProgress?.(error instanceof RecordsRecalculationLogicalDateChangedError
    ? "Records logical day changed; retrying Records"
    : "Records sources changed; retrying Records");
}

/**
 * Shared Records recalculation protocol. It owns the source and logical-day
 * fences; callers supply only source loading and the existing reconciliation
 * writer. The evaluator remains the single semantic authority.
 */
export async function executeRecordsRecalculation(input: RecordsRecalculationInput): Promise<RecordsRecalculationResult> {
  let lastRace: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const sourceStateBefore = await input.loadSourceState();
    if (input.requireSourceState && !sourceStateBefore) throw new RecordsRecalculationSourceStateUnavailableError();
    const logicalDateBefore = await input.getCurrentLogicalDate();
    input.onProgress?.("Loading Records sources");
    const sources = await input.loadSources();
    input.onProgress?.("Evaluating Records");
    const evaluationInput: RecordsEvaluationInput = {
      evaluatedAt: evaluatedAt(input),
      focusSessions: sources.focusSessions,
      logicalDayStart: input.logicalDayStart,
      openLogicalDate: logicalDateBefore,
      taskHistory: sources.taskHistory,
      tasks: sources.tasks,
      timezone: input.timezone,
    };
    const evaluation = await (input.evaluate ?? evaluateRecords)(evaluationInput);
    const sourceStateAfter = await input.loadSourceState();
    if (input.requireSourceState && !sourceStateAfter) throw new RecordsRecalculationSourceStateUnavailableError();
    const logicalDateAfterEvaluation = await input.getCurrentLogicalDate();
    if (sourceStateBefore && !recordsSourceStatesMatch(sourceStateBefore, sourceStateAfter)) {
      lastRace = new RecordsRecalculationSourceChangedError();
      await retryOrThrow(input, attempt, lastRace);
      continue;
    }
    if (logicalDateBefore !== logicalDateAfterEvaluation) {
      lastRace = new RecordsRecalculationLogicalDateChangedError();
      await retryOrThrow(input, attempt, lastRace);
      continue;
    }

    input.onProgress?.("Reconciling Records");
    try {
      await input.reconcile(evaluation, sourceStateAfter!);
    } catch (error) {
      if (isSourceRace(error)) {
        lastRace = new RecordsRecalculationSourceChangedError();
        await retryOrThrow(input, attempt, lastRace);
        continue;
      }
      if (isLogicalDateRace(error)) {
        lastRace = new RecordsRecalculationLogicalDateChangedError();
        await retryOrThrow(input, attempt, lastRace);
        continue;
      }
      throw error;
    }

    const logicalDateAfterReconciliation = await input.getCurrentLogicalDate();
    if (logicalDateAfterReconciliation !== logicalDateAfterEvaluation) {
      lastRace = new RecordsRecalculationLogicalDateChangedError();
      await retryOrThrow(input, attempt, lastRace);
      continue;
    }
    return {
      evaluation,
      logicalDate: logicalDateAfterReconciliation,
      retryCount: attempt,
      sourceState: sourceStateAfter!,
    };
  }
  throw lastRace ?? new RecordsRecalculationSourceChangedError();
}
