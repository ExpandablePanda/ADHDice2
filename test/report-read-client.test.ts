import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyUnifiedReportReadModel } from "../src/lib/unified-report-read-model.ts";
import { readUnifiedReport, type ReportReadClient, type UnifiedReportReadRequest } from "../src/lib/report-read-client.ts";

const request: UnifiedReportReadRequest = {
  endDateKey: "2026-09-07",
  startDateKey: "2026-09-01",
  todayDateKey: "2026-09-07",
};

function model() {
  return createEmptyUnifiedReportReadModel(request.startDateKey!, request.endDateKey!);
}

test("concurrent identical report reads share one backend invocation and result", async () => {
  let resolve!: (value: ReturnType<typeof model>) => void;
  const pending = new Promise<ReturnType<typeof model>>((resolver) => { resolve = resolver; });
  let calls = 0;
  const client = {
    functions: {
      invoke: async () => {
        calls += 1;
        return { data: await pending, error: null };
      },
    },
  } as ReportReadClient;

  const first = readUnifiedReport(client, "user-1", request);
  const second = readUnifiedReport(client, "user-1", { ...request });
  assert.strictEqual(first, second);
  assert.equal(calls, 1);
  resolve(model());
  assert.strictEqual(await first, await second);
});

test("changing range creates a separate report request", async () => {
  let calls = 0;
  const client = {
    functions: {
      invoke: async () => {
        calls += 1;
        return { data: model(), error: null };
      },
    },
  } as ReportReadClient;

  await readUnifiedReport(client, "user-2", request);
  await readUnifiedReport(client, "user-2", { ...request, startDateKey: "2026-09-02" });
  assert.equal(calls, 2);
});

test("a failed report request is removed so the same identity can retry", async () => {
  let calls = 0;
  const client = {
    functions: {
      invoke: async () => {
        calls += 1;
        if (calls === 1) return { data: null, error: { message: "temporary failure" } };
        return { data: model(), error: null };
      },
    },
  } as ReportReadClient;

  await assert.rejects(readUnifiedReport(client, "user-3", request), /temporary failure/);
  await readUnifiedReport(client, "user-3", request);
  assert.equal(calls, 2);
});

test("user changes do not share a report request across identities", async () => {
  let calls = 0;
  const client = {
    functions: {
      invoke: async () => {
        calls += 1;
        return { data: model(), error: null };
      },
    },
  } as ReportReadClient;

  const first = readUnifiedReport(client, "user-a", request);
  const second = readUnifiedReport(client, "user-b", request);
  assert.notStrictEqual(first, second);
  await Promise.all([first, second]);
  assert.equal(calls, 2);
});
