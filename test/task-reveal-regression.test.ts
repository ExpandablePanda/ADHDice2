import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Task creation and import use the shared reveal request without changing list semantics", async () => {
  const [app, create, crud, table, list] = await Promise.all([
    readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useTaskCreateAction.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useTaskCrudActions.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(create, /if \(!data\.parent_task_id\) \{[\s\S]*?onTaskRevealRequested\?\.\(data\.id\);/);
  assert.match(create, /if \(error\) \{[\s\S]*?return null;[\s\S]*?if \(data\)/);
  assert.match(crud, /setTasks\(\(current\) => sortTasksForUi\(mergeTasksById\(current, importedAllTasks\)\)\);[\s\S]*?if \(importedRootTasks\.length > 0\) \{[\s\S]*?onTaskRevealRequested\?\.\(importedRootTasks\[0\]\.id\);/);
  assert.match(app, /crud: \{[\s\S]*?onTaskRevealRequested: requestTaskReveal/);
  assert.match(app, /create: \{[\s\S]*?onTaskRevealRequested: requestTaskReveal/);
  assert.match(app, /const activeHighlightedTaskId = taskRevealRequest\?\.taskId \?\?/);
  assert.match(table, /const revealTaskIndex = effectiveDisplayedTasks\.findIndex\([\s\S]*?setRenderedTaskCount/);
  assert.match(list, /revealTargetInScrollableContainer\(target, listShellRef\.current\)/);
  assert.doesNotMatch(list, /target\?\.scrollIntoView\(\{ block: "nearest", behavior: "smooth" \}\)/);
  assert.match(list, /const targetIndex = tableProps\.tasks\.findIndex\([\s\S]*?setRowWindow/);
  assert.match(list, /const targetIndex = tasks\.findIndex\([\s\S]*?setRowWindow/);
});

test("temporary canonical diagnostic logging is removed", async () => {
  const sources = await Promise.all([
    readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useTaskCrudActions.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8"),
  ]);

  const source = sources.join("\n");
  for (const marker of [
    "[canonical-snapshot-publish]",
    "[canonical-import-publish]",
    "[canonical-active-status-input]",
    "[canonical-projection-loss]",
    "canonical-task-diagnostic",
  ]) {
    assert.doesNotMatch(source, new RegExp(marker.replace(/[\[\]]/g, "\\$&")));
  }
});
