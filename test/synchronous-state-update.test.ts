import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { updateSynchronousState } from "../src/lib/synchronous-state-update.ts";

function createStateOwner<T>(initial: T) {
  const reference = { current: initial };
  const queuedSnapshots: T[] = [];
  let renderedState = initial;
  let publishCalls = 0;

  return {
    reference,
    get renderedState() { return renderedState; },
    get publishCalls() { return publishCalls; },
    update(updater: T | ((current: T) => T)) {
      return updateSynchronousState(reference, updater, (next) => {
        publishCalls += 1;
        queuedSnapshots.push(next);
      });
    },
    commit() {
      while (queuedSnapshots.length > 0) renderedState = queuedSnapshots.shift()!;
    },
  };
}

test("functional state updates execute once and publish their precomputed snapshot", () => {
  const owner = createStateOwner({ draftId: "saved", revision: 0 });
  let updaterCalls = 0;
  let generatedDraftId = 0;
  const next = owner.update((current) => {
    updaterCalls += 1;
    generatedDraftId += 1;
    return { draftId: `draft-${generatedDraftId}`, revision: current.revision + 1 };
  });

  assert.equal(updaterCalls, 1);
  assert.equal(owner.publishCalls, 1);
  assert.equal(owner.reference.current, next);
  owner.commit();
  assert.equal(owner.renderedState, next);
  assert.equal(owner.reference.current, owner.renderedState);
  assert.equal(owner.renderedState.draftId, "draft-1");
  assert.equal(generatedDraftId, 1);
});

test("rapid functional updates use the latest synchronous reference and keep order", () => {
  const owner = createStateOwner({ value: 0 });
  let firstCalls = 0;
  let secondCalls = 0;

  owner.update((current) => {
    firstCalls += 1;
    return { value: current.value + 1 };
  });
  owner.update((current) => {
    secondCalls += 1;
    return { value: current.value + 1 };
  });

  assert.equal(owner.reference.current.value, 2);
  assert.equal(firstCalls, 1);
  assert.equal(secondCalls, 1);
  owner.commit();
  assert.equal(owner.renderedState.value, 2);
  assert.equal(owner.reference.current, owner.renderedState);
});

test("no-op functional updates preserve state identity and do not publish", () => {
  const initial = { value: 1 };
  const owner = createStateOwner(initial);
  let updaterCalls = 0;

  const next = owner.update((current) => {
    updaterCalls += 1;
    return current;
  });

  assert.equal(next, initial);
  assert.equal(updaterCalls, 1);
  assert.equal(owner.reference.current, initial);
  assert.equal(owner.publishCalls, 0);
  owner.commit();
  assert.equal(owner.renderedState, initial);
});

test("both hook state owners publish computed snapshots without competing direct setters", async () => {
  const [masterSource, taskSource] = await Promise.all([
    readFile(new URL("../src/hooks/useMasterWorkspaceController.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useTaskUiState.ts", import.meta.url), "utf8"),
  ]);

  assert.match(masterSource, /updateSynchronousState\(workspaceRef, update, setWorkspace\)/);
  assert.doesNotMatch(masterSource, /setWorkspace\s*\(/);
  assert.match(taskSource, /updateSynchronousState\(taskWorkspaceTabsStateRef, updater, setTaskWorkspaceTabsState\)/);
  assert.doesNotMatch(taskSource, /setTaskWorkspaceTabsState\s*\(/);
});
