"use client";

import type { ReactNode } from "react";
import { MasterWorkspacePanel } from "@/components/task-app/master-workspace-panel";

type SplitPanelInfo = {
  activeTabId: string;
  id: string;
  navigation: ReactNode;
  scrollTop: number;
};

type TasksSplitLayoutProps = {
  active: boolean;
  left: ReactNode;
  right: ReactNode;
  leftPanel?: SplitPanelInfo;
  rightPanel?: SplitPanelInfo;
  onOverlayHostChange?: (panelId: string, element: HTMLDivElement | null, tabId: string) => void;
  splitRatio: number;
};

export function TasksSplitLayout({ active, left, right, leftPanel, rightPanel, onOverlayHostChange, splitRatio }: TasksSplitLayoutProps) {
  if (!active) return <>{left}</>;

  return (
    <div
      className="grid min-w-0 items-start gap-3"
      data-master-workspace-split="tasks"
      style={{ gridTemplateColumns: `minmax(0, ${splitRatio}fr) minmax(0, ${1 - splitRatio}fr)` }}
    >
      {leftPanel ? (
        <MasterWorkspacePanel
          activeTabId={leftPanel.activeTabId}
          id={leftPanel.id}
          navigation={leftPanel.navigation}
          onOverlayHostChange={onOverlayHostChange}
          scrollTop={leftPanel.scrollTop}
          side="left"
        >
          {left}
        </MasterWorkspacePanel>
      ) : <section data-master-workspace-panel="left">{left}</section>}
      {rightPanel ? (
        <MasterWorkspacePanel
          activeTabId={rightPanel.activeTabId}
          id={rightPanel.id}
          navigation={rightPanel.navigation}
          onOverlayHostChange={onOverlayHostChange}
          scrollTop={rightPanel.scrollTop}
          side="right"
        >
          {right}
        </MasterWorkspacePanel>
      ) : <section data-master-workspace-panel="right">{right}</section>}
    </div>
  );
}
