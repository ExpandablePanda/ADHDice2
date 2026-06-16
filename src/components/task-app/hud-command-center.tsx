"use client";

import { Plus, RotateCcw, Settings2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type PointerEvent as ReactPointerEvent, type ReactNode, type SetStateAction } from "react";
import {
  HUD_LAYOUT_SNAPSHOT_LIMIT,
  HUD_WIDGET_LABELS,
  HUD_WIDGET_TYPES,
  HUD_WORKSPACE_SNAP_PX,
  addHudSnapshot,
  clampHudWidgetDimensions,
  cycleHudSnapshot,
  createDefaultHudUiState,
  getHudSnapshotIds,
  resetActiveHudSnapshot,
  saveActiveHudSnapshot,
  getHudWorkspaceContentDimensions,
  getHudWorkspaceMinimumHeight,
  getHudWorkspaceViewportWidth,
  getHudSortableTarget,
  type HudSortableTarget,
  type HudUiState,
  type HudWorkspaceWidget,
  type HudWidgetType,
  reorderHudWorkspaceWidgets,
  updateActiveHudWorkspace,
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

const CUSTOM_SCROLLBAR_MIN_THUMB_PX = 28;
const CUSTOM_SCROLLBAR_TRACK_INSET_PX = 10;
const CUSTOM_SCROLLBAR_TRACK_GAP_PX = CUSTOM_SCROLLBAR_TRACK_INSET_PX * 2;
const CUSTOM_SCROLLBAR_INITIAL_VISIBLE_MS = 5000;
const CUSTOM_SCROLLBAR_IDLE_HIDE_MS = 850;
const CUSTOM_SCROLLBAR_LEAVE_HIDE_MS = 350;
const WIDGET_DRAG_THRESHOLD_PX = 6;
const WORKSPACE_DIMENSION_LIMITS = {
  maxHeight: 720,
  maxWidth: 2400,
  minWidth: 320,
} as const;

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
  const workspaceRegionRef = useRef<HTMLDivElement | null>(null);
  const workspaceScrollRef = useRef<HTMLDivElement | null>(null);
  const customScrollbarHideTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const customScrollbarDragRef = useRef<{
    axis: "horizontal" | "vertical";
    pointerId: number;
    startClientPosition: number;
    startScrollPosition: number;
  } | null>(null);
  const widgetResizeDragRef = useRef<{
    pointerId: number;
    startHeight: number;
    startWidth: number;
    startX: number;
    startY: number;
    widgetId: string;
  } | null>(null);
  const workspaceResizeDragRef = useRef<{
    axis: "both" | "height" | "width";
    pointerId: number;
    releaseElement: HTMLButtonElement | null;
    startHeight: number;
    startWidth: number;
    startX: number;
    startY: number;
  } | null>(null);
  const dragMoveRef = useRef<{
    hasExceededDragThreshold: boolean;
    lastTarget: HudSortableTarget;
    pointerId: number;
    releaseElement: HTMLDivElement | null;
    startX: number;
    startY: number;
    widgetId: string;
  } | null>(null);
  const [isHiddenWidgetTrayOpen, setIsHiddenWidgetTrayOpen] = useState(false);
  const [activeDragGuide, setActiveDragGuide] = useState<{ heightPx: number; widthPx: number; x: number; y: number } | null>(null);
  const [availableWorkspaceWidth, setAvailableWorkspaceWidth] = useState(0);
  const [dragPreviewWidgets, setDragPreviewWidgets] = useState<HudWorkspaceWidget[] | null>(null);
  const [workspaceScrollMetrics, setWorkspaceScrollMetrics] = useState(getInitialScrollMetrics);
  const [isCustomScrollbarVisible, setIsCustomScrollbarVisible] = useState(true);
  const [isCustomScrollbarDragging, setIsCustomScrollbarDragging] = useState(false);
  const [snapshotFlashLabel, setSnapshotFlashLabel] = useState<string | null>(null);
  const snapshotFlashTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const workspaceAvailableRef = useRef<HTMLDivElement | null>(null);
  const dragPreviewWidgetsRef = useRef<HudWorkspaceWidget[] | null>(null);
  const workspaceWidgets = dragPreviewWidgets ?? hudUiState.hudWorkspace.widgets;

  const selectedWidget = useMemo(
    () => workspaceWidgets.find((widget) => widget.id === hudUiState.selectedHudWidgetId) ?? null,
    [hudUiState.selectedHudWidgetId, workspaceWidgets],
  );
  const hiddenWidgetTypes = HUD_WIDGET_TYPES.filter((widgetType) =>
    !workspaceWidgets.some((widget) => widget.type === widgetType && widget.isVisible),
  );
  const hiddenWidgetCount = hiddenWidgetTypes.length;
  const visibleHudWidgets = useMemo(
    () => sortWorkspaceWidgets(workspaceWidgets.filter((widget) => widget.isVisible)),
    [workspaceWidgets],
  );
  const snapshotIds = useMemo(() => getHudSnapshotIds(hudUiState), [hudUiState]);
  const canAddSnapshot = hudUiState.hudSnapshots.length < HUD_LAYOUT_SNAPSHOT_LIMIT;
  const workspaceViewportWidth = getHudWorkspaceViewportWidth(
    hudUiState.hudWorkspace,
    availableWorkspaceWidth,
  );
  const effectiveWorkspace = useMemo(
    () => ({
      ...hudUiState.hudWorkspace,
      widthPx: workspaceViewportWidth,
    }),
    [hudUiState.hudWorkspace, workspaceViewportWidth],
  );
  const workspaceContentDimensions = useMemo(
    () => getHudWorkspaceContentDimensions(visibleHudWidgets, effectiveWorkspace),
    [effectiveWorkspace, visibleHudWidgets],
  );
  const workspaceContentWidth = workspaceContentDimensions.widthPx;
  const workspaceContentHeight = workspaceContentDimensions.heightPx;
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

  useEffect(() => {
    dragPreviewWidgetsRef.current = dragPreviewWidgets;
  }, [dragPreviewWidgets]);

  useEffect(() => {
    if (!hudUiState.isHudEditMode && dragPreviewWidgetsRef.current !== null) {
      dragPreviewWidgetsRef.current = null;
      setDragPreviewWidgets(null);
      setActiveDragGuide(null);
    }
  }, [hudUiState.isHudEditMode]);

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
    const region = workspaceAvailableRef.current;
    if (!region) {
      return;
    }

    function updateAvailableWorkspaceWidth() {
      setAvailableWorkspaceWidth(region.clientWidth);
    }

    updateAvailableWorkspaceWidth();
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateAvailableWorkspaceWidth);
    resizeObserver?.observe(region);
    return () => resizeObserver?.disconnect();
  }, []);

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

  useEffect(() => {
    return () => {
      if (snapshotFlashTimeoutRef.current) {
        window.clearTimeout(snapshotFlashTimeoutRef.current);
        snapshotFlashTimeoutRef.current = null;
      }
    };
  }, []);

  const clearWidgetDrag = useCallback((pointerId?: number) => {
    const dragState = dragMoveRef.current;
    if (!dragState || (pointerId !== undefined && dragState.pointerId !== pointerId)) {
      return;
    }

    if (dragState.releaseElement?.hasPointerCapture(dragState.pointerId)) {
      dragState.releaseElement.releasePointerCapture(dragState.pointerId);
    }
    dragMoveRef.current = null;
    dragPreviewWidgetsRef.current = null;
    setDragPreviewWidgets(null);
    setActiveDragGuide(null);
  }, []);

  const commitWidgetDrag = useCallback((pointerId?: number) => {
    const dragState = dragMoveRef.current;
    if (!dragState || (pointerId !== undefined && dragState.pointerId !== pointerId)) {
      return;
    }

    const previewWidgets = dragPreviewWidgetsRef.current;
    if (dragState.hasExceededDragThreshold && previewWidgets) {
      updateWorkspaceWidgets(() => previewWidgets);
    }

    if (dragState.releaseElement?.hasPointerCapture(dragState.pointerId)) {
      dragState.releaseElement.releasePointerCapture(dragState.pointerId);
    }
    dragMoveRef.current = null;
    dragPreviewWidgetsRef.current = null;
    setDragPreviewWidgets(null);
    setActiveDragGuide(null);
  }, []);

  const clearWorkspaceResize = useCallback((pointerId?: number) => {
    const resizeState = workspaceResizeDragRef.current;
    if (!resizeState || (pointerId !== undefined && resizeState.pointerId !== pointerId)) {
      return;
    }

    if (resizeState.releaseElement?.hasPointerCapture(resizeState.pointerId)) {
      resizeState.releaseElement.releasePointerCapture(resizeState.pointerId);
    }
    workspaceResizeDragRef.current = null;
  }, []);

  useEffect(() => {
    function handleWindowPointerEnd(event: PointerEvent) {
      commitWidgetDrag(event.pointerId);
      clearWorkspaceResize(event.pointerId);
    }

    function handleWindowBlur() {
      commitWidgetDrag();
      clearWorkspaceResize();
    }

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        clearWidgetDrag();
        clearWorkspaceResize();
      }
    }

    window.addEventListener("pointerup", handleWindowPointerEnd);
    window.addEventListener("pointercancel", handleWindowPointerEnd);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("keydown", handleWindowKeyDown);

    return () => {
      window.removeEventListener("pointerup", handleWindowPointerEnd);
      window.removeEventListener("pointercancel", handleWindowPointerEnd);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [clearWidgetDrag, clearWorkspaceResize, commitWidgetDrag]);

  function updateHudState(updater: (current: HudUiState) => HudUiState) {
    setHudUiState((current) => updater(current));
  }

  function updateWorkspaceWidgets(updater: (widgets: HudWorkspaceWidget[]) => HudWorkspaceWidget[]) {
    updateHudState((current) => updateActiveHudWorkspace(current, (workspace) => ({
      ...workspace,
      widgets: updater(workspace.widgets),
    })));
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
    clearWidgetDrag();
    widgetResizeDragRef.current = null;
    setActiveDragGuide(null);
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
    const defaultWorkspaceWidget = createDefaultHudUiState().hudWorkspace.widgets.find((widget) => widget.type === widgetType);
    let nextSelectedWidgetId: string | null = null;
    updateWorkspaceWidgets((widgets) => {
      const existingWidget = widgets.find((widget) => widget.type === widgetType);
      if (existingWidget) {
        nextSelectedWidgetId = existingWidget.id;
        return updateHudWorkspaceWidgetLayout(
          widgets,
          effectiveWorkspace,
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
        effectiveWorkspace,
        defaultWorkspaceWidget.id,
        { isVisible: true },
      );
    });
    selectWidget(nextSelectedWidgetId);
    setIsHiddenWidgetTrayOpen(false);
  }

  function resizeWidget(widgetId: string, widthPx: number, heightPx: number) {
    const widgetType = hudUiState.hudWorkspace.widgets.find((widget) => widget.id === widgetId)?.type;
    if (!widgetType) {
      return;
    }
    const dimensions = clampHudWidgetDimensions(widgetType, widthPx, heightPx);
    updateWorkspaceWidgets((widgets) => updateHudWorkspaceWidgetLayout(
      widgets,
      hudUiState.hudWorkspace,
      widgetId,
      dimensions,
    ));
  }

  function resizeWorkspace(widthPx: number, heightPx: number, isWidthUserSized: boolean) {
    updateHudState((current) => updateActiveHudWorkspace(current, (workspace) => ({
      ...workspace,
      heightPx: clampWidgetDimension(
        heightPx,
        getHudWorkspaceMinimumHeight(workspace.widgets),
        WORKSPACE_DIMENSION_LIMITS.maxHeight,
      ),
      isWidthUserSized: isWidthUserSized || workspace.isWidthUserSized,
      widthPx: isWidthUserSized
        ? clampWidgetDimension(widthPx, WORKSPACE_DIMENSION_LIMITS.minWidth, WORKSPACE_DIMENSION_LIMITS.maxWidth)
        : workspace.widthPx,
    })));
    revealCustomScrollbar(CUSTOM_SCROLLBAR_IDLE_HIDE_MS);
  }

  function flashSnapshotLabel(label: string) {
    if (snapshotFlashTimeoutRef.current) {
      window.clearTimeout(snapshotFlashTimeoutRef.current);
    }
    setSnapshotFlashLabel(label);
    snapshotFlashTimeoutRef.current = window.setTimeout(() => {
      setSnapshotFlashLabel(null);
      snapshotFlashTimeoutRef.current = null;
    }, 1400);
  }

  function getSortableTarget(widgetId: string, clientX: number, clientY: number) {
    const viewport = workspaceScrollRef.current;
    if (!viewport) {
      return null;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const pointerX = clientX - viewportRect.left + viewport.scrollLeft;
    const pointerY = clientY - viewportRect.top + viewport.scrollTop;
    return getHudSortableTarget(visibleHudWidgets, widgetId, { x: pointerX, y: pointerY });
  }

  function reorderWidget(widgetId: string, target: HudSortableTarget) {
    let nextGuide: { heightPx: number; widthPx: number; x: number; y: number } | null = null;
    const sourceWidgets = dragPreviewWidgetsRef.current ?? hudUiState.hudWorkspace.widgets;
    const nextWidgets = reorderHudWorkspaceWidgets(
      sourceWidgets,
      widgetId,
      target,
    );
    const draggedWidget = nextWidgets.find((widget) => widget.id === widgetId) ?? null;
    nextGuide = draggedWidget ? {
      heightPx: draggedWidget.heightPx,
      widthPx: draggedWidget.widthPx,
      x: draggedWidget.x,
      y: draggedWidget.y,
    } : null;
    dragPreviewWidgetsRef.current = nextWidgets;
    setDragPreviewWidgets(nextWidgets);
    setActiveDragGuide(nextGuide);
  }

  function handleResizePointerDown(event: ReactPointerEvent<HTMLButtonElement>, widget: HudWorkspaceWidget) {
    event.preventDefault();
    event.stopPropagation();
    widgetResizeDragRef.current = {
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

  function handleWidgetPointerDown(event: ReactPointerEvent<HTMLDivElement>, widget: HudWorkspaceWidget) {
    if (!hudUiState.isHudEditMode || widgetResizeDragRef.current !== null || workspaceResizeDragRef.current !== null || event.button !== 0) {
      return;
    }

    event.preventDefault();
    const target = getSortableTarget(widget.id, event.clientX, event.clientY)
      ?? {
        laneIndex: 0,
        laneY: widget.y,
        slotIndex: Math.max(0, visibleHudWidgets.findIndex((visibleWidget) => visibleWidget.id === widget.id)),
      };
    dragMoveRef.current = {
      hasExceededDragThreshold: false,
      lastTarget: target,
      pointerId: event.pointerId,
      releaseElement: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      widgetId: widget.id,
    };
    selectWidget(widget.id);
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function handleWidgetPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragMoveRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || widgetResizeDragRef.current !== null || workspaceResizeDragRef.current !== null) {
      return;
    }

    event.preventDefault();
    if (!dragState.hasExceededDragThreshold) {
      const pointerDistance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
      if (pointerDistance < WIDGET_DRAG_THRESHOLD_PX) {
        return;
      }
      dragState.hasExceededDragThreshold = true;
      const draggedWidget = visibleHudWidgets.find((widget) => widget.id === dragState.widgetId);
      if (draggedWidget) {
        setActiveDragGuide({
          heightPx: draggedWidget.heightPx,
          widthPx: draggedWidget.widthPx,
          x: draggedWidget.x,
          y: draggedWidget.y,
        });
      }
    }
    const target = getSortableTarget(dragState.widgetId, event.clientX, event.clientY);
    if (
      target === null
      || (
        target.laneIndex === dragState.lastTarget.laneIndex
        && target.laneY === dragState.lastTarget.laneY
        && target.slotIndex === dragState.lastTarget.slotIndex
      )
    ) {
      return;
    }

    dragState.lastTarget = target;
    reorderWidget(dragState.widgetId, target);
  }

  function handleWidgetPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragMoveRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    commitWidgetDrag(event.pointerId);
  }

  function handleResizePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = widgetResizeDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    resizeWidget(dragState.widgetId, dragState.startWidth + event.clientX - dragState.startX, dragState.startHeight + event.clientY - dragState.startY);
  }

  function handleResizePointerEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = widgetResizeDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    widgetResizeDragRef.current = null;
    setActiveDragGuide(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWorkspaceResizePointerDown(event: ReactPointerEvent<HTMLButtonElement>, axis: "both" | "height" | "width") {
    event.preventDefault();
    event.stopPropagation();
    clearWidgetDrag();
    workspaceResizeDragRef.current = {
      axis,
      pointerId: event.pointerId,
      releaseElement: event.currentTarget,
      startHeight: hudUiState.hudWorkspace.heightPx,
      startWidth: workspaceViewportWidth,
      startX: event.clientX,
      startY: event.clientY,
    };
    revealCustomScrollbar();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleWorkspaceResizePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const resizeState = workspaceResizeDragRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const nextWidth = resizeState.axis === "height"
      ? resizeState.startWidth
      : resizeState.startWidth + event.clientX - resizeState.startX;
    const nextHeight = resizeState.axis === "width"
      ? resizeState.startHeight
      : resizeState.startHeight + event.clientY - resizeState.startY;
    resizeWorkspace(nextWidth, nextHeight, resizeState.axis !== "height");
  }

  function handleWorkspaceResizePointerEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    const resizeState = workspaceResizeDragRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    clearWorkspaceResize(event.pointerId);
  }

  function resetHudLayout() {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Reset HUD Layout? This restores the default HUD layout, widget visibility, and sandbox size for snapshot ${hudUiState.activeSnapshotId} on your current account.`);
      if (!confirmed) {
        return;
      }
    }
    setHudUiState((current) => resetActiveHudSnapshot(current));
    setIsHiddenWidgetTrayOpen(false);
    flashSnapshotLabel(`Snapshot ${hudUiState.activeSnapshotId} reset`);
  }

  function handleCycleSnapshot() {
    if (snapshotIds.length <= 1) {
      flashSnapshotLabel(`Snapshot ${hudUiState.activeSnapshotId}`);
      return;
    }
    setHudUiState((current) => cycleHudSnapshot(current));
  }

  function handleSaveSnapshot() {
    setHudUiState((current) => saveActiveHudSnapshot(current));
    flashSnapshotLabel(`Snapshot ${hudUiState.activeSnapshotId} saved`);
  }

  function handleAddSnapshot() {
    if (!canAddSnapshot) {
      flashSnapshotLabel("Max 5 snapshots");
      return;
    }
    const nextSnapshotId = Math.max(0, ...snapshotIds) + 1;
    setHudUiState((current) => addHudSnapshot(current));
    flashSnapshotLabel(`Snapshot ${nextSnapshotId}`);
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
    const isDragging = isSelected && dragMoveRef.current?.widgetId === widget.id && dragMoveRef.current?.hasExceededDragThreshold === true && activeDragGuide !== null;
    const overflowClass = widget.type === "notification_inbox" ? "overflow-visible z-20" : "overflow-hidden";
    const tileStyle: CSSProperties = {
      height: widget.heightPx,
      left: clampPosition(widget.x),
      top: clampPosition(widget.y),
      width: widget.widthPx,
    };

    return (
      <div
        className={`absolute min-h-0 min-w-0 overflow-visible rounded-[1rem] text-left transition-[left,top,box-shadow,transform] duration-150 motion-reduce:transition-none ${isSelected ? "ring-2 ring-[#6f57f6]/75" : ""} ${hudUiState.isHudEditMode ? "touch-none cursor-grab select-none" : ""} ${isDragging ? "scale-[0.98] cursor-grabbing shadow-[0_16px_34px_rgba(81,61,168,0.18)]" : ""}`}
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
        onLostPointerCapture={() => clearWidgetDrag()}
        onPointerMove={handleWidgetPointerMove}
        onPointerUp={handleWidgetPointerEnd}
        role={hudUiState.isHudEditMode ? "button" : undefined}
        tabIndex={hudUiState.isHudEditMode ? 0 : undefined}
      >
        {isSelected ? (
          <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-[1rem]">
            <button
              aria-label={`Drag to resize ${HUD_WIDGET_LABELS[widget.type]}`}
              className="pointer-events-auto absolute bottom-1 right-1 flex h-5 w-5 cursor-se-resize items-center justify-center rounded-full border border-[#ddd6fb] bg-white/95 text-[#7a63f7] shadow-[0_8px_18px_rgba(81,61,168,0.1)] touch-none dark:border-white/10 dark:bg-[#171328] dark:text-[#cabfff]"
              onClick={(event) => event.stopPropagation()}
              onLostPointerCapture={() => {
                widgetResizeDragRef.current = null;
                setActiveDragGuide(null);
              }}
              onPointerCancel={handleResizePointerEnd}
              onPointerDown={(event) => handleResizePointerDown(event, widget)}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerEnd}
              type="button"
            >
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-br-[0.35rem] border-b-2 border-r-2 border-current" />
            </button>
          </div>
        ) : null}
        <div className={`h-full rounded-[1rem] border border-[#ece8f8] bg-[var(--hud-surface)] dark:border-white/10 ${hudUiState.isHudEditMode ? "px-[5px] py-[5px]" : "px-1.5 py-1.5"} ${overflowClass} ${hudUiState.isHudEditMode ? "pointer-events-none" : ""}`}>
          {renderWidget(widget.type)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1">
      <div>
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1" ref={workspaceAvailableRef}>
            <div
              className="relative min-w-0"
              ref={workspaceRegionRef}
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
              style={{
                maxWidth: "100%",
                width: workspaceViewportWidth,
              }}
            >
              <div
                className="adhdice-hud-workspace-scrollbar w-full min-w-0 overflow-auto rounded-[1.2rem] border border-[#ece8f8] bg-[var(--hud-surface)] dark:border-white/10"
                ref={workspaceScrollRef}
                style={{
                  height: hudUiState.hudWorkspace.heightPx,
                }}
              >
                <div
                  className="relative h-full w-full"
                  style={{
                    minHeight: workspaceContentHeight,
                    minWidth: workspaceContentWidth,
                  }}
                >
                  {hudUiState.isHudEditMode && activeDragGuide ? (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute rounded-[1rem] border-2 border-dashed border-[#6f57f6]/55 bg-[#6f57f6]/8 shadow-[0_0_0_4px_rgba(111,87,246,0.08)] transition-[left,top,width,height] duration-150 motion-reduce:transition-none dark:border-[#cabfff]/55 dark:bg-[#cabfff]/10"
                      style={{
                        height: activeDragGuide.heightPx,
                        left: activeDragGuide.x,
                        top: activeDragGuide.y,
                        width: activeDragGuide.widthPx,
                      }}
                    />
                  ) : null}
                  {visibleHudWidgets.map((widget) => renderWidgetTile(widget))}
                </div>
              </div>
              {hudUiState.isHudEditMode ? (
                <>
                  <button
                    aria-label="Resize HUD sandbox width"
                    className="absolute right-[-3px] top-4 z-30 h-[calc(100%-2rem)] w-2 cursor-ew-resize rounded-full border border-[#ddd6fb] bg-white/75 text-[#7a63f7] opacity-70 shadow-[0_8px_18px_rgba(81,61,168,0.1)] touch-none hover:opacity-100 dark:border-white/10 dark:bg-[#171328]/85 dark:text-[#cabfff]"
                    onClick={(event) => event.stopPropagation()}
                    onLostPointerCapture={() => clearWorkspaceResize()}
                    onPointerCancel={handleWorkspaceResizePointerEnd}
                    onPointerDown={(event) => handleWorkspaceResizePointerDown(event, "width")}
                    onPointerMove={handleWorkspaceResizePointerMove}
                    onPointerUp={handleWorkspaceResizePointerEnd}
                    type="button"
                  />
                  <button
                    aria-label="Resize HUD sandbox height"
                    className="absolute bottom-[-3px] left-4 z-30 h-2 w-[calc(100%-2rem)] cursor-ns-resize rounded-full border border-[#ddd6fb] bg-white/75 text-[#7a63f7] opacity-70 shadow-[0_8px_18px_rgba(81,61,168,0.1)] touch-none hover:opacity-100 dark:border-white/10 dark:bg-[#171328]/85 dark:text-[#cabfff]"
                    onClick={(event) => event.stopPropagation()}
                    onLostPointerCapture={() => clearWorkspaceResize()}
                    onPointerCancel={handleWorkspaceResizePointerEnd}
                    onPointerDown={(event) => handleWorkspaceResizePointerDown(event, "height")}
                    onPointerMove={handleWorkspaceResizePointerMove}
                    onPointerUp={handleWorkspaceResizePointerEnd}
                    type="button"
                  />
                  <button
                    aria-label="Resize HUD sandbox"
                    className="absolute bottom-[-5px] right-[-5px] z-40 flex h-5 w-5 cursor-se-resize items-center justify-center rounded-full border border-[#ddd6fb] bg-white/90 text-[#7a63f7] shadow-[0_8px_18px_rgba(81,61,168,0.1)] touch-none dark:border-white/10 dark:bg-[#171328] dark:text-[#cabfff]"
                    onClick={(event) => event.stopPropagation()}
                    onLostPointerCapture={() => clearWorkspaceResize()}
                    onPointerCancel={handleWorkspaceResizePointerEnd}
                    onPointerDown={(event) => handleWorkspaceResizePointerDown(event, "both")}
                    onPointerMove={handleWorkspaceResizePointerMove}
                    onPointerUp={handleWorkspaceResizePointerEnd}
                    type="button"
                  >
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-br-[0.35rem] border-b-2 border-r-2 border-current" />
                  </button>
                </>
              ) : null}
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
          </div>
          <div className="relative mt-1 flex shrink-0 flex-col items-center gap-2">
            <button
              aria-label={hudUiState.isHudEditMode ? "Finish editing HUD" : "Edit HUD"}
              aria-pressed={hudUiState.isHudEditMode}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${hudUiState.isHudEditMode ? "bg-[#6f57f6] text-white shadow-[0_10px_22px_rgba(111,87,246,0.18)] dark:bg-[#cabfff] dark:text-[#1a1431]" : "border border-white/70 bg-white/[0.62] text-[#6f57f6] hover:bg-white/[0.82] dark:border-white/10 dark:bg-white/[0.05] dark:text-[#cabfff]"}`}
              onClick={toggleEditMode}
              type="button"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
            <button
              aria-label={`Cycle HUD snapshot. Active snapshot ${hudUiState.activeSnapshotId}.`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/70 bg-white/[0.62] text-[12px] font-semibold text-[#6f57f6] shadow-[0_10px_22px_rgba(111,87,246,0.12)] transition hover:bg-white/[0.82] dark:border-white/10 dark:bg-white/[0.05] dark:text-[#cabfff]"
              onClick={handleCycleSnapshot}
              type="button"
            >
              {hudUiState.activeSnapshotId}
            </button>
            {snapshotFlashLabel ? (
              <div className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#2b2445] px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_10px_20px_rgba(22,18,37,0.22)] dark:bg-[#f4f0ff] dark:text-[#2b2445]">
                {snapshotFlashLabel}
              </div>
            ) : null}
          </div>
        </div>

        {hudUiState.isHudEditMode ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button className="ui-pill-button-strong-light" onClick={handleSaveSnapshot} type="button">
              Save Snapshot
            </button>
            <button
              className="ui-pill-button-light disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canAddSnapshot}
              onClick={handleAddSnapshot}
              type="button"
            >
              {canAddSnapshot ? "Add Snapshot" : "Max 5"}
            </button>
            <button className="ui-pill-button-danger-light" onClick={resetHudLayout} type="button">
              <RotateCcw className="mr-1 inline h-3.5 w-3.5" />
              Reset HUD Layout
            </button>
            <button
              className="ui-pill-button-danger-light disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!selectedWidget}
              onClick={() => {
                if (selectedWidget) {
                  removeWidget(selectedWidget.id);
                }
              }}
              type="button"
            >
              <Trash2 className="mr-1 inline h-3.5 w-3.5" />
              Hide selected
            </button>

            {selectedWidget ? (
              <>
                <span className="rounded-full bg-white/[0.62] px-3 py-1.5 text-xs font-semibold text-[#655f84] dark:bg-white/[0.04] dark:text-white/65">
                  {HUD_WIDGET_LABELS[selectedWidget.type]}
                </span>
                <span className="rounded-full bg-white/[0.62] px-3 py-1.5 text-xs font-semibold text-[#655f84] dark:bg-white/[0.04] dark:text-white/65">
                  Drag the selected widget directly. Resize from the inside corner handle.
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
              Sortable lanes
            </span>
            <span className="rounded-full bg-white/[0.62] px-3 py-1.5 text-xs font-semibold text-[#655f84] dark:bg-white/[0.04] dark:text-white/65">
              Snapshots {snapshotIds.join(", ")}
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
