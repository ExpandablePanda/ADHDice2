import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatPursuitChildDeleteWarning } from "@/hooks/usePursuits";

const hookSource = readFileSync(new URL("../src/hooks/usePursuits.ts", import.meta.url), "utf8");
const rowSource = readFileSync(new URL("../src/components/task-app/pursuit-workspace-row.tsx", import.meta.url), "utf8");
const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");

function deleteHookSource() {
  return hookSource.slice(hookSource.indexOf("const deletePursuit"), hookSource.indexOf("const updateExistingCompletion"));
}

test("deletePursuit is an owner-scoped hard delete with local cascade cleanup", () => {
  const source = deleteHookSource();

  assert.match(source, /from\("adhdice_pursuits"\)\s*\.delete\(\)\s*\.eq\("id", pursuitId\)\s*\.eq\("user_id", userId\)/);
  assert.match(source, /setPursuits\(\(current\) => current\.filter\(\(pursuit\) => pursuit\.id !== pursuitId\)\)/);
  assert.match(source, /setActivities\(\(current\) => current\.filter\(\(activity\) => activity\.pursuit_id !== pursuitId\)\)/);
  assert.match(source, /setMessage\?\.\(\{ tone: "good", text: "Pursuit deleted\." \}\)/);
  assert.doesNotMatch(source, /adhdice_clean_tasks|adhdice_task_history/);

  const failureIndex = source.indexOf("if (result.error)");
  const localPursuitsCleanupIndex = source.indexOf("setPursuits");
  const localActivitiesCleanupIndex = source.indexOf("setActivities");
  assert.ok(failureIndex >= 0 && failureIndex < localPursuitsCleanupIndex);
  assert.ok(failureIndex < localActivitiesCleanupIndex);
});

test("child Pursuits block deletion before the database delete", () => {
  const source = deleteHookSource();

  assert.match(source, /const childCount = pursuits\.filter\(\(pursuit\) => pursuit\.parent_pursuit_id === pursuitId\)\.length/);
  assert.match(source, /if \(childCount > 0\) \{[\s\S]*reportError\(formatPursuitChildDeleteWarning\(childCount\)\);[\s\S]*return false;/);
  assert.ok(source.indexOf("if (childCount > 0)") < source.indexOf('from("adhdice_pursuits")'));
  assert.equal(formatPursuitChildDeleteWarning(1), "This Pursuit has 1 child Pursuit. Delete it first.");
  assert.equal(formatPursuitChildDeleteWarning(2), "This Pursuit has 2 child Pursuits. Delete them first.");
});

test("shared Pursuit row actions require confirmation and expose a destructive Trash control", () => {
  const source = rowSource.slice(rowSource.indexOf("function PursuitRowActions"), rowSource.indexOf("function neutralCell"));

  assert.match(source, /Trash2/);
  assert.match(source, /title="Delete Pursuit"/);
  assert.match(source, /tone="danger"/);
  assert.match(source, /aria-label=\{`Delete \$\{pursuit\.title\}`\}/);
  assert.match(source, /onClick=\{\(event\) => \{ event\.stopPropagation\(\); if \(!window\.confirm\(/);
  assert.match(source, /void onDeletePursuit\(pursuit\.id\)/);
  assert.ok(source.indexOf("event.stopPropagation()") < source.indexOf("window.confirm"));
  assert.ok(source.indexOf("window.confirm") < source.indexOf("onDeletePursuit(pursuit.id)"));
});

test("Table and List Pursuit paths receive the shared delete authority", () => {
  assert.match(rowSource, /onDeletePursuit\?: \(pursuitId: string\) => Promise<boolean> \| boolean/);
  assert.match(rowSource, /PursuitTableWorkspaceRow[\s\S]*onDeletePursuit[\s\S]*PursuitRowActions/);
  assert.match(rowSource, /PursuitListWorkspaceRow[\s\S]*onDeletePursuit[\s\S]*PursuitRowActions/);
  assert.match(tableSource, /onDeletePursuit\?: \(pursuitId: string\) => Promise<boolean> \| boolean/);
  assert.match(tableSource, /onDeletePursuit=\{onDeletePursuit\}/);
  assert.match(listSource, /onDeletePursuit\?: \(pursuitId: string\) => Promise<boolean> \| boolean/);
  assert.match(listSource, /onDeletePursuit=\{tableProps\.onDeletePursuit\}/);
  assert.match(appSource, /onDeletePursuit=\{deletePursuit\}/);
  assert.match(appSource, /onDeletePursuit: deletePursuit/);
});
