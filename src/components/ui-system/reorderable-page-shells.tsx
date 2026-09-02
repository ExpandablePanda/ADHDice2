"use client";

import { Check, CornerDownRight, GripVertical, PanelsTopLeft, RotateCcw } from "lucide-react";
import { Children, isValidElement, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactElement, type ReactNode } from "react";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdIconButton } from "@/components/ui-system/adhd-icon-button";
import type { PageShellLayoutState } from "@/hooks/usePageShellLayout";
import {
  getPageShellInsertionIndex,
  mergeVisiblePageShellOrder,
  normalizePageShellSpan,
  PAGE_SHELL_ROW_ALIGNMENT_PX,
  reorderPageShellOrderAt,
  snapPageShellHeight,
  type PageShellGeometry,
  type PageShellLayoutPreference,
  type PageShellSize,
} from "@/lib/page-shell-layout";

export type PageShellProps = {
  className?: string;
  id: string;
  label: string;
  children: ReactNode;
};

type ReorderablePageShellsProps = {
  children: ReactNode;
  layout: PageShellLayoutState;
  shellsClassName?: string;
};

type ShellMoveInteraction = {
  geometries: PageShellGeometry[];
  id: string;
  kind: "move";
  pointerId: number;
  startVisibleOrder: string[];
  startLayout: PageShellLayoutPreference;
  targetIndex: number;
};

type ShellResizeInteraction = {
  columnWidth: number;
  id: string;
  initialSize: PageShellSize;
  kind: "resize";
  naturalHeight: number;
  pointerId: number;
  startLayout: PageShellLayoutPreference;
  startX: number;
  startY: number;
};

type ShellInteraction = ShellMoveInteraction | ShellResizeInteraction;
type PageShellInsertionIndicatorStyle = {
  height: number;
  left: number;
  top: number;
  width: number;
};

const SHELL_SPAN_CLASSES: Record<number, string> = {
  6: "xl:col-span-6",
  7: "xl:col-span-7",
  8: "xl:col-span-8",
  9: "xl:col-span-9",
  10: "xl:col-span-10",
  11: "xl:col-span-11",
  12: "xl:col-span-12",
};
function layoutsHaveSameOrder(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function measureNaturalShellHeight(element: HTMLDivElement | null) {
  if (!element) return 0;
  const currentHeight = element.style.height;
  const currentMinHeight = element.style.minHeight;
  const currentOverflowY = element.style.overflowY;
  element.style.height = "";
  element.style.minHeight = "0px";
  element.style.overflowY = "visible";
  const naturalHeight = element.getBoundingClientRect().height;
  element.style.height = currentHeight;
  element.style.minHeight = currentMinHeight;
  element.style.overflowY = currentOverflowY;
  return naturalHeight;
}

function geometriesShareRow(left: PageShellGeometry, right: PageShellGeometry) {
  const overlap = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  const minimumHeight = Math.min(left.bottom - left.top, right.bottom - right.top);
  return Math.abs(left.top - right.top) <= PAGE_SHELL_ROW_ALIGNMENT_PX || (minimumHeight > 0 && overlap / minimumHeight >= 0.5);
}

function getInsertionIndicatorStyle(
  interaction: ShellMoveInteraction,
  insertionIndex: number,
  container: HTMLDivElement | null,
) {
  const containerRect = container?.getBoundingClientRect();
  const fallbackWidth = containerRect?.width ?? 0;
  const geometryById = new Map(interaction.geometries.map((geometry) => [geometry.id, geometry]));
  const orderWithoutSource = interaction.startVisibleOrder.filter((id) => id !== interaction.id);
  const before = insertionIndex > 0 ? geometryById.get(orderWithoutSource[insertionIndex - 1]) : undefined;
  const after = insertionIndex < orderWithoutSource.length ? geometryById.get(orderWithoutSource[insertionIndex]) : undefined;
  const leftOffset = containerRect?.left ?? 0;
  const topOffset = containerRect?.top ?? 0;

  if (before && after && geometriesShareRow(before, after)) {
    return {
      height: Math.max(before.bottom, after.bottom) - Math.min(before.top, after.top),
      left: (after.left - leftOffset) - 2,
      top: Math.min(before.top, after.top) - topOffset,
      width: 4,
    };
  }
  const top = after?.top ?? before?.bottom ?? topOffset;
  return {
    height: 4,
    left: 0,
    top: top - topOffset - 2,
    width: fallbackWidth,
  };
}

export function PageShell({ children }: PageShellProps) {
  return <>{children}</>;
}

export function PageShellLayoutControls({ layout }: { layout: PageShellLayoutState }) {
  if (!layout.canEdit) return null;
  if (layout.isEditing) {
    return (
      <>
        <AdhdChip aria-label="Reset Layout" icon={<RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />} onClick={layout.reset} title="Reset Layout" type="button">
          Reset Layout
        </AdhdChip>
        <AdhdChip aria-label="Done" icon={<Check aria-hidden="true" className="h-3.5 w-3.5" />} onClick={layout.finishEditing} tone="purple" title="Done" type="button">
          Done
        </AdhdChip>
      </>
    );
  }
  return (
    <AdhdIconButton aria-label="Edit page layout" onClick={layout.startEditing} size="sm" title="Edit layout" tone="ghost" variant="rowToolbar">
      <PanelsTopLeft aria-hidden="true" />
    </AdhdIconButton>
  );
}

export function ReorderablePageShells({ children, layout, shellsClassName = "grid gap-3 xl:grid-cols-12" }: ReorderablePageShellsProps) {
  const shellElements = useMemo(
    () => Children.toArray(children).filter((child): child is ReactElement<PageShellProps> => isValidElement(child)),
    [children],
  );
  const shells = useMemo(
    () => shellElements.map((element) => ({ className: element.props.className, id: element.props.id, label: element.props.label, node: element.props.children })),
    [shellElements],
  );
  const shellsById = useMemo(() => new Map(shells.map((shell) => [shell.id, shell])), [shells]);
  const visibleShellIds = useMemo(() => shells.map((shell) => shell.id), [shells]);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const shellRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const shellContentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const interactionRef = useRef<ShellInteraction | null>(null);
  const [dragStartVisibleOrder, setDragStartVisibleOrder] = useState<string[] | null>(null);
  const [dragIndicatorStyle, setDragIndicatorStyle] = useState<PageShellInsertionIndicatorStyle | null>(null);
  const renderedShellOrder = dragStartVisibleOrder ?? layout.order;
  const orderedShells = renderedShellOrder.flatMap((id) => {
    const shell = shellsById.get(id);
    return shell ? [shell] : [];
  });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragInsertionIndex, setDragInsertionIndex] = useState<number | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);

  useEffect(() => {
    if (layout.isEditing || !interactionRef.current) return;
    interactionRef.current = null;
    setDraggingId(null);
    setDragStartVisibleOrder(null);
    setDragInsertionIndex(null);
    setDragIndicatorStyle(null);
    setResizingId(null);
  }, [layout.isEditing]);

  function currentLayout(): PageShellLayoutPreference {
    return {
      order: [...layout.order],
      sizes: Object.fromEntries(Object.entries(layout.sizes).map(([id, size]) => [id, { ...size }])),
    };
  }

  function captureShellGeometry() {
    return orderedShells.flatMap((shell) => {
      const element = shellRefs.current[shell.id];
      if (!element) return [];
      const rect = element.getBoundingClientRect();
      return [{ bottom: rect.bottom, id: shell.id, left: rect.left, right: rect.right, top: rect.top }];
    });
  }

  function beginMove(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (!layout.isEditing) return;
    event.preventDefault();
    event.stopPropagation();
    const startLayout = currentLayout();
    const startVisibleOrder = orderedShells.map((shell) => shell.id);
    const moveInteraction: ShellMoveInteraction = {
      geometries: captureShellGeometry(),
      id,
      kind: "move",
      pointerId: event.pointerId,
      startVisibleOrder,
      startLayout,
      targetIndex: Math.max(0, startVisibleOrder.indexOf(id)),
    };
    interactionRef.current = moveInteraction;
    layout.beginPreview(startLayout);
    setDraggingId(id);
    setDragStartVisibleOrder(startVisibleOrder);
    setDragInsertionIndex(Math.max(0, startVisibleOrder.indexOf(id)));
    setDragIndicatorStyle(getInsertionIndicatorStyle(moveInteraction, moveInteraction.targetIndex, layoutRef.current));
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function beginResize(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (!layout.isEditing) return;
    event.preventDefault();
    event.stopPropagation();
    const startLayout = currentLayout();
    const shellContent = shellContentRefs.current[id];
    const layoutElement = layoutRef.current;
    const naturalHeight = measureNaturalShellHeight(shellContent);
    const layoutWidth = layoutElement?.getBoundingClientRect().width ?? shellContent?.getBoundingClientRect().width ?? 0;
    const initialSize = startLayout.sizes[id] ?? { heightPx: null, span: 12 };
    interactionRef.current = {
      columnWidth: layoutWidth > 0 ? layoutWidth / 12 : Math.max(shellContent?.getBoundingClientRect().width ?? 1, 1),
      id,
      initialSize,
      kind: "resize",
      naturalHeight,
      pointerId: event.pointerId,
      startLayout,
      startX: event.clientX,
      startY: event.clientY,
    };
    layout.beginPreview(startLayout);
    setResizingId(id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateInteraction(event: PointerEvent<HTMLButtonElement>) {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (interaction.kind === "move") {
      const insertionIndex = getPageShellInsertionIndex(
        interaction.geometries,
        interaction.startVisibleOrder,
        interaction.id,
        event.clientX,
        event.clientY,
        interaction.targetIndex,
      );
      interaction.targetIndex = insertionIndex;
      setDragInsertionIndex(insertionIndex);
      setDragIndicatorStyle(getInsertionIndicatorStyle(interaction, insertionIndex, layoutRef.current));
      const nextVisibleOrder = reorderPageShellOrderAt(interaction.startVisibleOrder, interaction.id, insertionIndex);
      const nextOrder = mergeVisiblePageShellOrder(interaction.startLayout.order, nextVisibleOrder, visibleShellIds);
      if (!layoutsHaveSameOrder(nextOrder, layout.order)) layout.setPreviewOrder(nextOrder);
      return;
    }

    const deltaColumns = interaction.columnWidth > 0 ? Math.round((event.clientX - interaction.startX) / interaction.columnWidth) : 0;
    const span = normalizePageShellSpan(interaction.initialSize.span + deltaColumns, interaction.initialSize.span);
    const initialHeight = interaction.initialSize.heightPx ?? interaction.naturalHeight;
    const heightPx = snapPageShellHeight(initialHeight + (event.clientY - interaction.startY), interaction.naturalHeight);
    const currentSize = layout.sizes[interaction.id];
    if (currentSize?.span === span && currentSize.heightPx === heightPx) return;
    layout.setPreviewSizes((sizes) => ({
      ...sizes,
      [interaction.id]: { heightPx, span },
    }));
  }

  function endInteraction(event: PointerEvent<HTMLButtonElement>, cancelled: boolean) {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    interactionRef.current = null;
    if (cancelled) layout.cancelPreview();
    else layout.commitPreview();
    setDraggingId(null);
    setDragStartVisibleOrder(null);
    setDragInsertionIndex(null);
    setDragIndicatorStyle(null);
    setResizingId(null);
  }

  return (
    <div className={`${shellsClassName} relative`} data-page-shell-layout={layout.pageKey} data-page-shell-edit-mode={layout.isEditing ? "true" : "false"} ref={layoutRef}>
      {orderedShells.map((shell) => {
        const size = layout.sizes[shell.id] ?? { heightPx: null, span: 12 as const };
        const spanClass = SHELL_SPAN_CLASSES[size.span] ?? SHELL_SPAN_CLASSES[12];
        const hasCustomHeight = size.heightPx !== null;
        return (
          <div
            className={`min-w-0 transition-transform ${spanClass} ${layout.isEditing ? "relative" : ""} ${draggingId === shell.id ? "z-10 opacity-75" : ""} ${resizingId === shell.id ? "z-10" : ""} ${shell.className ?? ""}`}
            data-page-shell-id={shell.id}
            data-page-shell-dragging={draggingId === shell.id ? "true" : "false"}
            data-page-shell-resizing={resizingId === shell.id ? "true" : "false"}
            data-page-shell-size-span={size.span}
            key={shell.id}
            ref={(element) => { shellRefs.current[shell.id] = element; }}
          >
            {layout.isEditing ? (
              <div className="mb-1 flex min-h-7 items-center gap-1.5 rounded-lg border border-[#e4def8] bg-[#faf8ff]/90 px-1.5 py-1 text-xs text-[#6f57f6] dark:border-white/10 dark:bg-[#211a38]/90 dark:text-[#cabfff]" data-page-shell-layout-strip>
                <button
                  aria-label={`Move ${shell.label}`}
                  className="flex h-6 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md hover:bg-[#eee9ff] active:cursor-grabbing dark:hover:bg-white/10"
                  onPointerCancel={(event) => endInteraction(event, true)}
                  onPointerDown={(event) => beginMove(event, shell.id)}
                  onPointerMove={updateInteraction}
                  onPointerUp={(event) => endInteraction(event, false)}
                  title={`Move ${shell.label}`}
                  type="button"
                >
                  <GripVertical aria-hidden="true" className="h-4 w-4" />
                </button>
                <span className="min-w-0 flex-1 truncate font-semibold">{shell.label}</span>
                <span className="shrink-0 text-[10px] font-medium text-[#9188b8] dark:text-white/45">{size.span}/12</span>
              </div>
            ) : null}
            <div
              className={`relative min-w-0 ${hasCustomHeight ? "adhdice-scrollbar page-shell-custom-height overflow-y-auto overscroll-contain" : ""}`}
              data-page-shell-height={size.heightPx ?? "natural"}
              ref={(element) => { shellContentRefs.current[shell.id] = element; }}
              style={hasCustomHeight ? { height: `${size.heightPx}px` } : undefined}
            >
              {shell.node}
              {layout.isEditing ? (
                <button
                  aria-label={`Resize ${shell.label}`}
                  className="absolute bottom-1 right-1 z-20 flex h-6 w-6 cursor-se-resize touch-none items-center justify-center rounded-md border border-[#d8d0f5] bg-[#faf8ff]/95 text-[#6f57f6] shadow-sm hover:bg-[#eee9ff] dark:border-white/15 dark:bg-[#211a38]/95 dark:text-[#cabfff] dark:hover:bg-white/10"
                  onPointerCancel={(event) => endInteraction(event, true)}
                  onPointerDown={(event) => beginResize(event, shell.id)}
                  onPointerMove={updateInteraction}
                  onPointerUp={(event) => endInteraction(event, false)}
                  title={`Resize ${shell.label}`}
                  type="button"
                >
                  <CornerDownRight aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
      {draggingId && dragInsertionIndex !== null && dragIndicatorStyle ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-30 rounded-full bg-[#6f57f6]/75 shadow-[0_0_0_3px_rgba(111,87,246,0.12)]"
          data-page-shell-insertion-indicator
          style={dragIndicatorStyle}
        />
      ) : null}
    </div>
  );
}
