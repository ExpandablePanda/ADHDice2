"use client";

import type { ReactNode } from "react";
import { MasterWorkspacePanel } from "@/components/task-app/master-workspace-panel";

type SplitPanelInfo = {
  activeTabId: string;
  bottomNavigation?: ReactNode;
  id: string;
  navigation: ReactNode;
  shortcutGuide?: ReactNode;
  scrollTop: number;
};

type TasksSplitLayoutProps = {
  active: boolean;
  left: ReactNode;
  right: ReactNode;
  leftPanel?: SplitPanelInfo;
  rightPanel?: SplitPanelInfo;
  onPanelInteraction?: (panelId: string) => void;
  onOverlayHostChange?: (panelId: string, element: HTMLDivElement | null, tabId: string) => void;
  splitRatio: number;
};

export function TasksSplitLayout({ active, left, right, leftPanel, rightPanel, onOverlayHostChange, onPanelInteraction, splitRatio }: TasksSplitLayoutProps) {
  if (!active) return <>{left}</>;

  return (
    <div
      className="grid min-h-0 min-w-0 flex-1 items-stretch gap-3"
      data-master-workspace-split="tasks"
      style={{ gridTemplateColumns: `minmax(0, ${splitRatio}fr) minmax(0, ${1 - splitRatio}fr)` }}
    >
      {leftPanel ? (
        <MasterWorkspacePanel
          activeTabId={leftPanel.activeTabId}
          bottomNavigation={leftPanel.bottomNavigation}
          id={leftPanel.id}
          navigation={leftPanel.navigation}
          onInteraction={onPanelInteraction}
          onOverlayHostChange={onOverlayHostChange}
          scrollTop={leftPanel.scrollTop}
          shortcutGuide={leftPanel.shortcutGuide}
          side="left"
        >
          {left}
        </MasterWorkspacePanel>
      ) : <section data-master-workspace-panel="left">{left}</section>}
      {rightPanel ? (
        <MasterWorkspacePanel
          activeTabId={rightPanel.activeTabId}
          bottomNavigation={rightPanel.bottomNavigation}
          id={rightPanel.id}
          navigation={rightPanel.navigation}
          onInteraction={onPanelInteraction}
          onOverlayHostChange={onOverlayHostChange}
          scrollTop={rightPanel.scrollTop}
          shortcutGuide={rightPanel.shortcutGuide}
          side="right"
        >
          {right}
        </MasterWorkspacePanel>
      ) : <section data-master-workspace-panel="right">{right}</section>}
    </div>
  );
}
