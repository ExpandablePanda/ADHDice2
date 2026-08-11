import type { createBrowserSupabaseClient } from "@/lib/supabase";
import type { FocusSession, Task, TaskHistory } from "@/lib/database.types";
import type { CanonicalTaskHistoryFact } from "@/lib/task-state-canonical/types";
import type { RecordsEvaluation, PersistedRecordCurrent, PersistedRecordEvent } from "@/lib/records/types";
import { evaluateRecords } from "@/lib/records/evaluator";
import { mapCanonicalTaskHistoryFacts } from "@/lib/task-state-canonical/history-projection";
import { TASK_STATE_CANONICAL_COMMANDS_ENABLED } from "@/lib/task-state-runtime-gate";
import {
  RECORDS_CHUNK_CLIENT_MAX_BYTES,
  recordsUploadEnvelope,
  serializeRecordsReconciliation,
  utf8Bytes,
  type RecordsReconciliationChunk,
} from "@/lib/records/persistence";

export type RecordsClient = NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
const PAGE_SIZE = 1000;
const activeRecordsPipelines = new Map<string, Promise<unknown>>();
export const RECORDS_BUSY_MESSAGE = "Records are already refreshing in another session.";

type RecordsFinalizeResult =
  | { status: "busy" }
  | { current_count: number; evaluated_at: string; event_count: number; status: "ok" };

type RecordsBeginResult =
  | { status: "busy" }
  | {
    status: "ready" | "resume";
    run_id: string;
    received_chunks: Array<{ chunk_digest: string; chunk_index: number; row_kind: string; section_key: string }>;
    expected_chunk_count: number;
    expected_current_row_count: number;
    expected_event_row_count: number;
  };

export class RecordsBusyError extends Error {
  readonly code = "RECORDS_BUSY";

  constructor() {
    super(RECORDS_BUSY_MESSAGE);
    this.name = "RecordsBusyError";
  }
}

export type RecordsPipelineStage =
  | "Task load"
  | "Task History load"
  | "Focus Session load"
  | "Records evaluation"
  | "Records reconciliation"
  | "Current Records load"
  | "Record events load";

export type RecordsProgress = string;
type RecordsRpcName =
  | "adhdice_begin_records_reconciliation"
  | "adhdice_upload_records_reconciliation_chunk"
  | "adhdice_finalize_records_reconciliation";
type RecordsRpcStage = "Begin" | "Upload" | "Finalize";
type RecordsErrorDetail = { code?: string; details?: string; hint?: string; message?: string };

export class RecordsRpcContractError extends Error {
  readonly code = "RECORDS_RPC_SIGNATURE";

  constructor(stage: RecordsRpcStage) {
    super(`${stage} Records RPC argument mismatch; expected p_payload.`);
    this.name = "RecordsRpcContractError";
  }
}

export class RecordsStageError extends Error {
  readonly code: string | undefined;
  readonly stage: RecordsPipelineStage;

  constructor(stage: RecordsPipelineStage, cause: unknown) {
    const detail = cause as { code?: string; message?: string };
    const message = typeof detail?.message === "string" && detail.message.trim() ? detail.message.trim() : "Unknown error";
    super(`${stage} failed: ${message}`, { cause });
    this.name = "RecordsStageError";
    this.code = detail?.code;
    this.stage = stage;
  }
}

export async function withRecordsStage<T>(stage: RecordsPipelineStage, operation: () => Promise<T> | T): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof RecordsStageError) throw error;
    throw new RecordsStageError(stage, error);
  }
}

function recordsErrorText(error: RecordsErrorDetail | null | undefined) {
  return `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
}

export function isRecordsRpcSignatureMismatch(error: RecordsErrorDetail | null | undefined) {
  if (error?.code?.toUpperCase() !== "PGRST202") return false;
  const signature = recordsErrorText(error).match(/adhdice_(?:begin_records_reconciliation|upload_records_reconciliation_chunk|finalize_records_reconciliation)\(([^)]*)\)/i);
  return Boolean(signature && signature[1].trim().toLowerCase() !== "p_payload");
}

export function isRecordsSetupError(error: RecordsErrorDetail | null | undefined) {
  const code = error?.code?.toUpperCase();
  if (code === "RECORDS_RPC_SIGNATURE" || isRecordsRpcSignatureMismatch(error)) return false;
  if (code === "42P01" || code === "PGRST205") return true;
  if (code === "42883") {
    return /(?:function\s+)?(?:public\.)?adhdice_(?:begin_records_reconciliation|upload_records_reconciliation_chunk|finalize_records_reconciliation)/i.test(recordsErrorText(error));
  }
  if (code === "PGRST202") {
    return /adhdice_(?:begin_records_reconciliation|upload_records_reconciliation_chunk|finalize_records_reconciliation)\(p_payload\)/i.test(recordsErrorText(error));
  }
  return /adhdice_record_(?:current|events|reconcile_runs|reconcile_chunks|current_stage|event_stage).*(?:does not exist|not found|schema cache)/i.test(recordsErrorText(error));
}

export function isRecordsBusyError(error: { code?: string } | null | undefined) {
  return error?.code === "RECORDS_BUSY";
}

export async function callRecordsRpc(client: Pick<RecordsClient, "rpc">, name: RecordsRpcName, pPayload: unknown, stage: RecordsRpcStage) {
  const response = await client.rpc(name, { p_payload: pPayload });
  if (response.error) {
    if (isRecordsRpcSignatureMismatch(response.error)) throw new RecordsRpcContractError(stage);
    throw response.error;
  }
  return response.data;
}

export async function loadRecordsTasks(client: RecordsClient, userId: string) {
  const rows: Task[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client.from("adhdice_clean_tasks").select("*").eq("user_id", userId).order("created_at", { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as Task[]));
    if ((data?.length ?? 0) < PAGE_SIZE) return rows;
  }
}

export async function loadRecordsTaskHistory(client: RecordsClient, userId: string) {
  const rows: TaskHistory[] = [];
  if (TASK_STATE_CANONICAL_COMMANDS_ENABLED) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await client
        .from("adhdice_task_history_facts")
        .select("*")
        .eq("user_id", userId)
        .order("logical_date", { ascending: true })
        .order("updated_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      rows.push(...mapCanonicalTaskHistoryFacts((data ?? []) as CanonicalTaskHistoryFact[]));
      if ((data?.length ?? 0) < PAGE_SIZE) return rows;
    }
  }
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client.from("adhdice_task_history").select("*").eq("user_id", userId).order("created_at", { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as TaskHistory[]));
    if ((data?.length ?? 0) < PAGE_SIZE) return rows;
  }
}

export async function loadRecordsFocusSessions(client: RecordsClient, userId: string) {
  const rows: FocusSession[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client.from("adhdice_focus_sessions").select("*").eq("user_id", userId).order("created_at", { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as FocusSession[]));
    if ((data?.length ?? 0) < PAGE_SIZE) return rows;
  }
}

export async function loadCompleteRecordsSources(client: RecordsClient, userId: string) {
  const tasks = await withRecordsStage("Task load", () => loadRecordsTasks(client, userId));
  const taskHistory = await withRecordsStage("Task History load", () => loadRecordsTaskHistory(client, userId));
  const focusSessions = await withRecordsStage("Focus Session load", () => loadRecordsFocusSessions(client, userId));
  return { focusSessions, taskHistory, tasks };
}

function chunkKey(chunk: Pick<RecordsReconciliationChunk, "chunkDigest" | "chunkIndex" | "rowKind" | "sectionKey">) {
  return `${chunk.rowKind}:${chunk.sectionKey}:${chunk.chunkIndex}:${chunk.chunkDigest}`;
}

const SECTION_LABELS = {
  global_tasks: "Global Task records",
  streaks: "Streak records",
  focus: "Focus records",
  per_task: "Per-task records",
  record_history: "Record History",
} as const;

export async function reconcileRecords(
  client: Pick<RecordsClient, "rpc">,
  evaluation: RecordsEvaluation,
  timezone: string,
  logicalDayStart: string,
  onProgress: (progress: RecordsProgress) => void = () => undefined,
) {
  onProgress("Preparing Records");
  const serialized = await serializeRecordsReconciliation(evaluation, timezone, logicalDayStart);
  if (process.env.NODE_ENV === "development") {
    console.info("Records compact reconciliation", {
      totalCompactBytes: serialized.measurements.compactTotalBytes,
      chunkCount: serialized.measurements.totalChunks,
      maximumChunkBytes: serialized.measurements.maximumChunkBytes,
      currentRowCount: serialized.measurements.currentRowCount,
      eventRowCount: serialized.measurements.eventRowCount,
      maximumEvidenceBytes: serialized.measurements.maximumEvidenceBytes,
    });
  }

  const begin = await callRecordsRpc(client, "adhdice_begin_records_reconciliation", serialized.manifest, "Begin") as RecordsBeginResult | null;
  if (begin?.status === "busy") throw new RecordsBusyError();
  if (!begin || (begin.status !== "ready" && begin.status !== "resume") || typeof begin.run_id !== "string") {
    throw new Error("Records reconciliation begin returned an invalid response.");
  }
  const acknowledged = new Set(begin.received_chunks.map((chunk) => `${chunk.row_kind}:${chunk.section_key}:${chunk.chunk_index}:${chunk.chunk_digest}`));
  const sectionTotals = new Map<string, number>();
  for (const chunk of serialized.chunks) sectionTotals.set(chunk.sectionKey, (sectionTotals.get(chunk.sectionKey) ?? 0) + 1);

  for (const chunk of serialized.chunks) {
    if (acknowledged.has(chunkKey(chunk))) continue;
    onProgress(`Uploading ${SECTION_LABELS[chunk.sectionKey]} — ${chunk.chunkIndex + 1} of ${sectionTotals.get(chunk.sectionKey)}`);
    const envelope = recordsUploadEnvelope(begin.run_id, chunk);
    const serializedRequest = JSON.stringify({ p_payload: envelope });
    const requestBytes = utf8Bytes(serializedRequest);
    if (requestBytes > RECORDS_CHUNK_CLIENT_MAX_BYTES) {
      throw new Error(`Records ${SECTION_LABELS[chunk.sectionKey]} chunk is ${requestBytes.toLocaleString()} bytes and exceeds the 750 KiB upload limit.`);
    }
    const upload = await callRecordsRpc(client, "adhdice_upload_records_reconciliation_chunk", envelope, "Upload") as { status?: string } | null;
    if (upload?.status !== "ok" && upload?.status !== "already_received") throw new Error("Records chunk upload returned an invalid response.");
  }

  onProgress("Finalizing Records");
  const result = await callRecordsRpc(client, "adhdice_finalize_records_reconciliation", { run_id: begin.run_id, manifest_digest: serialized.manifest.manifest_digest }, "Finalize") as RecordsFinalizeResult | null;
  if (result?.status === "busy") throw new RecordsBusyError();
  if (result?.status !== "ok") throw new Error("Records reconciliation finalize returned an invalid response.");
  onProgress("Reloading Records");
  return { ...result, measurements: serialized.measurements };
}

export async function loadPersistedRecords(client: RecordsClient, userId: string) {
  const currentRecords = await loadRecordsCurrent(client, userId);
  const events = await loadRecordEvents(client, userId);
  return { currentRecords, events };
}

export async function loadRecordsCurrent(client: RecordsClient, userId: string) {
  return withRecordsStage("Current Records load", async () => {
    const result = await client.from("adhdice_record_current").select("*").eq("user_id", userId).eq("rules_version", "records-v1").order("metric_key", { ascending: true });
    if (result.error) throw result.error;
    return (result.data ?? []) as PersistedRecordCurrent[];
  });
}

export async function loadRecordEvents(client: RecordsClient, userId: string) {
  return withRecordsStage("Record events load", async () => {
    const result = await client.from("adhdice_record_events").select("*").eq("user_id", userId).eq("rules_version", "records-v1").order("credited_date", { ascending: false }).order("created_at", { ascending: false });
    if (result.error) throw result.error;
    return (result.data ?? []) as PersistedRecordEvent[];
  });
}

export type RecordsPipelineStages<TTasks, THistory, TFocus, TEvaluation, TCurrent, TEvents> = {
  evaluate: (tasks: TTasks, taskHistory: THistory, focusSessions: TFocus) => Promise<TEvaluation> | TEvaluation;
  loadCurrentRecords: () => Promise<TCurrent>;
  loadFocusSessions: () => Promise<TFocus>;
  loadRecordEvents: () => Promise<TEvents>;
  loadTaskHistory: () => Promise<THistory>;
  loadTasks: () => Promise<TTasks>;
  reconcile: (evaluation: TEvaluation) => Promise<unknown>;
};

export async function executeRecordsPipeline<TTasks, THistory, TFocus, TEvaluation, TCurrent, TEvents>(stages: RecordsPipelineStages<TTasks, THistory, TFocus, TEvaluation, TCurrent, TEvents>) {
  const tasks = await withRecordsStage("Task load", stages.loadTasks);
  const taskHistory = await withRecordsStage("Task History load", stages.loadTaskHistory);
  const focusSessions = await withRecordsStage("Focus Session load", stages.loadFocusSessions);
  const evaluation = await withRecordsStage("Records evaluation", () => stages.evaluate(tasks, taskHistory, focusSessions));
  await withRecordsStage("Records reconciliation", () => stages.reconcile(evaluation));
  const currentRecords = await withRecordsStage("Current Records load", stages.loadCurrentRecords);
  const events = await withRecordsStage("Record events load", stages.loadRecordEvents);
  return { currentRecords, evaluation, events, focusSessions, taskHistory, tasks };
}

export function runRecordsPipelineSingleFlight<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  const active = activeRecordsPipelines.get(userId);
  if (active) return active as Promise<T>;
  const request = operation();
  activeRecordsPipelines.set(userId, request);
  void request.finally(() => {
    if (activeRecordsPipelines.get(userId) === request) activeRecordsPipelines.delete(userId);
  }).catch(() => undefined);
  return request;
}

export async function runRecordsPipeline(client: RecordsClient, userId: string, input: { evaluatedAt: string; logicalDayStart: string; openLogicalDate: string; timezone: string }, onProgress?: (progress: RecordsProgress) => void) {
  return executeRecordsPipeline({
    evaluate: (tasks, taskHistory, focusSessions) => evaluateRecords({ ...input, focusSessions, taskHistory, tasks }),
    loadCurrentRecords: () => loadRecordsCurrent(client, userId),
    loadFocusSessions: () => loadRecordsFocusSessions(client, userId),
    loadRecordEvents: () => loadRecordEvents(client, userId),
    loadTaskHistory: () => loadRecordsTaskHistory(client, userId),
    loadTasks: () => loadRecordsTasks(client, userId),
    reconcile: (evaluation) => reconcileRecords(client, evaluation, input.timezone, input.logicalDayStart, onProgress),
  });
}
