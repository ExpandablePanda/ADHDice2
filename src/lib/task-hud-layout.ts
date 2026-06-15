export type HudWidgetType =
  | "dark_mode"
  | "calm"
  | "sync_status"
  | "xp"
  | "points"
  | "tokens"
  | "streak"
  | "notification_inbox"
  | "focus_alarm"
  | "focus_timer"
  | "zoom"
  | "new_task"
  | "refocus"
  | "quick_capture"
  | "task_counts";

export type HudWidgetSize = "1x1" | "1x2" | "2x1" | "2x2";

export type HudWidgetLayoutItem = {
  heightPx?: number;
  id: string;
  size: HudWidgetSize;
  type: HudWidgetType;
  widthPx?: number;
};

export type HudWorkspaceWidget = {
  heightPx: number;
  id: string;
  isVisible: boolean;
  type: HudWidgetType;
  widthPx: number;
  x: number;
  y: number;
};

export type HudWorkspace = {
  heightPx: number;
  isWidthUserSized: boolean;
  version: number;
  widgets: HudWorkspaceWidget[];
  widthPx: number;
};

export type HudLayoutSnapshot = {
  id: number;
  workspace: HudWorkspace;
};

export type HudSortablePointer = {
  x: number;
  y: number;
};

export type HudSortableTarget = {
  laneIndex: number;
  laneY: number;
  slotIndex: number;
};

export type HudPage = {
  id: "overview" | "command";
  title: string;
  widgets: HudWidgetLayoutItem[];
};

export type HudUiState = {
  activeHudPageId: HudPage["id"];
  activeSnapshotId: number;
  hudWorkspace: HudWorkspace;
  hudSnapshots: HudLayoutSnapshot[];
  hudPages: HudPage[];
  isHudCollapsed: boolean;
  hudUiVersion: number;
  isHudEditMode: boolean;
  selectedHudWidgetId: string | null;
};

export const HUD_UI_SCHEMA_VERSION = 6;
export const HUD_WORKSPACE_SCHEMA_VERSION = 2;
export const HUD_WORKSPACE_SNAP_PX = 8;
export const HUD_LAYOUT_SNAPSHOT_LIMIT = 5;
export const HUD_WORKSPACE_BOTTOM_GUTTER_PX = 12;
export const HUD_PAGE_IDS: HudPage["id"][] = ["overview", "command"];
export const HUD_WIDGET_TYPES: HudWidgetType[] = [
  "dark_mode",
  "calm",
  "sync_status",
  "xp",
  "points",
  "tokens",
  "streak",
  "notification_inbox",
  "focus_alarm",
  "focus_timer",
  "zoom",
  "new_task",
  "refocus",
  "quick_capture",
  "task_counts",
];

export const HUD_WIDGET_LABELS: Record<HudWidgetType, string> = {
  calm: "Calm",
  dark_mode: "Dark Mode",
  focus_alarm: "Focus Alarm",
  focus_timer: "Focus Timer",
  new_task: "New Task",
  notification_inbox: "Notifications",
  points: "Points",
  quick_capture: "Quick Capture",
  refocus: "Refocus",
  sync_status: "Sync Status",
  streak: "Streak",
  task_counts: "Task Counts",
  tokens: "Tokens",
  xp: "Level + XP",
  zoom: "Zoom",
};

const DEFAULT_WIDGET_SIZES: Record<HudWidgetType, HudWidgetSize> = {
  calm: "1x1",
  dark_mode: "1x1",
  focus_alarm: "2x1",
  focus_timer: "2x2",
  new_task: "1x1",
  notification_inbox: "1x1",
  points: "1x1",
  quick_capture: "1x1",
  refocus: "1x1",
  sync_status: "1x1",
  streak: "1x1",
  task_counts: "2x1",
  tokens: "1x1",
  xp: "2x1",
  zoom: "1x1",
};

const HUD_WIDGET_DIMENSION_LIMITS = {
  maxHeight: 220,
  maxWidth: 640,
  minHeight: 36,
  minWidth: 44,
} as const;

const HUD_WIDGET_MIN_DIMENSIONS: Record<HudWidgetType, { heightPx: number; widthPx: number }> = {
  calm: { heightPx: 54, widthPx: 104 },
  dark_mode: { heightPx: 44, widthPx: 44 },
  focus_alarm: { heightPx: 56, widthPx: 224 },
  focus_timer: { heightPx: 96, widthPx: 220 },
  new_task: { heightPx: 44, widthPx: 112 },
  notification_inbox: { heightPx: 44, widthPx: 108 },
  points: { heightPx: 44, widthPx: 96 },
  quick_capture: { heightPx: 44, widthPx: 148 },
  refocus: { heightPx: 44, widthPx: 112 },
  sync_status: { heightPx: 44, widthPx: 108 },
  streak: { heightPx: 44, widthPx: 96 },
  task_counts: { heightPx: 48, widthPx: 184 },
  tokens: { heightPx: 44, widthPx: 96 },
  xp: { heightPx: 48, widthPx: 192 },
  zoom: { heightPx: 44, widthPx: 96 },
};

const HUD_WORKSPACE_DIMENSION_LIMITS = {
  maxHeight: 720,
  maxWidth: 2400,
  minHeight: 108,
  minWidth: 320,
} as const;

const HUD_WORKSPACE_DEFAULT_DIMENSIONS = {
  heightPx: 120,
  widthPx: 880,
} as const;

const HUD_WORKSPACE_GAP_PX = 8;
const HUD_WORKSPACE_CANVAS_PADDING_PX = HUD_WORKSPACE_GAP_PX * 3;

function snapToWorkspaceGrid(value: number) {
  return Math.round(value / HUD_WORKSPACE_SNAP_PX) * HUD_WORKSPACE_SNAP_PX;
}

function clampWorkspaceCoordinate(position: number, size: number, workspaceSize: number) {
  return Math.max(0, Math.min(Math.max(0, workspaceSize - size), snapToWorkspaceGrid(position)));
}

function enumerateSnappedCoordinates(max: number) {
  if (max <= 0) {
    return [0];
  }

  const coordinates: number[] = [];
  for (let value = 0; value <= max; value += HUD_WORKSPACE_SNAP_PX) {
    coordinates.push(value);
  }
  if (coordinates[coordinates.length - 1] !== max) {
    coordinates.push(max);
  }
  return coordinates;
}

function widgetsOverlap(first: Pick<HudWorkspaceWidget, "heightPx" | "widthPx" | "x" | "y">, second: Pick<HudWorkspaceWidget, "heightPx" | "widthPx" | "x" | "y">) {
  return first.x < second.x + second.widthPx
    && first.x + first.widthPx > second.x
    && first.y < second.y + second.heightPx
    && first.y + first.heightPx > second.y;
}

function getWidgetRight(widget: Pick<HudWorkspaceWidget, "widthPx" | "x">) {
  return widget.x + widget.widthPx;
}

function getWidgetBottom(widget: Pick<HudWorkspaceWidget, "heightPx" | "y">) {
  return widget.y + widget.heightPx;
}

function getVisibleWidgetsExcluding(widgets: HudWorkspaceWidget[], widgetId: string) {
  return widgets.filter((widget) => widget.id !== widgetId && widget.isVisible);
}

export function getHudWorkspaceContentDimensions(
  widgets: HudWorkspaceWidget[],
  workspace: Pick<HudWorkspace, "heightPx" | "widthPx">,
) {
  const visibleWidgets = widgets.filter((widget) => widget.isVisible);
  const farRight = visibleWidgets.reduce((maxRight, widget) => Math.max(maxRight, getWidgetRight(widget)), 0);
  const farBottom = visibleWidgets.reduce((maxBottom, widget) => Math.max(maxBottom, getWidgetBottom(widget)), 0);
  const widthOverflow = Math.max(0, farRight - workspace.widthPx);
  const heightOverflow = Math.max(0, farBottom - workspace.heightPx);

  return {
    heightPx: workspace.heightPx + (heightOverflow > 0 ? heightOverflow + HUD_WORKSPACE_CANVAS_PADDING_PX : 0),
    widthPx: workspace.widthPx + (widthOverflow > 0 ? widthOverflow + HUD_WORKSPACE_CANVAS_PADDING_PX : 0),
  };
}

export function getHudWorkspaceMinimumHeight(widgets: HudWorkspaceWidget[]) {
  const visibleWidgets = widgets.filter((widget) => widget.isVisible);
  if (visibleWidgets.length === 0) {
    return HUD_WORKSPACE_DIMENSION_LIMITS.minHeight;
  }

  const farBottom = visibleWidgets.reduce((maxBottom, widget) => Math.max(maxBottom, getWidgetBottom(widget)), 0);
  return clampDimension(
    farBottom + HUD_WORKSPACE_BOTTOM_GUTTER_PX,
    1,
    HUD_WORKSPACE_DIMENSION_LIMITS.maxHeight,
  );
}

export function getHudWorkspaceViewportWidth(
  workspace: Pick<HudWorkspace, "isWidthUserSized" | "widthPx">,
  availableWidthPx: number,
) {
  const availableWidth = Math.max(0, Math.round(availableWidthPx));
  if (workspace.isWidthUserSized || availableWidth === 0) {
    return workspace.widthPx;
  }
  return Math.max(workspace.widthPx, availableWidth);
}

function getPlacementSearchArea(
  widgets: HudWorkspaceWidget[],
  workspace: Pick<HudWorkspace, "heightPx" | "widthPx">,
  targetWidget: HudWorkspaceWidget,
  options?: { expandToDesiredPosition?: boolean },
) {
  const otherVisibleWidgets = getVisibleWidgetsExcluding(widgets, targetWidget.id);
  const farRight = otherVisibleWidgets.reduce((maxRight, widget) => Math.max(maxRight, getWidgetRight(widget)), 0);
  const farBottom = otherVisibleWidgets.reduce((maxBottom, widget) => Math.max(maxBottom, getWidgetBottom(widget)), 0);
  const desiredRight = options?.expandToDesiredPosition ? Math.max(0, targetWidget.x) + targetWidget.widthPx : 0;
  const desiredBottom = options?.expandToDesiredPosition ? Math.max(0, targetWidget.y) + targetWidget.heightPx : 0;

  return {
    heightPx: Math.max(
      workspace.heightPx,
      farBottom + targetWidget.heightPx + HUD_WORKSPACE_GAP_PX,
      desiredBottom + HUD_WORKSPACE_CANVAS_PADDING_PX,
    ),
    otherVisibleWidgets,
    widthPx: Math.max(
      workspace.widthPx,
      farRight + targetWidget.widthPx + HUD_WORKSPACE_GAP_PX,
      desiredRight + HUD_WORKSPACE_CANVAS_PADDING_PX,
    ),
  };
}

function resolveWorkspacePlacement(
  widgets: HudWorkspaceWidget[],
  workspace: Pick<HudWorkspace, "heightPx" | "widthPx">,
  targetWidget: HudWorkspaceWidget,
  options?: { expandToDesiredPosition?: boolean },
): HudWorkspaceWidget {
  if (!targetWidget.isVisible) {
    return targetWidget;
  }

  const searchArea = getPlacementSearchArea(widgets, workspace, targetWidget, options);
  const maxX = Math.max(0, searchArea.widthPx - targetWidget.widthPx);
  const maxY = Math.max(0, searchArea.heightPx - targetWidget.heightPx);
  const desiredX = clampWorkspaceCoordinate(targetWidget.x, targetWidget.widthPx, searchArea.widthPx);
  const desiredY = clampWorkspaceCoordinate(targetWidget.y, targetWidget.heightPx, searchArea.heightPx);
  const desiredPlacement = {
    ...targetWidget,
    x: desiredX,
    y: desiredY,
  };

  if (!searchArea.otherVisibleWidgets.some((widget) => widgetsOverlap(desiredPlacement, widget))) {
    return desiredPlacement;
  }

  const candidateXs = enumerateSnappedCoordinates(maxX);
  const candidateYs = enumerateSnappedCoordinates(maxY);
  let bestPlacement: HudWorkspaceWidget | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidateY of candidateYs) {
    for (const candidateX of candidateXs) {
      const candidatePlacement = {
        ...targetWidget,
        x: candidateX,
        y: candidateY,
      };
      if (searchArea.otherVisibleWidgets.some((widget) => widgetsOverlap(candidatePlacement, widget))) {
        continue;
      }
      const distance = Math.abs(candidateX - desiredX) + Math.abs(candidateY - desiredY);
      if (
        distance < bestDistance
        || (distance === bestDistance && bestPlacement && (candidateY < bestPlacement.y || (candidateY === bestPlacement.y && candidateX < bestPlacement.x)))
        || (distance === bestDistance && bestPlacement === null)
      ) {
        bestPlacement = candidatePlacement;
        bestDistance = distance;
      }
    }
  }

  if (bestPlacement) {
    return bestPlacement;
  }

  const fallbackWidth = searchArea.widthPx + targetWidget.widthPx + HUD_WORKSPACE_GAP_PX;
  const fallbackHeight = searchArea.heightPx + targetWidget.heightPx + HUD_WORKSPACE_GAP_PX;
  return resolveWorkspacePlacement(
    widgets,
    { heightPx: fallbackHeight, widthPx: fallbackWidth },
    targetWidget,
    options,
  );
}

function defaultWidget(type: HudWidgetType): HudWidgetLayoutItem {
  return {
    id: `hud-${type}`,
    size: DEFAULT_WIDGET_SIZES[type],
    type,
  };
}

const DEFAULT_HUD_PAGES: HudPage[] = [
  {
    id: "overview",
    title: "Overview",
    widgets: [
      defaultWidget("dark_mode"),
      defaultWidget("calm"),
      defaultWidget("sync_status"),
      defaultWidget("xp"),
      defaultWidget("points"),
      defaultWidget("tokens"),
      defaultWidget("streak"),
      defaultWidget("notification_inbox"),
      defaultWidget("focus_alarm"),
    ],
  },
  {
    id: "command",
    title: "Command",
    widgets: [
      defaultWidget("focus_timer"),
      defaultWidget("zoom"),
      defaultWidget("new_task"),
      defaultWidget("refocus"),
      defaultWidget("quick_capture"),
      defaultWidget("task_counts"),
    ],
  },
];

function clampDimension(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function getWidgetMinimumDimensions(type: HudWidgetType) {
  const minimums = HUD_WIDGET_MIN_DIMENSIONS[type];
  return {
    heightPx: Math.max(minimums.heightPx, HUD_WIDGET_DIMENSION_LIMITS.minHeight),
    widthPx: Math.max(minimums.widthPx, HUD_WIDGET_DIMENSION_LIMITS.minWidth),
  };
}

export function clampHudWidgetDimensions(
  type: HudWidgetType,
  widthPx: number,
  heightPx: number,
) {
  const minimums = getWidgetMinimumDimensions(type);
  return {
    heightPx: clampDimension(
      heightPx,
      minimums.heightPx,
      HUD_WIDGET_DIMENSION_LIMITS.maxHeight,
    ),
    widthPx: clampDimension(
      widthPx,
      minimums.widthPx,
      HUD_WIDGET_DIMENSION_LIMITS.maxWidth,
    ),
  };
}

function getDefaultWidgetDimensions(widget: Pick<HudWidgetLayoutItem, "size" | "type">) {
  if (widget.type === "dark_mode") {
    return { heightPx: 50, widthPx: 50 };
  }

  if (widget.type === "calm") {
    return { heightPx: 54, widthPx: 104 };
  }

  return {
    heightPx: widget.size.endsWith("2") ? 108 : 50,
    widthPx: widget.size.startsWith("2") ? 260 : 132,
  };
}

function getWorkspaceDimensions(
  widthPx: unknown,
  heightPx: unknown,
  options?: { allowDynamicMinimumHeight?: boolean },
) {
  return {
    heightPx: typeof heightPx === "number" && Number.isFinite(heightPx)
      ? clampDimension(
        heightPx,
        options?.allowDynamicMinimumHeight ? 1 : HUD_WORKSPACE_DIMENSION_LIMITS.minHeight,
        HUD_WORKSPACE_DIMENSION_LIMITS.maxHeight,
      )
      : HUD_WORKSPACE_DEFAULT_DIMENSIONS.heightPx,
    widthPx: typeof widthPx === "number" && Number.isFinite(widthPx)
      ? clampDimension(widthPx, HUD_WORKSPACE_DIMENSION_LIMITS.minWidth, HUD_WORKSPACE_DIMENSION_LIMITS.maxWidth)
      : HUD_WORKSPACE_DEFAULT_DIMENSIONS.widthPx,
  };
}

function createWorkspaceWidget(
  widget: HudWidgetLayoutItem,
  position: { x: number; y: number },
  isVisible: boolean,
): HudWorkspaceWidget {
  const defaults = getDefaultWidgetDimensions(widget);
  const dimensions = clampHudWidgetDimensions(
    widget.type,
    widget.widthPx ?? defaults.widthPx,
    widget.heightPx ?? defaults.heightPx,
  );
  return {
    heightPx: dimensions.heightPx,
    id: widget.id,
    isVisible,
    type: widget.type,
    widthPx: dimensions.widthPx,
    x: Math.max(0, Math.round(position.x)),
    y: Math.max(0, Math.round(position.y)),
  };
}

export function updateHudWorkspaceWidgetLayout(
  widgets: HudWorkspaceWidget[],
  workspace: Pick<HudWorkspace, "heightPx" | "widthPx">,
  widgetId: string,
  overrides: Partial<Pick<HudWorkspaceWidget, "heightPx" | "isVisible" | "widthPx" | "x" | "y">>,
): HudWorkspaceWidget[] {
  const previousWidget = widgets.find((widget) => widget.id === widgetId) ?? null;
  const nextWidgets = widgets.map((widget) => widget.id === widgetId ? { ...widget, ...overrides } : widget);
  const targetWidget = nextWidgets.find((widget) => widget.id === widgetId);

  if (!targetWidget) {
    return widgets;
  }

  const targetDimensions = clampHudWidgetDimensions(targetWidget.type, targetWidget.widthPx, targetWidget.heightPx);
  const boundedWidgets = nextWidgets.map((widget) => widget.id === widgetId
    ? { ...widget, ...targetDimensions }
    : widget);
  const boundedTargetWidget = boundedWidgets.find((widget) => widget.id === widgetId);

  if (!boundedTargetWidget) {
    return widgets;
  }

  if (!boundedTargetWidget.isVisible) {
    return boundedWidgets;
  }

  const resolvedWidget = resolveWorkspacePlacement(
    boundedWidgets,
    workspace,
    boundedTargetWidget,
    { expandToDesiredPosition: overrides.x !== undefined || overrides.y !== undefined || (previousWidget?.isVisible ?? true) },
  );
  return boundedWidgets.map((widget) => widget.id === widgetId ? resolvedWidget : widget);
}

function sortHudWorkspaceWidgets(widgets: HudWorkspaceWidget[]) {
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

function packOrderedWorkspaceWidgets(widgets: HudWorkspaceWidget[]) {
  const packedWidgets: HudWorkspaceWidget[] = [];
  let cursorX = 0;

  for (const widget of widgets) {
    packedWidgets.push({
      ...widget,
      x: cursorX,
    });
    cursorX += widget.widthPx + HUD_WORKSPACE_GAP_PX;
  }

  return packedWidgets;
}

function getLaneHeight(widgets: HudWorkspaceWidget[]) {
  return widgets.reduce((height, widget) => Math.max(height, widget.heightPx), 0);
}

function packWorkspaceLanes(lanes: ReturnType<typeof groupWorkspaceWidgetLanes>) {
  const packedWidgets: HudWorkspaceWidget[] = [];
  let laneY = 0;

  for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
    const lane = lanes[laneIndex];
    const laneHeight = getLaneHeight(lane.widgets);
    const packedLaneWidgets = packOrderedWorkspaceWidgets(lane.widgets).map((widget) => ({
      ...widget,
      y: Math.round(laneY + (laneHeight - widget.heightPx) / 2),
    }));

    packedWidgets.push(...packedLaneWidgets);
    laneY += laneHeight + HUD_WORKSPACE_GAP_PX;
  }

  return packedWidgets;
}

function groupWorkspaceWidgetLanes(widgets: HudWorkspaceWidget[]) {
  const lanes: Array<{
    bottom: number;
    top: number;
    widgets: HudWorkspaceWidget[];
  }> = [];

  for (const widget of sortHudWorkspaceWidgets(widgets)) {
    const currentLane = lanes[lanes.length - 1] ?? null;
    if (!currentLane || widget.y > currentLane.bottom) {
      lanes.push({
        bottom: widget.y + widget.heightPx,
        top: widget.y,
        widgets: [widget],
      });
      continue;
    }

    currentLane.widgets.push(widget);
    currentLane.bottom = Math.max(currentLane.bottom, widget.y + widget.heightPx);
    currentLane.top = Math.min(currentLane.top, widget.y);
  }

  return lanes;
}

function getLaneInsertionTarget(
  lanes: ReturnType<typeof groupWorkspaceWidgetLanes>,
  targetIndex: number,
): HudSortableTarget {
  const boundedTargetIndex = Math.max(0, Math.round(targetIndex));
  let cursorIndex = 0;

  for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
    const lane = lanes[laneIndex];
    const laneEndIndex = cursorIndex + lane.widgets.length;
    if (boundedTargetIndex <= laneEndIndex) {
      return {
        laneIndex,
        laneY: lane.top,
        slotIndex: Math.max(0, Math.min(lane.widgets.length, boundedTargetIndex - cursorIndex)),
      };
    }
    cursorIndex = laneEndIndex;
  }

  const fallbackLaneIndex = Math.max(0, lanes.length - 1);
  const fallbackLane = lanes[fallbackLaneIndex];
  return {
    laneIndex: fallbackLaneIndex,
    laneY: fallbackLane?.top ?? 0,
    slotIndex: fallbackLane?.widgets.length ?? 0,
  };
}

export function reorderHudWorkspaceWidgets(
  widgets: HudWorkspaceWidget[],
  widgetId: string,
  target: number | HudSortableTarget,
): HudWorkspaceWidget[] {
  const visibleWidgets = sortHudWorkspaceWidgets(widgets.filter((widget) => widget.isVisible));
  const draggedWidget = visibleWidgets.find((widget) => widget.id === widgetId);

  if (!draggedWidget) {
    return widgets;
  }

  const lanes = groupWorkspaceWidgetLanes(visibleWidgets);
  const targetLane = typeof target === "number"
    ? getLaneInsertionTarget(lanes, target)
    : target;
  const targetLaneIndex = lanes.findIndex((lane) => lane.top === targetLane.laneY);
  const resolvedTargetLaneIndex = targetLaneIndex >= 0 ? targetLaneIndex : targetLane.laneIndex;
  const targetLaneY = Number.isFinite(targetLane.laneY) ? targetLane.laneY : lanes[resolvedTargetLaneIndex]?.top ?? draggedWidget.y;
  let didInsertDraggedWidget = false;
  const nextLanes = lanes.map((lane, laneIndex) => {
    const laneWidgets = lane.widgets.filter((widget) => widget.id !== widgetId);
    if (laneIndex === resolvedTargetLaneIndex) {
      const slotIndex = Math.max(0, Math.min(laneWidgets.length, Math.round(targetLane.slotIndex)));
      laneWidgets.splice(slotIndex, 0, { ...draggedWidget, y: targetLaneY });
      didInsertDraggedWidget = true;
    }

    return {
      ...lane,
      bottom: laneWidgets.reduce((bottom, widget) => Math.max(bottom, widget.y + widget.heightPx), lane.top),
      widgets: laneWidgets,
    };
  });

  if (!didInsertDraggedWidget) {
    nextLanes.push({
      bottom: targetLaneY + draggedWidget.heightPx,
      top: targetLaneY,
      widgets: [{ ...draggedWidget, y: targetLaneY }],
    });
  }

  const packedVisibleWidgets = packWorkspaceLanes(nextLanes.filter((lane) => lane.widgets.length > 0));
  const hiddenWidgets = widgets.filter((widget) => !widget.isVisible);

  return [
    ...packedVisibleWidgets,
    ...hiddenWidgets,
  ];
}

export function getHudSortableTarget(
  widgets: HudWorkspaceWidget[],
  widgetId: string,
  pointer: HudSortablePointer,
): HudSortableTarget {
  const targetWidgets = sortHudWorkspaceWidgets(widgets.filter((widget) => widget.isVisible && widget.id !== widgetId));
  if (targetWidgets.length === 0) {
    return { laneIndex: 0, laneY: 0, slotIndex: 0 };
  }

  const lanes = groupWorkspaceWidgetLanes(targetWidgets);
  const targetLaneIndex = lanes.findIndex((lane) => pointer.y >= lane.top && pointer.y <= lane.bottom);
  const targetLane = targetLaneIndex >= 0
    ? lanes[targetLaneIndex]
    : lanes.reduce((closestLane, lane) => {
      const closestDistance = Math.abs(pointer.y - ((closestLane.top + closestLane.bottom) / 2));
      const laneDistance = Math.abs(pointer.y - ((lane.top + lane.bottom) / 2));
      return laneDistance < closestDistance ? lane : closestLane;
    }, lanes[0]);
  const laneIndex = targetLaneIndex >= 0 ? targetLaneIndex : lanes.indexOf(targetLane);

  for (let slotIndex = 0; slotIndex < targetLane.widgets.length; slotIndex += 1) {
    const widget = targetLane.widgets[slotIndex];
    if (pointer.x < widget.x + widget.widthPx / 2) {
      return {
        laneIndex,
        laneY: targetLane.top,
        slotIndex,
      };
    }
  }

  return {
    laneIndex,
    laneY: targetLane.top,
    slotIndex: targetLane.widgets.length,
  };
}

export function getHudSortableTargetIndex(
  widgets: HudWorkspaceWidget[],
  widgetId: string,
  pointer: HudSortablePointer,
) {
  const target = getHudSortableTarget(widgets, widgetId, pointer);
  const lanes = groupWorkspaceWidgetLanes(widgets.filter((widget) => widget.isVisible && widget.id !== widgetId));
  const precedingWidgetCount = lanes
    .slice(0, target.laneIndex)
    .reduce((count, lane) => count + lane.widgets.length, 0);
  return precedingWidgetCount + target.slotIndex;
}

function stabilizeWorkspaceWidgets(
  widgets: HudWorkspaceWidget[],
  workspace: Pick<HudWorkspace, "heightPx" | "widthPx">,
) {
  const hiddenWidgets = widgets.filter((widget) => !widget.isVisible);
  const visibleWidgets = sortHudWorkspaceWidgets(widgets.filter((widget) => widget.isVisible));
  const placedWidgets: HudWorkspaceWidget[] = [];

  for (const widget of visibleWidgets) {
    const resolvedWidget = resolveWorkspacePlacement(
      [...placedWidgets, ...hiddenWidgets],
      workspace,
      widget,
    );
    placedWidgets.push(resolvedWidget);
  }

  return widgets.map((widget) => {
    if (!widget.isVisible) {
      return widget;
    }
    return placedWidgets.find((placedWidget) => placedWidget.id === widget.id) ?? widget;
  });
}

function buildWorkspaceWidgetsFromOrderedItems(
  orderedWidgets: Array<{ isVisible: boolean; widget: HudWidgetLayoutItem }>,
  workspaceWidthPx: number,
) {
  const widgets: HudWorkspaceWidget[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  for (const { isVisible, widget } of orderedWidgets) {
    const defaults = getDefaultWidgetDimensions(widget);
    const dimensions = clampHudWidgetDimensions(
      widget.type,
      widget.widthPx ?? defaults.widthPx,
      widget.heightPx ?? defaults.heightPx,
    );
    const { heightPx, widthPx } = dimensions;

    if (cursorX > 0 && cursorX + widthPx > workspaceWidthPx) {
      cursorX = 0;
      cursorY += rowHeight + HUD_WORKSPACE_GAP_PX;
      rowHeight = 0;
    }

    widgets.push(createWorkspaceWidget(widget, isVisible ? { x: cursorX, y: cursorY } : { x: 0, y: 0 }, isVisible));
    if (isVisible) {
      cursorX += widthPx + HUD_WORKSPACE_GAP_PX;
      rowHeight = Math.max(rowHeight, heightPx);
    }
  }

  return widgets;
}

function buildWorkspaceFromPages(
  pages: HudPage[],
  dimensions?: { heightPx?: unknown; widthPx?: unknown },
): HudWorkspace {
  const workspaceDimensions = getWorkspaceDimensions(dimensions?.widthPx, dimensions?.heightPx);
  const orderedVisibleWidgets = pages.flatMap((page) => page.widgets.map((widget) => ({ isVisible: true, widget })));
  const seenTypes = new Set<HudWidgetType>(orderedVisibleWidgets.map(({ widget }) => widget.type));
  const hiddenWidgets = HUD_WIDGET_TYPES
    .filter((type) => !seenTypes.has(type))
    .map((type) => ({ isVisible: false, widget: defaultWidget(type) }));

  return {
    heightPx: workspaceDimensions.heightPx,
    isWidthUserSized: false,
    version: HUD_WORKSPACE_SCHEMA_VERSION,
    widgets: buildWorkspaceWidgetsFromOrderedItems([...orderedVisibleWidgets, ...hiddenWidgets], workspaceDimensions.widthPx),
    widthPx: workspaceDimensions.widthPx,
  };
}

function cloneHudWorkspace(workspace: HudWorkspace): HudWorkspace {
  return {
    ...workspace,
    widgets: workspace.widgets.map((widget) => ({ ...widget })),
  };
}

function createHudSnapshot(id: number, workspace: HudWorkspace): HudLayoutSnapshot {
  return {
    id,
    workspace: cloneHudWorkspace(workspace),
  };
}

export const DEFAULT_HUD_UI_STATE: HudUiState = {
  activeHudPageId: "overview",
  activeSnapshotId: 1,
  hudPages: DEFAULT_HUD_PAGES,
  hudWorkspace: buildWorkspaceFromPages(DEFAULT_HUD_PAGES),
  hudSnapshots: [createHudSnapshot(1, buildWorkspaceFromPages(DEFAULT_HUD_PAGES))],
  isHudCollapsed: false,
  hudUiVersion: HUD_UI_SCHEMA_VERSION,
  isHudEditMode: false,
  selectedHudWidgetId: null,
};

function isHudPageId(value: unknown): value is HudPage["id"] {
  return value === "overview" || value === "command";
}

function isHudWidgetType(value: unknown): value is HudWidgetType {
  return typeof value === "string" && HUD_WIDGET_TYPES.includes(value as HudWidgetType);
}

function isLegacyThemeWidget(value: unknown): value is { heightPx?: unknown; type: "theme" } {
  return Boolean(value) && typeof value === "object" && (value as { type?: unknown }).type === "theme";
}

function isHudWidgetSize(value: unknown): value is HudWidgetSize {
  return value === "1x1" || value === "1x2" || value === "2x1" || value === "2x2";
}

function normalizeHudWidget(value: unknown): HudWidgetLayoutItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<HudWidgetLayoutItem>;
  if (!isHudWidgetType(candidate.type)) {
    return null;
  }

  const size = isHudWidgetSize(candidate.size) ? candidate.size : DEFAULT_WIDGET_SIZES[candidate.type];
  const defaults = getDefaultWidgetDimensions({ size, type: candidate.type });
  const dimensions = clampHudWidgetDimensions(
    candidate.type,
    typeof candidate.widthPx === "number" && Number.isFinite(candidate.widthPx) ? candidate.widthPx : defaults.widthPx,
    typeof candidate.heightPx === "number" && Number.isFinite(candidate.heightPx) ? candidate.heightPx : defaults.heightPx,
  );
  const widthPx = typeof candidate.widthPx === "number" && Number.isFinite(candidate.widthPx)
    ? dimensions.widthPx
    : undefined;
  const heightPx = typeof candidate.heightPx === "number" && Number.isFinite(candidate.heightPx)
    ? dimensions.heightPx
    : undefined;

  return {
    heightPx,
    id: typeof candidate.id === "string" && candidate.id.length > 0 ? candidate.id : `hud-${candidate.type}`,
    size,
    type: candidate.type,
    widthPx,
  };
}

function normalizePageWidgets(pageId: HudPage["id"], widgets: unknown, includeMissingDefaults: boolean): HudWidgetLayoutItem[] {
  const normalized = Array.isArray(widgets)
    ? widgets.flatMap((widget) => {
      if (isLegacyThemeWidget(widget)) {
        const darkModeDimensions = clampHudWidgetDimensions("dark_mode", 50, typeof widget.heightPx === "number" && Number.isFinite(widget.heightPx) ? widget.heightPx : 50);
        const calmDimensions = clampHudWidgetDimensions("calm", 104, typeof widget.heightPx === "number" && Number.isFinite(widget.heightPx) ? widget.heightPx : 54);
        return [
          { ...defaultWidget("dark_mode"), heightPx: darkModeDimensions.heightPx, widthPx: darkModeDimensions.widthPx },
          { ...defaultWidget("calm"), heightPx: calmDimensions.heightPx, widthPx: calmDimensions.widthPx },
        ];
      }

      const normalizedWidget = normalizeHudWidget(widget);
      return normalizedWidget ? [normalizedWidget] : [];
    })
    : [];

  const deduped: HudWidgetLayoutItem[] = [];
  const seenTypes = new Set<HudWidgetType>();

  for (const widget of normalized) {
    if (seenTypes.has(widget.type)) {
      continue;
    }
    deduped.push(widget);
    seenTypes.add(widget.type);
  }

  const expectedTypes = DEFAULT_HUD_PAGES.find((page) => page.id === pageId)?.widgets.map((widget) => widget.type) ?? [];
  if (deduped.length === 0) {
    return expectedTypes.map((type) => defaultWidget(type));
  }

  if (includeMissingDefaults) {
    for (const type of expectedTypes) {
      if (!seenTypes.has(type)) {
        deduped.push(defaultWidget(type));
        seenTypes.add(type);
      }
    }
  }

  return deduped;
}

function normalizeWorkspaceWidget(value: unknown): HudWorkspaceWidget | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<HudWorkspaceWidget>;
  if (!isHudWidgetType(candidate.type)) {
    return null;
  }

  const fallbackWidget = {
    id: typeof candidate.id === "string" && candidate.id.length > 0 ? candidate.id : `hud-${candidate.type}`,
    size: DEFAULT_WIDGET_SIZES[candidate.type],
    type: candidate.type,
    widthPx: typeof candidate.widthPx === "number" ? candidate.widthPx : undefined,
    heightPx: typeof candidate.heightPx === "number" ? candidate.heightPx : undefined,
  } satisfies HudWidgetLayoutItem;

  return {
    ...createWorkspaceWidget(
      fallbackWidget,
      {
        x: typeof candidate.x === "number" && Number.isFinite(candidate.x) ? candidate.x : 0,
        y: typeof candidate.y === "number" && Number.isFinite(candidate.y) ? candidate.y : 0,
      },
      candidate.isVisible !== false,
    ),
    id: fallbackWidget.id,
  };
}

function normalizeHudWorkspace(
  value: unknown,
  fallbackPages: HudPage[],
  includeMissingDefaults: boolean,
): HudWorkspace {
  const candidate = value && typeof value === "object" ? value as Partial<HudWorkspace> : null;
  const workspaceDimensions = getWorkspaceDimensions(
    candidate?.widthPx,
    candidate?.heightPx,
    { allowDynamicMinimumHeight: true },
  );
  const fallbackWorkspace = buildWorkspaceFromPages(fallbackPages, workspaceDimensions);

  if (!candidate) {
    return fallbackWorkspace;
  }

  const normalized = Array.isArray(candidate.widgets)
    ? candidate.widgets.flatMap((widget) => {
      const normalizedWidget = normalizeWorkspaceWidget(widget);
      return normalizedWidget ? [normalizedWidget] : [];
    })
    : [];

  const deduped: HudWorkspaceWidget[] = [];
  const seenTypes = new Set<HudWidgetType>();

  for (const widget of normalized) {
    if (seenTypes.has(widget.type)) {
      continue;
    }
    deduped.push(widget);
    seenTypes.add(widget.type);
  }

  if (deduped.length === 0) {
    return fallbackWorkspace;
  }

  if (includeMissingDefaults || deduped.length < HUD_WIDGET_TYPES.length) {
    for (const widget of fallbackWorkspace.widgets) {
      if (!seenTypes.has(widget.type)) {
        deduped.push({ ...widget, isVisible: false });
        seenTypes.add(widget.type);
      }
    }
  }

  const stabilizedWidgets = stabilizeWorkspaceWidgets(deduped, workspaceDimensions);
  return {
    heightPx: clampDimension(
      workspaceDimensions.heightPx,
      getHudWorkspaceMinimumHeight(stabilizedWidgets),
      HUD_WORKSPACE_DIMENSION_LIMITS.maxHeight,
    ),
    isWidthUserSized: typeof candidate.isWidthUserSized === "boolean"
      ? candidate.isWidthUserSized
      : candidate.version === HUD_WORKSPACE_SCHEMA_VERSION
        ? false
        : workspaceDimensions.widthPx !== HUD_WORKSPACE_DEFAULT_DIMENSIONS.widthPx,
    version: typeof candidate.version === "number" && Number.isFinite(candidate.version)
      ? Math.max(HUD_WORKSPACE_SCHEMA_VERSION, Math.round(candidate.version))
      : HUD_WORKSPACE_SCHEMA_VERSION,
    widgets: stabilizedWidgets,
    widthPx: workspaceDimensions.widthPx,
  };
}

function normalizeSnapshotId(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value);
  if (rounded < 1 || rounded > HUD_LAYOUT_SNAPSHOT_LIMIT) {
    return null;
  }
  return rounded;
}

function normalizeHudSnapshots(
  value: unknown,
  fallbackPages: HudPage[],
): HudLayoutSnapshot[] {
  const candidateSnapshots = Array.isArray(value) ? value : [];
  const normalizedSnapshots: HudLayoutSnapshot[] = [];
  const seenIds = new Set<number>();

  for (const snapshot of candidateSnapshots) {
    if (!snapshot || typeof snapshot !== "object") {
      continue;
    }
    const candidate = snapshot as Partial<HudLayoutSnapshot> & { workspace?: unknown };
    const snapshotId = normalizeSnapshotId(candidate.id);
    if (snapshotId === null || seenIds.has(snapshotId)) {
      continue;
    }
    normalizedSnapshots.push(createHudSnapshot(
      snapshotId,
      normalizeHudWorkspace(candidate.workspace, fallbackPages, true),
    ));
    seenIds.add(snapshotId);
    if (normalizedSnapshots.length >= HUD_LAYOUT_SNAPSHOT_LIMIT) {
      break;
    }
  }

  if (normalizedSnapshots.length === 0) {
    return [createHudSnapshot(1, buildWorkspaceFromPages(fallbackPages))];
  }

  normalizedSnapshots.sort((left, right) => left.id - right.id);
  return normalizedSnapshots;
}

function resolveActiveSnapshotId(value: unknown, snapshots: HudLayoutSnapshot[]) {
  const preferredId = normalizeSnapshotId(value);
  if (preferredId !== null && snapshots.some((snapshot) => snapshot.id === preferredId)) {
    return preferredId;
  }
  return snapshots[0]?.id ?? 1;
}

export function normalizeHudUiState(value: unknown): HudUiState {
  if (!value || typeof value !== "object") {
    return DEFAULT_HUD_UI_STATE;
  }

  const candidate = value as Partial<HudUiState>;
  const incomingPages = Array.isArray(candidate.hudPages) ? candidate.hudPages : [];
  const includeMissingDefaults = candidate.hudUiVersion !== HUD_UI_SCHEMA_VERSION;

  const hudPages: HudPage[] = HUD_PAGE_IDS.map((pageId) => {
    const source = incomingPages.find((page) => page && typeof page === "object" && isHudPageId((page as Partial<HudPage>).id) && (page as Partial<HudPage>).id === pageId) as Partial<HudPage> | undefined;
    return {
      id: pageId,
      title: typeof source?.title === "string" && source.title.length > 0
        ? source.title
        : (DEFAULT_HUD_PAGES.find((page) => page.id === pageId)?.title ?? pageId),
      widgets: normalizePageWidgets(pageId, source?.widgets, includeMissingDefaults),
    };
  });

  const normalizedWorkspace = normalizeHudWorkspace((candidate as Partial<HudUiState> & { hudWorkspace?: unknown }).hudWorkspace, hudPages, includeMissingDefaults);
  const normalizedSnapshots = normalizeHudSnapshots(
    (candidate as Partial<HudUiState> & { hudSnapshots?: unknown }).hudSnapshots,
    hudPages,
  );
  const hasSnapshotPayload = Array.isArray((candidate as Partial<HudUiState> & { hudSnapshots?: unknown }).hudSnapshots);
  const migratedSnapshots = hasSnapshotPayload
    ? normalizedSnapshots
    : [createHudSnapshot(1, normalizedWorkspace)];
  const activeSnapshotId = resolveActiveSnapshotId(candidate.activeSnapshotId, migratedSnapshots);
  const activeSnapshot = migratedSnapshots.find((snapshot) => snapshot.id === activeSnapshotId) ?? migratedSnapshots[0];

  return {
    activeHudPageId: isHudPageId(candidate.activeHudPageId) ? candidate.activeHudPageId : DEFAULT_HUD_UI_STATE.activeHudPageId,
    activeSnapshotId,
    hudWorkspace: activeSnapshot ? cloneHudWorkspace(activeSnapshot.workspace) : cloneHudWorkspace(DEFAULT_HUD_UI_STATE.hudWorkspace),
    hudSnapshots: migratedSnapshots.map((snapshot) => createHudSnapshot(snapshot.id, snapshot.workspace)),
    hudPages,
    isHudCollapsed: candidate.isHudCollapsed === true,
    hudUiVersion: HUD_UI_SCHEMA_VERSION,
    isHudEditMode: candidate.isHudEditMode === true,
    selectedHudWidgetId: typeof candidate.selectedHudWidgetId === "string" ? candidate.selectedHudWidgetId : null,
  };
}

export function createDefaultHudUiState(): HudUiState {
  return normalizeHudUiState(DEFAULT_HUD_UI_STATE);
}

export function getHudSnapshotIds(state: Pick<HudUiState, "hudSnapshots">) {
  return state.hudSnapshots.map((snapshot) => snapshot.id);
}

export function updateActiveHudWorkspace(
  state: HudUiState,
  updater: (workspace: HudWorkspace) => HudWorkspace,
): HudUiState {
  const nextWorkspace = cloneHudWorkspace(updater(cloneHudWorkspace(state.hudWorkspace)));
  return {
    ...state,
    hudWorkspace: nextWorkspace,
    hudSnapshots: state.hudSnapshots.map((snapshot) => snapshot.id === state.activeSnapshotId
      ? createHudSnapshot(snapshot.id, nextWorkspace)
      : createHudSnapshot(snapshot.id, snapshot.workspace)),
  };
}

export function saveActiveHudSnapshot(state: HudUiState): HudUiState {
  return updateActiveHudWorkspace(state, (workspace) => workspace);
}

export function addHudSnapshot(state: HudUiState): HudUiState {
  if (state.hudSnapshots.length >= HUD_LAYOUT_SNAPSHOT_LIMIT) {
    return state;
  }

  const nextSnapshotId = Math.max(0, ...state.hudSnapshots.map((snapshot) => snapshot.id)) + 1;
  if (nextSnapshotId > HUD_LAYOUT_SNAPSHOT_LIMIT) {
    return state;
  }

  const nextWorkspace = cloneHudWorkspace(state.hudWorkspace);
  return {
    ...state,
    activeSnapshotId: nextSnapshotId,
    hudWorkspace: nextWorkspace,
    hudSnapshots: [
      ...state.hudSnapshots.map((snapshot) => createHudSnapshot(snapshot.id, snapshot.workspace)),
      createHudSnapshot(nextSnapshotId, nextWorkspace),
    ],
  };
}

export function cycleHudSnapshot(state: HudUiState): HudUiState {
  if (state.hudSnapshots.length <= 1) {
    return state;
  }

  const snapshotIds = getHudSnapshotIds(state);
  const currentIndex = snapshotIds.indexOf(state.activeSnapshotId);
  const nextSnapshotId = snapshotIds[(currentIndex + 1) % snapshotIds.length] ?? snapshotIds[0];
  const nextSnapshot = state.hudSnapshots.find((snapshot) => snapshot.id === nextSnapshotId);
  if (!nextSnapshot) {
    return state;
  }

  return {
    ...state,
    activeSnapshotId: nextSnapshotId,
    hudWorkspace: cloneHudWorkspace(nextSnapshot.workspace),
    hudSnapshots: state.hudSnapshots.map((snapshot) => createHudSnapshot(snapshot.id, snapshot.workspace)),
    selectedHudWidgetId: state.selectedHudWidgetId && nextSnapshot.workspace.widgets.some((widget) => widget.id === state.selectedHudWidgetId)
      ? state.selectedHudWidgetId
      : null,
  };
}

export function resetActiveHudSnapshot(state: HudUiState): HudUiState {
  return updateActiveHudWorkspace(state, () => DEFAULT_HUD_UI_STATE.hudWorkspace);
}
