import {
  rebuildCurrentTaskProjection,
  type CurrentTaskProjectionRebuildResult,
  type TrustedCurrentTaskProjectionClient,
} from "../../../src/lib/task-current-projection-rebuild.ts";

export const CURRENT_PROJECTION_BACKFILL_DEFAULT_LIMIT = 10;
export const CURRENT_PROJECTION_BACKFILL_MAX_LIMIT = 10;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CurrentProjectionBackfillRequest = {
  limit: number;
  afterTaskId: string | null;
};

export type BackfillAdminClient = {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { code?: string | null; message?: string | null } | null }>;
};

export type ProjectionBackfillTaskResult = {
  taskId: string;
  status: "written" | "failed";
  reason?: string;
};

export type ProjectionBackfillResponse = {
  requestedLimit: number;
  candidateCount: number;
  writtenCount: number;
  failedCount: number;
  retryCount: number;
  remainingCount: number;
  results: ProjectionBackfillTaskResult[];
  nextCursor: string | null;
  elapsedMs: number;
};

type BackfillSummary = Pick<ProjectionBackfillResponse, "candidateCount" | "writtenCount" | "failedCount" | "retryCount" | "elapsedMs">;

type RebuildCurrentTaskProjection = (input: {
  adminClient: BackfillAdminClient;
  userId: string;
  taskId: string;
}) => Promise<CurrentTaskProjectionRebuildResult>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function parseCurrentProjectionBackfillRequest(value: unknown): CurrentProjectionBackfillRequest | null {
  if (!isRecord(value)) return null;
  if (Object.keys(value).some((key) => key !== "limit" && key !== "afterTaskId")) return null;

  const limit = value.limit === undefined
    ? CURRENT_PROJECTION_BACKFILL_DEFAULT_LIMIT
    : value.limit;
  if (typeof limit !== "number"
    || !Number.isSafeInteger(limit)
    || limit < 1
    || limit > CURRENT_PROJECTION_BACKFILL_MAX_LIMIT) {
    return null;
  }

  const afterTaskId = value.afterTaskId === undefined || value.afterTaskId === null
    ? null
    : value.afterTaskId;
  if (afterTaskId !== null && !isUuid(afterTaskId)) return null;
  return { limit, afterTaskId };
}

function rpcError(
  result: { error: { code?: string | null; message?: string | null } | null },
  operation: string,
) {
  if (!result.error) return;
  throw new Error(`${operation}: ${result.error.message ?? "database query failed"}`);
}

function rowId(row: unknown, field: string, operation: string) {
  if (!isRecord(row) || !isUuid(row[field])) {
    throw new Error(`${operation}: database returned a malformed UUID row.`);
  }
  return row[field];
}

export async function loadMissingCurrentProjectionCandidates(
  adminClient: BackfillAdminClient,
  userId: string,
  request: CurrentProjectionBackfillRequest,
): Promise<string[]> {
  const result = await adminClient.rpc(
    "adhdice_list_missing_task_current_projection_candidates",
    {
      p_user_id: userId,
      p_limit: request.limit,
      p_after_task_id: request.afterTaskId,
    },
  );
  rpcError(result, "Current projection candidate query failed");
  if (!Array.isArray(result.data) || result.data.length > request.limit) {
    throw new Error("Current projection candidate query returned malformed data.");
  }
  return result.data.map((row) => rowId(row, "id", "Current projection candidate query"));
}

const defaultRebuildCurrentTaskProjection: RebuildCurrentTaskProjection = async ({ adminClient, userId, taskId }) => (
  rebuildCurrentTaskProjection({
    adminClient: adminClient as unknown as TrustedCurrentTaskProjectionClient,
    userId,
    taskId,
  })
);

export async function runCurrentProjectionBackfill(input: {
  adminClient: BackfillAdminClient;
  userId: string;
  request: CurrentProjectionBackfillRequest;
  rebuild?: RebuildCurrentTaskProjection;
  now?: () => number;
  logSummary?: (summary: BackfillSummary) => void;
}): Promise<ProjectionBackfillResponse> {
  const now = input.now ?? Date.now;
  const startedAt = now();
  const candidateIds = await loadMissingCurrentProjectionCandidates(input.adminClient, input.userId, input.request);
  const results: ProjectionBackfillTaskResult[] = [];
  let writtenCount = 0;
  let failedCount = 0;
  let retryCount = 0;
  const rebuild = input.rebuild ?? defaultRebuildCurrentTaskProjection;

  for (const taskId of candidateIds) {
    let result: CurrentTaskProjectionRebuildResult;
    try {
      result = await rebuild({ adminClient: input.adminClient, userId: input.userId, taskId });
    } catch {
      result = { status: "failed", reason: "unexpected_projection_rebuild_error", message: "Projection rebuild failed." };
    }

    if (result.status === "retryable") {
      retryCount += 1;
      try {
        result = await rebuild({ adminClient: input.adminClient, userId: input.userId, taskId });
      } catch {
        result = { status: "failed", reason: "unexpected_projection_rebuild_error", message: "Projection rebuild retry failed." };
      }
    }

    if (result.status === "written") {
      writtenCount += 1;
      results.push({ taskId, status: "written" });
    } else {
      failedCount += 1;
      results.push({ taskId, status: "failed", reason: result.reason });
    }
  }

  const response: ProjectionBackfillResponse = {
    requestedLimit: input.request.limit,
    candidateCount: candidateIds.length,
    writtenCount,
    failedCount,
    retryCount,
    remainingCount: await loadMissingCurrentProjectionCount(input.adminClient, input.userId),
    results,
    nextCursor: candidateIds.length > 0 ? candidateIds[candidateIds.length - 1]! : null,
    elapsedMs: Math.max(0, now() - startedAt),
  };
  const summary = {
    candidateCount: response.candidateCount,
    writtenCount: response.writtenCount,
    failedCount: response.failedCount,
    retryCount: response.retryCount,
    elapsedMs: response.elapsedMs,
  } satisfies BackfillSummary;
  (input.logSummary ?? ((value) => console.info("[task-current-projection-backfill] completed", value)))(summary);
  return response;
}

async function loadMissingCurrentProjectionCount(adminClient: BackfillAdminClient, userId: string) {
  const result = await adminClient.rpc("adhdice_count_missing_task_current_projections", {
    p_user_id: userId,
  });
  if (result.error) {
    throw new Error(`Current projection remaining-count query failed: ${result.error.message ?? "database query failed"}`);
  }
  if (typeof result.data !== "number" || !Number.isSafeInteger(result.data) || result.data < 0) {
    throw new Error("Current projection remaining-count query returned malformed data.");
  }
  return result.data;
}
