import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createDefaultMasterWorkspaceState,
  createMasterTab,
  duplicateFocusedPageIntoRightPanel,
} from "../src/lib/master-workspace-state.ts";
import {
  isMasterWorkspaceShortcutTargetEditable,
  resolveMasterWorkspaceShortcutCommand,
  resolveMasterWorkspaceShortcutPanel,
  resolveMasterWorkspaceShortcutSelection,
  resolveMasterWorkspaceShortcutTab,
} from "../src/lib/master-workspace-shortcuts.ts";

function keyEvent(key: string, overrides: Partial<{
  altKey: boolean;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  isComposing: boolean;
  metaKey: boolean;
  repeat: boolean;
  shiftKey: boolean;
}> = {}) {
  return {
    altKey: false,
    ctrlKey: false,
    defaultPrevented: false,
    isComposing: false,
    key,
    metaKey: false,
    repeat: false,
    shiftKey: false,
    ...overrides,
  };
}

function workspaceWithTabs() {
  const initial = createDefaultMasterWorkspaceState();
  const panelId = initial.panels[0].id;
  const second = createMasterTab(initial, panelId, {
    id: "second-tab",
    destination: { kind: "page", page: "Tasks" },
    presentation: {},
  }, false);
  return createMasterTab(second, panelId, {
    id: "third-tab",
    destination: { kind: "page", page: "Notes" },
    presentation: {},
  }, false);
}

test("Shift + S activates Shortcut Mode only outside editable targets and ignores repeats and OS modifiers", () => {
  assert.deepEqual(resolveMasterWorkspaceShortcutCommand(keyEvent("S", { shiftKey: true }), {
    enabled: true,
    isOpen: false,
    targetIsEditable: false,
  }), { kind: "open" });
  assert.equal(resolveMasterWorkspaceShortcutCommand(keyEvent("s"), {
    enabled: true,
    isOpen: false,
    targetIsEditable: false,
  }), null);
  assert.equal(resolveMasterWorkspaceShortcutCommand(keyEvent("s", { shiftKey: true }), {
    enabled: false,
    isOpen: false,
    targetIsEditable: false,
  }), null);

  for (const overrides of [
    { shiftKey: true, repeat: true },
    { shiftKey: true, metaKey: true },
    { shiftKey: true, ctrlKey: true },
    { shiftKey: true, altKey: true },
    { shiftKey: true, isComposing: true },
  ]) {
    assert.equal(resolveMasterWorkspaceShortcutCommand(keyEvent("s", overrides), {
      enabled: true,
      isOpen: false,
      targetIsEditable: false,
    }), null);
  }

  assert.equal(isMasterWorkspaceShortcutTargetEditable({ tagName: "INPUT" }), true);
  assert.equal(isMasterWorkspaceShortcutTargetEditable({ tagName: "TEXTAREA" }), true);
  assert.equal(isMasterWorkspaceShortcutTargetEditable({ isContentEditable: true }), true);
  assert.equal(isMasterWorkspaceShortcutTargetEditable({ tagName: "BUTTON" }), false);
  assert.equal(isMasterWorkspaceShortcutTargetEditable({
    tagName: "SPAN",
    closest: (selector: string) => selector.includes('[role="textbox"]') ? {} : null,
  }), true);
});

test("Shortcut Mode maps number keys to visual tab order and dismisses with Escape or Shift + S", () => {
  const workspace = workspaceWithTabs();
  const tabs = workspace.panels[0].tabs;
  assert.equal(resolveMasterWorkspaceShortcutTab(tabs, 1)?.id, "master-tab-1");
  assert.equal(resolveMasterWorkspaceShortcutTab(tabs, 2)?.id, "second-tab");
  assert.equal(resolveMasterWorkspaceShortcutTab(tabs, 3)?.id, "third-tab");
  assert.equal(resolveMasterWorkspaceShortcutTab(tabs, 9), null);
  assert.equal(resolveMasterWorkspaceShortcutTab(tabs, 0), null);

  assert.deepEqual(resolveMasterWorkspaceShortcutCommand(keyEvent("2"), {
    enabled: true,
    isOpen: true,
    targetIsEditable: false,
  }), { kind: "select-tab", tabNumber: 2 });
  assert.deepEqual(resolveMasterWorkspaceShortcutCommand(keyEvent("Escape"), {
    enabled: true,
    isOpen: true,
    targetIsEditable: false,
  }), { kind: "cancel" });
  assert.deepEqual(resolveMasterWorkspaceShortcutCommand(keyEvent("s", { shiftKey: true }), {
    enabled: true,
    isOpen: true,
    targetIsEditable: false,
  }), { kind: "cancel" });
  assert.equal(resolveMasterWorkspaceShortcutCommand(keyEvent("0"), {
    enabled: true,
    isOpen: true,
    targetIsEditable: false,
  }), null);
});

test("Shortcut Mode follows the last interacted panel and falls back to Window 1", () => {
  const split = duplicateFocusedPageIntoRightPanel(createDefaultMasterWorkspaceState(), {
    panelId: "right-panel",
    tabId: "right-tab",
  });
  assert.equal(resolveMasterWorkspaceShortcutPanel(split.panels, "right-panel")?.side, "right");
  assert.equal(resolveMasterWorkspaceShortcutPanel(split.panels, "removed-panel")?.side, "left");
  assert.equal(resolveMasterWorkspaceShortcutPanel(split.panels, null)?.id, split.panels[0].id);

  const right = split.panels.find((panel) => panel.side === "right");
  assert.ok(right);
  assert.deepEqual(resolveMasterWorkspaceShortcutSelection(right, 1, (panelId) => panelId === right.id), {
    kind: "activate",
    panelId: right.id,
    tab: right.tabs[0],
  });
  assert.equal(resolveMasterWorkspaceShortcutSelection(right, 2, () => true).kind, "invalid");
  assert.equal(resolveMasterWorkspaceShortcutSelection(right, 1, () => false).kind, "blocked");
});

test("shortcut listener stays single and Task shortcuts yield while Shortcut Mode is active", () => {
  const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const shortcutHookSource = readFileSync(new URL("../src/hooks/useMasterWorkspaceShortcutMode.ts", import.meta.url), "utf8");

  assert.match(taskAppSource, /masterWorkspaceShortcutModeOpenRef\.current/);
  assert.match(taskAppSource, /event\.metaKey[\s\S]*?event\.ctrlKey[\s\S]*?event\.altKey/);
  assert.match(shortcutHookSource, /window\.addEventListener\("keydown", handleKeyDown, true\)/);
  assert.match(shortcutHookSource, /window\.removeEventListener\("keydown", handleKeyDown, true\)/);
  assert.match(shortcutHookSource, /document\.addEventListener\("pointerdown", handlePointerDown, true\)/);
  assert.match(shortcutHookSource, /document\.removeEventListener\("pointerdown", handlePointerDown, true\)/);
  assert.equal((shortcutHookSource.match(/window\.addEventListener\("keydown"/g) ?? []).length, 1);
});
