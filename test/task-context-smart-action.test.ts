import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getTaskContextSmartActionLabel,
  getTaskContextSmartActionStorageKey,
  isTaskContextSmartActionEligible,
  isValidTaskContextSmartAction,
  readTaskContextSmartAction,
  writeTaskContextSmartAction,
  type TaskContextSmartAction,
} from "../src/lib/task-context-smart-action.ts";

type LocalStorageStub = {
  data: Map<string, string>;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function withLocalStorage<T>(run: (storage: LocalStorageStub) => T) {
  const storage: LocalStorageStub = {
    data: new Map(),
    getItem: (key) => storage.data.get(key) ?? null,
    setItem: (key, value) => storage.data.set(key, value),
  };
  const previousWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });
  try {
    return run(storage);
  } finally {
    if (previousWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
    }
  }
}

const missedAction: TaskContextSmartAction = { kind: "status", status: "missed", version: 1 };
const priorityAction: TaskContextSmartAction = { kind: "priority", priorities: ["4"], version: 1 };
const energyAction: TaskContextSmartAction = { kind: "energy", energy: "low", version: 1 };
const folderAction: TaskContextSmartAction = { kind: "folder", folderId: "folder-personal", label: "Personal", version: 1 };
const parentAction: TaskContextSmartAction = { kind: "parent", parentTaskId: "task-parent", label: "Morning Routine", version: 1 };
const baseTarget = { listIds: ["routine"], parentTaskId: null, status: "pending" as const, taskContentFolderId: null };

test("no saved action fails closed and a resolved status stores its leaf action", () => {
  withLocalStorage(() => {
    assert.equal(readTaskContextSmartAction("user-a"), null);
    assert.equal(writeTaskContextSmartAction("user-a", missedAction), true);
    assert.deepEqual(readTaskContextSmartAction("user-a"), missedAction);
    assert.equal(getTaskContextSmartActionLabel(missedAction), "Repeat: Missed");
  });
});

test("priority and energy values are remembered as resolved actions", () => {
  withLocalStorage(() => {
    assert.equal(writeTaskContextSmartAction("user-a", priorityAction), true);
    assert.deepEqual(readTaskContextSmartAction("user-a"), priorityAction);
    assert.equal(getTaskContextSmartActionLabel(priorityAction), "Repeat: Priority 4");
    assert.equal(writeTaskContextSmartAction("user-a", energyAction), true);
    assert.deepEqual(readTaskContextSmartAction("user-a"), energyAction);
    assert.equal(getTaskContextSmartActionLabel(energyAction), "Repeat: Energy Low");
  });
});

test("folder and parent destinations use stable IDs and hide when unavailable", () => {
  assert.equal(isTaskContextSmartActionEligible(folderAction, baseTarget, { availableFolderIds: ["folder-personal"] }), true);
  assert.equal(isTaskContextSmartActionEligible(folderAction, baseTarget, { availableFolderIds: [] }), false);
  assert.equal(isTaskContextSmartActionEligible(parentAction, baseTarget, { availableParentIds: ["task-parent"] }), true);
  assert.equal(isTaskContextSmartActionEligible(parentAction, baseTarget, { availableParentIds: [] }), false);
  assert.equal(getTaskContextSmartActionStorageKey("user-a"), "adhdice-task-context-smart-action:v1:user-a");
});

test("eligibility respects policy, target state, and safe repeat rules", () => {
  assert.equal(isTaskContextSmartActionEligible(missedAction, baseTarget, { availableStatuses: ["missed"] }), true);
  assert.equal(isTaskContextSmartActionEligible(missedAction, baseTarget, { availableStatuses: ["pending"] }), false);
  assert.equal(isTaskContextSmartActionEligible({ kind: "restore", version: 1 }, { ...baseTarget, status: "archived" }), true);
  assert.equal(isTaskContextSmartActionEligible({ kind: "restore", version: 1 }, baseTarget), false);
  assert.equal(isTaskContextSmartActionEligible({ kind: "remove", version: 1 }, baseTarget, { canRemoveFromCurrentList: true }), true);
  assert.equal(isTaskContextSmartActionEligible({ kind: "remove", version: 1 }, baseTarget), false);
  assert.equal(isTaskContextSmartActionEligible({ kind: "list", label: "Routine", listId: "routine", operation: "remove", version: 1 }, baseTarget, { availableListIds: ["routine"] }), true);
  assert.equal(isTaskContextSmartActionEligible({ kind: "list", label: "Personal", listId: "personal", operation: "add", version: 1 }, baseTarget, { availableListIds: ["personal"] }), true);
});

test("destructive, free-text, and malformed values are never valid smart actions", () => {
  assert.equal(isValidTaskContextSmartAction({ kind: "status", status: "trashed", version: 1 }), false);
  assert.equal(isValidTaskContextSmartAction({ kind: "delete", version: 1 }), false);
  assert.equal(isValidTaskContextSmartAction({ kind: "notes", notes: "replace", version: 1 }), false);
  assert.equal(isValidTaskContextSmartAction({ kind: "link", url: "https://example.com", version: 1 }), false);
  assert.equal(isValidTaskContextSmartAction({ kind: "actual", seconds: 10, version: 1 }), false);
  withLocalStorage((storage) => {
    storage.setItem(getTaskContextSmartActionStorageKey("user-a"), "{malformed");
    assert.equal(readTaskContextSmartAction("user-a"), null);
    storage.setItem(getTaskContextSmartActionStorageKey("user-a"), JSON.stringify({ kind: "delete", version: 1 }));
    assert.equal(readTaskContextSmartAction("user-a"), null);
  });
});

test("saved action is scoped by user ID", () => {
  withLocalStorage(() => {
    writeTaskContextSmartAction("user-a", missedAction);
    assert.deepEqual(readTaskContextSmartAction("user-a"), missedAction);
    assert.equal(readTaskContextSmartAction("user-b"), null);
  });
});

test("Table and List render the same shared smart-action menu and guarded status path", () => {
  const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
  const listSource = readFileSync(new URL("../src/components/task-app/tasks-list-adapter.tsx", import.meta.url), "utf8");
  assert.match(tableSource, /onRepeatSmartAction=\{applyRowContextMenuSmartAction\}/);
  assert.match(listSource, /onRepeatSmartAction=\{applyRowContextMenuSmartAction\}/);
  assert.match(tableSource, /case "status":\s+setTaskStatus\(task\.id, action\.status/);
  assert.match(listSource, /case "status":\s+tableProps\.onSetStatus\?\.\(task\.id, action\.status/);
  assert.match(tableSource, /smartActionEligibility=\{isRowContextMenuSmartActionEligible\}/);
  assert.match(listSource, /smartActionEligibility=\{isRowContextMenuSmartActionEligible\}/);
  assert.match(tableSource, /userId=\{userId\}/);
  assert.match(listSource, /userId=\{tableProps\.userId\}/);
  assert.match(tableSource, /onClick=\{onDismiss\}/);
  assert.match(tableSource, /event\.key === "Escape"/);
  assert.match(tableSource, /rememberTaskContextSmartAction\(action\)/);
  assert.match(listSource, /rememberTaskContextSmartAction\(action\)/);
});
