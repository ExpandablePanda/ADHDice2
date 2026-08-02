import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("shared editor recovery imports and memoizes its task row projection", async () => {
  const app = await source("../src/components/task-app.tsx");
  assert.match(app, /import \{ buildTaskTableRow \} from "@\/lib\/task-table-row"/);
  assert.match(app, /const sharedTaskEditorRows = useMemo\(/);
  assert.match(app, /tasksForActiveStatusRead\.map\(\(task\) => buildTaskTableRow/);
});

test("search defers query work and reuses memoized hierarchy preparation", async () => {
  const app = await source("../src/components/task-app.tsx");
  const derived = await source("../src/lib/task-app-derived.ts");
  assert.match(app, /const deferredSearchQuery = useDeferredValue/);
  assert.match(app, /const taskAppStructuralData = useMemo\(/);
  assert.match(app, /activePage: TASK_DERIVATION_SCOPE/);
  assert.match(app, /structuralData: taskAppStructuralData/);
  assert.match(derived, /const hierarchy = buildTaskHierarchyAdapter\(tasks\)/);
  assert.match(derived, /buildTaskHierarchyDiagnostics\(tasks, hierarchy\)/);
  assert.match(derived, /buildTaskPrimaryVisibility\(tasks, hierarchy\)/);
});

test("shared status glyph separates Unscheduled calendar from Archive book", async () => {
  const statusUi = await source("../src/components/task-app/task-status-ui.tsx");
  assert.match(statusUi, /status === "unscheduled"[\s\S]*?<CalendarDays/);
  assert.match(statusUi, /status === "trashed"[\s\S]*?<Trash2/);
  assert.match(statusUi, /return <BookOpen/);
});

test("nested task table avoids row paint skipping that requires scroll invalidation", async () => {
  const table = await source("../src/components/ui/task-management-table-v2.tsx");
  assert.doesNotMatch(table, /contentVisibility|containIntrinsicSize/);
  assert.match(table, /const renderedTasks = useMemo/);
});
