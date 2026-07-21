import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { completeRecordsRefresh, retainRecordsAfterRefreshFailure, type RecordsInternalState } from "../src/hooks/useRecords.ts";
import { reconcileRecords, RECORDS_BUSY_MESSAGE, RecordsBusyError, runRecordsPipelineSingleFlight } from "../src/lib/record-repository.ts";
import { evaluateRecords } from "../src/lib/records/evaluator.ts";
import {
  compactRecordEvidence,
  RECORDS_CHUNK_CLIENT_MAX_BYTES,
  RECORDS_COMPACT_TOTAL_MAX_BYTES,
  RECORDS_EVIDENCE_MAX_BYTES,
  recordsUploadEnvelope,
  serializeRecordsReconciliation,
} from "../src/lib/records/persistence.ts";
import type { Task, TaskHistory } from "../src/lib/database.types.ts";
import type { RecordsEvaluation } from "../src/lib/records/types.ts";

const patch = readFileSync(new URL("../supabase/patch_records_chunked_reconciliation.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const repository = readFileSync(new URL("../src/lib/record-repository.ts", import.meta.url), "utf8");

function buildFixture(): RecordsEvaluation {
  const task = {
    id: "stress-task", parent_task_id: null, repeat_frequency: "daily", title: "fixture", user_id: "fixture-user",
  } as Task;
  const taskHistory: TaskHistory[] = [];
  for (let index = 0; index < 365; index += 1) {
    const date = new Date(Date.UTC(2025, 6, 20 + index)).toISOString().slice(0, 10);
    taskHistory.push({
      id: `row-${index}`, task_id: task.id, user_id: task.user_id, entry_date: date,
      occurrence_key: `occurrence:${date}`, occurrence_due_on: date, status: "done", event_type: "status",
      counted_as_due_occurrence: false, was_completed: true, created_at: `${date}T12:00:00Z`,
      updated_at: `${date}T12:00:00Z`,
    } as TaskHistory);
  }
  return evaluateRecords({
    evaluatedAt: "2026-07-20T12:00:00Z", focusSessions: [], logicalDayStart: "06:00",
    openLogicalDate: "2026-07-20", taskHistory, tasks: [task], timezone: "America/New_York",
  });
}

type RpcResponse = { data: unknown; error: { code?: string; message: string } | null };

class FakeRecordsProtocol {
  active: { digest: string; manifest: Record<string, unknown>; runId: string } | null = null;
  received = new Map<string, { digest: string; rows: Array<Record<string, unknown>> }>();
  liveCurrent: Array<Record<string, unknown>> = [{ record_identity: "old-current", first_achieved_at: "2020-01-01T00:00:00Z" }];
  liveEvents: Array<Record<string, unknown>> = [{ event_identity: "old-event", first_achieved_at: "2020-01-01T00:00:00Z", validity_state: "valid" }];
  calls: string[] = [];
  failUploadAt: number | null = null;
  finalizeBusy = false;
  expired = false;
  uploadCalls = 0;
  concurrentUploads = 0;
  maximumConcurrentUploads = 0;

  async rpc(name: string, args: { p_payload: Record<string, unknown> }): Promise<RpcResponse> {
    this.calls.push(name);
    const payload = args.p_payload;
    if (name === "adhdice_begin_records_reconciliation") {
      if (this.expired) {
        this.active = null;
        this.received.clear();
        this.expired = false;
      }
      if (this.active && this.active.digest !== payload.manifest_digest) return { data: { status: "busy" }, error: null };
      if (!this.active) this.active = { digest: String(payload.manifest_digest), manifest: payload, runId: "00000000-0000-0000-0000-000000000001" };
      return {
        data: {
          status: this.received.size ? "resume" : "ready",
          run_id: this.active.runId,
          received_chunks: [...this.received.entries()].map(([key, chunk]) => {
            const [row_kind, section_key, chunk_index] = key.split(":");
            return { row_kind, section_key, chunk_index: Number(chunk_index), chunk_digest: chunk.digest };
          }),
          expected_chunk_count: payload.expected_chunk_count,
          expected_current_row_count: payload.expected_current_row_count,
          expected_event_row_count: payload.expected_event_row_count,
        },
        error: null,
      };
    }
    if (name === "adhdice_upload_records_reconciliation_chunk") {
      this.concurrentUploads += 1;
      this.maximumConcurrentUploads = Math.max(this.maximumConcurrentUploads, this.concurrentUploads);
      this.uploadCalls += 1;
      await Promise.resolve();
      try {
        if (this.failUploadAt === this.uploadCalls) return { data: null, error: { code: "UPLOAD_FAILED", message: "scoped upload failure" } };
        const key = `${payload.row_kind}:${payload.section_key}:${payload.chunk_index}`;
        const digest = String(payload.chunk_digest);
        const existing = this.received.get(key);
        if (existing?.digest === digest) return { data: { status: "already_received" }, error: null };
        if (existing) return { data: null, error: { code: "23505", message: "different digest" } };
        const identities = new Set([...this.received.values()].flatMap((chunk) => chunk.rows.map((row) => String(row.record_identity))));
        const rows = payload.rows as Array<Record<string, unknown>>;
        if (rows.some((row) => identities.has(String(row.record_identity)))) return { data: null, error: { code: "23505", message: "duplicate identity" } };
        this.received.set(key, { digest, rows });
        return { data: { status: "ok" }, error: null };
      } finally {
        this.concurrentUploads -= 1;
      }
    }
    if (name === "adhdice_finalize_records_reconciliation") {
      if (this.finalizeBusy) return { data: { status: "busy" }, error: null };
      const expectedChunks = Number(this.active?.manifest.expected_chunk_count);
      const expectedCurrent = Number(this.active?.manifest.expected_current_row_count);
      const expectedEvents = Number(this.active?.manifest.expected_event_row_count);
      const rows = [...this.received.values()].flatMap((chunk) => chunk.rows);
      const current = rows.filter((row) => !("event_identity" in row));
      const events = rows.filter((row) => "event_identity" in row);
      if (this.received.size !== expectedChunks || current.length !== expectedCurrent || events.length !== expectedEvents) {
        return { data: null, error: { code: "22023", message: "incomplete" } };
      }
      const priorCurrent = new Map(this.liveCurrent.map((row) => [row.record_identity, row]));
      const priorEvents = new Map(this.liveEvents.map((row) => [row.event_identity, row]));
      this.liveCurrent = current.map((row) => ({ ...row, first_achieved_at: priorCurrent.get(row.record_identity)?.first_achieved_at ?? row.first_achieved_at }));
      const nextEventIds = new Set(events.map((row) => row.event_identity));
      this.liveEvents = [
        ...events.map((row) => ({ ...row, first_achieved_at: priorEvents.get(row.event_identity)?.first_achieved_at ?? row.first_achieved_at, validity_state: "valid" })),
        ...this.liveEvents.filter((row) => !nextEventIds.has(row.event_identity)).map((row) => ({ ...row, validity_state: "invalid" })),
      ];
      this.active = null;
      this.received.clear();
      return { data: { status: "ok", current_count: current.length, event_count: events.length, evaluated_at: "2026-07-20T12:00:00Z" }, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  }
}

test("7.2.24 compact evidence and byte-bounded chunk contract", async () => {
  const evaluation = buildFixture();
  const serialized = await serializeRecordsReconciliation(evaluation, "America/New_York", "06:00");
  const boundary = JSON.stringify({ current: serialized.currentRows, events: serialized.eventRows });

  assert.doesNotMatch(boundary, /sourceRows|identities|counted_as_due_occurrence|occurrence_key|Task History|focus_type_snapshot|notes/);
  for (const row of [...serialized.currentRows, ...serialized.eventRows]) {
    assert.equal(row.evidence_snapshot.schemaVersion, 2);
    assert.ok(row.evidence_snapshot.evidenceDigest.startsWith("sha256:"));
    assert.ok(!("sourceRows" in row.evidence_snapshot));
    assert.ok(!("identities" in row.evidence_snapshot));
  }
  for (const event of serialized.eventRows.filter((row) => ["period_aggregate", "streak", "biggest_comeback"].includes(row.evidence_snapshot.kind))) {
    assert.ok(event.evidence_snapshot.evidenceCount >= 1);
    assert.ok(!Array.isArray(event.evidence_snapshot));
  }

  const sample = evaluation.events.find((event) => event.evidence.identities.length > 2)!;
  const reversed = { ...sample, evidence: { identities: [...sample.evidence.identities].reverse(), sourceRows: [...sample.evidence.sourceRows].reverse() } };
  const changed = { ...sample, evidence: { identities: [...sample.evidence.identities.slice(0, -1), "changed-identity"], sourceRows: sample.evidence.sourceRows } };
  assert.equal((await compactRecordEvidence(sample)).evidenceDigest, (await compactRecordEvidence(reversed)).evidenceDigest);
  assert.notEqual((await compactRecordEvidence(sample)).evidenceDigest, (await compactRecordEvidence(changed)).evidenceDigest);

  assert.ok(serialized.measurements.compactTotalBytes < RECORDS_COMPACT_TOTAL_MAX_BYTES);
  assert.ok(serialized.measurements.maximumEvidenceBytes < RECORDS_EVIDENCE_MAX_BYTES);
  assert.ok(serialized.chunks.every((chunk) => chunk.bytes < RECORDS_CHUNK_CLIENT_MAX_BYTES));
  assert.equal(serialized.chunks.reduce((sum, chunk) => sum + chunk.rowCount, 0), serialized.currentRows.length + serialized.eventRows.length);
  const identities = serialized.chunks.flatMap((chunk) => chunk.rows.map((row) => row.record_identity));
  assert.equal(new Set(identities).size, identities.length);
  assert.ok(serialized.chunks.length > 1);

  console.log(`records_compact_measurement=${JSON.stringify({
    compact_total_bytes: serialized.measurements.compactTotalBytes,
    total_chunks: serialized.measurements.totalChunks,
    maximum_chunk_bytes: serialized.measurements.maximumChunkBytes,
    maximum_evidence_bytes: serialized.measurements.maximumEvidenceBytes,
    current_row_count: serialized.measurements.currentRowCount,
    event_row_count: serialized.measurements.eventRowCount,
  })}`);
});

test("7.2.24 repository resumes sequential chunks and publishes only on complete finalization", async () => {
  const evaluation = buildFixture();
  const protocol = new FakeRecordsProtocol();
  const priorCurrent = structuredClone(protocol.liveCurrent);
  const priorEvents = structuredClone(protocol.liveEvents);
  protocol.failUploadAt = 2;

  await assert.rejects(
    () => reconcileRecords(protocol as never, evaluation, "America/New_York", "06:00"),
    (error: unknown) => (error as { code?: string; message?: string }).code === "UPLOAD_FAILED"
      && (error as { message?: string }).message === "scoped upload failure",
  );
  assert.deepEqual(protocol.liveCurrent, priorCurrent);
  assert.deepEqual(protocol.liveEvents, priorEvents);
  assert.equal(protocol.received.size, 1);

  protocol.failUploadAt = null;
  const callsBeforeResume = protocol.calls.length;
  await reconcileRecords(protocol as never, evaluation, "America/New_York", "06:00");
  const resumedCalls = protocol.calls.slice(callsBeforeResume);
  assert.equal(resumedCalls[0], "adhdice_begin_records_reconciliation");
  assert.equal(resumedCalls.at(-1), "adhdice_finalize_records_reconciliation");
  assert.equal(protocol.maximumConcurrentUploads, 1);
  assert.notDeepEqual(protocol.liveCurrent, priorCurrent);
  assert.ok(protocol.liveEvents.some((event) => event.event_identity === "old-event" && event.validity_state === "invalid"));
  assert.ok(protocol.calls.indexOf("adhdice_finalize_records_reconciliation") < protocol.calls.lastIndexOf("adhdice_begin_records_reconciliation") || protocol.calls.filter((name) => name === "adhdice_finalize_records_reconciliation").length === 1);
});

test("7.2.24 protocol rejects conflicts, incompleteness, and busy publication without live writes", async () => {
  const evaluation = buildFixture();
  const serialized = await serializeRecordsReconciliation(evaluation, "America/New_York", "06:00");
  const protocol = new FakeRecordsProtocol();
  const begin = await protocol.rpc("adhdice_begin_records_reconciliation", { p_payload: serialized.manifest as unknown as Record<string, unknown> });
  const runId = String((begin.data as { run_id: string }).run_id);
  const firstEnvelope = recordsUploadEnvelope(runId, serialized.chunks[0]) as unknown as Record<string, unknown>;
  assert.equal((await protocol.rpc("adhdice_upload_records_reconciliation_chunk", { p_payload: firstEnvelope })).error, null);
  const replay = await protocol.rpc("adhdice_upload_records_reconciliation_chunk", { p_payload: firstEnvelope });
  assert.deepEqual(replay.data, { status: "already_received" });
  assert.equal((await protocol.rpc("adhdice_upload_records_reconciliation_chunk", { p_payload: { ...firstEnvelope, chunk_digest: `sha256:${"f".repeat(64)}` } })).error?.code, "23505");

  const duplicateEnvelope = { ...recordsUploadEnvelope(runId, serialized.chunks[1]), rows: [serialized.chunks[0].rows[0]], row_count: 1 } as unknown as Record<string, unknown>;
  assert.equal((await protocol.rpc("adhdice_upload_records_reconciliation_chunk", { p_payload: duplicateEnvelope })).error?.code, "23505");
  assert.equal((await protocol.rpc("adhdice_finalize_records_reconciliation", { p_payload: { run_id: runId, manifest_digest: serialized.manifest.manifest_digest } })).error?.code, "22023");

  const liveBeforeBusy = structuredClone(protocol.liveCurrent);
  protocol.finalizeBusy = true;
  for (const chunk of serialized.chunks.slice(1)) {
    await protocol.rpc("adhdice_upload_records_reconciliation_chunk", { p_payload: recordsUploadEnvelope(runId, chunk) as unknown as Record<string, unknown> });
  }
  const busy = await protocol.rpc("adhdice_finalize_records_reconciliation", { p_payload: { run_id: runId, manifest_digest: serialized.manifest.manifest_digest } });
  assert.deepEqual(busy.data, { status: "busy" });
  assert.deepEqual(protocol.liveCurrent, liveBeforeBusy);

  const different = { ...serialized.manifest, manifest_digest: `sha256:${"a".repeat(64)}` };
  assert.deepEqual((await protocol.rpc("adhdice_begin_records_reconciliation", { p_payload: different })).data, { status: "busy" });
  protocol.expired = true;
  const liveBeforeCleanup = structuredClone(protocol.liveCurrent);
  assert.equal((await protocol.rpc("adhdice_begin_records_reconciliation", { p_payload: different })).error, null);
  assert.deepEqual(protocol.liveCurrent, liveBeforeCleanup);
});

test("7.2.24 SQL exposes only canonical staged RPCs and preserves publication invariants", () => {
  for (const source of [patch, schema]) {
    assert.equal((source.match(/create function public\.adhdice_begin_records_reconciliation\(p_payload jsonb\)/g) ?? []).length, 1);
    assert.equal((source.match(/create function public\.adhdice_upload_records_reconciliation_chunk\(p_payload jsonb\)/g) ?? []).length, 1);
    assert.equal((source.match(/create function public\.adhdice_finalize_records_reconciliation\(p_payload jsonb\)/g) ?? []).length, 1);
    assert.doesNotMatch(source, /create (?:or replace )?function public\.adhdice_reconcile_records/);
    assert.match(source, /drop function if exists public\.adhdice_reconcile_records\(jsonb\)/);
    assert.match(source, /notify pgrst, 'reload schema'/);
    assert.match(source, /pg_try_advisory_xact_lock/);
    assert.match(source, /octet_length\(p_payload::text\).*1048576/s);
    assert.match(source, /evidence_snapshot->>'schemaVersion' = '2'/);
    assert.equal((source.match(/jsonb_to_recordset\(p_payload->'rows'\)/g) ?? []).length, 2);
    assert.match(source, /Duplicate Records identity across chunks/);
    assert.match(source, /already_received/);
    assert.match(source, /different digest/);
    assert.match(source, /Records reconciliation is incomplete/);
    assert.match(source, /first_achieved_at = least/);
    assert.doesNotMatch(source, /first_qualified_at = excluded/);
    assert.doesNotMatch(source, /delete from public\.adhdice_record_events/);
    assert.match(source, /absent_from_complete_recalculation/);
    assert.match(source, /legacy_compacted/);
    assert.match(source, /interval '45 minutes'/);
    assert.match(source, /enable row level security/);
    assert.match(source, /revoke all on table public\.adhdice_record_reconcile_runs from public, anon, authenticated/);
  }
  assert.doesNotMatch(patch, /set\s+(?:local\s+)?statement_timeout/i);
  assert.match(repository, /for \(const chunk of serialized\.chunks\)/);
  assert.doesNotMatch(repository, /Promise\.all\([^)]*upload/);
  assert.match(repository, /adhdice_begin_records_reconciliation[\s\S]*adhdice_upload_records_reconciliation_chunk[\s\S]*adhdice_finalize_records_reconciliation/);
  assert.match(repository, /onProgress\("Reloading Records"\)/);
});

test("7.2.24 busy and refresh failure preserve the previous UI snapshot", async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const first = runRecordsPipelineSingleFlight("user-1", async () => { calls += 1; await gate; return "done"; });
  const second = runRecordsPipelineSingleFlight("user-1", async () => { calls += 1; return "duplicate"; });
  assert.strictEqual(second, first);
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 1);

  const prior: RecordsInternalState = completeRecordsRefresh({
    currentRecords: [], error: null, events: [], hasSuccessfulResult: false, isLoading: false,
    isRecalculating: false, lastCalculatedAt: null, ownerUserId: "user-1", progress: null,
    provisionalCandidates: [], setupRequired: false, warnings: [],
  }, {
    currentRecords: [{ id: "record-1" }] as never[], evaluatedAt: "2026-07-20T12:00:00Z",
    events: [{ id: "event-1" }] as never[], ownerUserId: "user-1", provisionalCandidates: [], warnings: [],
  });
  const failed = retainRecordsAfterRefreshFailure(prior, { error: "upload failed", ownerUserId: "user-1", setupRequired: false });
  assert.equal(failed.currentRecords[0]?.id, "record-1");
  assert.equal(failed.events[0]?.id, "event-1");
  assert.equal(failed.hasSuccessfulResult, true);

  await assert.rejects(
    () => reconcileRecords({ rpc: async () => ({ data: { status: "busy" }, error: null }) } as never, buildFixture(), "America/New_York", "06:00"),
    (error: unknown) => error instanceof RecordsBusyError && error.message === RECORDS_BUSY_MESSAGE,
  );
});
