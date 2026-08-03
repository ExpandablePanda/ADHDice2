import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const derivedSource = readFileSync(new URL("../src/lib/task-app-derived.ts", import.meta.url), "utf8");

test("search does not depend on a deferred React value or duplicate root input", () => {
  assert.doesNotMatch(appSource, /useDeferredValue|taskSearchInput/);
});

test("inactive pages skip query-only search derivation", () => {
  assert.match(appSource, /shouldRunTaskSearch\(activePage\)/);
  assert.match(appSource, /deferredSearchQuery: ""/);
});

test("search rows and rail totals share one committed selection result", () => {
  assert.match(appSource, /const activeListFacetCounts = taskSearchSelection\?\.listFacetCounts/);
  assert.match(appSource, /const activePrimaryFacetVisibleEntityIds = taskSearchSelection\?\.primaryFacetVisibleEntityIds/);
  assert.match(appSource, /const selectedBucketTasks = taskSearchSelection\?\.visibleTasks/);
  assert.match(appSource, /count: activeListFacetCounts\[item\.id\]/);
  assert.match(appSource, /activePrimaryFacetVisibleEntityIds,\n    \),/);
});

test("search does not invalidate the stable complete-derivation revision", () => {
  const revisionBlock = appSource.slice(appSource.indexOf("const taskDerivationRevision"), appSource.indexOf("const derivedData"));
  assert.doesNotMatch(revisionBlock, /search|effectiveSearchQuery|taskUiState\.search/);
});

test("derive-stage logging is gated by the explicit workspace diagnostics flag", () => {
  assert.match(derivedSource, /!isWorkspacePerformanceDiagnosticsEnabled\(\)/);
});

test("list hierarchy groups render directly without an unsafe render-prop memo boundary", () => {
  assert.doesNotMatch(listSource, /TaskListRow|render=\{\(\) => \(/);
  assert.match(listSource, /<div className="space-y-3" data-task-list-hierarchy-group=\{task\.id\} key=\{task\.id\}>/);
  assert.match(listSource, /windowedTasks\.map\(\(task\) =>/);
});

test("table hierarchy groups render directly without an unsafe render-prop memo boundary", () => {
  assert.doesNotMatch(tableSource, /TaskTableRow|render=\{\(\) => \(/);
  assert.match(tableSource, /<div\s+key=\{`task:\$\{getPrototypeTaskRowKey\(task\)\}`\}/);
  assert.match(tableSource, /renderedTasks\.map\(\(task\) =>/);
});
