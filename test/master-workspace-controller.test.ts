import assert from "node:assert/strict";
import test from "node:test";
import {
  isMasterWorkspaceFeatureEnabled,
  persistMasterWorkspaceForReadyUser,
  restoreMasterWorkspaceForUser,
} from "../src/lib/master-workspace-controller.ts";
import {
  createMasterTab,
  duplicateFocusedPageIntoRightPanel,
  getMasterWorkspaceStorageKey,
} from "../src/lib/master-workspace-state.ts";
import { DEFAULT_TASK_WORKSPACE_TABS_STATE } from "../src/lib/task-ui-state.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

test("first hydration preserves the legacy page and Tasks workspace without writing early", () => {
  const storage = memoryStorage();
  const tasksState = {
    ...DEFAULT_TASK_WORKSPACE_TABS_STATE,
    activeTabId: "legacy-tab",
    tabs: [{ ...DEFAULT_TASK_WORKSPACE_TABS_STATE.tabs[0], id: "legacy-tab", label: "Legacy Tasks" }],
  };
  const restored = restoreMasterWorkspaceForUser(storage, "user-a", "Tasks", tasksState);

  assert.equal(restored.restored, false);
  assert.equal(restored.state.panels[0].tabs[0].destination.page, "Tasks");
  assert.equal(restored.state.panels[0].tabs[0].presentation.tasksWorkspace?.activeTabId, "legacy-tab");
  assert.equal(storage.values.has(getMasterWorkspaceStorageKey("user-a")), false);
});

test("ready-user persistence is fenced by readiness and restored user, then survives refresh", () => {
  const storage = memoryStorage();
  const state = restoreMasterWorkspaceForUser(storage, "user-a", "Health", DEFAULT_TASK_WORKSPACE_TABS_STATE).state;

  assert.equal(persistMasterWorkspaceForReadyUser(storage, "user-a", null, true, state), false);
  assert.equal(persistMasterWorkspaceForReadyUser(storage, "user-a", "user-a", false, state), false);
  assert.equal(storage.values.has(getMasterWorkspaceStorageKey("user-a")), false);
  assert.equal(persistMasterWorkspaceForReadyUser(storage, "user-a", "user-a", true, state), true);

  const afterRefresh = restoreMasterWorkspaceForUser(storage, "user-a", "Home", DEFAULT_TASK_WORKSPACE_TABS_STATE);
  assert.equal(afterRefresh.restored, true);
  assert.equal(afterRefresh.state.panels[0].tabs[0].destination.page, "Health");
});

test("restoring and persisting preserves both panels, all tabs, and focused-panel identity", () => {
  const storage = memoryStorage();
  const initial = restoreMasterWorkspaceForUser(storage, "user-split", "Home", DEFAULT_TASK_WORKSPACE_TABS_STATE).state;
  const withRightPanel = duplicateFocusedPageIntoRightPanel(initial, { panelId: "right-panel", tabId: "right-home" });
  const completeWorkspace = createMasterTab(withRightPanel, "right-panel", {
    id: "right-notes",
    destination: { kind: "page", page: "Notes" },
    presentation: {},
  });

  assert.equal(persistMasterWorkspaceForReadyUser(storage, "user-split", "user-split", true, completeWorkspace), true);
  const restored = restoreMasterWorkspaceForUser(storage, "user-split", "Home", DEFAULT_TASK_WORKSPACE_TABS_STATE);
  assert.equal(restored.restored, true);
  assert.deepEqual(restored.state.panels.map((panel) => ({ id: panel.id, side: panel.side, tabIds: panel.tabs.map((tab) => tab.id) })), [
    { id: "master-panel-1", side: "left", tabIds: ["master-tab-1"] },
    { id: "right-panel", side: "right", tabIds: ["right-home", "right-notes"] },
  ]);
  assert.equal(restored.state.focusedPanelId, "right-panel");

  assert.equal(persistMasterWorkspaceForReadyUser(storage, "user-split", "user-split", true, restored.state), true);
  const afterSecondRefresh = restoreMasterWorkspaceForUser(storage, "user-split", "Home", DEFAULT_TASK_WORKSPACE_TABS_STATE);
  assert.deepEqual(afterSecondRefresh.state.panels.map((panel) => panel.tabs.map((tab) => tab.id)), [["master-tab-1"], ["right-home", "right-notes"]]);
  assert.equal(afterSecondRefresh.state.focusedPanelId, "right-panel");
});

test("malformed saved controller state recovers to a default workspace", () => {
  const storage = memoryStorage();
  const key = getMasterWorkspaceStorageKey("broken-user");
  storage.values.set(key, "{");

  const restored = restoreMasterWorkspaceForUser(storage, "broken-user", "Notes", DEFAULT_TASK_WORKSPACE_TABS_STATE);

  assert.equal(restored.restored, true);
  assert.equal(restored.state.panels.length, 1);
  assert.equal(restored.state.panels[0].tabs[0].destination.page, "Home");
  assert.equal(storage.values.has(key), false);
});

test("account switching restores isolated state and blocks writes for the previous user", () => {
  const storage = memoryStorage();
  const userAState = restoreMasterWorkspaceForUser(storage, "user-a", "Notes", DEFAULT_TASK_WORKSPACE_TABS_STATE).state;
  assert.equal(persistMasterWorkspaceForReadyUser(storage, "user-a", "user-a", true, userAState), true);

  const userBState = restoreMasterWorkspaceForUser(storage, "user-b", "Focus", DEFAULT_TASK_WORKSPACE_TABS_STATE);
  assert.equal(userBState.restored, false);
  assert.equal(userBState.state.panels[0].tabs[0].destination.page, "Focus");
  assert.equal(persistMasterWorkspaceForReadyUser(storage, "user-b", "user-a", true, userBState.state), false);
  assert.equal(storage.values.has(getMasterWorkspaceStorageKey("user-b")), false);
  assert.equal(restoreMasterWorkspaceForUser(storage, "user-a", "Home", DEFAULT_TASK_WORKSPACE_TABS_STATE).state.panels[0].tabs[0].destination.page, "Notes");
});

test("the shell gate is explicit and remains disabled outside development", () => {
  assert.equal(isMasterWorkspaceFeatureEnabled("production", "true"), false);
  assert.equal(isMasterWorkspaceFeatureEnabled("development", undefined), false);
  assert.equal(isMasterWorkspaceFeatureEnabled("development", "false"), false);
  assert.equal(isMasterWorkspaceFeatureEnabled("development", "true"), true);
});
