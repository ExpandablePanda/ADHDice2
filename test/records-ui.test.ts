import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/components/task-app/achievements-page.tsx", import.meta.url), "utf8");
const records = readFileSync(new URL("../src/components/task-app/records-tab.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/hooks/useRecords.ts", import.meta.url), "utf8");

test("Records is the third accessible Progress tab and preserves tabpanel wiring", () => {
  assert.match(page, /\["achievements", "milestones", "records"\]/);
  assert.match(page, /role="tablist"/);
  assert.match(page, /progress-panel-records/);
  assert.match(page, /<RecordsTab/);
  assert.match(page, /initialRecordMetricKey/);
  assert.match(page, /initialRecordMetricKey \? "records" : "achievements"/);
});

test("Records UI exposes required sections, refresh, history, and factual disclosure", () => {
  for (const label of ["Global Task records", "Streak records", "Focus records", "Per-task records", "Record history", "Refresh Records", "Provisional"]) assert.match(records, new RegExp(label));
  assert.match(records, /Past hard deletions cannot be reconstructed/);
  assert.match(records, /fallback occurrence identity/);
  assert.match(records, /Show invalidated/);
  assert.match(records, /initialMetricKey/);
  assert.match(records, /candidate\.scope_kind === "global"/);
  assert.match(records, /buildCurrentRecordCard\(record, records\.events, records\.taskEvidenceByRecordIdentity\)/);
  assert.match(records, /Record Evidence/);
  assert.match(records, /getRecordTaskEvidenceCount/);
  assert.match(records, /evidenceCount\.warning/);
  assert.match(records, /data-record-evidence-list/);
  assert.match(records, /Unavailable/);
});

test("Home Record deep-links acknowledge only after the requested detail is ready", () => {
  assert.doesNotMatch(page, /useEffect\(\(\) => \{\n    if \(initialRecordMetricKey\) onRecordRequestHandled/);
  assert.match(page, /onRecordRequestHandled=\{onRecordRequestHandled\}/);
  const effectStart = records.indexOf("useEffect(() => {\n    if (!initialMetricKey");
  const effectEnd = records.indexOf("\n\n  function toggleSection", effectStart);
  assert.ok(effectStart >= 0 && effectEnd > effectStart);
  const effect = records.slice(effectStart, effectEnd);
  assert.doesNotMatch(effect, /setTimeout|clearTimeout/);
  const detailOpen = effect.indexOf("setDetailRecord(buildCurrentRecordCard(record, records.events, records.taskEvidenceByRecordIdentity));");
  const consumed = effect.indexOf("openedInitialMetricRef.current = initialMetricKey;", detailOpen);
  const acknowledged = effect.indexOf("onRecordRequestHandled?.();", consumed);
  assert.ok(detailOpen >= 0 && consumed > detailOpen && acknowledged > consumed);
  assert.match(effect, /if \(!record\) \{\n      openedInitialMetricRef\.current = initialMetricKey;\n      onRecordRequestHandled\?\.\(\);/);
});

test("Records stays lazy, prevents overlap, and contains a migration-missing fallback", () => {
  assert.match(hook, /if \(!active \|\| !client \|\| !userId \|\| runningRef\.current\) return/);
  assert.match(hook, /runningRef\.current = true/);
  assert.match(hook, /Records storage is not installed/);
  assert.match(records, /Records setup required/);
});

test("Records evidence reuses the successful evaluation projection and opens through TaskApp", () => {
  assert.match(hook, /buildTaskEvidenceByRecordIdentity\(result\.evaluation\.currentRecords\)/);
  assert.match(page, /onOpenTask: \(taskId: string\) => void/);
  assert.match(page, /onOpenTask=\{onOpenTask\}/);
  assert.match(records, /props\.onOpenTask\(taskId\)/);
  assert.match(records, /setDetailRecord\(null\)/);
  assert.doesNotMatch(records, /runRecordsPipeline/);
});
