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

test("search does not invalidate the stable complete-derivation revision", () => {
  const revisionBlock = appSource.slice(appSource.indexOf("const taskDerivationRevision"), appSource.indexOf("const derivedData"));
  assert.doesNotMatch(revisionBlock, /search|effectiveSearchQuery|taskUiState\.search/);
});

test("derive-stage logging is gated by the explicit workspace diagnostics flag", () => {
  assert.match(derivedSource, /!isWorkspacePerformanceDiagnosticsEnabled\(\)/);
});

test("list rows are real memoized components rather than children boundaries", () => {
  assert.match(listSource, /const TaskListRow = memo\(/);
  assert.match(listSource, /render=\{\(\) => \(/);
  assert.doesNotMatch(listSource, /StableListRowBoundary/);
});

test("table rows also defer row JSX behind a memo boundary", () => {
  assert.match(tableSource, /const TaskTableRow = memo\(/);
  assert.match(tableSource, /<TaskTableRow[\s\S]*?render=\{\(\) => \(/);
});
