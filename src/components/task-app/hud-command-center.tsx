"use client";

import { GripVertical, Plus, RotateCcw, Settings2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type PointerEvent as ReactPointerEvent, type ReactNode, type SetStateAction } from "react";
import {
  DEFAULT_HUD_UI_STATE,
  HUD_WIDGET_LABELS,
  HUD_WIDGET_TYPES,
  HUD_WORKSPACE_SNAP_PX,
  type HudUiState,
  type HudWorkspaceWidget,
  type HudWidgetType,
  updateHudWorkspaceWidgetLayout,
} from "@/lib/task-hud-layout";

type HudWorkspaceScrollMetrics = {
  clientHeight: number;
  clientWidth: number;
  scrollHeight: number;
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
};

type HudCommandCenterProps = {
  hudUiState: HudUiState;
  setHudUiState: Dispatch<SetStateAction<HudUiState>>;
  renderWidget: (widgetType: HudWidgetType) => ReactNode;
};

export function HudRuntimeClock({
  active,
  children,
}: {
  active: boolean;
  children: (now: number) => ReactNode;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [active]);

  return children(now);
}

const FREEFORM_WIDGET_LIMITS = {
  maxHeight: 220,
  maxWidth: 640,
  minHeight: 36,
  minWidth: 44,
};
const WORKSPACE_CANVAS_PADDING_PX = HUD_WORKSPACE_SNAP_PX * 2;
const CUSTOM_SCROLLBAR_MIN_THUMB_PX = 28;
const CUSTOM_SCROLLBAR_TRACK_INSET_PX = 10;
const CUSTOM_SCROLLBAR_TRACK_GAP_PX = CUSTOM_SCROLLBAR_TRACK_INSET_PX * 2;
const CUSTOM_SCROLLBAR_INITIAL_VISIBLE_MS = 5000;
const CUSTOM_SCROLLBAR_IDLE_HIDE_MS = 850;
const CUSTOM_SCROLLBAR_LEAVE_HIDE_MS = 350;

function clampWidgetDimension(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampPosition(value: number) {
  return Math.max(0, Math.round(value));
}

function getInitialScrollMetrics(): HudWorkspaceScrollMetrics {
  return {
    clientHeight: 0,
    clientWidth: 0,
    scrollHeight: 0,
    scrollLeft: 0,
    scrollTop: 0,
    scrollWidth: 0,
  };
}

function sortWorkspaceWidgets(widgets: HudWorkspaceWidget[]) {
  return [...widgets].sort((left, right) => {
    if (left.y !== right.y) {
      return left.y - right.y;
    }
    if (left.x !== right.x) {
      return left.x - right.x;
    }
    return HUD_WIDGET_TYPES.indexOf(left.type) - HUD_WIDGET_TYPES.indexOf(right.type);
  });
}

export function HudCommandCenter({
  hudUiState,
  renderWidget,
  setHudUiState,
}: HudCommandCenterProps) {
  const workspaceScrollRef = useRef<HTMLDivElement | null>(null);
  const customScrollbarHideTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const customScrollbarDragRef = useRef<{
    axis: "horizontal" | "vertical";
    pointerId: number;
    startClientPosition: number;
    startScrollPosition: number;
  } | null>(null);
  const resizeDragRef = useRef<{
    pointerId: number;
    startHeight: number;
    startWidth: number;
    startX: number;
    startY: number;
    widgetId: string;
  } | null>(null);
  const dragMoveRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    widgetId: string;
  } | null>(null);
  const [isHiddenWidgetTrayOpen, setIsHiddenWidgetTrayOpen] = useState(false);
  const [activeDragGuide, setActiveDragGuide] = useState<{ heightPx: number; widthPx: number; x: number; y: number } | null>(null);
  const [workspaceScrollMetrics, setWorkspaceScrollMetrics] = useState(getInitialScrollMetrics);
  const [isCustomScrollbarVisible, setIsCustomScrollbarVisible] = useState(true);
  const [isCustomScrollbarDragging, setIsCustomScrollbarDragging] = useState(false);

  const selectedWidget = useMemo(
    () => hudUiState.hudWorkspace.widgets.find((widget) => widget.id === hudUiState.selectedHudWidgetId) ?? null,
    [hudUiState.hudWorkspace.widgets, hudUiState.selectedHudWidgetId],
  );
  const hiddenWidgetTypes = HUD_WIDGET_TYPES.filter((widgetType) =>
    !hudUiState.hudWorkspace.widgets.some((widget) => widget.type === widgetType && widget.isVisible),
  );
  const hiddenWidgetCount = hiddenWidgetTypes.length;
  const visibleHudWidgets = useMemo(
    () => sortWorkspaceWidgets(hudUiState.hudWorkspace.widgets.filter((widget) => widget.isVisible)),
    [hudUiState.hudWorkspace.widgets],
  );
  const workspaceContentWidth = useMemo(() => {
    const farRight = visibleHudWidgets.reduce(
      (maxRight, widget) => Math.max(maxRight, widget.x + widget.widthPx),
      hudUiState.hudWorkspace.widthPx,
    );
    return Math.max(hudUiState.hudWorkspace.widthPx, farRight + WORKSPACE_CANVAS_PADDING_PX);
  }, [hudUiState.hudWorkspace.widthPx, visibleHudWidgets]);
  const workspaceContentHeight = useMemo(() => {
    const farBottom = visibleHudWidgets.reduce(
      (maxBottom, widget) => Math.max(maxBottom, widget.y + widget.heightPx),
      hudUiState.hudWorkspace.heightPx,
    );
    return Math.max(hudUiState.hudWorkspace.heightPx, farBottom + WORKSPACE_CANVAS_PADDING_PX);
  }, [hudUiState.hudWorkspace.heightPx, visibleHudWidgets]);
  const canScrollVertically = workspaceScrollMetrics.scrollHeight > workspaceScrollMetrics.clientHeight + 1;
  const canScrollHorizontally = workspaceScrollMetrics.scrollWidth > workspaceScrollMetrics.clientWidth + 1;
  const verticalTrackHeight = Math.max(0, workspaceScrollMetrics.clientHeight - CUSTOM_SCROLLBAR_TRACK_GAP_PX);
  const horizontalTrackWidth = Math.max(0, workspaceScrollMetrics.clientWidth - CUSTOM_SCROLLBAR_TRACK_GAP_PX);
  const verticalThumbHeight = canScrollVertically
    ? Math.max(
      CUSTOM_SCROLLBAR_MIN_THUMB_PX,
      Math.round((workspaceScrollMetrics.clientHeight / workspaceScrollMetrics.scrollHeight) * verticalTrackHeight),
    )
    : 0;
  const horizontalThumbWidth = canScrollHorizontally
    ? Math.max(
      CUSTOM_SCROLLBAR_MIN_THUMB_PX,
      Math.round((workspaceScrollMetrics.clientWidth / workspaceScrollMetrics.scrollWidth) * horizontalTrackWidth),
    )
    : 0;
  const verticalThumbTop = canScrollVertically
    ? Math.round((workspaceScrollMetrics.scrollTop / Math.max(1, workspaceScrollMetrics.scrollHeight - workspaceScrollMetrics.clientHeight)) * Math.max(0, verticalTrackHeight - verticalThumbHeight))
    : 0;
  const horizontalThumbLeft = canScrollHorizontally
    ? Math.round((workspaceScrollMetrics.scrollLeft / Math.max(1, workspaceScrollMetrics.scrollWidth - workspaceScrollMetrics.clientWidth)) * Math.max(0, horizontalTrackWidth - horizontalThumbWidth))
    : 0;
  const customScrollbarVisibilityClass = isCustomScrollbarVisible || isCustomScrollbarDragging
    ? "opacity-100"
    : "opacity-0";
  const clearCustomScrollbarHideTimer = useCallback(() => {
    if (customScrollbarHideTimeoutRef.current) {
      window.clearTimeout(customScrollbarHideTimeoutRef.current);
      customScrollbarHideTimeoutRef.current = null;
    }
  }, []);
  const scheduleCustomScrollbarHide = useCallback((delayMs: number) => {
    clearCustomScrollbarHideTimer();
    customScrollbarHideTimeoutRef.current = window.setTimeout(() => {
      setIsCustomScrollbarVisible(false);
      customScrollbarHideTimeoutRef.current = null;
    }, delayMs);
  }, [clearCustomScrollbarHideTimer]);
  const revealCustomScrollbar = useCallback((hideDelayMs?: number) => {
    clearCustomScrollbarHideTimer();
    setIsCustomScrollbarVisible(true);
    if (hideDelayMs !== undefined) {
      scheduleCustomScrollbarHide(hideDelayMs);
    }
  }, [clearCustomScrollbarHideTimer, scheduleCustomScrollbarHide]);

  useEffect(() => {
    const viewport = workspaceScrollRef.current;
    if (!viewport) {
      return;
    }

    function updateWorkspaceScrollMetrics() {
      setWorkspaceScrollMetrics({
        clientHeight: viewport.clientHeight,
        clientWidth: viewport.clientWidth,
        scrollHeight: viewport.scrollHeight,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
        scrollWidth: viewport.scrollWidth,
      });
    }

    function handleWorkspaceScroll() {
      revealCustomScrollbar(CUSTOM_SCROLLBAR_IDLE_HIDE_MS);
      updateWorkspaceScrollMetrics();
    }

    updateWorkspaceScrollMetrics();
    viewport.addEventListener("scroll", handleWorkspaceScroll, { passive: true });

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateWorkspaceScrollMetrics);
    resizeObserver?.observe(viewport);
    if (viewport.firstElementChild) {
      resizeObserver?.observe(viewport.firstElementChild);
    }

    return () => {
      viewport.removeEventListener("scroll", handleWorkspaceScroll);
      resizeObserver?.disconnect();
    };
  }, [hudUiState.hudWorkspace.heightPx, revealCustomScrollbar, workspaceContentHeight, workspaceContentWidth]);

  useEffect(() => {
    scheduleCustomScrollbarHide(CUSTOM_SCROLLBAR_INITIAL_VISIBLE_MS);
    return clearCustomScrollbarHideTimer;
  }, [clearCustomScrollbarHideTimer, scheduleCustomScrollbarHide]);

  function updateHudState(updater: (current: HudUiState) => HudUiState) {
    setHudUiState((current) => updater(current));
  }

  function updateWorkspaceWidgets(updater: (widgets: HudWorkspaceWidget[]) => HudWorkspaceWidget[]) {
    updateHudState((current) => ({
      ...current,
      hudWorkspace: {
        ...current.hudWorkspace,
        widgets: updater(current.hudWorkspace.widgets),
      },
    }));
  }

  function toggleEditMode() {
    updateHudState((current) => ({
      ...current,
      isHudEditMode: !current.isHudEditMode,
      selectedHudWidgetId: current.isHudEditMode ? null : current.selectedHudWidgetId,
    }));
  }

  function selectWidget(widgetId: string | null) {
    updateHudState((current) => ({ ...current, selectedHudWidgetId: widgetId }));
  }

  function removeWidget(widgetId: string) {
    updateHudState((current) => ({
      ...current,
      hudWorkspace: {
        ...current.hudWorkspace,
        widgets: current.hudWorkspace.widgets.map((widget) => widget.id === widgetId
          ? { ...widget, isVisible: false }
          : widget),
      },
      selectedHudWidgetId: current.selectedHudWidgetId === widgetId ? null : current.selectedHudWidgetId,
    }));
  }

  function addWidget(widgetType: HudWidgetType) {
    const defaultWorkspaceWidget = DEFAULT_HUD_UI_STATE.hudWorkspace.widgets.find((widget) => widget.type === widgetType);
    let nextSelectedWidgetId: string | null = null;
    updateWorkspaceWidgets((widgets) => {
      const existingWidget = widgets.find((widget) => widget.type === widgetType);
      if (existingWidget) {
        nextSelectedWidgetId = existingWidget.id;
        return updateHudWorkspaceWidgetLayout(
          widgets,
          hudUiState.hudWorkspace,
          existingWidget.id,
          { isVisible: true },
        );
      }
      if (!defaultWorkspaceWidget) {
        return widgets;
      }
      nextSelectedWidgetId = defaultWorkspaceWidget.id;
      return updateHudWorkspaceWidgetLayout(
        [...widgets, { ...defaultWorkspaceWidget, isVisible: true }],
        hudUiState.hudWorkspace,
        defaultWorkspaceWidget.id,
        { isVisible: true },
      );
    });
    selectWidget(nextSelectedWidgetId);
    setIsHiddenWidgetTrayOpen(false);
  }

  function resizeWidget(widgetId: string, widthPx: number, heightPx: number) {
    updateWorkspaceWidgets((widgets) => updateHudWorkspaceWidgetLayout(
      widgets,
      hudUiState.hudWorkspace,
      widgetId,
      {
        heightPx: clampWidgetDimension(heightPx, FREEFORM_WIDGET_LIMITS.minHeight, FREEFORM_WIDGET_LIMITS.maxHeight),
        widthPx: clampWidgetDimension(widthPx, FREEFORM_WIDGET_LIMITS.minWidth, FREEFORM_WIDGET_LIMITS.maxWidth),
      },
    ));
  }

  function handleResizePointerDown(event: ReactPointerEvent<HTMLButtonElement>, widget: HudWorkspaceWidget) {
    event.preventDefault();
    event.stopPropagation();
    resizeDragRef.current = {
      pointerId: event.pointerId,
      startHeight: widget.heightPx,
      startWidth: widget.widthPx,
      startX: event.clientX,
      startY: event.clientY,
      widgetId: widget.id,
    };
    selectWidget(widget.id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveWidget(widgetId: string, x: number, y: number) {
    let nextGuide: { heightPx: number; widthPx: number; x: number; y: number } | null = null;
    updateWorkspaceWidgets((widgets) => {
      const nextWidgets = updateHudWorkspaceWidgetLayout(
        widgets,
        hudUiState.hudWorkspace,
        widgetId,
        { x, y },
      );
      const movedWidget = nextWidgets.find((widget) => widget.id === widgetId) ?? null;
      nextGuide = movedWidget ? {
        heightPx: movedWidget.heightPx,
        widthPx: movedWidget.widthPx,
        x: movedWidget.x,
        y: movedWidget.y,
      } : null;
      return nextWidgets;
    });
    setActiveDragGuide(nextGuide);
  }

  function handleWidgetPointerDown(event: ReactPointerEvent<HTMLDivElement>, widget: HudWorkspaceWidget) {
    if (!hudUiState.isHudEditMode || resizeDragRef.current !== null || event.button !== 0) {
      return;
    }

    event.preventDefault();
    dragMoveRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: widget.x,
      startY: widget.y,
      widgetId: widget.id,
    };
    selectWidget(widget.id);
    setActiveDragGuide({
      heightPx: widget.heightPx,
      widthPx: widget.widthPx,
      x: widget.x,
      y: widget.y,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleWidgetPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragMoveRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || resizeDragRef.current !== null) {
      return;
    }

    event.preventDefault();
    moveWidget(
      dragState.widgetId,
      dragState.startX + event.clientX - dragState.startClientX,
      dragState.startY + event.clientY - dragState.startClientY,
    );
  }

  function handleWidgetPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragMoveRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    dragMoveRef.current = null;
    setActiveDragGuide(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleResizePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = resizeDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    resizeWidget(dragState.widgetId, dragState.startWidth + event.clientX - dragState.startX, dragState.startHeight + event.clientY - dragState.startY);
  }

  function handleResizePointerEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = resizeDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    resizeDragRef.current = null;
    setActiveDragGuide(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function resetHudLayout() {
    setHudUiState(DEFAULT_HUD_UI_STATE);
    setIsHiddenWidgetTrayOpen(false);
  }

  function handleCustomScrollbarPointerDown(event: ReactPointerEvent<HTMLButtonElement>, axis: "horizontal" | "vertical") {
    event.preventDefault();
    event.stopPropagation();
    const viewport = workspaceScrollRef.current;
    if (!viewport) {
      return;
    }

    customScrollbarDragRef.current = {
      axis,
      pointerId: event.pointerId,
      startClientPosition: axis === "horizontal" ? event.clientX : event.clientY,
      startScrollPosition: axis === "horizontal" ? viewport.scrollLeft : viewport.scrollTop,
    };
    clearCustomScrollbarHideTimer();
    setIsCustomScrollbarVisible(true);
    setIsCustomScrollbarDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCustomScrollbarPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = customScrollbarDragRef.current;
    const viewport = workspaceScrollRef.current;
    if (!dragState || !viewport || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const isHorizontal = dragState.axis === "horizontal";
    const clientSize = isHorizontal ? viewport.clientWidth : viewport.clientHeight;
    const scrollSize = isHorizontal ? viewport.scrollWidth : viewport.scrollHeight;
    const trackSize = Math.max(0, clientSize - CUSTOM_SCROLLBAR_TRACK_GAP_PX);
    const thumbSize = Math.max(CUSTOM_SCROLLBAR_MIN_THUMB_PX, Math.round((clientSize / scrollSize) * trackSize));
    const scrollableDistance = Math.max(1, scrollSize - clientSize);
    const draggableDistance = Math.max(1, trackSize - thumbSize);
    const pointerDelta = (isHorizontal ? event.clientX : event.clientY) - dragState.startClientPosition;
    const nextScrollPosition = dragState.startScrollPosition + (pointerDelta / draggableDistance) * scrollableDistance;

    if (isHorizontal) {
      viewport.scrollLeft = nextScrollPosition;
    } else {
      viewport.scrollTop = nextScrollPosition;
    }
  }

  function handleCustomScrollbarPointerEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = customScrollbarDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    customScrollbarDragRef.current = null;
    setIsCustomScrollbarDragging(false);
    scheduleCustomScrollbarHide(CUSTOM_SCROLLBAR_IDLE_HIDE_MS);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function renderWidgetTile(widget: HudWorkspaceWidget) {
    const isSelected = hudUiState.isHudEditMode && selectedWidget?.id === widget.id;
    const isDragging = dragMoveRef.current?.widgetId === widget.id;
    const overflowClass = widget.type === "notification_inbox" ? "overflow-visible z-20" : "overflow-hidden";
    const tileStyle: CSSProperties = {
      height: widget.heightPx,
      left: clampPosition(widget.x),
      top: clampPosition(widget.y),
      width: widget.widthPx,
    };

    return (
      <div
        className={`absolute min-h-0 min-w-0 rounded-[1rem] border border-white/35 bg-transparent px-2.5 py-2 text-left backdrop-blur-[10px] dark:border-white/10 dark:bg-transparent ${overflowClass} ${isSelected ? "ring-2 ring-[#6f57f6]" : ""} ${hudUiState.isHudEditMode ? "touch-none cursor-grab select-none" : ""} ${isDragging ? "cursor-grabbing shadow-[0_16px_34px_rgba(81,61,168,0.18)]" : ""}`}
        key={widget.id}
        style={tileStyle}
        onClick={() => {
          if (hudUiState.isHudEditMode) {
            selectWidget(widget.id);
          }
        }}
        onKeyDown={(event) => {
          if (!hudUiState.isHudEditMode) {
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectWidget(widget.id);
          }
        }}
        onPointerCancel={handleWidgetPointerEnd}
        onPointerDown={(event) => handleWidgetPointerDown(event, widget)}
        onPointerMove={handleWidgetPointerMove}
        onPointerUp={handleWidgetPointerEnd}
        role={hudUiState.isHudEditMode ? "button" : undefined}
        tabIndex={hudUiState.isHudEditMode ? 0 : undefined}
      >
        {hudUiState.isHudEditMode ? (
          <>
            <div className="absolute left-1 top-1 rounded-full bg-white/85 p-0.5 text-[#7a63f7] shadow-[0_6px_18px_rgba(81,61,168,0.08)] dark:bg-[#171328] dark:text-[#cabfff]">
              <GripVertical className="h-3 w-3" />
            </div>
            <button
              aria-label={`Remove ${HUD_WIDGET_LABELS[widget.type]}`}
              className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[#fff1f3]/90 text-[#f05566] dark:bg-[#44232f] dark:text-[#ff9eaf]"
              onClick={(event) => {
                event.stopPropagation();
                removeWidget(widget.id);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              type="button"
            >
              <Trash2 className="h-3 w-3" />
            </button>
            <button
              aria-label={`Drag to resize ${HUD_WIDGET_LABELS[widget.type]}`}
              className="absolute bottom-1 right-1 z-10 flex h-5 w-5 cursor-se-resize items-center justify-center rounded-full border border-[#ddd6fb] bg-white/90 text-[#7a63f7] shadow-[0_8px_18px_rgba(81,61,168,0.1)] touch-none dark:border-white/10 dark:bg-[#171328] dark:text-[#cabfff]"
              onClick={(event) => event.stopPropagation()}
              onPointerCancel={handleResizePointerEnd}
              onPointerDown={(event) => handleResizePointerDown(event, widget)}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerEnd}
              type="button"
            >
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-br-[0.35rem] border-b-2 border-r-2 border-current" />
            </button>
          </>
        ) : null}
        <div className="h-full">
          {renderWidget(widget.type)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1">
      <div>
        <div className="flex min-w-0 items-start gap-2">
          <div
            className="relative min-w-0 flex-1"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                scheduleCustomScrollbarHide(CUSTOM_SCROLLBAR_LEAVE_HIDE_MS);
              }
            }}
            onFocus={() => revealCustomScrollbar()}
            onPointerEnter={() => revealCustomScrollbar()}
            onPointerLeave={() => {
              if (!isCustomScrollbarDragging) {
                scheduleCustomScrollbarHide(CUSTOM_SCROLLBAR_LEAVE_HIDE_MS);
              }
            }}
          >
            <div
              className="adhdice-hud-workspace-scrollbar min-w-0 overflow-auto rounded-[1.2rem] border border-white/35 bg-white/[0.2] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:border-white/10 dark:bg-white/[0.03]"
              ref={workspaceScrollRef}
              style={{ height: hudUiState.hudWorkspace.heightPx }}
            >
              <div
                className="relative min-w-full"
                style={{
                  height: workspaceContentHeight,
                  width: workspaceContentWidth,
                }}
              >
                {hudUiState.isHudEditMode && activeDragGuide ? (
                  <>
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute bottom-0 top-0 w-px bg-[#6f57f6]/35 dark:bg-[#cabfff]/35"
                      style={{ left: activeDragGuide.x }}
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute left-0 right-0 h-px bg-[#6f57f6]/35 dark:bg-[#cabfff]/35"
                      style={{ top: activeDragGuide.y }}
                    />
                  </>
                ) : null}
                {visibleHudWidgets.map((widget) => renderWidgetTile(widget))}
              </div>
            </div>
            {canScrollVertically ? (
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute bottom-[10px] right-[5px] top-[10px] w-1.5 rounded-full bg-[#ede9fe]/40 transition-opacity duration-200 motion-reduce:transition-none dark:bg-[#4f3f91]/20 ${customScrollbarVisibilityClass}`}
              >
                <button
                  aria-label="Drag HUD vertical scrollbar"
                  className="pointer-events-auto absolute left-0 w-1.5 cursor-grab rounded-full bg-[#b9a7ff]/80 shadow-[0_0_0_1px_rgba(255,255,255,0.4)] active:cursor-grabbing dark:bg-[#cabfff]/75"
                  onPointerCancel={handleCustomScrollbarPointerEnd}
                  onPointerDown={(event) => handleCustomScrollbarPointerDown(event, "vertical")}
                  onPointerMove={handleCustomScrollbarPointerMove}
                  onPointerUp={handleCustomScrollbarPointerEnd}
                  style={{
                    height: verticalThumbHeight,
                    top: verticalThumbTop,
                  }}
                  tabIndex={-1}
                  type="button"
                />
              </div>
            ) : null}
            {canScrollHorizontally ? (
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute bottom-[5px] left-[10px] right-[10px] h-1.5 rounded-full bg-[#ede9fe]/40 transition-opacity duration-200 motion-reduce:transition-none dark:bg-[#4f3f91]/20 ${customScrollbarVisibilityClass}`}
              >
                <button
                  aria-label="Drag HUD horizontal scrollbar"
                  className="pointer-events-auto absolute top-0 h-1.5 cursor-grab rounded-full bg-[#b9a7ff]/80 shadow-[0_0_0_1px_rgba(255,255,255,0.4)] active:cursor-grabbing dark:bg-[#cabfff]/75"
                  onPointerCancel={handleCustomScrollbarPointerEnd}
                  onPointerDown={(event) => handleCustomScrollbarPointerDown(event, "horizontal")}
                  onPointerMove={handleCustomScrollbarPointerMove}
                  onPointerUp={handleCustomScrollbarPointerEnd}
                  style={{
                    left: horizontalThumbLeft,
                    width: horizontalThumbWidth,
                  }}
                  tabIndex={-1}
                  type="button"
                />
              </div>
            ) : null}
          </div>
          <button
            aria-label={hudUiState.isHudEditMode ? "Finish editing HUD" : "Edit HUD"}
            aria-pressed={hudUiState.isHudEditMode}
            className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${hudUiState.isHudEditMode ? "bg-[#6f57f6] text-white shadow-[0_10px_22px_rgba(111,87,246,0.18)] dark:bg-[#cabfff] dark:text-[#1a1431]" : "border border-white/70 bg-white/[0.62] text-[#6f57f6] hover:bg-white/[0.82] dark:border-white/10 dark:bg-white/[0.05] dark:text-[#cabfff]"}`}
            onClick={toggleEditMode}
            type="button"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {hudUiState.isHudEditMode ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button className="ui-pill-button-danger-light" onClick={resetHudLayout} type="button">
              <RotateCcw className="mr-1 inline h-3.5 w-3.5" />
              Reset
            </button>

            {selectedWidget ? (
              <>
                <span className="rounded-full bg-white/[0.62] px-3 py-1.5 text-xs font-semibold text-[#655f84] dark:bg-white/[0.04] dark:text-white/65">
                  {HUD_WIDGET_LABELS[selectedWidget.type]}
                </span>
                <span className="rounded-full bg-white/[0.62] px-3 py-1.5 text-xs font-semibold text-[#655f84] dark:bg-white/[0.04] dark:text-white/65">
                  Drag to place. Resize with the corner handle.
                </span>
              </>
            ) : (
              <span className="rounded-full bg-white/[0.62] px-3 py-1.5 text-xs font-semibold text-[#655f84] dark:bg-white/[0.04] dark:text-white/65">
                Select a widget to drag, resize, or hide it.
              </span>
            )}

            <button className="ui-pill-button-strong-light" onClick={() => setIsHiddenWidgetTrayOpen((current) => !current)} type="button">
              <Plus className="mr-1 inline h-3.5 w-3.5" />
              {isHiddenWidgetTrayOpen ? "Hide" : hiddenWidgetCount > 0 ? `Add (${hiddenWidgetCount})` : "All shown"}
            </button>
            <span className="rounded-full bg-white/[0.62] px-3 py-1.5 text-xs font-semibold text-[#655f84] dark:bg-white/[0.04] dark:text-white/65">
              Snap {HUD_WORKSPACE_SNAP_PX}px
            </span>
          </div>
        ) : null}

        {hudUiState.isHudEditMode && isHiddenWidgetTrayOpen ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {hiddenWidgetTypes.length > 0 ? hiddenWidgetTypes.map((widgetType) => (
              <button className="ui-pill-button-light" key={widgetType} onClick={() => addWidget(widgetType)} type="button">
                <Plus className="mr-1 inline h-3.5 w-3.5" />
                {HUD_WIDGET_LABELS[widgetType]}
              </button>
            )) : (
              <div className="rounded-full bg-white/[0.62] px-3 py-1.5 text-xs font-semibold text-[#655f84] dark:bg-white/[0.04] dark:text-white/65">
                Every HUD widget is already visible.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
