import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { retainRecordsAfterRefreshFailure, type RecordsInternalState } from "../src/hooks/useRecords.ts";
import {
  callRecordsRpc,
  isRecordsRpcSignatureMismatch,
  isRecordsSetupError,
  RecordsRpcContractError,
} from "../src/lib/record-repository.ts";

const repository = readFileSync(new URL("../src/lib/record-repository.ts", import.meta.url), "utf8");

test("7.2.25 chunked Records RPCs expose exactly one p_payload SQL argument", async () => {
  const calls: Array<{ args: Record<string, unknown>; name: string }> = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ args, name });
      return { data: { status: "ok" }, error: null };
    },
  };
  const cases = [
    ["adhdice_begin_records_reconciliation", { manifest: true }, "Begin"],
    ["adhdice_upload_records_reconciliation_chunk", { rows: [] }, "Upload"],
    ["adhdice_finalize_records_reconciliation", { run_id: "run" }, "Finalize"],
  ] as const;

  for (const [name, payload, stage] of cases) await callRecordsRpc(client as never, name, payload, stage);

  assert.deepEqual(calls.map((call) => call.name), cases.map(([name]) => name));
  for (let index = 0; index < calls.length; index += 1) {
    assert.deepEqual(Object.keys(calls[index].args), ["p_payload"]);
    assert.strictEqual(calls[index].args.p_payload, cases[index][1]);
  }
  assert.doesNotMatch(repository, /\.rpc\(\s*["']adhdice_(?:begin_records_reconciliation|upload_records_reconciliation_chunk|finalize_records_reconciliation)["']\s*,\s*{\s*(?:payload|manifest|chunk)\s*:/);
  assert.match(repository, /client\.rpc\(name, { p_payload: pPayload }\)/);
});

test("7.2.25 signature mismatch stays stage-specific while genuine absence retains setup fallback", async () => {
  const mismatch = {
    code: "PGRST202",
    message: "Could not find the function public.adhdice_begin_records_reconciliation(payload) in the schema cache",
  };
  assert.equal(isRecordsRpcSignatureMismatch(mismatch), true);
  await assert.rejects(
    () => callRecordsRpc({ rpc: async () => ({ data: null, error: mismatch }) } as never, "adhdice_begin_records_reconciliation", {}, "Begin"),
    (error: unknown) => error instanceof RecordsRpcContractError
      && error.code === "RECORDS_RPC_SIGNATURE"
      && error.message === "Begin Records RPC argument mismatch; expected p_payload."
      && !isRecordsSetupError(error),
  );

  assert.equal(isRecordsSetupError({
    code: "PGRST202",
    message: "Could not find the function public.adhdice_begin_records_reconciliation(p_payload) in the schema cache",
  }), true);
  assert.equal(isRecordsSetupError({ code: "42883", message: "function public.adhdice_begin_records_reconciliation(jsonb) does not exist" }), true);
  assert.equal(isRecordsSetupError({ code: "42883", message: "function pg_catalog.pg_input_is_valid(text, regtype) does not exist" }), false);

  const prior: RecordsInternalState = {
    currentRecords: [{ id: "record-1" }] as never[],
    error: null,
    events: [{ id: "event-1" }] as never[],
    hasSuccessfulResult: true,
    isLoading: false,
    isRecalculating: true,
    lastCalculatedAt: "2026-07-20T12:00:00Z",
    ownerUserId: "user-1",
    progress: "Preparing Records",
    provisionalCandidates: [],
    setupRequired: false,
    warnings: [],
  };
  const retained = retainRecordsAfterRefreshFailure(prior, { error: "Begin Records RPC argument mismatch; expected p_payload.", ownerUserId: "user-1", setupRequired: false });
  assert.equal(retained.currentRecords[0]?.id, "record-1");
  assert.equal(retained.events[0]?.id, "event-1");
});
