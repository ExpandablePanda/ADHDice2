export type TaskGridLayoutItem<TWidgetType extends string> = {
  h: number;
  id: string;
  type: TWidgetType;
  w: number;
  x: number;
  y: number;
};

export function normalizeTaskGridLayout<TWidgetType extends string>(
  layout: TaskGridLayoutItem<TWidgetType>[],
  isWidgetType: (value: string) => value is TWidgetType,
  maxColumns: number,
  maxDisplayRows: number,
) {
  const sanitized = layout
    .filter((item) => isWidgetType(item.type))
    .map((item) => ({
      ...item,
      h: Math.max(4, Math.min(maxDisplayRows * 2, Number.isFinite(item.h) ? Math.round(item.h) : 4)),
      w: Math.max(1, Math.min(maxColumns, Number.isFinite(item.w) ? Math.round(item.w) : 1)),
    }));

  const result: TaskGridLayoutItem<TWidgetType>[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  for (const item of sanitized) {
    if (cursorX + item.w > maxColumns) {
      cursorY += rowHeight;
      cursorX = 0;
      rowHeight = 0;
    }

    const normalizedItem = {
      ...item,
      x: cursorX,
      y: cursorY,
    };
    result.push(normalizedItem);

    cursorX += item.w;
    rowHeight = Math.max(rowHeight, item.h);

    if (cursorX >= maxColumns) {
      cursorY += rowHeight;
      cursorX = 0;
      rowHeight = 0;
    }
  }

  return result;
}

export function buildTaskGridWidget<TWidgetType extends string>(
  widgetType: TWidgetType,
  nextId: string,
): TaskGridLayoutItem<TWidgetType> {
  const defaultSize = widgetType === "urgent" || widgetType === "due_today" || widgetType === "completed" || widgetType === "import"
    ? { h: 8, w: 2 }
    : widgetType === "focus_stats"
      ? { h: 6, w: 1 }
      : { h: 6, w: 1 };

  return {
    h: defaultSize.h,
    id: nextId,
    type: widgetType,
    w: defaultSize.w,
    x: 0,
    y: 0,
  };
}

export function reorderTaskGridItems<TWidgetType extends string>(
  layout: TaskGridLayoutItem<TWidgetType>[],
  sourceId: string,
  targetId: string,
  isWidgetType: (value: string) => value is TWidgetType,
  maxColumns: number,
  maxDisplayRows: number,
) {
  const sourceIndex = layout.findIndex((item) => item.id === sourceId);
  const targetIndex = layout.findIndex((item) => item.id === targetId);

  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return layout;
  }

  const next = [...layout];
  const [sourceItem] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, sourceItem);
  return normalizeTaskGridLayout(next, isWidgetType, maxColumns, maxDisplayRows);
}

export function moveTaskGridItem<TWidgetType extends string>(
  layout: TaskGridLayoutItem<TWidgetType>[],
  widgetId: string,
  direction: "up" | "down",
  isWidgetType: (value: string) => value is TWidgetType,
  maxColumns: number,
  maxDisplayRows: number,
) {
  const currentIndex = layout.findIndex((item) => item.id === widgetId);
  if (currentIndex === -1) {
    return layout;
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= layout.length) {
    return layout;
  }

  const next = [...layout];
  const [item] = next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, item);
  return normalizeTaskGridLayout(next, isWidgetType, maxColumns, maxDisplayRows);
}

export function getMissingTaskGridWidgetTypes<TWidgetType extends string>(
  layout: TaskGridLayoutItem<TWidgetType>[],
  allTypes: TWidgetType[],
) {
  const usedTypes = new Set(layout.map((item) => item.type));
  return allTypes.filter((type) => !usedTypes.has(type));
}

export function getTaskGridWidthPresets(currentColumns: number) {
  return [
    { label: "1 Col", width: 1 },
    ...(currentColumns >= 2 ? [{ label: "2 Cols", width: 2 }] : []),
    ...(currentColumns >= 3 ? [{ label: "3 Cols", width: 3 }] : []),
    ...(currentColumns >= 4 ? [{ label: "4 Cols", width: 4 }] : []),
  ];
}

export function getTaskGridHeightPresets() {
  return [
    { label: "2 Rows", span: 4 },
    { label: "4 Rows", span: 8 },
    { label: "6 Rows", span: 12 },
    { label: "8 Rows", span: 16 },
    { label: "10 Rows", span: 20 },
  ];
}

export function getDisplayRowsFromSpan(span: number) {
  return Math.max(1, Math.round(span / 2));
}

export function getSpanFromDisplayRows(rows: number, maxDisplayRows: number) {
  return Math.max(2, Math.min(maxDisplayRows * 2, rows * 2));
}

export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shiftDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}
