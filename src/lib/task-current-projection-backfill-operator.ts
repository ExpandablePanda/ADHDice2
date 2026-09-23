export const CURRENT_PROJECTION_BACKFILL_BATCH_SIZE = 10;
export const CURRENT_PROJECTION_BACKFILL_MAX_BATCHES = 5;
const CURRENT_PROJECTION_BACKFILL_FUNCTION = "task-current-projection-backfill";

type ProjectionBackfillQueryResult = {
  count: number | null;
  error: { message?: string | null } | null;
};

type ProjectionBackfillCountQuery = PromiseLike<ProjectionBackfillQueryResult> & {
  select(columns: string, options: { count: "exact"; head: true }): ProjectionBackfillCountQuery;
  eq(column: string, value: string): ProjectionBackfillCountQuery;
  is(column: string, value: null): ProjectionBackfillCountQuery;
  in(column: string, values: string[]): ProjectionBackfillCountQuery;
};

export type ProjectionBackfillOperatorClient = {
  functions: {
    invoke<T>(
      functionName: string,
      options: { body: { limit: number } },
    ): Promise<{ data: T | null; error: { message?: string | null } | null }>;
  };
  from(table: string): ProjectionBackfillCountQuery;
};

export type ProjectionBackfillBatchResponse = {
  candidateCount: number;
  writtenCount: number;
  failedCount: number;
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
  stoppedReason: "completed" | "candidate_count_zero" | "partial_batch" | "failed_count" | "request_failed" | "count_failed" | "unmounted";
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
    || value.writtenCount + value.failedCount !== value.candidateCount) {
    return null;
  }
  return {
    candidateCount: value.candidateCount,
    writtenCount: value.writtenCount,
    failedCount: value.failedCount,
  };
}

export async function loadMissingCurrentProjectionCount(
  client: ProjectionBackfillOperatorClient,
  userId: string,
): Promise<number> {
  const result = await client
    .from("adhdice_clean_tasks")
    .select("id, adhdice_task_current_projections!left(entity_id)", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("permanently_deleted_at", null)
    .eq("canonicalization_status", "canonical_runtime")
    .in("entity_kind", ["parent", "step", "substep"])
    .is("adhdice_task_current_projections.entity_id", null);
  if (result.error) {
    throw new Error(result.error.message ?? "Missing projection count query failed.");
  }
  if (!nonNegativeInteger(result.count)) {
    throw new Error("Missing projection count query returned an unusable result.");
  }
  return result.count;
}

export async function runCurrentProjectionBackfillOperator(input: {
  client: ProjectionBackfillOperatorClient;
  userId: string;
  maxBatches: number;
  shouldContinue?: () => boolean;
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
  let stoppedReason: ProjectionBackfillOperatorResult["stoppedReason"] = "completed";
  let errorMessage: string | null = null;

  for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
    if (!shouldContinue()) {
      stoppedReason = "unmounted";
      break;
    }

    requestCount += 1;
    let data: unknown;
    try {
      const response = await input.client.functions.invoke<unknown>(CURRENT_PROJECTION_BACKFILL_FUNCTION, {
        body: { limit: CURRENT_PROJECTION_BACKFILL_BATCH_SIZE },
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

    try {
      remainingCount = await loadMissingCurrentProjectionCount(input.client, input.userId);
    } catch (error) {
      stoppedReason = "count_failed";
      errorMessage = error instanceof Error ? error.message : "Missing projection count query failed.";
      break;
    }

    if (!shouldContinue()) {
      stoppedReason = "unmounted";
      break;
    }

    input.onProgress?.({ processedCount, totalCount: maxBatches * CURRENT_PROJECTION_BACKFILL_BATCH_SIZE, writtenCount, failedCount, remainingCount });

    if (batch.failedCount > 0) {
      stoppedReason = "failed_count";
      break;
    }
    if (batch.candidateCount === 0) {
      stoppedReason = "candidate_count_zero";
      break;
    }
    if (batch.candidateCount < CURRENT_PROJECTION_BACKFILL_BATCH_SIZE) {
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
