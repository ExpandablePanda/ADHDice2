import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Table and List slice the committed result window before constructing row models", async () => {
  const source = await readFile(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
  assert.match(source, /windowedTasks = useMemo\([\s\S]*?tasks\.slice\(0, rowWindowCount\)/);
  assert.match(source, /windowedTasks\.map\(\(task\) => rowModelCache\.getOrCreate/);
  assert.doesNotMatch(source, /const allTaskRows = useMemo\([\s\S]*?allTasks[\s\S]*?getOrCreate/);
  assert.match(source, /ROW_MODEL_WINDOW_SIZE = 24[\s\S]*ROW_MODEL_OVERSCAN = 8/);
});

test("search owns a query revision and is excluded from settings revision sources", async () => {
  const source = await readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  assert.match(source, /const searchQueryRevision = createProjectionDomainRevision\("search-query"/);
  assert.match(source, /queryRevision: searchQueryRevision/);
  assert.match(source, /const taskRowContext = useMemo/);
  assert.equal((source.match(/rowContext: taskRowContext/g) ?? []).length, 2);
  const settingsSource = source.slice(source.indexOf("settings: {", source.indexOf("derivedDiagnosticTracker.capture")), source.indexOf("task: {", source.indexOf("derivedDiagnosticTracker.capture")));
  assert.doesNotMatch(settingsSource, /effectiveSearchQuery|searchQueryRevision/);
  assert.match(source, /setTaskSearchInput\(search\)[\s\S]*?startTransition/);
});
