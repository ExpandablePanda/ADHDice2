import assert from "node:assert/strict";
import test from "node:test";
import { completeRecordsRefresh, retainRecordsAfterRefreshFailure, type RecordsInternalState } from "../src/hooks/useRecords.ts";
import { executeRecordsPipeline, RecordsStageError } from "../src/lib/record-repository.ts";

const baseState: RecordsInternalState = {
  currentRecords: [], error: null, events: [], hasSuccessfulResult: false, isLoading: false,
  isRecalculating: false, lastCalculatedAt: null, ownerUserId: "user-1",
  progress: null, provisionalCandidates: [], setupRequired: false, warnings: [],
};

function stages(overrides: Partial<Parameters<typeof executeRecordsPipeline>[0]> = {}) {
  return {
    evaluate: () => ({ provisionalCandidates: [], warnings: [] }),
    loadCurrentRecords: async () => ["current"],
    loadFocusSessions: async () => ["focus"],
    loadRecordEvents: async () => ["event"],
    loadTaskHistory: async () => ["history"],
    loadTasks: async () => ["task"],
    reconcile: async () => undefined,
    ...overrides,
  };
}

test("a failed source stage reports its exact stage without exposing payloads", async () => {
  await assert.rejects(
    () => executeRecordsPipeline(stages({ loadTaskHistory: async () => { throw new TypeError("Load failed"); } })),
    (error: unknown) => error instanceof RecordsStageError && error.stage === "Task History load" && error.message === "Task History load failed: Load failed",
  );
});

test("a failed reconciliation reports the reconciliation stage", async () => {
  await assert.rejects(
    () => executeRecordsPipeline(stages({ reconcile: async () => { throw Object.assign(new Error("request rejected"), { code: "413" }); } })),
    (error: unknown) => error instanceof RecordsStageError && error.stage === "Records reconciliation" && error.code === "413",
  );
});

test("failed refresh retains the last successful Records snapshot", () => {
  const successful = completeRecordsRefresh(baseState, {
    currentRecords: [{ id: "record-1" }] as never[], evaluatedAt: "2026-07-20T12:00:00Z",
    events: [{ id: "event-1" }] as never[], ownerUserId: "user-1", provisionalCandidates: [], warnings: [],
  });
  const failed = retainRecordsAfterRefreshFailure(successful, { error: "Focus Session load failed: Load failed", ownerUserId: "user-1", setupRequired: false });
  assert.equal(failed.currentRecords[0]?.id, "record-1");
  assert.equal(failed.events[0]?.id, "event-1");
  assert.equal(failed.lastCalculatedAt, successful.lastCalculatedAt);
  assert.equal(failed.hasSuccessfulResult, true);
});

test("successful empty data is distinguishable from a load failure", () => {
  const emptySuccess = completeRecordsRefresh(baseState, { currentRecords: [], evaluatedAt: "2026-07-20T12:00:00Z", events: [], ownerUserId: "user-1", provisionalCandidates: [], warnings: [] });
  const initialFailure = retainRecordsAfterRefreshFailure(baseState, { error: "Task load failed: Load failed", ownerUserId: "user-1", setupRequired: false });
  assert.equal(emptySuccess.hasSuccessfulResult, true);
  assert.equal(initialFailure.hasSuccessfulResult, false);
});

test("successful pipeline returns loaded current Records and events", async () => {
  const result = await executeRecordsPipeline(stages());
  assert.deepEqual(result.currentRecords, ["current"]);
  assert.deepEqual(result.events, ["event"]);
});
