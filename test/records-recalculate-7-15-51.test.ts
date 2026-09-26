import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  recordsRunMatchesLogicalDate,
  recordsRunMatchesSettings,
} from "../src/hooks/useRecords.ts";
import {
  executeRecordsRecalculation,
  type RecordsRecalculationSources,
} from "../src/lib/records/recalculation.ts";
import { RECORDS_RULES_VERSION } from "../src/lib/records/types.ts";
import type { RecordsSourceState } from "../src/lib/records/source-state.ts";

const hookSource = readFileSync(new URL("../src/hooks/useRecords.ts", import.meta.url), "utf8");
const repositorySource = readFileSync(new URL("../src/lib/record-repository.ts", import.meta.url), "utf8");
const sharedSource = readFileSync(new URL("../src/lib/records/recalculation.ts", import.meta.url), "utf8");
const edgeSource = readFileSync(new URL("../supabase/functions/records-recalculate/index.ts", import.meta.url), "utf8");
const edgeDomainSource = readFileSync(new URL("../supabase/functions/records-recalculate/domain.ts", import.meta.url), "utf8");

const sourceState: RecordsSourceState = {
  schema_version: "records-source-state-v1",
  history_sync_epoch: "00000000-0000-4000-8000-000000000001",
  history_revision: 12,
  task_row_count: 522,
  task_digest: `sha256:${"1".repeat(64)}`,
  focus_row_count: 859,
  focus_digest: `sha256:${"2".repeat(64)}`,
};

const sources: RecordsRecalculationSources = { focusSessions: [], taskHistory: [], tasks: [] };
const settings = { logicalDayStart: "06:00", timezone: "America/New_York" };
const run = {
  completed_at: "2026-09-26T12:01:00Z",
  evaluated_at: "2026-09-26T12:00:00Z",
  logical_day_start: "06:00:00",
  rules_version: RECORDS_RULES_VERSION,
  source_state: sourceState,
  timezone: settings.timezone,
};

function runner(overrides: Partial<Parameters<typeof executeRecordsRecalculation>[0]> = {}) {
  return {
    getCurrentLogicalDate: async () => "2026-09-26",
    loadSourceState: async () => sourceState,
    loadSources: async () => sources,
    logicalDayStart: settings.logicalDayStart,
    reconcile: async () => undefined,
    timezone: settings.timezone,
    ...overrides,
  };
}

test("source-fresh and same logical date keep the persisted fast-path contract", () => {
  assert.equal(recordsRunMatchesSettings(run, settings), true);
  assert.equal(recordsRunMatchesLogicalDate(run, settings, "2026-09-26"), true);
  assert.match(hookSource, /if \(durableIsFresh\)[\s\S]*loadPersistedRecords/);
  assert.match(hookSource, /edgeInvoked: false/);
});

test("source-fresh but next logical date requires server recalculation", () => {
  assert.equal(recordsRunMatchesLogicalDate(run, settings, "2026-09-27"), false);
  assert.match(hookSource, /logicalDateMatched/);
  assert.match(hookSource, /invokeRecordsRecalculation\(client, \{ logicalDayStart, timezone \}\)/);
});

test("source mismatch retries once before reconciliation", async () => {
  let sourceReads = 0;
  let reconciliations = 0;
  const changed = { ...sourceState, history_revision: 13 };
  const result = await executeRecordsRecalculation(runner({
    loadSourceState: async () => {
      sourceReads += 1;
      if (sourceReads === 2) return changed;
      return sourceReads === 1 ? sourceState : changed;
    },
    reconcile: async () => { reconciliations += 1; },
  }));
  assert.equal(result.retryCount, 1);
  assert.equal(reconciliations, 1);
  assert.equal(sourceReads, 4);
});

test("logical date changing during evaluation retries once", async () => {
  const dates = ["2026-09-26", "2026-09-27", "2026-09-27", "2026-09-27", "2026-09-27"];
  let dateReads = 0;
  let reconciliations = 0;
  const result = await executeRecordsRecalculation(runner({
    getCurrentLogicalDate: () => dates[dateReads++] ?? "2026-09-27",
    reconcile: async () => { reconciliations += 1; },
  }));
  assert.equal(result.retryCount, 1);
  assert.equal(result.logicalDate, "2026-09-27");
  assert.equal(reconciliations, 1);
});

test("logical date changing again after the retry fails safely", async () => {
  const dates = ["2026-09-26", "2026-09-26", "2026-09-27", "2026-09-27", "2026-09-27", "2026-09-28"];
  let dateReads = 0;
  await assert.rejects(
    () => executeRecordsRecalculation(runner({ getCurrentLogicalDate: () => dates[dateReads++] ?? "2026-09-28" })),
    (error: unknown) => (error as { code?: string }).code === "RECORDS_LOGICAL_DATE_CHANGED",
  );
});

test("the shared server pipeline uses evaluateRecords and the existing reconciliation writer", () => {
  assert.match(sharedSource, /import \{ evaluateRecords \} from "\.\/evaluator\.ts"/);
  assert.match(edgeDomainSource, /executeRecordsRecalculation/);
  assert.match(edgeDomainSource, /reconcileRecords\(/);
  assert.match(edgeDomainSource, /buildTaskEvidenceByRecordIdentity/);
});

test("explicit refresh invokes the Edge recalculation path", () => {
  assert.match(hookSource, /const explicitRefresh = refreshRequestedRef\.current/);
  assert.match(hookSource, /explicitRefresh \? "explicit_refresh"/);
  assert.match(hookSource, /edgeInvoked = true/);
  assert.match(hookSource, /invokeRecordsRecalculation\(client, \{ logicalDayStart, timezone \}\)/);
});

test("the normal stale path cannot call browser Task, History, or Focus loaders", () => {
  for (const loader of ["loadRecordsTasks", "loadRecordsTaskHistory", "loadRecordsFocusSessions"]) {
    assert.doesNotMatch(hookSource, new RegExp(loader));
  }
  assert.doesNotMatch(hookSource, /runRecordsPipeline\(/);
  assert.match(hookSource, /loadPersistedRecords\(client, userId\)/);
});

test("Edge authentication uses the caller context and never accepts a user_id", () => {
  assert.match(edgeSource, /withSupabase\(\{ auth: "user" \}/);
  assert.match(edgeSource, /userIdFromContext\(context\)/);
  assert.match(edgeSource, /context\.supabase as unknown as RecordsClient/);
  assert.doesNotMatch(edgeSource, /context\.supabaseAdmin/);
  assert.doesNotMatch(edgeSource, /user_id/);
});

test("Edge response is compact detail plus fences, not raw source arrays", () => {
  const responseStart = edgeDomainSource.indexOf("return {\n    currentCount:");
  assert.notEqual(responseStart, -1);
  const response = edgeDomainSource.slice(responseStart, responseStart + 900);
  assert.match(response, /provisionalCandidates/);
  assert.match(response, /taskEvidenceByRecordIdentity/);
  assert.match(response, /sourceState/);
  assert.doesNotMatch(response, /tasks|taskHistory|focusSessions/);
});

test("successful Edge refresh reloads persisted current Records and valid events", () => {
  assert.match(hookSource, /const persisted = await loadPersistedRecords\(client, userId\)/);
  assert.match(repositorySource, /\.eq\("validity_state", "valid"\)/);
  assert.match(hookSource, /serverResult\.provisionalCandidates/);
  assert.match(hookSource, /serverResult\.taskEvidenceByRecordIdentity/);
  assert.match(hookSource, /writeRecordsLocalDetailCache/);
});

test("Edge failure retains the prior snapshot and has no browser bulk fallback", () => {
  assert.match(hookSource, /retainRecordsAfterRefreshFailure/);
  assert.doesNotMatch(hookSource, /catch[\s\S]*runRecordsPipeline\(/);
  assert.doesNotMatch(hookSource, /loadRecordsTaskHistory|loadRecordsTasks|loadRecordsFocusSessions/);
  assert.match(edgeSource, /RECORDS_BUSY/);
  assert.match(edgeSource, /return json\(\{ error:/);
});

test("busy reconciliation returns a retryable Edge result", () => {
  assert.match(repositorySource, /if \(begin\?\.status === "busy"\) throw new RecordsBusyError/);
  assert.match(edgeSource, /code === "RECORDS_BUSY"/);
  assert.match(edgeSource, /return 409/);
});

test("server response preserves the current provisional and warning evidence contract", () => {
  assert.match(edgeDomainSource, /provisionalCandidates: result\.evaluation\.provisionalCandidates/);
  assert.match(edgeDomainSource, /taskEvidenceByRecordIdentity: buildTaskEvidenceByRecordIdentity/);
  assert.match(edgeDomainSource, /warnings: result\.evaluation\.warnings/);
  assert.match(hookSource, /hasDetailedEvidence: true/);
});
