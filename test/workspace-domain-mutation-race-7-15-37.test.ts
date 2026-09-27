import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { advanceWorkspaceDomainGeneration } from "../src/lib/workspace-refresh-coordinator.ts";

type Snapshot = ReadonlyArray<Record<string, unknown>>;

function createGenerationRace(initial: Snapshot) {
  const generation = { current: 0 };
  let local = initial;

  return {
    get local() {
      return local;
    },
    beginSnapshot() {
      return generation.current;
    },
    apply(snapshotGeneration: number, snapshot: Snapshot) {
      if (snapshotGeneration !== generation.current) return false;
      local = snapshot;
      return true;
    },
    beginMutation() {
      return advanceWorkspaceDomainGeneration(generation);
    },
  };
}

const workspaceSource = readFileSync(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
const contentFolderActionsSource = readFileSync(new URL("../src/hooks/useTaskContentFolderActions.ts", import.meta.url), "utf8");
const taskListActionsSource = readFileSync(new URL("../src/hooks/useTaskListActions.ts", import.meta.url), "utf8");
const taskListFolderActionsSource = readFileSync(new URL("../src/hooks/useTaskListFolderActions.ts", import.meta.url), "utf8");
const taskRoutingActionsSource = readFileSync(new URL("../src/hooks/useTaskRoutingActions.ts", import.meta.url), "utf8");
const focusSource = readFileSync(new URL("../src/hooks/useFocus.ts", import.meta.url), "utf8");
const focusSelectionSource = readFileSync(new URL("../src/hooks/useFocusSelectionPersistence.ts", import.meta.url), "utf8");
const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");

test("a stale Content Folder snapshot cannot revert a committed rename", () => {
  const race = createGenerationRace([{ id: "folder-a", name: "Old name" }]);
  const oldSnapshotGeneration = race.beginSnapshot();

  race.beginMutation();
  assert.equal(race.apply(race.beginSnapshot(), [{ id: "folder-a", name: "New name" }]), true);
  assert.equal(race.apply(oldSnapshotGeneration, [{ id: "folder-a", name: "Old name" }]), false);
  assert.deepEqual(race.local, [{ id: "folder-a", name: "New name" }]);

  assert.equal(race.apply(race.beginSnapshot(), [{ id: "folder-a", name: "New name" }]), true);
  assert.deepEqual(race.local, [{ id: "folder-a", name: "New name" }]);
});

test("Content Folder create, delete, move, and icon updates fence old snapshots", () => {
  const cases: Array<{ initial: Snapshot; committed: Snapshot }> = [
    { initial: [], committed: [{ id: "folder-a", name: "Created" }] },
    { initial: [{ id: "folder-a", name: "Existing" }], committed: [] },
    { initial: [{ id: "folder-a", parent_folder_id: null }], committed: [{ id: "folder-a", parent_folder_id: "folder-b" }] },
    { initial: [{ id: "folder-a", icon_key: "folder" }], committed: [{ id: "folder-a", icon_key: "star" }] },
  ];

  for (const { initial, committed } of cases) {
    const race = createGenerationRace(initial);
    const oldSnapshotGeneration = race.beginSnapshot();
    race.beginMutation();
    assert.equal(race.apply(race.beginSnapshot(), committed), true);
    assert.equal(race.apply(oldSnapshotGeneration, initial), false);
    assert.deepEqual(race.local, committed);
  }
});

test("create-and-move rollback fences both the pre-create and pre-rollback snapshots", () => {
  const race = createGenerationRace([]);
  const preCreateGeneration = race.beginSnapshot();

  race.beginMutation();
  const created = [{ id: "folder-a", name: "Temporary" }];
  assert.equal(race.apply(race.beginSnapshot(), created), true);

  const preRollbackGeneration = race.beginSnapshot();
  race.beginMutation();
  assert.equal(race.apply(race.beginSnapshot(), []), true);
  assert.equal(race.apply(preCreateGeneration, []), false);
  assert.equal(race.apply(preRollbackGeneration, created), false);
  assert.deepEqual(race.local, []);

  assert.equal(race.apply(race.beginSnapshot(), []), true);
  assert.deepEqual(race.local, []);
});

test("Task List and Focus domain mutations use the same generation barrier contract", () => {
  for (const [initial, committed] of [
    [[{ id: "list-a", name: "Old" }], [{ id: "list-a", name: "New" }]],
    [[{ id: "focus-a", title: "Old" }], []],
  ] as const) {
    const race = createGenerationRace(initial);
    const oldSnapshotGeneration = race.beginSnapshot();
    race.beginMutation();
    assert.equal(race.apply(race.beginSnapshot(), committed), true);
    assert.equal(race.apply(oldSnapshotGeneration, initial), false);
    assert.deepEqual(race.local, committed);
  }
});

test("workspace core application retains domain fences while local mutation barriers are wired", () => {
  assert.match(workspaceSource, /advanceWorkspaceDomainGeneration\(taskListDataGeneration\)/);
  assert.match(workspaceSource, /advanceWorkspaceDomainGeneration\(taskContentFolderDataGenerationRef\)/);
  assert.match(workspaceSource, /advanceWorkspaceDomainGeneration\(focusDataGenerationRef\)/);
  assert.match(workspaceSource, /taskListLoadGeneration === taskListDataGeneration\.current/);
  assert.match(workspaceSource, /taskContentFolderLoadGeneration === taskContentFolderDataGenerationRef\.current/);
  assert.match(workspaceSource, /focusLoadGeneration === focusDataGenerationRef\.current/);
  assert.match(workspaceSource, /requestFocusDomainRefresh\("local_focus_migration"\)/);
});

test("all affected local mutation paths advance their owned domain generation", () => {
  assert.equal((contentFolderActionsSource.match(/invalidateTaskContentFolderDomainGeneration\(\);/g) ?? []).length, 7);
  assert.equal((taskListActionsSource.match(/invalidateTaskListDomainGeneration\(\);/g) ?? []).length, 3);
  assert.match(taskListFolderActionsSource, /invalidateTaskListDomainGeneration\(\);\s*await mutation\(\)/);
  assert.match(taskRoutingActionsSource, /invalidateTaskListDomainGeneration\(\);/);
  assert.equal((focusSource.match(/invalidateFocusDomainGeneration\(\);/g) ?? []).length, 3);
  assert.match(focusSelectionSource, /invalidateFocusDomainGeneration\(\);\s*setFocusedTaskIdsByDate/);
  assert.match(taskAppSource, /invalidateTaskListDomainGeneration\(\);\s*void reconcileTaskListRailPlacements/);
});
