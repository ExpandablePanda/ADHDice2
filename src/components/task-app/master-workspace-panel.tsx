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
  onOverlayHostChange?: (panelId: string, element: HTMLDivElement | null, tabId: string) => void;
  scrollTop?: number;
  side: MasterPanelSide;
};

export function MasterWorkspacePanel({ activeTabId, bottomNavigation, children, id, navigation, onOverlayHostChange, scrollTop = 0, side }: MasterWorkspacePanelProps) {
  const [overlayElement, setOverlayElement] = useState<HTMLDivElement | null>(null);
  const scrollElementRef = useRef<HTMLDivElement | null>(null);
  const activeTabIdRef = useRef(activeTabId);
  const setOverlayHost = useCallback((element: HTMLDivElement | null) => {
    setOverlayElement(element);
    onOverlayHostChange?.(id, element, activeTabIdRef.current);
  }, [id, onOverlayHostChange]);

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
      className="relative isolate flex h-[calc(100dvh-18rem)] min-h-64 min-w-0 flex-col overflow-hidden rounded-[1.5rem] border border-[#ece8f8] bg-white/55 dark:border-white/10 dark:bg-white/[0.025]"
      data-master-workspace-panel={side}
      data-master-workspace-panel-id={id}
    >
      <div className="shrink-0">{navigation}</div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
          <WorkspaceOverlayHostContext.Provider value={overlayElement ? { element: overlayElement, panelId: id, tabId: activeTabId } : null}>
          <div
            className="adhdice-scrollbar h-full min-w-0 overflow-y-auto overscroll-contain"
            data-master-workspace-scroll-container={id}
            ref={scrollElementRef}
          >
            <div className="min-w-0 p-3">{children}</div>
          </div>
          <div
            className="pointer-events-none absolute inset-0 z-[130]"
            data-master-workspace-overlay-host={id}
            ref={setOverlayHost}
          />
        </WorkspaceOverlayHostContext.Provider>
      </div>
      {bottomNavigation ? <div className="z-20 shrink-0 border-t border-[#ece8f8] bg-white/80 py-1 dark:border-white/10 dark:bg-[#171328]/80">{bottomNavigation}</div> : null}
    </section>
  );
}
