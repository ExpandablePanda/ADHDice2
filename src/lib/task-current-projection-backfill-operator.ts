export const CURRENT_PROJECTION_BACKFILL_BATCH_SIZE = 10;
export const CURRENT_PROJECTION_BACKFILL_MAX_BATCHES = 5;
export const CURRENT_PROJECTION_REBUILD_BATCH_SIZE = CURRENT_PROJECTION_BACKFILL_BATCH_SIZE;
export const CURRENT_PROJECTION_REBUILD_MAX_BATCHES = CURRENT_PROJECTION_BACKFILL_MAX_BATCHES;
const CURRENT_PROJECTION_BACKFILL_FUNCTION = "task-current-projection-backfill";

export type ProjectionBackfillOperatorClient = {
  functions: {
    invoke<T>(
      functionName: string,
      options: { body: { limit: number; afterTaskId?: string | null } },
    ): Promise<{ data: T | null; error: { message?: string | null } | null }>;
  };
};

export type ProjectionBackfillBatchResponse = {
  candidateCount: number;
  writtenCount: number;
  failedCount: number;
  remainingCount: number;
  nextCursor?: string | null;
};

export type ProjectionBackfillOperatorProgress = {
  processedCount: number;
  totalCount: number;
  writtenCount: number;
  failedCount: number;
  remainingCount: number;
};

export type ProjectionBackfillOperatorResult = {
  requestCount: number;
  batchCount: number;
  processedCount: number;
  writtenCount: number;
  failedCount: number;
  remainingCount: number | null;
  stoppedReason: "completed" | "candidate_count_zero" | "partial_batch" | "failed_count" | "request_failed" | "count_failed" | "rollover_active" | "unmounted";
  errorMessage: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseBatchResponse(value: unknown): ProjectionBackfillBatchResponse | null {
  if (!isRecord(value)
    || !nonNegativeInteger(value.candidateCount)
    || !nonNegativeInteger(value.writtenCount)
    || !nonNegativeInteger(value.failedCount)
    || !nonNegativeInteger(value.remainingCount)
    || value.writtenCount + value.failedCount !== value.candidateCount) {
    return null;
  }
  if (value.nextCursor !== undefined && value.nextCursor !== null && typeof value.nextCursor !== "string") return null;
  return {
    candidateCount: value.candidateCount,
    writtenCount: value.writtenCount,
    failedCount: value.failedCount,
    remainingCount: value.remainingCount,
    nextCursor: value.nextCursor === undefined ? null : value.nextCursor,
  };
}

export async function runCurrentProjectionBackfillOperator(input: {
  client: ProjectionBackfillOperatorClient;
  maxBatches: number;
  shouldContinue?: () => boolean;
  isRolloverActive?: () => boolean;
  onProgress?: (progress: ProjectionBackfillOperatorProgress) => void;
}): Promise<ProjectionBackfillOperatorResult> {
  const maxBatches = Math.min(CURRENT_PROJECTION_BACKFILL_MAX_BATCHES, Math.max(1, Math.floor(input.maxBatches)));
  const shouldContinue = input.shouldContinue ?? (() => true);
  let requestCount = 0;
  let batchCount = 0;
  let processedCount = 0;
  let writtenCount = 0;
  let failedCount = 0;
  let remainingCount: number | null = null;
  let afterTaskId: string | null = null;
  let stoppedReason: ProjectionBackfillOperatorResult["stoppedReason"] = "completed";
  let errorMessage: string | null = null;

  for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
    if (input.isRolloverActive?.()) {
      stoppedReason = "rollover_active";
      break;
    }
    if (!shouldContinue()) {
      stoppedReason = "unmounted";
      break;
    }

    requestCount += 1;
    let data: unknown;
    try {
      const response = await input.client.functions.invoke<unknown>(CURRENT_PROJECTION_BACKFILL_FUNCTION, {
        body: { limit: CURRENT_PROJECTION_REBUILD_BATCH_SIZE, afterTaskId },
      });
      if (response.error) throw new Error(response.error.message ?? "Backfill request failed.");
      data = response.data;
    } catch (error) {
      stoppedReason = "request_failed";
      errorMessage = error instanceof Error ? error.message : "Backfill request failed.";
      break;
    }

    if (!shouldContinue()) {
      stoppedReason = "unmounted";
      break;
    }

    const batch = parseBatchResponse(data);
    if (!batch) {
      stoppedReason = "request_failed";
      errorMessage = "Backfill returned an unusable result.";
      break;
    }

    batchCount += 1;
    processedCount += batch.candidateCount;
    writtenCount += batch.writtenCount;
    failedCount += batch.failedCount;

    if (!shouldContinue()) {
      stoppedReason = "unmounted";
      break;
    }

    remainingCount = batch.remainingCount;
    afterTaskId = batch.nextCursor ?? null;

    input.onProgress?.({ processedCount, totalCount: maxBatches * CURRENT_PROJECTION_BACKFILL_BATCH_SIZE, writtenCount, failedCount, remainingCount });

    if (batch.failedCount > 0) {
      stoppedReason = "failed_count";
      break;
    }
    if (batch.candidateCount === 0) {
      stoppedReason = "candidate_count_zero";
      break;
    }
    if (batch.candidateCount < CURRENT_PROJECTION_REBUILD_BATCH_SIZE) {
      stoppedReason = "partial_batch";
      break;
    }
  }

  return {
    requestCount,
    batchCount,
    processedCount,
    writtenCount,
    failedCount,
    remainingCount,
    stoppedReason,
    errorMessage,
  };
}
