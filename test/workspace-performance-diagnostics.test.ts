import assert from "node:assert/strict";
import test from "node:test";

import { createDevelopmentComputationTracker } from "../src/lib/workspace-performance-diagnostics.ts";

test("computation diagnostics identify changed references without serializing their content", () => {
  const tracker = createDevelopmentComputationTracker("canonical task projection", "TaskApp");
  const tasks = [{ id: "task-id", title: "private title" }];
  const history = [{ id: "history-id" }];
  const lists = [{ id: "list-id" }];
  const settings = { search: "private search" };
  const capture = (taskValue: unknown = tasks) => tracker.capture({
    activePage: "Tasks",
    dependencies: { history, settings, tasks: taskValue },
    revisionSources: {
      history: { history },
      list: { lists },
      settings: { settings },
      task: { tasks: taskValue },
    },
  });

  const initial = capture();
  const repeat = capture();
  const changed = capture([...tasks]);

  assert.equal(initial.changedDependencies, "initial");
  assert.equal(repeat.changedDependencies, "none (repeat evaluation)");
  assert.equal(repeat.taskRevision, initial.taskRevision);
  assert.equal(changed.changedDependencies, "tasks");
  assert.notEqual(changed.taskRevision, repeat.taskRevision);
  assert.equal(JSON.stringify(changed).includes("private title"), false);
  assert.equal(JSON.stringify(changed).includes("private search"), false);
});
