"use client";

import { ArrowDown, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUp, ArrowUpToLine, Check, ChevronDown, CornerDownRight, Download, GripVertical, MoveHorizontal, PanelsTopLeft, RotateCcw, Save } from "lucide-react";
import { Children, isValidElement, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent, type HTMLAttributes, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactElement, type ReactNode, type Ref } from "react";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdDropdownPanel } from "@/components/ui-system/adhd-dropdown-panel";
import { AdhdIconButton } from "@/components/ui-system/adhd-icon-button";
import { TASK_TABLE_INPUT_CLASS } from "@/components/ui/task-table-primitives";
import type { PageShellLayoutState } from "@/hooks/usePageShellLayout";
import {
  getPageShellDirectionalInsertionIndex,
  getPageShellDropTarget,
  getPageShellDragAutoScrollDelta,
  clampPageShellHeight,
  formatPageShellDimensions,
  getPageShellExportFilename,
  getPageShellShrinkHeight,
  mergeVisiblePageShellOrder,
  normalizePageShellSpan,
  placePageShellAtDrop,
  packPageShellLayout,
  PAGE_SHELL_MIN_HEIGHT,
  PAGE_SHELL_ROW_ALIGNMENT_PX,
  reorderPageShellOrderAt,
  type PageShellPackedPosition,
  type PageShellGeometry,
  type PageShellCanonicalGroup,
  type PageShellLayoutPreference,
  type PageShellDropTarget,
  type PageShellSize,
} from "@/lib/page-shell-layout";
import { useNativeIosPlatform } from "@/lib/platform";

export type PageShellProps = {
  className?: string;
  hiddenDescription?: string;
  id: string;
  label: string;
  visible?: boolean;
  children: ReactNode;
};

type ReorderablePageShellsProps = {
  children: ReactNode;
  layout: PageShellLayoutState;
  shellsClassName?: string;
};

type ShellMoveInteraction = {
  captureElement: HTMLButtonElement | null;
  geometries: PageShellGeometry[];
  id: string;
  kind: "move";
  packedPositions: Record<string, PageShellPackedPosition>;
  pointerId: number;
  pointerType: string;
  pointerX: number;
  pointerY: number;
  startVisibleOrder: string[];
  startLayout: PageShellLayoutPreference;
  target?: PageShellDropTarget;
  targetIndex: number;
};

type ShellResizeInteraction = {
  captureElement: HTMLButtonElement | null;
  columnWidth: number;
  id: string;
  initialSize: PageShellSize;
  initialHeight: number;
  kind: "resize" | "width-resize";
  naturalHeight: number;
  pointerId: number;
  pointerType: string;
  startLayout: PageShellLayoutPreference;
  startX: number;
  startY: number;
};

type ShellInteraction = ShellMoveInteraction | ShellResizeInteraction;
type ShellPointerEvent = {
  buttons?: number;
  clientX: number;
  clientY: number;
  pointerId: number;
  pointerType: string;
  preventDefault: () => void;
  stopPropagation: () => void;
};
type PageShellInsertionIndicatorStyle = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type RenderedPageShell = {
  className?: string;
  hiddenDescription?: string;
  id: string;
  label: string;
  node: ReactNode;
  visible: boolean;
};

type RenderedPageShellGroup = {
  className?: string;
  shells: RenderedPageShell[];
};

const SHELL_SPAN_CLASSES: Record<number, string> = {
  3: "xl:col-span-3",
  4: "xl:col-span-4",
  5: "xl:col-span-5",
  6: "xl:col-span-6",
  7: "xl:col-span-7",
  8: "xl:col-span-8",
  9: "xl:col-span-9",
  10: "xl:col-span-10",
  11: "xl:col-span-11",
  12: "xl:col-span-12",
};
const DEFAULT_HIDDEN_SHELL_DESCRIPTION = "Hidden until available";
function layoutsHaveSameOrder(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function isPageShellPointerMatch(activePointerId: number, pointerId: number) {
  return activePointerId === pointerId;
}

export function isStalePageShellMouseMove(pointerType: string, buttons: number | undefined) {
  return pointerType === "mouse" && buttons === 0;
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
  dropTarget?: PageShellDropTarget,
) {
  const containerRect = container?.getBoundingClientRect();
  const scrollTop = getPageScrollTop();
  const fallbackWidth = containerRect?.width ?? 0;
  const geometryById = new Map(interaction.geometries.map((geometry) => [geometry.id, geometry]));
  const orderWithoutSource = interaction.startVisibleOrder.filter((id) => id !== interaction.id);
  const before = insertionIndex > 0 ? geometryById.get(orderWithoutSource[insertionIndex - 1]) : undefined;
  const after = insertionIndex < orderWithoutSource.length ? geometryById.get(orderWithoutSource[insertionIndex]) : undefined;
  const leftOffset = containerRect?.left ?? 0;
  const topOffset = (containerRect?.top ?? 0) + scrollTop;

  if (dropTarget?.targetId) {
    const targetGeometry = geometryById.get(dropTarget.targetId);
    if (targetGeometry) {
      const targetColumnShells = interaction.geometries
        .filter((geometry) => geometry.id !== interaction.id && interaction.packedPositions[geometry.id]?.columnStart === dropTarget.columnStart)
        .sort((left, right) => left.top - right.top);
      const targetLane = targetColumnShells.findIndex((geometry) => geometry.id === dropTarget.targetId);
      const insertAfter = dropTarget.laneOrder > targetLane;
      return {
        height: 4,
        left: targetGeometry.left - leftOffset,
        top: (insertAfter ? targetGeometry.bottom : targetGeometry.top) - topOffset - 2,
        width: Math.max(4, targetGeometry.right - targetGeometry.left),
      };
    }
  }

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

function getPageScrollTop() {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  return Math.max(window.scrollY, document.scrollingElement?.scrollTop ?? 0);
}

function setPointerCaptureSafely(element: HTMLButtonElement, pointerId: number) {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Pointer capture is an enhancement; window listeners own lifecycle safety.
  }
}

function releasePointerCaptureSafely(interaction: ShellInteraction) {
  try {
    if (interaction.captureElement?.isConnected && interaction.captureElement.hasPointerCapture(interaction.pointerId)) {
      interaction.captureElement.releasePointerCapture(interaction.pointerId);
    }
  } catch {
    // The originating control may have been removed during packed reflow.
  }
}

export function PageShell({ children }: PageShellProps) {
  return <>{children}</>;
}

export function PageShellSurface({ children, className, ref, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode; ref?: Ref<HTMLDivElement> }) {
  return (
    <div className={`page-shell-surface flex h-full min-h-0 min-w-0 flex-col overflow-hidden ${className ?? ""}`} ref={ref} {...props}>
      {children}
    </div>
  );
}

export function PageShellBody({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={`page-shell-body adhdice-scrollbar min-w-0 ${className ?? ""}`} {...props}>
      {children}
    </div>
  );
}

export function PageShellLayoutControls({ layout }: { layout: PageShellLayoutState }) {
  const isNativeIosPlatform = useNativeIosPlatform();
  const [isSaveViewOpen, setIsSaveViewOpen] = useState(false);
  const [isViewsOpen, setIsViewsOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [viewTarget, setViewTarget] = useState<"web" | "iphone">("web");

  if (!layout.canEdit) return null;
  if (layout.isEditing) {
    function toggleSaveView() {
      setIsViewsOpen(false);
      setViewTarget(isNativeIosPlatform ? "iphone" : "web");
      setIsSaveViewOpen((current) => !current);
    }

    function handleSaveView(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (!layout.saveView(viewName, viewTarget)) return;
      setViewName("");
      setIsSaveViewOpen(false);
    }

    function handleExportLayouts() {
      if (typeof document === "undefined" || typeof URL === "undefined") return;
      const content = JSON.stringify(layout.exportLayouts(), null, 2);
      const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = getPageShellExportFilename();
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    }

    function handleFinishEditing() {
      setIsSaveViewOpen(false);
      setIsViewsOpen(false);
      layout.finishEditing();
    }

    return (
      <>
        <div className="relative inline-flex">
          <AdhdChip aria-expanded={isSaveViewOpen} aria-haspopup="dialog" icon={<Save aria-hidden="true" className="h-3.5 w-3.5" />} onClick={toggleSaveView} title="Save View" type="button">
            Save View
          </AdhdChip>
          {isSaveViewOpen ? (
            <AdhdDropdownPanel aria-label="Save page layout view" className="grid w-64 gap-3" role="dialog">
              <form className="grid gap-3" onSubmit={handleSaveView}>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8d87a7] dark:text-white/45">View name</span>
                  <input aria-label="View name" autoFocus className={`${TASK_TABLE_INPUT_CLASS} h-8 px-2.5 py-1 text-xs`} onChange={(event) => setViewName(event.target.value)} placeholder="Desktop Food" type="text" value={viewName} />
                </label>
                <div className="grid gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8d87a7] dark:text-white/45">Target</span>
                  <div className="flex flex-wrap gap-1.5">
                    <AdhdChip onClick={() => setViewTarget("web")} selected={viewTarget === "web"} type="button">Web</AdhdChip>
                    <AdhdChip onClick={() => setViewTarget("iphone")} selected={viewTarget === "iphone"} type="button">iPhone</AdhdChip>
                  </div>
                </div>
                <AdhdChip disabled={!viewName.trim()} icon={<Save aria-hidden="true" className="h-3.5 w-3.5" />} tone="purple" type="submit">Save</AdhdChip>
              </form>
              <AdhdChip aria-label="Export Layouts" icon={<Download aria-hidden="true" className="h-3.5 w-3.5" />} onClick={handleExportLayouts} title="Export Layouts" type="button">Export Layouts</AdhdChip>
            </AdhdDropdownPanel>
          ) : null}
        </div>
        {layout.views.length > 0 ? (
          <div className="relative inline-flex">
            <AdhdChip aria-expanded={isViewsOpen} aria-haspopup="menu" icon={<ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => { setIsSaveViewOpen(false); setIsViewsOpen((current) => !current); }} title="Saved Views" type="button">
              Views
            </AdhdChip>
            {isViewsOpen ? (
              <AdhdDropdownPanel aria-label="Saved page layout views" className="grid min-w-72 gap-2" role="menu">
                <AdhdChip aria-label="Export Layouts" icon={<Download aria-hidden="true" className="h-3.5 w-3.5" />} onClick={handleExportLayouts} title="Export Layouts" type="button">Export Layouts</AdhdChip>
                {layout.views.map((view) => (
                  <div className="grid gap-2 rounded-xl border border-[#eee9f8] bg-[#fcfbff] p-2 dark:border-white/10 dark:bg-white/[0.03]" key={view.id}>
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-xs font-semibold text-[#40385f] dark:text-white/80">{view.name}</span>
                      <span className="shrink-0 text-[10px] text-[#9188b8] dark:text-white/45">{view.target === "iphone" ? "iPhone" : "Web"}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <AdhdChip onClick={() => layout.applyView(view.id)} tone="purple" type="button">Apply</AdhdChip>
                      <AdhdChip onClick={() => layout.deleteView(view.id)} tone="danger" type="button">Delete</AdhdChip>
                    </div>
                  </div>
                ))}
              </AdhdDropdownPanel>
            ) : null}
          </div>
        ) : null}
        <AdhdChip aria-label="Reset Layout" icon={<RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />} onClick={layout.reset} title="Reset Layout" type="button">
          Reset Layout
        </AdhdChip>
        <AdhdChip aria-label="Done" icon={<Check aria-hidden="true" className="h-3.5 w-3.5" />} onClick={handleFinishEditing} tone="purple" title="Done" type="button">
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
    () => shellElements.map((element) => ({
      className: element.props.className,
      hiddenDescription: element.props.hiddenDescription,
      id: element.props.id,
      label: element.props.label,
      node: element.props.children,
      visible: element.props.visible !== false,
    })),
    [shellElements],
  );
  const renderedShells = useMemo(
    () => layout.isEditing ? shells : shells.filter((shell) => shell.visible),
    [layout.isEditing, shells],
  );
  const shellsById = useMemo(() => new Map(renderedShells.map((shell) => [shell.id, shell])), [renderedShells]);
  const visibleShellIds = useMemo(() => renderedShells.map((shell) => shell.id), [renderedShells]);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const shellRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const shellContentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const interactionRef = useRef<ShellInteraction | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const updateInteractionRef = useRef<(event: ShellPointerEvent) => void>(() => undefined);
  const endInteractionRef = useRef<(event: ShellPointerEvent | null, cancelled: boolean) => void>(() => undefined);
  const [dragStartVisibleOrder, setDragStartVisibleOrder] = useState<string[] | null>(null);
  const [dragIndicatorStyle, setDragIndicatorStyle] = useState<PageShellInsertionIndicatorStyle | null>(null);
  const renderedShellOrderKey = dragStartVisibleOrder?.join("|") ?? layout.order.join("|");
  const orderedShells = useMemo(() => renderedShellOrderKey.split("|").flatMap((id) => {
    const shell = shellsById.get(id);
    return shell ? [shell] : [];
  }), [renderedShellOrderKey, shellsById]);
  const canonicalGroups = useMemo<RenderedPageShellGroup[] | null>(() => {
    if (!layout.isCanonical || !layout.canonicalLayout.groups?.length) return null;
    const assignedShellIds = new Set<string>();
    const configuredGroups = layout.canonicalLayout.groups.flatMap((group: PageShellCanonicalGroup) => {
      const groupShells = group.shellIds.flatMap((id) => {
        const shell = shellsById.get(id);
        if (!shell || assignedShellIds.has(id)) return [];
        assignedShellIds.add(id);
        return [shell];
      });
      return groupShells.length > 0 ? [{ className: group.className, shells: groupShells }] : [];
    });
    const ungroupedShells = orderedShells.filter((shell) => !assignedShellIds.has(shell.id));
    return ungroupedShells.length > 0 ? [...configuredGroups, { shells: ungroupedShells }] : configuredGroups;
  }, [layout.canonicalLayout.groups, layout.isCanonical, orderedShells, shellsById]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragInsertionIndex, setDragInsertionIndex] = useState<number | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [naturalHeights, setNaturalHeights] = useState<Record<string, number>>({});
  const [renderedWidths, setRenderedWidths] = useState<Record<string, number>>({});
  const [positionDrafts, setPositionDrafts] = useState<Record<string, string>>({});
  const [widthDrafts, setWidthDrafts] = useState<Record<string, string>>({});
  const packedPositions = useMemo<Record<string, PageShellPackedPosition>>(
    () => packPageShellLayout(
      orderedShells.map((shell) => shell.id),
      layout.sizes,
      {
        chromeHeightPx: layout.isEditing ? 32 : 0,
        naturalHeights,
        placements: layout.placements,
      },
    ),
    [layout.isEditing, layout.placements, layout.sizes, naturalHeights, orderedShells],
  );
  // Canonical metadata owns the historical presentation. Once a user has a
  // custom layout (including a live edit preview), derived packing takes over.
  const usePackedPlacement = !layout.isCanonical;

  const measureNaturalShellHeights = useCallback(() => {
    const next = Object.fromEntries(orderedShells.flatMap((shell) => {
      const height = measureNaturalShellHeight(shellContentRefs.current[shell.id]);
      return height > 0 ? [[shell.id, height]] : [];
    }));
    const nextWidths = Object.fromEntries(orderedShells.flatMap((shell) => {
      const width = shellRefs.current[shell.id]?.getBoundingClientRect().width ?? 0;
      return width > 0 ? [[shell.id, Math.round(width)]] : [];
    }));
    setNaturalHeights((current) => {
      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(next);
      if (currentKeys.length === nextKeys.length && nextKeys.every((id) => current[id] === next[id])) return current;
      return next;
    });
    setRenderedWidths((current) => {
      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(nextWidths);
      if (currentKeys.length === nextKeys.length && nextKeys.every((id) => current[id] === nextWidths[id])) return current;
      return nextWidths;
    });
  }, [orderedShells]);

  useEffect(() => {
    let frame: number | null = null;
    const scheduleMeasurement = () => {
      if (frame !== null && typeof window !== "undefined") window.cancelAnimationFrame(frame);
      if (typeof window === "undefined") {
        measureNaturalShellHeights();
        return;
      }
      frame = window.requestAnimationFrame(() => {
        frame = null;
        measureNaturalShellHeights();
      });
    };
    scheduleMeasurement();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasurement);
    if (observer) {
      orderedShells.forEach((shell) => {
        const element = shellContentRefs.current[shell.id];
        if (element) observer.observe(element);
        const shellElement = shellRefs.current[shell.id];
        if (shellElement) observer?.observe(shellElement);
      });
    }
    const mutationObserver = typeof MutationObserver === "undefined" ? null : new MutationObserver(scheduleMeasurement);
    if (mutationObserver) {
      orderedShells.forEach((shell) => {
        const element = shellContentRefs.current[shell.id];
        if (element) mutationObserver.observe(element, { characterData: true, childList: true, subtree: true });
      });
    }
    return () => {
      if (frame !== null && typeof window !== "undefined") window.cancelAnimationFrame(frame);
      observer?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [layout.isCanonical, measureNaturalShellHeights, orderedShells, renderedShellOrderKey]);

  function currentLayout(): PageShellLayoutPreference {
    return {
      order: [...layout.order],
      placements: layout.placements
        ? Object.fromEntries(Object.entries(layout.placements).map(([id, placement]) => [id, { ...placement }]))
        : undefined,
      sizes: Object.fromEntries(Object.entries(layout.sizes).map(([id, size]) => [id, { ...size }])),
    };
  }

  function captureShellGeometry() {
    const scrollTop = getPageScrollTop();
    return orderedShells.flatMap((shell) => {
      const element = shellRefs.current[shell.id];
      if (!element) return [];
      const rect = element.getBoundingClientRect();
      return [{ bottom: rect.bottom + scrollTop, id: shell.id, left: rect.left, right: rect.right, top: rect.top + scrollTop }];
    });
  }

  function updateMovePreview(interaction: ShellMoveInteraction, pointerX: number, pointerY: number) {
    const dropTarget = getPageShellDropTarget(
      interaction.geometries,
      interaction.packedPositions,
      interaction.startVisibleOrder,
      interaction.id,
      pointerX,
      pointerY + getPageScrollTop(),
    );
    interaction.target = dropTarget;
    setDragInsertionIndex(dropTarget.insertionIndex);
    setDragIndicatorStyle(getInsertionIndicatorStyle(interaction, dropTarget.insertionIndex, layoutRef.current, dropTarget));
    const nextLayout = placePageShellAtDrop(interaction.startLayout, visibleShellIds, interaction.id, dropTarget);
    if (!layoutsHaveSameOrder(nextLayout.order, layout.order)) layout.setPreviewOrder(nextLayout.order);
    if (JSON.stringify(nextLayout.placements) !== JSON.stringify(layout.placements)) layout.setPreviewPlacements(nextLayout.placements);
  }

  function cancelDragAutoScroll() {
    if (autoScrollFrameRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
    }
    autoScrollFrameRef.current = null;
  }

  function runDragAutoScroll() {
    autoScrollFrameRef.current = null;
    const interaction = interactionRef.current;
    if (!interaction || interaction.kind !== "move" || typeof window === "undefined" || typeof document === "undefined") return;
    const scrollingElement = document.scrollingElement ?? document.documentElement;
    const scrollTop = getPageScrollTop();
    const scrollHeight = Math.max(scrollingElement.scrollHeight, document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0);
    const delta = getPageShellDragAutoScrollDelta(interaction.pointerY, window.innerHeight, scrollTop, scrollHeight);
    if (!delta) return;
    const maxScrollTop = Math.max(0, scrollHeight - window.innerHeight);
    const nextScrollTop = Math.max(0, Math.min(maxScrollTop, scrollTop + delta));
    if (nextScrollTop === scrollTop) return;
    window.scrollTo({ behavior: "auto", top: nextScrollTop });
    updateMovePreview(interaction, interaction.pointerX, interaction.pointerY);
    if (interactionRef.current === interaction) {
      autoScrollFrameRef.current = window.requestAnimationFrame(runDragAutoScroll);
    }
  }

  function scheduleDragAutoScroll() {
    const interaction = interactionRef.current;
    if (!interaction || interaction.kind !== "move" || typeof window === "undefined" || typeof document === "undefined") return;
    const scrollingElement = document.scrollingElement ?? document.documentElement;
    const scrollTop = getPageScrollTop();
    const scrollHeight = Math.max(scrollingElement.scrollHeight, document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0);
    if (!getPageShellDragAutoScrollDelta(interaction.pointerY, window.innerHeight, scrollTop, scrollHeight)) {
      cancelDragAutoScroll();
      return;
    }
    if (autoScrollFrameRef.current === null) {
      autoScrollFrameRef.current = window.requestAnimationFrame(runDragAutoScroll);
    }
  }

  function beginMove(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (!layout.isEditing || !layout.canReorder) return;
    event.preventDefault();
    event.stopPropagation();
    const startLayout = currentLayout();
    const startVisibleOrder = orderedShells.map((shell) => shell.id);
    const moveInteraction: ShellMoveInteraction = {
      captureElement: event.currentTarget,
      geometries: captureShellGeometry(),
      id,
      kind: "move",
      packedPositions: { ...packedPositions },
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      pointerX: event.clientX,
      pointerY: event.clientY,
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
    setPointerCaptureSafely(event.currentTarget, event.pointerId);
  }

  function beginResize(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (!layout.isEditing || !layout.canResize) return;
    event.preventDefault();
    event.stopPropagation();
    const startLayout = currentLayout();
    const shellContent = shellContentRefs.current[id];
    const layoutElement = layoutRef.current;
    const naturalHeight = measureNaturalShellHeight(shellContent);
    const layoutWidth = layoutElement?.getBoundingClientRect().width ?? shellContent?.getBoundingClientRect().width ?? 0;
    const initialSize = startLayout.sizes[id] ?? { heightPx: null, span: 12 };
    const initialHeight = clampPageShellHeight(initialSize.heightPx ?? naturalHeight, naturalHeight);
    interactionRef.current = {
      captureElement: event.currentTarget,
      columnWidth: layoutWidth > 0 ? layoutWidth / 12 : Math.max(shellContent?.getBoundingClientRect().width ?? 1, 1),
      id,
      initialSize,
      initialHeight,
      kind: "resize",
      naturalHeight,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startLayout,
      startX: event.clientX,
      startY: event.clientY,
    };
    layout.beginPreview(startLayout);
    layout.setPreviewSizes((sizes) => ({
      ...sizes,
      [id]: { ...(sizes[id] ?? initialSize), heightPx: naturalHeight < PAGE_SHELL_MIN_HEIGHT ? null : initialHeight },
    }));
    setResizingId(id);
    setPointerCaptureSafely(event.currentTarget, event.pointerId);
  }

  function beginWidthResize(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (!layout.isEditing || !layout.canResize) return;
    event.preventDefault();
    event.stopPropagation();
    const startLayout = currentLayout();
    const shellContent = shellContentRefs.current[id];
    const layoutElement = layoutRef.current;
    const initialSize = startLayout.sizes[id] ?? { heightPx: null, span: 12 as const };
    const layoutWidth = layoutElement?.getBoundingClientRect().width ?? shellContent?.getBoundingClientRect().width ?? 0;
    interactionRef.current = {
      captureElement: event.currentTarget,
      columnWidth: layoutWidth > 0 ? layoutWidth / 12 : Math.max(shellContent?.getBoundingClientRect().width ?? 1, 1),
      id,
      initialSize,
      initialHeight: initialSize.heightPx ?? 0,
      kind: "width-resize",
      naturalHeight: 0,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startLayout,
      startX: event.clientX,
      startY: event.clientY,
    };
    layout.beginPreview(startLayout);
    setResizingId(id);
    setPointerCaptureSafely(event.currentTarget, event.pointerId);
  }

  function setShellHeight(event: MouseEvent<HTMLButtonElement>, id: string, heightPx: number | null) {
    if (!layout.isEditing || !layout.canResize || interactionRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const startLayout = currentLayout();
    const currentSize = startLayout.sizes[id];
    if (!currentSize || currentSize.heightPx === heightPx) return;
    layout.beginPreview(startLayout);
    layout.setPreviewSizes((sizes) => ({
      ...sizes,
      [id]: { ...currentSize, heightPx },
    }));
    layout.commitPreview();
  }

  function setShellToShrinkHeight(event: MouseEvent<HTMLButtonElement>, id: string) {
    const naturalHeight = measureNaturalShellHeight(shellContentRefs.current[id]);
    setShellHeight(event, id, naturalHeight < PAGE_SHELL_MIN_HEIGHT ? null : getPageShellShrinkHeight(naturalHeight));
  }

  function setShellToNaturalHeight(event: MouseEvent<HTMLButtonElement>, id: string) {
    setShellHeight(event, id, null);
  }

  function setShellWidth(id: string, rawValue: string) {
    const currentLayoutValue = currentLayout();
    const currentSize = currentLayoutValue.sizes[id];
    if (!currentSize || !rawValue.trim()) return;
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) return;
    const span = normalizePageShellSpan(numericValue, currentSize.span);
    if (currentSize.span === span) return;
    layout.beginPreview(currentLayoutValue);
    layout.setPreviewSizes((sizes) => ({
      ...sizes,
      [id]: { ...currentSize, span },
    }));
    layout.commitPreview();
  }

  function commitShellWidth(event: ChangeEvent<HTMLInputElement>, id: string) {
    event.stopPropagation();
    setShellWidth(id, event.currentTarget.value);
    setWidthDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function commitShellPosition(id: string, rawValue: string) {
    if (!rawValue.trim()) return;
    const startLayout = currentLayout();
    const startVisibleOrder = orderedShells.map((shell) => shell.id);
    const currentIndex = startVisibleOrder.indexOf(id);
    if (currentIndex < 0) return;
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) return;
    const targetIndex = Math.max(0, Math.min(startVisibleOrder.length - 1, Math.round(numericValue) - 1));
    const nextVisibleOrder = reorderPageShellOrderAt(startVisibleOrder, id, targetIndex);
    const nextOrder = mergeVisiblePageShellOrder(startLayout.order, nextVisibleOrder, visibleShellIds);
    if (layoutsHaveSameOrder(nextOrder, layout.order)) return;
    const resequencedPlacements = packPageShellLayout(nextOrder, startLayout.sizes);
    const nextPlacements = Object.fromEntries(Object.entries(resequencedPlacements).map(([shellId, position]) => [shellId, {
      columnStart: position.columnStart,
      laneOrder: nextOrder
        .filter((candidateId) => resequencedPlacements[candidateId]?.columnStart === position.columnStart)
        .indexOf(shellId),
    }]));
    layout.beginPreview(startLayout);
    layout.setPreviewOrder(nextOrder);
    layout.setPreviewPlacements(nextPlacements);
    layout.commitPreview();
  }

  function handlePositionCommit(event: ChangeEvent<HTMLInputElement>, id: string) {
    event.stopPropagation();
    commitShellPosition(id, event.currentTarget.value);
    setPositionDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function handleNumericInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  function moveShellDirection(event: MouseEvent<HTMLButtonElement>, id: string, direction: "down" | "left" | "right" | "up") {
    if (!layout.isEditing || !layout.canReorder) return;
    event.preventDefault();
    event.stopPropagation();
    const startLayout = currentLayout();
    const startVisibleOrder = orderedShells.map((shell) => shell.id);
    const targetIndex = getPageShellDirectionalInsertionIndex(captureShellGeometry(), startVisibleOrder, id, direction);
    if (targetIndex === null) return;
    const orderWithoutSource = startVisibleOrder.filter((candidateId) => candidateId !== id);
    const targetId = direction === "left" || direction === "up"
      ? orderWithoutSource[targetIndex]
      : orderWithoutSource[targetIndex - 1];
    const targetPosition = targetId ? packedPositions[targetId] : undefined;
    if (!targetId || !targetPosition) return;
    const destinationColumnIds = startVisibleOrder
      .filter((candidateId) => candidateId !== id && layout.placements?.[candidateId]?.columnStart === targetPosition.columnStart)
      .sort((left, right) => (layout.placements?.[left]?.laneOrder ?? 0) - (layout.placements?.[right]?.laneOrder ?? 0));
    const targetLane = Math.max(0, destinationColumnIds.indexOf(targetId) + (direction === "down" || direction === "right" ? 1 : 0));
    const nextOrder = mergeVisiblePageShellOrder(
      startLayout.order,
      reorderPageShellOrderAt(startVisibleOrder, id, targetIndex),
      visibleShellIds,
    );
    const nextLayout = placePageShellAtDrop(startLayout, visibleShellIds, id, {
      columnStart: targetPosition.columnStart,
      insertionIndex: targetIndex,
      laneOrder: targetLane,
      targetId,
    });
    if (layoutsHaveSameOrder(nextOrder, layout.order) && JSON.stringify(nextLayout.placements) === JSON.stringify(layout.placements)) return;
    layout.beginPreview(startLayout);
    layout.setPreviewOrder(nextLayout.order);
    layout.setPreviewPlacements(nextLayout.placements);
    layout.commitPreview();
  }

  function updateInteraction(event: ShellPointerEvent) {
    const interaction = interactionRef.current;
    if (!interaction || !isPageShellPointerMatch(interaction.pointerId, event.pointerId)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!layout.isEditing || !layout.isPreviewing) {
      endInteraction(null, true);
      return;
    }
    if (isStalePageShellMouseMove(interaction.pointerType, event.buttons)) {
      endInteraction(event, true);
      return;
    }
    if (interaction.kind === "move") {
      interaction.pointerX = event.clientX;
      interaction.pointerY = event.clientY;
      updateMovePreview(interaction, interaction.pointerX, interaction.pointerY);
      scheduleDragAutoScroll();
      return;
    }

    const deltaColumns = interaction.columnWidth > 0 ? Math.round((event.clientX - interaction.startX) / interaction.columnWidth) : 0;
    const span = normalizePageShellSpan(interaction.initialSize.span + deltaColumns, interaction.initialSize.span);
    if (interaction.kind === "width-resize") {
      const currentSize = layout.sizes[interaction.id];
      if (currentSize?.span === span) return;
      layout.setPreviewSizes((sizes) => ({
        ...sizes,
        [interaction.id]: { ...(sizes[interaction.id] ?? interaction.initialSize), span },
      }));
      return;
    }
    const heightPx = interaction.naturalHeight < PAGE_SHELL_MIN_HEIGHT
      ? null
      : clampPageShellHeight(interaction.initialHeight + (event.clientY - interaction.startY), interaction.naturalHeight);
    const currentSize = layout.sizes[interaction.id];
    if (currentSize?.span === span && currentSize.heightPx === heightPx) return;
    layout.setPreviewSizes((sizes) => ({
      ...sizes,
      [interaction.id]: { heightPx, span },
    }));
  }

  function endInteraction(event: ShellPointerEvent | null, cancelled: boolean) {
    const interaction = interactionRef.current;
    if (!interaction) {
      if (!event) cancelDragAutoScroll();
      return;
    }
    if (event && !isPageShellPointerMatch(interaction.pointerId, event.pointerId)) return;
    interactionRef.current = null;
    cancelDragAutoScroll();
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    releasePointerCaptureSafely(interaction);
    if (cancelled) layout.cancelPreview();
    else layout.commitPreview();
    setDraggingId(null);
    setDragStartVisibleOrder(null);
    setDragInsertionIndex(null);
    setDragIndicatorStyle(null);
    setResizingId(null);
  }

  useEffect(() => {
    updateInteractionRef.current = updateInteraction;
    endInteractionRef.current = endInteraction;
  });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handlePointerMove = (event: globalThis.PointerEvent) => updateInteractionRef.current(event);
    const handlePointerUp = (event: globalThis.PointerEvent) => endInteractionRef.current(event, false);
    const handlePointerCancel = (event: globalThis.PointerEvent) => endInteractionRef.current(event, true);
    const handleWindowBlur = () => endInteractionRef.current(null, true);
    const listenerOptions = { capture: true };
    window.addEventListener("pointermove", handlePointerMove, listenerOptions);
    window.addEventListener("pointerup", handlePointerUp, listenerOptions);
    window.addEventListener("pointercancel", handlePointerCancel, listenerOptions);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove, listenerOptions);
      window.removeEventListener("pointerup", handlePointerUp, listenerOptions);
      window.removeEventListener("pointercancel", handlePointerCancel, listenerOptions);
      window.removeEventListener("blur", handleWindowBlur);
      endInteractionRef.current(null, true);
    };
  }, []);

  useEffect(() => {
    if (layout.isEditing && layout.isPreviewing) return;
    if (interactionRef.current) endInteractionRef.current(null, true);
    else cancelDragAutoScroll();
  }, [layout.isEditing, layout.isPreviewing]);

  function renderShell(shell: RenderedPageShell) {
    const size = layout.sizes[shell.id] ?? { heightPx: null, span: 12 as const };
    const spanClass = SHELL_SPAN_CLASSES[size.span] ?? SHELL_SPAN_CLASSES[12];
    const hasCustomHeight = size.heightPx !== null;
    const naturalHeight = naturalHeights[shell.id];
    const packedPosition = usePackedPlacement ? packedPositions[shell.id] : undefined;
    const shellPosition = orderedShells.findIndex((candidate) => candidate.id === shell.id);
    const packedStyle = packedPosition
      ? {
        "--page-shell-grid-column-span": packedPosition.columnSpan,
        "--page-shell-grid-column-start": packedPosition.columnStart,
        "--page-shell-grid-row-span": packedPosition.rowSpan,
        "--page-shell-grid-row-start": packedPosition.rowStart,
      } as CSSProperties
      : undefined;
    const shellPlacementClass = layout.isCanonical
      ? layout.canonicalLayout.shellClassNames?.[shell.id] ?? ""
      : spanClass;
    return (
      <div
        className={`min-w-0 transition-transform ${shellPlacementClass} ${layout.isEditing ? "relative" : ""} ${draggingId === shell.id ? "z-10 opacity-75" : ""} ${resizingId === shell.id ? "z-10" : ""} ${shell.className ?? ""}`}
        data-page-shell-id={shell.id}
        data-page-shell-dragging={draggingId === shell.id ? "true" : "false"}
        data-page-shell-resizing={resizingId === shell.id ? "true" : "false"}
        data-page-shell-rendered-width={renderedWidths[shell.id] ?? undefined}
        data-page-shell-size-span={size.span}
        key={shell.id}
        ref={(element) => { shellRefs.current[shell.id] = element; }}
        style={packedStyle}
      >
        {layout.isEditing ? (
          <div className="mb-1 flex min-h-7 items-center gap-1.5 rounded-lg border border-[#e4def8] bg-[#faf8ff]/90 px-1.5 py-1 text-xs text-[#6f57f6] dark:border-white/10 dark:bg-[#211a38]/90 dark:text-[#cabfff]" data-page-shell-layout-strip>
            {layout.canReorder ? (
              <button
                aria-label={`Move ${shell.label}`}
                className="flex h-6 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md hover:bg-[#eee9ff] active:cursor-grabbing dark:hover:bg-white/10"
                onPointerCancel={(event) => endInteraction(event, true)}
                onLostPointerCapture={(event) => endInteraction(event, true)}
                onPointerDown={(event) => beginMove(event, shell.id)}
                onPointerUp={(event) => endInteraction(event, false)}
                title={`Move ${shell.label}`}
                type="button"
              >
                <GripVertical aria-hidden="true" className="h-4 w-4" />
              </button>
            ) : null}
            <span className="min-w-0 flex-1 truncate font-semibold">{shell.label}</span>
            <button
              aria-label={`Resize ${shell.label} width`}
              className="inline-flex h-6 w-6 shrink-0 cursor-ew-resize touch-none items-center justify-center rounded-md text-[#6f57f6] hover:bg-[#eee9ff] dark:text-[#cabfff] dark:hover:bg-white/10"
              onPointerCancel={(event) => endInteraction(event, true)}
              onLostPointerCapture={(event) => endInteraction(event, true)}
              onPointerDown={(event) => beginWidthResize(event, shell.id)}
              onPointerUp={(event) => endInteraction(event, false)}
              title={`Resize ${shell.label} width`}
              type="button"
            >
              <MoveHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
            <label className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-[#9188b8] dark:text-white/45">
              <span>W</span>
              <input
                aria-label={`Set ${shell.label} width in columns`}
                className="page-shell-number-input h-6 min-w-10 w-10 rounded-md border border-[#ddd6fb] bg-white px-1 text-center text-[10px] font-semibold tabular-nums text-[#5f47d8] outline-none dark:border-white/15 dark:bg-white/10 dark:text-[#cabfff]"
                inputMode="numeric"
                max={12}
                min={3}
                onBlur={(event) => commitShellWidth(event, shell.id)}
                onChange={(event) => { event.stopPropagation(); setWidthDrafts((current) => ({ ...current, [shell.id]: event.target.value })); }}
                onKeyDown={handleNumericInputKeyDown}
                onPointerDown={(event) => event.stopPropagation()}
                step={1}
                type="number"
                value={widthDrafts[shell.id] ?? String(size.span)}
              />
              <span>/12</span>
            </label>
            <span className="shrink-0 text-[10px] font-medium text-[#9188b8] dark:text-white/45">{formatPageShellDimensions(size.span, size.heightPx, naturalHeight, renderedWidths[shell.id])}</span>
            {layout.canReorder ? (
              <>
                <label className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-[#9188b8] dark:text-white/45">
                  <span>Pos</span>
                  <input
                    aria-label={`Set ${shell.label} position`}
                    className="page-shell-number-input h-6 min-w-10 w-10 rounded-md border border-[#ddd6fb] bg-white px-1 text-center text-[10px] font-semibold tabular-nums text-[#5f47d8] outline-none dark:border-white/15 dark:bg-white/10 dark:text-[#cabfff]"
                    inputMode="numeric"
                    max={orderedShells.length}
                    min={1}
                    onBlur={(event) => handlePositionCommit(event, shell.id)}
                    onChange={(event) => { event.stopPropagation(); setPositionDrafts((current) => ({ ...current, [shell.id]: event.target.value })); }}
                    onKeyDown={handleNumericInputKeyDown}
                    onPointerDown={(event) => event.stopPropagation()}
                    step={1}
                    type="number"
                    value={positionDrafts[shell.id] ?? String(shellPosition + 1)}
                  />
                  <span>/{orderedShells.length}</span>
                </label>
                <div className="flex shrink-0 items-center gap-0.5" aria-label={`${shell.label} movement controls`}>
                  <button aria-label={`Move ${shell.label} up`} className="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-[#eee9ff] dark:hover:bg-white/10" onClick={(event) => moveShellDirection(event, shell.id, "up")} title={`Move ${shell.label} up`} type="button"><ArrowUp aria-hidden="true" className="h-3.5 w-3.5" /></button>
                  <button aria-label={`Move ${shell.label} down`} className="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-[#eee9ff] dark:hover:bg-white/10" onClick={(event) => moveShellDirection(event, shell.id, "down")} title={`Move ${shell.label} down`} type="button"><ArrowDown aria-hidden="true" className="h-3.5 w-3.5" /></button>
                  <button aria-label={`Move ${shell.label} left`} className="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-[#eee9ff] dark:hover:bg-white/10" onClick={(event) => moveShellDirection(event, shell.id, "left")} title={`Move ${shell.label} left`} type="button"><ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" /></button>
                  <button aria-label={`Move ${shell.label} right`} className="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-[#eee9ff] dark:hover:bg-white/10" onClick={(event) => moveShellDirection(event, shell.id, "right")} title={`Move ${shell.label} right`} type="button"><ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></button>
                </div>
              </>
            ) : null}
            <button
              aria-label={`Shrink ${shell.label}`}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#6f57f6] hover:bg-[#eee9ff] dark:text-[#cabfff] dark:hover:bg-white/10"
              onClick={(event) => setShellToShrinkHeight(event, shell.id)}
              title={`Shrink ${shell.label}`}
              type="button"
            >
              <ArrowDownToLine aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
            <button
              aria-label={`Expand ${shell.label}`}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#6f57f6] hover:bg-[#eee9ff] dark:text-[#cabfff] dark:hover:bg-white/10"
              onClick={(event) => setShellToNaturalHeight(event, shell.id)}
              title={`Expand ${shell.label}`}
              type="button"
            >
              <ArrowUpToLine aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
        <div
          className={`relative min-w-0 ${hasCustomHeight ? "page-shell-custom-height" : ""}`}
          data-page-shell-height={size.heightPx ?? "natural"}
          ref={(element) => { shellContentRefs.current[shell.id] = element; }}
          style={hasCustomHeight ? { height: `${size.heightPx}px` } : undefined}
        >
          {shell.visible ? shell.node : (
            <div aria-label={`${shell.label} placeholder`} className="flex min-h-36 flex-col justify-center rounded-[1rem] border border-dashed border-[#d8d0f5] bg-[#faf8ff]/70 px-4 py-5 text-center dark:border-white/15 dark:bg-white/[0.04]" data-page-shell-placeholder>
              <p className="text-sm font-semibold text-[#514779] dark:text-white/80">{shell.label}</p>
              <p className="mt-1 text-xs text-[#8c84aa] dark:text-white/50">{shell.hiddenDescription ?? DEFAULT_HIDDEN_SHELL_DESCRIPTION}</p>
            </div>
          )}
          {layout.isEditing ? (
            <button
              aria-label={`Resize ${shell.label}`}
              className="absolute bottom-1 right-1 z-20 flex h-6 w-6 cursor-se-resize touch-none items-center justify-center rounded-md border border-[#d8d0f5] bg-[#faf8ff]/95 text-[#6f57f6] shadow-sm hover:bg-[#eee9ff] dark:border-white/15 dark:bg-[#211a38]/95 dark:text-[#cabfff] dark:hover:bg-white/10"
              onPointerCancel={(event) => endInteraction(event, true)}
              onLostPointerCapture={(event) => endInteraction(event, true)}
              onPointerDown={(event) => beginResize(event, shell.id)}
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
  }

  return (
    <div
      className={`${shellsClassName.replace(/\bxl:grid-cols-12\b/g, "").trim()} ${layout.isCanonical ? layout.canonicalLayout.gridClassName ?? "" : "xl:grid-cols-12"} ${usePackedPlacement ? "page-shell-packed" : ""} relative`.trim()}
      data-page-shell-layout={layout.pageKey}
      data-page-shell-edit-mode={layout.isEditing ? "true" : "false"}
      data-page-shell-packed={usePackedPlacement ? "true" : "false"}
      data-page-shell-presentation={layout.isCanonical ? "canonical" : "custom"}
      ref={layoutRef}
    >
      {canonicalGroups ? canonicalGroups.map((group, index) => (
        <div className={`min-w-0 ${group.className ?? ""}`.trim()} data-page-shell-group={index} key={`page-shell-group-${index}`}>
          {group.shells.map(renderShell)}
        </div>
      )) : orderedShells.map(renderShell)}
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
