"use client";

import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { TaskGridWidgetShellComponent } from "./task-grid-widgets";

type GridItem = {
  h: number;
  id: string;
  type: string;
  w: number;
  x: number;
  y: number;
};

type TaskGridViewProps = {
  currentColumns: number;
  draggedWidgetId: string | null;
  gridAutoRowHeight: number;
  gridLayout: GridItem[];
  isEditMode: boolean;
  labelsByWidgetType: Record<string, string>;
  maxColumns: number;
  maxDisplayRows: number;
  onAddWidget: (widgetType: string) => void;
  onMoveWidget: (widgetId: string, direction: "up" | "down") => void;
  onRemoveWidget: (widgetId: string) => void;
  onReorderWidget: (targetWidgetId: string) => void;
  onResetLayout: () => void;
  onResizeWidget: (widgetId: string, nextWidth: number, nextHeight: number) => void;
  onSelectWidget: (widgetId: string | null) => void;
  onSetDraggedWidget: (widgetId: string | null) => void;
  onToggleEditMode: () => void;
  renderWidget: (widgetType: string) => ReactNode;
  selectedWidgetId: string | null;
};

const EMPTY_GRID_NOTE = "Turn on edit mode and add widgets back in any order you want.";

function getTaskGridWidthPresets(columns: number) {
  if (columns <= 1) {
    return [{ label: "1 col", width: 1 }];
  }

  if (columns === 2) {
    return [
      { label: "1 col", width: 1 },
      { label: "2 col", width: 2 },
    ];
  }

  return [
    { label: "1 col", width: 1 },
    { label: "2 col", width: 2 },
    { label: "3 col", width: 3 },
    { label: "4 col", width: 4 },
  ].filter((preset) => preset.width <= columns);
}

function getTaskGridHeightPresets() {
  return [
    { label: "Small", span: 6 },
    { label: "Medium", span: 8 },
    { label: "Large", span: 10 },
    { label: "XL", span: 12 },
  ];
}

export function TaskGridViewComponent({
  currentColumns,
  draggedWidgetId,
  gridAutoRowHeight,
  gridLayout,
  isEditMode,
  labelsByWidgetType,
  maxColumns,
  maxDisplayRows,
  onAddWidget,
  onMoveWidget,
  onRemoveWidget,
  onReorderWidget,
  onResetLayout,
  onResizeWidget,
  onSelectWidget,
  onSetDraggedWidget,
  onToggleEditMode,
  renderWidget,
  selectedWidgetId,
}: TaskGridViewProps) {
  const widthPresets = getTaskGridWidthPresets(currentColumns);
  const heightPresets = getTaskGridHeightPresets();
  const widgetTypes = Object.keys(labelsByWidgetType);
  const presentWidgetTypes = new Set(gridLayout.map((item) => item.type));
  const hiddenWidgetCount = widgetTypes.length - presentWidgetTypes.size;

  return (
    <section className="mt-7 space-y-4">
      <div className="rounded-[1.7rem] border p-4 border-[#ece8f8] bg-white shadow-[0_16px_40px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white">Grid View</h2>
            <p className="mt-1 text-sm text-[#78829c] dark:text-white/55">A modular tasks layout that keeps mobile in sync with desktop.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isEditMode ? (
              <button className="ui-pill-button-danger-light" onClick={onResetLayout} type="button">Reset Layout</button>
            ) : null}
            <button className={isEditMode ? "ui-pill-button-strong-light" : "ui-pill-button-light"} onClick={onToggleEditMode} type="button">{isEditMode ? "Done Editing" : "Edit Layout"}</button>
          </div>
        </div>

        {isEditMode ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full px-3 py-2 text-xs font-semibold bg-[#eef2ff] text-[#5363d3] dark:bg-[#1b2340] dark:text-[#a9b6ff]">{currentColumns} active column{currentColumns === 1 ? "" : "s"}</span>
              <span className="rounded-full px-3 py-2 text-xs font-semibold bg-[#f3efff] text-[#6f57f6] dark:bg-[#221a42] dark:text-[#cabfff]">{gridLayout.length} widget{gridLayout.length === 1 ? "" : "s"} on grid</span>
              <span className="rounded-full px-3 py-2 text-xs font-semibold bg-[#f7f7fb] text-[#68738c] dark:bg-white/8 dark:text-white/65">{hiddenWidgetCount} hidden</span>
            </div>
            <div className="rounded-[1.25rem] px-4 py-3 text-sm bg-[#faf7ff] text-[#6b738f] dark:bg-white/[0.04] dark:text-white/65">Tap a widget to select it. Each widget also shows a visible delete button while editing. Drag to reorder on desktop, or use move controls anywhere. On mobile, width presets map to the current column count automatically.</div>

            <div className="rounded-[1.25rem] border p-4 border-[#e9e1ff] bg-[#fcfbff] dark:border-white/10 dark:bg-white/[0.04]">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[#7a63f7] dark:text-[#c9bbff]">Add Widgets</p>
              <p className="mt-1 text-sm text-[#6b738f] dark:text-white/60">Turn sections on and off here. This list always shows every widget, whether it is currently on the grid or not.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {widgetTypes.map((widgetType) => {
                  const isPresent = presentWidgetTypes.has(widgetType);
                  const existingWidget = gridLayout.find((item) => item.type === widgetType) ?? null;

                  return (
                    <div className="flex items-center justify-between gap-3 rounded-[1rem] px-3 py-3 bg-white shadow-[0_8px_20px_rgba(81,61,168,0.05)] dark:bg-white/[0.04]" key={widgetType}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#27304c] dark:text-white">{labelsByWidgetType[widgetType]}</p>
                        <p className="mt-0.5 text-xs text-[#8a93aa] dark:text-white/45">{isPresent ? "On grid" : "Hidden"}</p>
                      </div>
                      {isPresent && existingWidget ? (
                        <button className="ui-pill-button-danger-light shrink-0" onClick={() => onRemoveWidget(existingWidget.id)} type="button">Remove</button>
                      ) : (
                        <button className="ui-pill-button-strong-light shrink-0" onClick={() => onAddWidget(widgetType)} type="button"><Plus className="mr-1 inline h-3.5 w-3.5" />Add</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedWidgetId ? (
              <div className="rounded-[1.25rem] border border-dashed px-4 py-4 text-sm border-[#ddd6f9] bg-[#faf8ff] text-[#7b84a0] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55">{labelsByWidgetType[gridLayout.find((item) => item.id === selectedWidgetId)?.type ?? ""] ?? "Widget"} is selected. Its resize and row controls now appear directly on top of that card.</div>
            ) : (
              <div className="rounded-[1.25rem] border border-dashed px-4 py-4 text-sm border-[#ddd6f9] bg-[#faf8ff] text-[#7b84a0] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55">Tap any widget card below to resize it, move it, or remove it.</div>
            )}
          </div>
        ) : null}
      </div>

      {gridLayout.length === 0 ? (
        <div className="rounded-[1.8rem] border border-dashed p-8 text-center border-[#dcd2ff] bg-[#faf8ff] text-[#6b738f] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/65">
          <p className="text-lg font-bold">Your grid is empty.</p>
          <p className="mt-2 text-sm">{EMPTY_GRID_NOTE}</p>
        </div>
      ) : null}

      <div className="grid gap-4 md:gap-5" style={{ gridAutoRows: `${gridAutoRowHeight}px`, gridTemplateColumns: `repeat(${currentColumns}, minmax(0, 1fr))` }}>
        {gridLayout.map((item) => (
          <TaskGridWidgetShellComponent
            currentColumns={currentColumns}
            draggedWidgetId={draggedWidgetId}
            heightPresets={heightPresets}
            isEditMode={isEditMode}
            item={item}
            key={item.id}
            maxColumns={maxColumns}
            maxDisplayRows={maxDisplayRows}
            onDeselect={() => onSelectWidget(null)}
            onDragEnd={() => onSetDraggedWidget(null)}
            onDragStart={() => onSetDraggedWidget(item.id)}
            onDrop={() => onReorderWidget(item.id)}
            onMove={onMoveWidget}
            onRemove={() => onRemoveWidget(item.id)}
            onResize={onResizeWidget}
            onSelect={() => onSelectWidget(item.id)}
            selected={selectedWidgetId === item.id}
            widgetLabel={labelsByWidgetType[item.type]}
            widthPresets={widthPresets}
          >
            {renderWidget(item.type)}
          </TaskGridWidgetShellComponent>
        ))}
      </div>
    </section>
  );
}
