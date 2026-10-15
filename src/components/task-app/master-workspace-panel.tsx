"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { MasterPanelSide } from "@/lib/master-workspace-state";

export type WorkspaceOverlayHost = {
  element: HTMLElement;
  panelId: string;
  tabId: string;
};

export const WorkspaceOverlayHostContext = createContext<WorkspaceOverlayHost | null | undefined>(undefined);

export function useWorkspaceOverlayHost() {
  return useContext(WorkspaceOverlayHostContext);
}

export function MasterWorkspacePanelContent({ render }: { render: () => ReactNode }) {
  return <>{render()}</>;
}

export function WorkspaceOverlayFrame({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const overlayHost = useWorkspaceOverlayHost();
  if (overlayHost === null) return null;

  const frame = (
    <div
      {...props}
      className={`pointer-events-auto ${overlayHost ? "absolute" : "fixed"} inset-0 ${className ?? ""}`}
      data-overlay-owner-panel={overlayHost?.panelId}
      data-overlay-owner-tab={overlayHost?.tabId}
    >
      {children}
    </div>
  );
  if (!overlayHost) return frame;
  return typeof document === "undefined" ? null : createPortal(frame, overlayHost.element);
}

type MasterWorkspacePanelProps = {
  children: ReactNode;
  activeTabId: string;
  id: string;
  navigation: ReactNode;
  bottomNavigation?: ReactNode;
  shortcutGuide?: ReactNode;
  onInteraction?: (panelId: string) => void;
  onOverlayHostChange?: (panelId: string, element: HTMLDivElement | null, tabId: string) => void;
  scrollTop?: number;
  side: MasterPanelSide;
};

export function MasterWorkspacePanel({ activeTabId, bottomNavigation, children, id, navigation, onInteraction, onOverlayHostChange, scrollTop = 0, shortcutGuide, side }: MasterWorkspacePanelProps) {
  const [overlayElement, setOverlayElement] = useState<HTMLDivElement | null>(null);
  const scrollElementRef = useRef<HTMLDivElement | null>(null);
  const activeTabIdRef = useRef(activeTabId);
  const setOverlayHost = useCallback((element: HTMLDivElement | null) => {
    setOverlayElement(element);
    onOverlayHostChange?.(id, element, activeTabIdRef.current);
  }, [id, onOverlayHostChange]);
  const handleInteraction = useCallback(() => onInteraction?.(id), [id, onInteraction]);

  useLayoutEffect(() => {
    if (activeTabIdRef.current === activeTabId) return;
    activeTabIdRef.current = activeTabId;
    if (overlayElement) onOverlayHostChange?.(id, overlayElement, activeTabId);
  }, [activeTabId, id, onOverlayHostChange, overlayElement]);

  useLayoutEffect(() => {
    if (scrollElementRef.current) scrollElementRef.current.scrollTop = scrollTop;
  }, [activeTabId, id, scrollTop]);

  return (
    <section
      aria-label={`${side === "left" ? "Window 1" : "Window 2"} workspace`}
      className="relative isolate flex h-full min-h-0 min-w-0 flex-col overflow-x-clip overflow-y-visible rounded-[1.5rem] border border-[#ece8f8] bg-white/55 dark:border-white/10 dark:bg-white/[0.025]"
      data-master-workspace-panel={side}
      data-master-workspace-panel-id={id}
      onFocusCapture={handleInteraction}
      onPointerDownCapture={handleInteraction}
      onWheelCapture={handleInteraction}
    >
      <div className="shrink-0">{navigation}</div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
          <WorkspaceOverlayHostContext.Provider value={overlayElement ? { element: overlayElement, panelId: id, tabId: activeTabId } : null}>
          <div
            className="adhdice-scrollbar h-full min-w-0 overflow-y-auto overscroll-contain"
            data-master-workspace-scroll-container={id}
            ref={scrollElementRef}
          >
            <div className={`min-w-0 p-3 ${bottomNavigation ? "pb-20" : ""}`}>{children}</div>
          </div>
          {shortcutGuide ? (
            <div className="pointer-events-none absolute inset-x-3 top-3 z-[125] flex justify-end">
              <div className="pointer-events-auto max-h-full max-w-full">{shortcutGuide}</div>
            </div>
          ) : null}
          <div
            className="pointer-events-none absolute inset-0 z-[130]"
            data-master-workspace-overlay-host={id}
            ref={setOverlayHost}
          />
        </WorkspaceOverlayHostContext.Provider>
      </div>
      {bottomNavigation}
    </section>
  );
}
