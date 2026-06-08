"use client";

import { ChevronLeft, ChevronRight, GripVertical, MoveHorizontal, Plus, RotateCcw, Settings2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type PointerEvent as ReactPointerEvent, type ReactNode, type SetStateAction } from "react";
import {
  DEFAULT_HUD_UI_STATE,
  HUD_WIDGET_LABELS,
  HUD_WIDGET_TYPES,
  type HudPage,
  type HudUiState,
  type HudWidgetLayoutItem,
  type HudWidgetType,
} from "@/lib/task-hud-layout";

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

function clampWidgetDimension(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function defaultWidgetDimensions(widget: HudWidgetLayoutItem, isPrimary: boolean) {
  if (widget.type === "dark_mode") {
    return { height: 50, width: 50 };
  }

  if (widget.type === "calm") {
    return { height: 50, width: 96 };
  }

  const width = widget.size.startsWith("2") ? 260 : 132;
  const height = widget.size.endsWith("2") ? 108 : 50;
  return {
    height: isPrimary ? Math.max(52, height) : height,
    width: isPrimary ? Math.max(230, width) : width,
  };
}

function getWidgetDimensions(widget: HudWidgetLayoutItem, isPrimary: boolean) {
  const fallback = defaultWidgetDimensions(widget, isPrimary);
  return {
    height: clampWidgetDimension(widget.heightPx ?? fallback.height, FREEFORM_WIDGET_LIMITS.minHeight, FREEFORM_WIDGET_LIMITS.maxHeight),
    width: clampWidgetDimension(widget.widthPx ?? fallback.width, FREEFORM_WIDGET_LIMITS.minWidth, FREEFORM_WIDGET_LIMITS.maxWidth),
  };
}

function clonePages(pages: HudPage[]) {
  return pages.map((page) => ({
    ...page,
    widgets: page.widgets.map((widget) => ({ ...widget })),
  }));
}

export function HudCommandCenter({
  hudUiState,
  renderWidget,
  setHudUiState,
}: HudCommandCenterProps) {
  const touchStartXRef = useRef<number | null>(null);
  const draggedWidgetIdRef = useRef<string | null>(null);
  const resizeDragRef = useRef<{
    pointerId: number;
    startHeight: number;
    startWidth: number;
    startX: number;
    startY: number;
    widgetId: string;
  } | null>(null);
  const [isHiddenWidgetTrayOpen, setIsHiddenWidgetTrayOpen] = useState(false);

  const activePageIndex = Math.max(0, hudUiState.hudPages.findIndex((page) => page.id === hudUiState.activeHudPageId));
  const activePage = hudUiState.hudPages[activePageIndex] ?? hudUiState.hudPages[0];
  const selectedWidget = useMemo(
    () => hudUiState.hudPages.flatMap((page) => page.widgets).find((widget) => widget.id === hudUiState.selectedHudWidgetId) ?? null,
    [hudUiState.hudPages, hudUiState.selectedHudWidgetId],
  );
  const hiddenWidgetTypes = HUD_WIDGET_TYPES.filter((widgetType) =>
    !hudUiState.hudPages.some((page) => page.widgets.some((widget) => widget.type === widgetType)),
  );
  const hiddenWidgetCount = hiddenWidgetTypes.length;
  const visibleHudWidgets = activePage.widgets;

  function updateHudState(updater: (current: HudUiState) => HudUiState) {
    setHudUiState((current) => updater(current));
  }

  function setActivePage(pageId: HudPage["id"]) {
    updateHudState((current) => ({ ...current, activeHudPageId: pageId, selectedHudWidgetId: null }));
  }

  function setActivePageByIndex(index: number) {
    const nextPage = hudUiState.hudPages[(index + hudUiState.hudPages.length) % hudUiState.hudPages.length];
    if (nextPage) {
      setActivePage(nextPage.id);
    }
  }

  function updatePagesWidgets(pageId: HudPage["id"], updater: (widgets: HudWidgetLayoutItem[]) => HudWidgetLayoutItem[]) {
    updateHudState((current) => ({
      ...current,
      hudPages: clonePages(current.hudPages).map((page) => (
        page.id === pageId ? { ...page, widgets: updater(page.widgets) } : page
      )),
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
      hudPages: clonePages(current.hudPages).map((page) => ({
        ...page,
        widgets: page.widgets.filter((widget) => widget.id !== widgetId),
      })),
      selectedHudWidgetId: current.selectedHudWidgetId === widgetId ? null : current.selectedHudWidgetId,
    }));
  }

  function addWidget(widgetType: HudWidgetType) {
    updatePagesWidgets(activePage.id, (widgets) => [
      ...widgets,
      {
        id: `hud-${widgetType}`,
        size: widgetType === "focus_timer" ? "2x2" : widgetType === "xp" || widgetType === "task_counts" || widgetType === "focus_alarm" ? "2x1" : "1x1",
        type: widgetType,
      },
    ]);
    selectWidget(`hud-${widgetType}`);
    setIsHiddenWidgetTrayOpen(false);
  }

  function resizeWidget(widgetId: string, widthPx: number, heightPx: number) {
    updateHudState((current) => ({
      ...current,
      hudPages: clonePages(current.hudPages).map((page) => ({
        ...page,
        widgets: page.widgets.map((widget) => widget.id === widgetId ? {
          ...widget,
          heightPx: clampWidgetDimension(heightPx, FREEFORM_WIDGET_LIMITS.minHeight, FREEFORM_WIDGET_LIMITS.maxHeight),
          widthPx: clampWidgetDimension(widthPx, FREEFORM_WIDGET_LIMITS.minWidth, FREEFORM_WIDGET_LIMITS.maxWidth),
        } : widget),
      })),
    }));
  }

  function handleResizePointerDown(event: ReactPointerEvent<HTMLButtonElement>, widget: HudWidgetLayoutItem, isPrimary: boolean) {
    event.preventDefault();
    event.stopPropagation();
    const { height, width } = getWidgetDimensions(widget, isPrimary);
    resizeDragRef.current = {
      pointerId: event.pointerId,
      startHeight: height,
      startWidth: width,
      startX: event.clientX,
      startY: event.clientY,
      widgetId: widget.id,
    };
    draggedWidgetIdRef.current = null;
    selectWidget(widget.id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResizePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = resizeDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    resizeWidget(
      dragState.widgetId,
      dragState.startWidth + event.clientX - dragState.startX,
      dragState.startHeight + event.clientY - dragState.startY,
    );
  }

  function handleResizePointerEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = resizeDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    resizeDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function moveSelectedWidgetToOtherPage() {
    if (!selectedWidget) return;
    const currentPageId = hudUiState.hudPages.find((page) => page.widgets.some((widget) => widget.id === selectedWidget.id))?.id;
    if (!currentPageId) return;
    const targetPageId: HudPage["id"] = currentPageId === "overview" ? "command" : "overview";
    updateHudState((current) => {
      const nextPages = clonePages(current.hudPages);
      const sourcePage = nextPages.find((page) => page.id === currentPageId);
      const targetPage = nextPages.find((page) => page.id === targetPageId);
      if (!sourcePage || !targetPage) {
        return current;
      }
      sourcePage.widgets = sourcePage.widgets.filter((widget) => widget.id !== selectedWidget.id);
      targetPage.widgets = [...targetPage.widgets, selectedWidget];
      return {
        ...current,
        activeHudPageId: targetPageId,
        hudPages: nextPages,
      };
    });
  }

  function reorderWithinPage(targetWidgetId: string) {
    const sourceWidgetId = draggedWidgetIdRef.current;
    if (!sourceWidgetId || sourceWidgetId === targetWidgetId) {
      return;
    }
    updatePagesWidgets(activePage.id, (widgets) => {
      const sourceIndex = widgets.findIndex((widget) => widget.id === sourceWidgetId);
      const targetIndex = widgets.findIndex((widget) => widget.id === targetWidgetId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return widgets;
      }
      const next = [...widgets];
      const [source] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, source);
      return next;
    });
  }

  function resetHudLayout() {
    setHudUiState(DEFAULT_HUD_UI_STATE);
    setIsHiddenWidgetTrayOpen(false);
  }

  function handleTouchStart(clientX: number) {
    touchStartXRef.current = clientX;
  }

  function handleTouchEnd(clientX: number) {
    if (touchStartXRef.current === null) {
      return;
    }
    const delta = clientX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(delta) < 48) {
      return;
    }
    setActivePageByIndex(activePageIndex + (delta < 0 ? 1 : -1));
  }

  function renderWidgetTile(widget: HudWidgetLayoutItem, isPrimary = false) {
    const isSelected = hudUiState.isHudEditMode && selectedWidget?.id === widget.id;
    const tilePaddingClass = isPrimary ? "px-3 py-2" : "px-2.5 py-2";
    const overflowClass = widget.type === "notification_inbox" ? "overflow-visible z-20" : "overflow-hidden";
    const dimensions = getWidgetDimensions(widget, isPrimary);
    const tileStyle: CSSProperties = {
      flex: `0 0 ${dimensions.width}px`,
      height: dimensions.height,
      maxWidth: "100%",
      width: dimensions.width,
    };

    return (
      <div
        className={`relative min-h-0 min-w-0 rounded-[1rem] border border-white/35 bg-transparent text-left backdrop-blur-[10px] dark:border-white/10 dark:bg-transparent ${overflowClass} ${tilePaddingClass} ${isSelected ? "ring-2 ring-[#6f57f6]" : ""}`}
        draggable={hudUiState.isHudEditMode && resizeDragRef.current === null}
        key={widget.id}
        style={tileStyle}
        onClick={() => {
          if (hudUiState.isHudEditMode) {
            selectWidget(widget.id);
          }
        }}
        onDragEnd={() => {
          draggedWidgetIdRef.current = null;
        }}
        onDragOver={(event) => {
          if (hudUiState.isHudEditMode) {
            event.preventDefault();
          }
        }}
        onDragStart={() => {
          draggedWidgetIdRef.current = widget.id;
        }}
        onDrop={(event) => {
          if (!hudUiState.isHudEditMode) {
            return;
          }
          event.preventDefault();
          reorderWithinPage(widget.id);
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
              type="button"
            >
              <Trash2 className="h-3 w-3" />
            </button>
            <button
              aria-label={`Drag to resize ${HUD_WIDGET_LABELS[widget.type]}`}
              className="absolute bottom-1 right-1 z-10 flex h-5 w-5 cursor-se-resize items-center justify-center rounded-full border border-[#ddd6fb] bg-white/90 text-[#7a63f7] shadow-[0_8px_18px_rgba(81,61,168,0.1)] touch-none dark:border-white/10 dark:bg-[#171328] dark:text-[#cabfff]"
              onClick={(event) => event.stopPropagation()}
              onPointerCancel={handleResizePointerEnd}
              onPointerDown={(event) => handleResizePointerDown(event, widget, isPrimary)}
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
      <div
        onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
        onTouchStart={(event) => handleTouchStart(event.touches[0]?.clientX ?? 0)}
      >
        <div className="flex flex-wrap items-center gap-2">
          {visibleHudWidgets.map((widget) => renderWidgetTile(widget))}

          <div className="flex h-[50px] shrink-0 items-center gap-1">
            <button
              aria-label="Previous HUD page"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/[0.62] text-[#6f57f6] transition hover:bg-white/[0.82] dark:border-white/10 dark:bg-white/[0.06] dark:text-[#cabfff]"
              onClick={() => setActivePageByIndex(activePageIndex - 1)}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              aria-label={hudUiState.isHudEditMode ? "Finish editing HUD" : "Edit HUD"}
              aria-pressed={hudUiState.isHudEditMode}
              className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold transition ${hudUiState.isHudEditMode ? "bg-[#6f57f6] text-white shadow-[0_10px_22px_rgba(111,87,246,0.18)] dark:bg-[#cabfff] dark:text-[#1a1431]" : "border border-white/70 bg-white/[0.62] text-[#6f57f6] hover:bg-white/[0.82] dark:border-white/10 dark:bg-white/[0.05] dark:text-[#cabfff]"}`}
              onClick={toggleEditMode}
              type="button"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
            <button
              aria-label="Next HUD page"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/[0.62] text-[#6f57f6] transition hover:bg-white/[0.82] dark:border-white/10 dark:bg-white/[0.06] dark:text-[#cabfff]"
              onClick={() => setActivePageByIndex(activePageIndex + 1)}
              type="button"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <span className="sr-only" aria-live="polite">{activePage.title}</span>
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
                  Drag the corner to resize.
                </span>
                <button className="ui-pill-button-light" onClick={moveSelectedWidgetToOtherPage} type="button">
                  <MoveHorizontal className="mr-1 inline h-3.5 w-3.5" />
                  Move to {activePage.id === "overview" ? "Command" : "Overview"}
                </button>
              </>
            ) : (
              <span className="rounded-full bg-white/[0.62] px-3 py-1.5 text-xs font-semibold text-[#655f84] dark:bg-white/[0.04] dark:text-white/65">
                Select a widget to resize or move it.
              </span>
            )}

            <button className="ui-pill-button-strong-light" onClick={() => setIsHiddenWidgetTrayOpen((current) => !current)} type="button">
              <Plus className="mr-1 inline h-3.5 w-3.5" />
              {isHiddenWidgetTrayOpen ? "Hide" : hiddenWidgetCount > 0 ? `Add (${hiddenWidgetCount})` : "All shown"}
            </button>
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
