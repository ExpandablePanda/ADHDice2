"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { NavigatorSearchTarget } from "@/lib/navigator-search";
import type { TaskSearchEntity } from "@/lib/task-search-selector";
import { NavigatorSearchInline, type NavigatorSearchPlacement } from "./navigator-search-inline";

type DockPlacement = NavigatorSearchPlacement;

type BottomDockProps<TPage extends string> = {
  activePage: TPage;
  dockIcons: Record<TPage, string>;
  dockItems: TPage[];
  onNavigate: (page: TPage) => void;
  onNavigateSearchTarget: (target: NavigatorSearchTarget) => void;
  renderIcon: (name: string) => ReactNode;
  searchTargets: readonly NavigatorSearchTarget[];
  taskSearchEntities: readonly TaskSearchEntity[];
};

export function BottomDockComponent<TPage extends string>({
  activePage,
  dockIcons,
  dockItems,
  onNavigate,
  onNavigateSearchTarget,
  renderIcon,
  searchTargets,
  taskSearchEntities,
}: BottomDockProps<TPage>) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [isDockCollapsing, setIsDockCollapsing] = useState(false);
  const [dockPlacement, setDockPlacement] = useState<DockPlacement>("bottom");
  const [showPlacementMenu, setShowPlacementMenu] = useState(false);
  const [placementMenuPos, setPlacementMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [isBubbleWhooshing, setIsBubbleWhooshing] = useState(false);
  const [bubblePos, setBubblePos] = useState(() => {
    if (typeof window === "undefined") {
      return { x: 24, y: 24 };
    }
    return { x: window.innerWidth - 96, y: window.innerHeight - 148 };
  });
  const [bubbleRenderPos, setBubbleRenderPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragReady, setIsDragReady] = useState(false);
  const dragRef = useRef<{
    moved: boolean;
    originX: number;
    originY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const dragReadyTimerRef = useRef<number | null>(null);
  const collapseButtonRef = useRef<HTMLButtonElement | null>(null);
  const placementMenuRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clampBubblePos = (x: number, y: number) => {
    if (typeof window === "undefined") {
      return { x, y };
    }
    const minX = 12;
    const minY = 12;
    const maxX = window.innerWidth - 76;
    const maxY = window.innerHeight - 76;
    return {
      x: Math.min(maxX, Math.max(minX, x)),
      y: Math.min(maxY, Math.max(minY, y)),
    };
  };

  useEffect(() => {
    const handleResize = () => {
      setBubblePos((prev) => clampBubblePos(prev.x, prev.y));
      setBubbleRenderPos((prev) => (prev ? clampBubblePos(prev.x, prev.y) : prev));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const clearPlacementMenu = (event: MouseEvent) => {
      if (!showPlacementMenu) {
        return;
      }
      if (collapseButtonRef.current && collapseButtonRef.current.contains(event.target as Node)) {
        return;
      }
      if (placementMenuRef.current && placementMenuRef.current.contains(event.target as Node)) {
        return;
      }
      setShowPlacementMenu(false);
    };
    document.addEventListener("mousedown", clearPlacementMenu);
    return () => document.removeEventListener("mousedown", clearPlacementMenu);
  }, [showPlacementMenu]);

  const getCollapseOrigin = () => {
    const dockElement = collapseButtonRef.current?.parentElement;
    if (dockElement) {
      const rect = dockElement.getBoundingClientRect();
      return clampBubblePos(rect.left + rect.width / 2 - 32, rect.top + rect.height / 2 - 32);
    }
    if (!collapseButtonRef.current) {
      return clampBubblePos(window.innerWidth - 96, window.innerHeight - 148);
    }
    const rect = collapseButtonRef.current.getBoundingClientRect();
    return clampBubblePos(rect.left + rect.width / 2 - 32, rect.top + rect.height / 2 - 32);
  };

  const renderedDockPlacement: DockPlacement = dockPlacement;

  const openPlacementMenu = () => {
    const fallback = { left: 16, top: 16 };
    if (!collapseButtonRef.current || typeof window === "undefined") {
      setPlacementMenuPos(fallback);
      setShowPlacementMenu(true);
      return;
    }

    const rect = collapseButtonRef.current.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 150;
    const gap = 12;
    const left =
      renderedDockPlacement === "left"
        ? rect.right + gap
        : renderedDockPlacement === "right"
          ? rect.left - menuWidth - gap
          : rect.right - menuWidth;
    const top = renderedDockPlacement === "bottom" ? rect.top - menuHeight - gap : rect.top;

    setPlacementMenuPos({
      left: Math.min(window.innerWidth - menuWidth - 12, Math.max(12, left)),
      top: Math.min(window.innerHeight - menuHeight - 12, Math.max(12, top)),
    });
    setShowPlacementMenu(true);
  };

  const collapseDock = () => {
    const target = clampBubblePos(bubblePos.x, bubblePos.y);
    setShowPlacementMenu(false);
    setIsDockCollapsing(true);
    window.setTimeout(() => {
      const origin = getCollapseOrigin();
      setIsDockCollapsing(false);
      setIsCollapsed(true);
      setBubbleRenderPos(origin);
      setIsBubbleWhooshing(false);
      window.setTimeout(() => {
        setIsBubbleWhooshing(true);
        window.requestAnimationFrame(() => {
          setBubbleRenderPos(target);
        });
      }, 90);
      window.setTimeout(() => {
        setIsBubbleWhooshing(false);
        setBubbleRenderPos(target);
      }, 860);
    }, 640);
  };

  const startBubbleDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const el = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = (bubbleRenderPos ?? bubblePos).x;
    const originY = (bubbleRenderPos ?? bubblePos).y;

    dragReadyTimerRef.current = window.setTimeout(() => {
      setIsDragReady(true);
      el.setPointerCapture(event.pointerId);
      dragRef.current = { startX, startY, originX, originY, moved: false };

      const handleMove = (moveEvent: PointerEvent) => {
        moveEvent.preventDefault();
        if (!dragRef.current) return;
        const dx = moveEvent.clientX - dragRef.current.startX;
        const dy = moveEvent.clientY - dragRef.current.startY;
        const next = clampBubblePos(dragRef.current.originX + dx, dragRef.current.originY + dy);
        dragRef.current.moved = true;
        setBubblePos(next);
        setBubbleRenderPos(next);
      };

      const handleUp = () => {
        dragRef.current = null;
        setIsDragReady(false);
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };

      window.addEventListener("pointermove", handleMove, { passive: false });
      window.addEventListener("pointerup", handleUp);
    }, 400);

    const cancelDragReady = () => {
      if (dragReadyTimerRef.current) {
        window.clearTimeout(dragReadyTimerRef.current);
        dragReadyTimerRef.current = null;
      }
      setIsDragReady(false);
      if (!dragRef.current?.moved) {
        setIsBubbleWhooshing(false);
        setIsCollapsed(false);
      }
      window.removeEventListener("pointerup", cancelDragReady);
    };

    window.addEventListener("pointerup", cancelDragReady);
  };

  if (isCollapsed) {
    return (
      <div
        className={`fixed z-20 select-none ${isBubbleWhooshing ? "transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]" : ""}`}
        style={{ left: (bubbleRenderPos ?? bubblePos).x, top: (bubbleRenderPos ?? bubblePos).y, userSelect: "none", WebkitUserSelect: "none", touchAction: isDragReady ? "none" : "auto" }}
      >
        <button
          aria-label="Open navigation"
          className={`flex h-16 w-16 items-center justify-center rounded-full border shadow-[0_16px_36px_rgba(60,44,140,0.22)] transition-all duration-300 ${isDragReady ? "scale-110 ring-4 ring-[#6f57f6]/40" : "hover:scale-105"} ${isBubbleWhooshing ? "duration-500 ease-out" : ""} border-[#ece8f8] bg-white/95 text-[#6f57f6] dark:border-white/10 dark:bg-[#171328]/95 dark:text-[#cabfff]`}
          onPointerDown={startBubbleDrag}
          style={{ WebkitUserDrag: "none", touchAction: "none" } as React.CSSProperties}
          type="button"
        >
          {renderIcon(dockIcons[activePage])}
        </button>
      </div>
    );
  }

  const isVertical = renderedDockPlacement !== "bottom";
  const dockZIndexClass = isSearchMode ? "z-40" : "z-10";
  const dockPositionClass = renderedDockPlacement === "bottom"
    ? `fixed inset-x-0 ${dockZIndexClass} min-w-0 px-4`
    : renderedDockPlacement === "left"
      ? `fixed left-4 top-4 bottom-4 ${dockZIndexClass} flex items-center`
      : `fixed right-4 top-4 bottom-4 ${dockZIndexClass} flex items-center`;
  const dockPositionStyle = renderedDockPlacement === "bottom"
    ? { bottom: "calc(1.25rem + env(safe-area-inset-bottom))" }
    : undefined;
  const dockShapeClass = isSearchMode
    ? renderedDockPlacement === "bottom"
      ? "mx-auto flex min-w-0 w-[min(28rem,calc(100vw-2rem))] max-w-full items-center gap-[3px] rounded-[1.75rem] px-[3px] py-1"
      : "adhdice-scrollbar flex max-h-full w-[5rem] flex-col items-center gap-1 overflow-visible rounded-[2rem] px-2 py-3 sm:w-[18rem] sm:flex-row sm:gap-[3px] sm:rounded-[1.75rem] sm:px-[3px] sm:py-1"
    : renderedDockPlacement === "bottom"
      ? "adhdice-scrollbar adhdice-horizontal-scroll mx-auto flex min-w-0 w-fit max-w-full items-center gap-[3px] rounded-[1.75rem] px-[3px] py-1 overflow-x-auto sm:overflow-x-visible touch-pan-x"
      : "adhdice-scrollbar flex max-h-full w-[5rem] flex-col items-center gap-1 overflow-y-auto rounded-[2rem] px-2 py-3";
  const collapsingStyle = isDockCollapsing
    ? renderedDockPlacement === "bottom"
      ? { maxWidth: "4rem", width: "4rem", height: "4rem", borderRadius: "9999px", padding: "0" }
      : { width: "4rem", height: "4rem", borderRadius: "9999px", padding: "0" }
    : undefined;

  return (
    <div className={`${dockPositionClass} select-none`} style={{ userSelect: "none", WebkitUserSelect: "none", ...dockPositionStyle }}>
      <div className={`relative ${isDockCollapsing ? "overflow-hidden" : "overflow-visible"} border shadow-[0_25px_45px_rgba(60,44,140,0.18)] transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${dockShapeClass} border-[#ece8f8] bg-white/92 backdrop-blur dark:border-white/10 dark:bg-[#171328]/92 dark:backdrop-blur`} style={collapsingStyle}>
        {isSearchMode ? (
          <NavigatorSearchInline
            onClose={() => setIsSearchMode(false)}
            onNavigate={onNavigateSearchTarget}
            placement={renderedDockPlacement}
            renderIcon={renderIcon}
            targets={searchTargets}
            taskSearchEntities={taskSearchEntities}
          />
        ) : (
          <>
            <button
              aria-label="Search navigation"
              className={`flex ${isVertical ? "w-full" : "h-10 w-10 shrink-0"} items-center justify-center rounded-xl transition duration-300 hover:scale-105 ${isDockCollapsing ? "scale-90 rounded-full" : ""} text-[#8d94ac] hover:bg-[#f7f5ff] hover:text-[#6f57f6] dark:text-white/50 dark:hover:bg-white/8 dark:hover:text-[#cabfff]`}
              onClick={() => {
                setShowPlacementMenu(false);
                setIsSearchMode(true);
              }}
              type="button"
            >
              {renderIcon("Search")}
            </button>
            {dockItems.map((item) => (
              <button
                className={`flex ${isVertical ? "w-full" : "h-10 w-10 shrink-0"} flex-col items-center justify-center rounded-[1rem] px-1 py-2 transition duration-300 ${isDockCollapsing ? "scale-75 opacity-0" : "scale-100 opacity-100"} ${activePage === item ? "text-[#6f57f6] dark:text-[#cabfff]" : "text-[#8d94ac] dark:text-white/50"}`}
                key={item}
                onClick={() => onNavigate(item)}
                type="button"
              >
                {renderIcon(dockIcons[item])}
              </button>
            ))}
            <button
              aria-label="Collapse navigation"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition duration-300 hover:scale-105 ${isVertical ? "" : "ml-[3px]"} ${isDockCollapsing ? "scale-90 rounded-full" : ""} text-[#8d94ac] hover:bg-[#f7f5ff] hover:text-[#6f57f6] dark:text-white/50 dark:hover:bg-white/8 dark:hover:text-[#cabfff]`}
              onClick={() => {
                if (!longPressTriggeredRef.current) {
                  collapseDock();
                }
              }}
              onPointerDown={() => {
                longPressTriggeredRef.current = false;
                if (longPressTimerRef.current) {
                  window.clearTimeout(longPressTimerRef.current);
                }
                longPressTimerRef.current = window.setTimeout(() => {
                  longPressTriggeredRef.current = true;
                  openPlacementMenu();
                }, 450);
              }}
              onPointerLeave={() => {
                if (longPressTimerRef.current) {
                  window.clearTimeout(longPressTimerRef.current);
                  longPressTimerRef.current = null;
                }
              }}
              onPointerUp={() => {
                if (longPressTimerRef.current) {
                  window.clearTimeout(longPressTimerRef.current);
                  longPressTimerRef.current = null;
                }
              }}
              ref={collapseButtonRef}
              type="button"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24">
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}
        {!isSearchMode && showPlacementMenu && placementMenuPos ? (
          <div className="fixed z-30 w-44 rounded-2xl border p-2 shadow-xl border-[#ece8f8] bg-white text-[#1f2746] dark:border-white/10 dark:bg-[#1b1730] dark:text-white" ref={placementMenuRef} style={{ left: placementMenuPos.left, top: placementMenuPos.top }}>
            <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/45">Dock Position</p>
            {([
              { id: "bottom", label: "Bottom Horizontal" },
              { id: "left", label: "Left Vertical" },
              { id: "right", label: "Right Vertical" },
            ] as Array<{ id: DockPlacement; label: string }>).map((option) => (
              <button
                className={`w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${dockPlacement === option.id ? "bg-[#f1ecff] text-[#6f57f6] dark:bg-[#2a214f] dark:text-[#cabfff]" : "hover:bg-[#f7f5ff] dark:hover:bg-white/10"}`}
                key={option.id}
                onClick={() => {
                  setDockPlacement(option.id);
                  setShowPlacementMenu(false);
                }}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
