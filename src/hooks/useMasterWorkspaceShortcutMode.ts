"use client";

import { useCallback, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import {
  isMasterWorkspaceShortcutTargetEditable,
  resolveMasterWorkspaceShortcutCommand,
  resolveMasterWorkspaceShortcutPanel,
  resolveMasterWorkspaceShortcutSelection,
} from "@/lib/master-workspace-shortcuts";
import type { MasterWorkspaceState } from "@/lib/master-workspace-state";

type ShortcutModeSession = { targetPanelId: string };

type UseMasterWorkspaceShortcutModeOptions = {
  enabled: boolean;
  workspace: MasterWorkspaceState;
  isOpenRef: MutableRefObject<boolean>;
  canActivateTabInPanel: (panelId: string, tabId: string) => boolean;
  activateTabInPanel: (panelId: string, tabId: string) => boolean;
  getTabTransitionBlockReasonInPanel: (panelId: string, tabId: string) => string | null;
  onBlocked: (reason: string) => void;
};

export function useMasterWorkspaceShortcutMode(options: UseMasterWorkspaceShortcutModeOptions) {
  const [session, setSession] = useState<ShortcutModeSession | null>(null);
  const sessionRef = useRef<ShortcutModeSession | null>(null);
  const lastInteractedPanelIdRef = useRef<string | null>(null);
  const optionsRef = useRef(options);

  const updateSession = useCallback((next: ShortcutModeSession | null) => {
    sessionRef.current = next;
    optionsRef.current.isOpenRef.current = Boolean(next);
    setSession(next);
  }, []);

  useLayoutEffect(() => {
    optionsRef.current = options;
    const current = sessionRef.current;
    const targetExists = current && options.workspace.panels.some((panel) => panel.id === current.targetPanelId);
    if (current && (!options.enabled || !targetExists)) {
      // Invalidate the keyboard session before paint when its workspace target disappears.
      updateSession(null);
    }
  }, [options, updateSession]);

  useLayoutEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const currentOptions = optionsRef.current;
      const currentSession = sessionRef.current;
      if (currentSession && (!currentOptions.enabled
        || !currentOptions.workspace.panels.some((panel) => panel.id === currentSession.targetPanelId))) {
        updateSession(null);
        return;
      }

      const command = resolveMasterWorkspaceShortcutCommand(event, {
        enabled: currentOptions.enabled,
        isOpen: Boolean(currentSession),
        targetIsEditable: isMasterWorkspaceShortcutTargetEditable(event.target),
      });
      if (!command) return;

      if (command.kind === "open") {
        const panel = resolveMasterWorkspaceShortcutPanel(
          currentOptions.workspace.panels,
          lastInteractedPanelIdRef.current,
        );
        if (!panel) return;
        event.preventDefault();
        updateSession({ targetPanelId: panel.id });
        return;
      }

      if (command.kind === "cancel") {
        event.preventDefault();
        updateSession(null);
        return;
      }

      const targetPanel = currentOptions.workspace.panels.find((panel) => panel.id === currentSession?.targetPanelId);
      const selection = resolveMasterWorkspaceShortcutSelection(
        targetPanel ?? null,
        command.tabNumber,
        currentOptions.canActivateTabInPanel,
      );
      event.preventDefault();
      if (selection.kind === "invalid") return;

      if (selection.kind === "blocked") {
        currentOptions.onBlocked(
          currentOptions.getTabTransitionBlockReasonInPanel(selection.panelId, selection.tab.id)
            ?? "Save or cancel the current edit before switching tabs.",
        );
        return;
      }

      if (currentOptions.activateTabInPanel(selection.panelId, selection.tab.id)) {
        updateSession(null);
      } else {
        currentOptions.onBlocked(
          currentOptions.getTabTransitionBlockReasonInPanel(selection.panelId, selection.tab.id)
            ?? "Save or cancel the current edit before switching tabs.",
        );
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!sessionRef.current) return;
      const target = event.target;
      if (target instanceof Element && target.closest("[data-master-workspace-shortcut-guide]")) return;
      updateSession(null);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [updateSession]);

  const recordPanelInteraction = useCallback((panelId: string) => {
    lastInteractedPanelIdRef.current = panelId;
  }, []);

  const targetPanelId = session
    && options.enabled
    && options.workspace.panels.some((panel) => panel.id === session.targetPanelId)
    ? session.targetPanelId
    : null;

  return {
    isOpenRef: options.isOpenRef,
    recordPanelInteraction,
    targetPanelId,
  };
}
