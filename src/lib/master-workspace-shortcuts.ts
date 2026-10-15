import type { MasterWorkspacePanel, MasterWorkspaceTab } from "@/lib/master-workspace-state";

export type MasterWorkspaceShortcutKeyEvent = Pick<KeyboardEvent,
  "altKey" | "ctrlKey" | "defaultPrevented" | "isComposing" | "key" | "metaKey" | "repeat" | "shiftKey"
>;

export type MasterWorkspaceShortcutCommand =
  | { kind: "open" }
  | { kind: "cancel" }
  | { kind: "select-tab"; tabNumber: number }
  | null;

export function resolveMasterWorkspaceShortcutCommand(
  event: MasterWorkspaceShortcutKeyEvent,
  options: { enabled: boolean; isOpen: boolean; targetIsEditable: boolean },
): MasterWorkspaceShortcutCommand {
  if (event.defaultPrevented || event.repeat || event.isComposing || options.targetIsEditable) return null;
  if (event.metaKey || event.ctrlKey || event.altKey) return null;

  const isShiftS = event.shiftKey && event.key.toLowerCase() === "s";
  if (options.isOpen) {
    if (event.key === "Escape" || isShiftS) return { kind: "cancel" };
    if (!event.shiftKey && /^[1-9]$/.test(event.key)) {
      return { kind: "select-tab", tabNumber: Number(event.key) };
    }
    return null;
  }

  return options.enabled && isShiftS ? { kind: "open" } : null;
}

export function resolveMasterWorkspaceShortcutPanel(
  panels: readonly Pick<MasterWorkspacePanel, "id" | "side">[],
  lastInteractedPanelId: string | null,
) {
  return panels.find((panel) => panel.id === lastInteractedPanelId)
    ?? panels.find((panel) => panel.side === "left")
    ?? panels[0]
    ?? null;
}

export function resolveMasterWorkspaceShortcutTab(
  tabs: readonly MasterWorkspaceTab[],
  tabNumber: number,
) {
  if (!Number.isInteger(tabNumber) || tabNumber < 1 || tabNumber > 9) return null;
  return tabs[tabNumber - 1] ?? null;
}

export function resolveMasterWorkspaceShortcutSelection(
  panel: Pick<MasterWorkspacePanel, "id" | "tabs"> | null,
  tabNumber: number,
  canActivateTabInPanel: (panelId: string, tabId: string) => boolean,
) {
  if (!panel) return { kind: "invalid" as const };
  const tab = resolveMasterWorkspaceShortcutTab(panel.tabs, tabNumber);
  if (!tab) return { kind: "invalid" as const };
  return canActivateTabInPanel(panel.id, tab.id)
    ? { kind: "activate" as const, panelId: panel.id, tab }
    : { kind: "blocked" as const, panelId: panel.id, tab };
}

export function isMasterWorkspaceShortcutTargetEditable(target: unknown) {
  if (!target || typeof target !== "object") return false;
  const element = target as {
    getAttribute?: (name: string) => string | null;
    isContentEditable?: boolean;
    matches?: (selectors: string) => boolean;
    closest?: (selectors: string) => unknown;
    tagName?: string;
  };
  if (element.isContentEditable) return true;

  const editableSelector = '[contenteditable=""], [contenteditable="true"], [role="textbox"], [role="searchbox"], [role="combobox"], [role="spinbutton"], [aria-multiline="true"]';
  const formFieldSelector = "input, textarea, select";
  const isEditableTag = ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName?.toUpperCase() ?? "");
  const hasEditableRole = ["textbox", "searchbox", "combobox", "spinbutton"].includes(element.getAttribute?.("role") ?? "");
  const isMultiline = element.getAttribute?.("aria-multiline") === "true";
  const contentEditable = element.getAttribute?.("contenteditable") === "" || element.getAttribute?.("contenteditable") === "true";
  return isEditableTag
    || hasEditableRole
    || isMultiline
    || contentEditable
    || Boolean(element.matches?.(editableSelector) || element.matches?.(formFieldSelector))
    || Boolean(element.closest?.(`${editableSelector}, ${formFieldSelector}`));
}
