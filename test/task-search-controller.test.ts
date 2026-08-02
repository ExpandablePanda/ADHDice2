import assert from "node:assert/strict";
import test from "node:test";

import { createTaskSearchCommitController } from "../src/lib/task-search-controller.ts";

function fakeScheduler() {
  const callbacks = new Map<number, () => void>();
  let nextId = 0;
  return {
    scheduler: {
      setTimeout(callback: () => void) { const id = ++nextId; callbacks.set(id, callback); return id; },
      clearTimeout(handle: unknown) { callbacks.delete(handle as number); },
    },
    flush() { for (const callback of callbacks.values()) callback(); callbacks.clear(); },
  };
}

test("one settled search publishes one committed query update", () => {
  const fake = fakeScheduler();
  const commits: string[] = [];
  const controller = createTaskSearchCommitController((value) => commits.push(value), fake.scheduler);
  controller.schedule("needle");
  assert.deepEqual(commits, []);
  fake.flush();
  assert.deepEqual(commits, ["needle"]);
});

test("explicit publish updates the committed query immediately, including clear", () => {
  const fake = fakeScheduler();
  const commits: string[] = [];
  const controller = createTaskSearchCommitController((value) => commits.push(value), fake.scheduler);
  controller.publish("needle");
  controller.publish("");
  assert.deepEqual(commits, ["needle", ""]);
});

test("obsolete debounced searches cannot commit", () => {
  const fake = fakeScheduler();
  const commits: string[] = [];
  const controller = createTaskSearchCommitController((value) => commits.push(value), fake.scheduler);
  controller.schedule("old");
  controller.schedule("new");
  fake.flush();
  assert.deepEqual(commits, ["new"]);
});
