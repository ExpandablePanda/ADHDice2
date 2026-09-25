"use client";

import { ArrowDown, ArrowUp, Copy, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { AdhdChip, AdhdIconButton } from "@/components/ui-system";
import { TaskTypeIcon } from "@/components/ui/lucide-icon";
import { getPageShellDragAutoScrollDelta } from "@/lib/page-shell-layout";
import { StyleLabBuilderColorControl } from "./style-lab-builder-color-control";
import {
  searchStyleLabBuilderLibrary,
  STYLE_LAB_BUILDER_LIBRARY_CATEGORIES,
  type StyleLabBuilderLibraryCategory,
  type StyleLabBuilderLibraryEntry,
} from "./style-lab-builder-library";
import {
  applyStyleLabBuilderDrop,
  canStyleLabBuilderMoveNode,
  getStyleLabBuilderDescendantIds,
  getStyleLabBuilderDropContainer,
  getStyleLabBuilderGridDropTarget,
  getStyleLabBuilderLinearDropTarget,
  type StyleLabBuilderDragContainerGeometry,
  type StyleLabBuilderDragRect,
} from "./style-lab-builder-drag";
import {
  getStyleLabBackgroundColorCssValue,
  getStyleLabBuilderFontOption,
  getStyleLabProperty,
  getStyleLabTextColorCssValue,
  STYLE_LAB_BUILDER_BORDER_OPTIONS,
  STYLE_LAB_BUILDER_CANVAS_WIDTHS,
  STYLE_LAB_BUILDER_CHIP_TONES,
  STYLE_LAB_BUILDER_DIVIDER_ORIENTATIONS,
  STYLE_LAB_BUILDER_DIVIDER_WIDTHS,
  STYLE_LAB_BUILDER_GRID_COLUMNS,
  STYLE_LAB_BUILDER_ICON_BUTTON_SIZES,
  STYLE_LAB_BUILDER_ICON_BUTTON_TONES,
  STYLE_LAB_BUILDER_LAYOUTS,
  STYLE_LAB_BUILDER_RADIUS_OPTIONS,
  STYLE_LAB_BUILDER_SHADOW_OPTIONS,
  STYLE_LAB_BUILDER_WEB_FONT_STYLESHEET,
  STYLE_LAB_BUILDER_FONT_OPTIONS,
  STYLE_LAB_ICON_OPTIONS,
  type StyleLabBuilderCanvasWidth,
} from "./style-lab-registry";
import { buildStyleLabModuleSpec, buildStyleLabReferenceCode } from "./style-lab-builder-export";
import {
  addStyleLabBuilderNode,
  createDefaultStyleLabBuilderDraft,
  deleteStyleLabBuilderNode,
  duplicateStyleLabBuilderNode,
  getStyleLabBuilderChildren,
  getStyleLabBuilderNode,
  insertStyleLabBuilderDraft,
  isStyleLabBuilderBlank,
  resizeStyleLabBuilderDimensions,
  moveStyleLabBuilderNode,
  normalizeStyleLabBuilderDraft,
  readStyleLabBuilderDraft,
  STYLE_LAB_BUILDER_ROOT_ID,
  type StyleLabBuilderResizeAxis,
  type StyleLabBuilderNodeType,
  updateStyleLabBuilderNode,
  writeStyleLabBuilderDraft,
  type StyleLabBuilderContainerNode,
  type StyleLabBuilderDraft,
  type StyleLabBuilderNode,
  type StyleLabBuilderTextStyles,
} from "./style-lab-builder-model";

const SELECT_CLASS = "h-8 min-w-0 flex-1 rounded-lg border border-[#e6e0f4] bg-white px-2 text-xs text-[#3f3856] outline-none focus:border-[#c9bcff] dark:border-white/10 dark:bg-white/[0.06] dark:text-white";
const INPUT_CLASS = "h-8 min-w-0 flex-1 rounded-lg border border-[#e6e0f4] bg-white px-2 text-xs text-[#3f3856] outline-none focus:border-[#c9bcff] dark:border-white/10 dark:bg-white/[0.06] dark:text-white";
const SUBPANEL_CLASS = "rounded-[1.25rem] border border-[#e4dcfb] bg-[#fbfaff] px-4 py-4 dark:border-white/10 dark:bg-white/[0.04]";

type BuilderOption = { label: string; value: string };

function options(values: readonly (string | number)[]): BuilderOption[] {
  return values.map((value) => ({ label: String(value), value: String(value) }));
}

function labeledOptions(values: readonly { label: string; value: string }[]): BuilderOption[] {
  return values.map(({ label, value }) => ({ label, value }));
}

function BuilderSelect({ label, onChange, options: optionValues, value }: { label: string; onChange: (value: string) => void; options: readonly BuilderOption[]; value: string }) {
  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="w-24 shrink-0 text-[11px] font-medium text-[#6f6785] dark:text-white/60">{label}</span>
      <select aria-label={label} className={SELECT_CLASS} onChange={(event) => onChange(event.target.value)} value={value}>
        {optionValues.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function BuilderFontSelect({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="w-24 shrink-0 text-[11px] font-medium text-[#6f6785] dark:text-white/60">Font family</span>
      <select aria-label="Font family" className={SELECT_CLASS} onChange={(event) => onChange(event.target.value)} value={value}>
        {STYLE_LAB_BUILDER_FONT_OPTIONS.map((option) => <option key={option.id} style={{ fontFamily: option.cssFamily }} value={option.id}>{option.label}</option>)}
      </select>
    </label>
  );
}

function BuilderTextInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="w-24 shrink-0 text-[11px] font-medium text-[#6f6785] dark:text-white/60">{label}</span>
      <input aria-label={label} className={INPUT_CLASS} onChange={(event) => onChange(event.target.value)} type="text" value={value} />
    </label>
  );
}

function BuilderDimensionInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  const [draft, setDraft] = useState(value);
  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="w-24 shrink-0 text-[11px] font-medium text-[#6f6785] dark:text-white/60">{label}</span>
      <input aria-label={label} className={INPUT_CLASS} onBlur={() => onChange(draft)} onChange={(event) => setDraft(event.target.value)} type="text" value={draft} />
      <span className="shrink-0 text-[10px] text-[#8d82a7] dark:text-white/45">px / approved</span>
    </label>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8d82b6] dark:text-white/45">{children}</p>;
}

function styleLabRadiusCss(value: StyleLabBuilderContainerNode["styles"]["radius"]): string {
  return STYLE_LAB_BUILDER_RADIUS_OPTIONS.find((option) => option.value === value)?.cssValue ?? "0";
}

function styleLabBorderCss(value: StyleLabBuilderContainerNode["styles"]["border"]): string {
  return STYLE_LAB_BUILDER_BORDER_OPTIONS.find((option) => option.value === value)?.cssValue ?? "none";
}

function styleLabShadowCss(value: StyleLabBuilderContainerNode["styles"]["shadow"]): string {
  return STYLE_LAB_BUILDER_SHADOW_OPTIONS.find((option) => option.value === value)?.cssValue ?? "none";
}

function textStyle(styles: StyleLabBuilderTextStyles): CSSProperties {
  return {
    color: getStyleLabTextColorCssValue(styles.textColor),
    fontFamily: getStyleLabBuilderFontOption(styles.fontFamily).cssFamily,
    fontSize: styles.fontSize,
    fontWeight: styles.fontWeight,
    letterSpacing: styles.letterSpacing,
    lineHeight: styles.lineHeight,
    textAlign: styles.textAlign,
  };
}

function containerStyle(node: StyleLabBuilderContainerNode): CSSProperties {
  const { styles } = node;
  return {
    alignItems: styles.alignItems === "start" ? "flex-start" : styles.alignItems === "end" ? "flex-end" : styles.alignItems,
    background: getStyleLabBackgroundColorCssValue(styles.backgroundColor),
    border: styleLabBorderCss(styles.border),
    borderRadius: styleLabRadiusCss(styles.radius),
    boxShadow: styleLabShadowCss(styles.shadow),
    display: styles.layout === "grid" ? "grid" : "flex",
    flexDirection: styles.layout === "grid" ? undefined : styles.layout,
    gap: styles.gap,
    gridTemplateColumns: styles.layout === "grid" ? `repeat(${styles.gridColumns}, minmax(0, 1fr))` : undefined,
    justifyContent: styles.justifyContent,
    maxWidth: styles.maxWidth,
    height: styles.height,
    minWidth: styles.minWidth,
    paddingBottom: styles.paddingY,
    paddingLeft: styles.paddingX,
    paddingRight: styles.paddingX,
    paddingTop: styles.paddingY,
    width: styles.width,
    position: "relative",
  };
}

function selectedPreviewStyle(selected: boolean): CSSProperties {
  return selected ? { outline: "2px solid var(--accent)", outlineOffset: "2px" } : {};
}

type BuilderPreviewProps = {
  draft: StyleLabBuilderDraft;
  draggingId: string | null;
  editingNodeId: string | null;
  editingValue: string;
  node: StyleLabBuilderNode;
  onBeginTextEdit: (id: string) => void;
  onCancelTextEdit: () => void;
  onCommitTextEdit: () => void;
  onInlineValueChange: (value: string) => void;
  onResizeCancel: (event: PointerEvent<HTMLButtonElement>) => void;
  onResizeEnd: (event: PointerEvent<HTMLButtonElement>) => void;
  onResizeLostCapture: (event: PointerEvent<HTMLButtonElement>) => void;
  onResizeMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onResizeStart: (event: PointerEvent<HTMLButtonElement>, nodeId: string, axis: StyleLabBuilderResizeAxis) => void;
  onNodePointerCancel: (event: PointerEvent<HTMLElement>) => void;
  onNodePointerDown: (event: PointerEvent<HTMLElement>, nodeId: string) => void;
  onNodePointerMove: (event: PointerEvent<HTMLElement>) => void;
  onNodePointerUp: (event: PointerEvent<HTMLElement>) => void;
  onNodeLostPointerCapture: (event: PointerEvent<HTMLElement>) => void;
  onSelect: (id: string) => void;
  shouldSuppressClick: () => boolean;
  selectedId: string;
};

function BuilderPreviewNode({
  draft,
  draggingId,
  editingNodeId,
  editingValue,
  node,
  onBeginTextEdit,
  onCancelTextEdit,
  onCommitTextEdit,
  onInlineValueChange,
  onResizeCancel,
  onResizeEnd,
  onResizeLostCapture,
  onResizeMove,
  onResizeStart,
  onNodePointerCancel,
  onNodePointerDown,
  onNodePointerMove,
  onNodePointerUp,
  onNodeLostPointerCapture,
  onSelect,
  shouldSuppressClick,
  selectedId,
}: BuilderPreviewProps) {
  const selected = node.id === selectedId;
  const dragging = node.id === draggingId;
  const visuallySelected = selected || dragging;
  const movable = node.id !== STYLE_LAB_BUILDER_ROOT_ID;
  const nodePointerDown = movable ? (event: PointerEvent<HTMLElement>) => onNodePointerDown(event, node.id) : undefined;
  const nodePointerMove = movable ? onNodePointerMove : undefined;
  const nodePointerUp = movable ? onNodePointerUp : undefined;
  const nodePointerCancel = movable ? onNodePointerCancel : undefined;
  const nodeLostPointerCapture = movable ? onNodeLostPointerCapture : undefined;
  const select = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (shouldSuppressClick()) return;
    onSelect(node.id);
  };
  const children = node.type === "container"
    ? getStyleLabBuilderChildren(draft, node.id).map((child) => <BuilderPreviewNode draft={draft} draggingId={draggingId} editingNodeId={editingNodeId} editingValue={editingValue} key={child.id} node={child} onBeginTextEdit={onBeginTextEdit} onCancelTextEdit={onCancelTextEdit} onCommitTextEdit={onCommitTextEdit} onInlineValueChange={onInlineValueChange} onNodeLostPointerCapture={onNodeLostPointerCapture} onNodePointerCancel={onNodePointerCancel} onNodePointerDown={onNodePointerDown} onNodePointerMove={onNodePointerMove} onNodePointerUp={onNodePointerUp} onResizeCancel={onResizeCancel} onResizeEnd={onResizeEnd} onResizeLostCapture={onResizeLostCapture} onResizeMove={onResizeMove} onResizeStart={onResizeStart} onSelect={onSelect} shouldSuppressClick={shouldSuppressClick} selectedId={selectedId} />)
    : null;

  const inlineInput = (ariaLabel: string) => (
    <input
      aria-label={ariaLabel}
      autoFocus
      className="min-w-[2rem] border-0 bg-transparent p-0 text-inherit outline-none focus:ring-2 focus:ring-[#b9a9ff]"
      data-builder-inline-editor
      onBlur={onCommitTextEdit}
      onChange={(event) => onInlineValueChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onLostPointerCapture={(event) => event.stopPropagation()}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          onCommitTextEdit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onCancelTextEdit();
        }
      }}
      onPointerCancel={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      type="text"
      value={editingValue}
    />
  );

  if (node.type === "container") {
    const handleProps = (axis: StyleLabBuilderResizeAxis, label: string, className: string) => ({
      "aria-label": label,
      className,
      onClick: (event: MouseEvent<HTMLButtonElement>) => event.stopPropagation(),
      onLostPointerCapture: onResizeLostCapture,
      onPointerCancel: onResizeCancel,
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => onResizeStart(event, node.id, axis),
      onPointerMove: onResizeMove,
      onPointerUp: onResizeEnd,
      type: "button" as const,
    });
    return (
      <div aria-label={`Select ${node.id === STYLE_LAB_BUILDER_ROOT_ID ? "root container" : "container"}`} className={dragging ? "cursor-grabbing select-none" : movable ? "cursor-grab" : "cursor-default"} data-builder-node-id={node.id} onClick={select} onLostPointerCapture={nodeLostPointerCapture} onPointerCancel={nodePointerCancel} onPointerDown={nodePointerDown} onPointerMove={nodePointerMove} onPointerUp={nodePointerUp} role="group" style={{ ...containerStyle(node), ...selectedPreviewStyle(visuallySelected), ...(dragging ? { opacity: 0.52, transform: "translateY(-1px)" } : {}) }}>
        {children}
        {selected ? (
          <>
            <button {...handleProps("width", "Resize container width", "absolute right-[-0.25rem] top-1/2 z-10 h-10 w-2 -translate-y-1/2 cursor-ew-resize select-none touch-none rounded-full bg-[#8f7cf8]/70 opacity-80 transition hover:opacity-100")} />
            <button {...handleProps("height", "Resize container height", "absolute bottom-[-0.25rem] left-1/2 z-10 h-2 w-10 -translate-x-1/2 cursor-ns-resize select-none touch-none rounded-full bg-[#8f7cf8]/70 opacity-80 transition hover:opacity-100")} />
            <button {...handleProps("both", "Resize container width and height", "absolute bottom-[-0.3rem] right-[-0.3rem] z-10 h-4 w-4 cursor-nwse-resize select-none touch-none rounded-sm border-2 border-white bg-[#6f57f6] shadow-sm dark:border-[#17132a]")} />
          </>
        ) : null}
      </div>
    );
  }
  if (node.type === "text") {
    const editing = editingNodeId === node.id;
    return editing
      ? <span className={dragging ? "cursor-grabbing select-none" : "cursor-grab"} data-builder-node-id={node.id} onClick={select} onLostPointerCapture={nodeLostPointerCapture} onPointerCancel={nodePointerCancel} onPointerDown={nodePointerDown} onPointerMove={nodePointerMove} onPointerUp={nodePointerUp} style={{ ...textStyle(node.styles), ...selectedPreviewStyle(visuallySelected), ...(dragging ? { opacity: 0.52, transform: "translateY(-1px)" } : {}) }}>{inlineInput(`Edit ${nodeTitle(node)}`)}</span>
      : <span className={dragging ? "cursor-grabbing select-none" : "cursor-grab"} data-builder-node-id={node.id} onClick={select} onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); onBeginTextEdit(node.id); }} onLostPointerCapture={nodeLostPointerCapture} onPointerCancel={nodePointerCancel} onPointerDown={nodePointerDown} onPointerMove={nodePointerMove} onPointerUp={nodePointerUp} style={{ ...textStyle(node.styles), ...selectedPreviewStyle(visuallySelected), ...(dragging ? { opacity: 0.52, transform: "translateY(-1px)" } : {}) }}>{node.text}</span>;
  }
  if (node.type === "chip") {
    const icon = node.styles.iconName ? <TaskTypeIcon aria-hidden="true" className="h-3.5 w-3.5" iconKey={node.styles.iconName} /> : undefined;
    return <AdhdChip className={dragging ? "cursor-grabbing select-none" : "cursor-grab"} data-builder-node-id={node.id} icon={icon} iconName={node.styles.iconName ?? undefined} onClick={select} onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); onBeginTextEdit(node.id); }} onLostPointerCapture={nodeLostPointerCapture} onPointerCancel={nodePointerCancel} onPointerDown={nodePointerDown} onPointerMove={nodePointerMove} onPointerUp={nodePointerUp} selected={node.styles.selected} style={{ ...textStyle(node.styles), ...selectedPreviewStyle(visuallySelected), ...(dragging ? { opacity: 0.52, transform: "translateY(-1px)" } : {}) }} tone={node.styles.tone} type="button">{editingNodeId === node.id ? inlineInput("Edit Chip label") : node.text}</AdhdChip>;
  }
  if (node.type === "icon-button") {
    return <AdhdIconButton aria-label={node.ariaLabel} className={dragging ? "cursor-grabbing select-none" : "cursor-grab"} data-builder-node-id={node.id} onClick={select} onLostPointerCapture={nodeLostPointerCapture} onPointerCancel={nodePointerCancel} onPointerDown={nodePointerDown} onPointerMove={nodePointerMove} onPointerUp={nodePointerUp} size={node.styles.size} style={{ ...selectedPreviewStyle(visuallySelected), ...(dragging ? { opacity: 0.52, transform: "translateY(-1px)" } : {}) }} tone={node.styles.tone} type="button"><TaskTypeIcon aria-hidden="true" iconKey={node.styles.iconName} /></AdhdIconButton>;
  }
  return <div aria-label="Select divider" className={dragging ? "cursor-grabbing select-none" : "cursor-grab"} data-builder-node-id={node.id} onClick={select} onLostPointerCapture={nodeLostPointerCapture} onPointerCancel={nodePointerCancel} onPointerDown={nodePointerDown} onPointerMove={nodePointerMove} onPointerUp={nodePointerUp} role="separator" style={{ background: getStyleLabTextColorCssValue(node.styles.color), height: node.styles.orientation === "horizontal" ? "1px" : node.styles.width, width: node.styles.orientation === "horizontal" ? node.styles.width : "1px", ...selectedPreviewStyle(visuallySelected), ...(dragging ? { opacity: 0.52, transform: "translateY(-1px)" } : {}) }} />;
}

function nodeTitle(node: StyleLabBuilderNode): string {
  if (node.id === STYLE_LAB_BUILDER_ROOT_ID) return "Root Container";
  if (node.type === "text" || node.type === "chip") return `${node.type === "text" ? "Text" : "Chip"} — ${node.text || "(empty)"}`;
  if (node.type === "icon-button") return `Icon Button — ${node.ariaLabel}`;
  return node.type === "container" ? "Container" : "Divider";
}

function BuilderTreeNode({ depth, draft, node, onSelect, selectedId }: { depth: number; draft: StyleLabBuilderDraft; node: StyleLabBuilderNode; onSelect: (id: string) => void; selectedId: string }) {
  const selected = node.id === selectedId;
  return (
    <>
      <button
        aria-current={selected ? "true" : undefined}
        className={`flex w-full min-w-0 items-center rounded-md px-2 py-1.5 text-left text-[11px] transition ${selected ? "bg-[#efe9ff] font-semibold text-[#5d4bb6] dark:bg-white/10 dark:text-[#ddd4ff]" : "text-[#655d7e] hover:bg-[#f4f0ff] dark:text-white/70 dark:hover:bg-white/[0.05]"}`}
        onClick={() => onSelect(node.id)}
        style={{ paddingLeft: `${0.5 + depth * 0.9}rem` }}
        type="button"
      >
        <span className="min-w-0 flex-1 truncate">{nodeTitle(node)}</span>
        <span className="ml-2 shrink-0 text-[9px] text-[#a098b7] dark:text-white/35">{node.type}</span>
      </button>
      {node.type === "container" ? getStyleLabBuilderChildren(draft, node.id).map((child) => <BuilderTreeNode depth={depth + 1} draft={draft} key={child.id} node={child} onSelect={onSelect} selectedId={selectedId} />) : null}
    </>
  );
}

function BuilderColorField({ kind, label, onChange, value }: { kind: "background" | "divider" | "text"; label: string; onChange: (value: string) => void; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className="w-24 shrink-0 pt-1 text-[11px] font-medium text-[#6f6785] dark:text-white/60">{label}</span>
      <StyleLabBuilderColorControl key={`${label}:${value}`} kind={kind} label={label} onChange={onChange} value={value} />
    </div>
  );
}

function TypographyControls({ onStyleChange, styles }: { onStyleChange: (key: keyof StyleLabBuilderTextStyles, value: string) => void; styles: StyleLabBuilderTextStyles }) {
  return (
    <div className="grid gap-2">
      <SectionHeading>Typography</SectionHeading>
      <BuilderFontSelect onChange={(value) => onStyleChange("fontFamily", value)} value={styles.fontFamily} />
      <BuilderSelect label="Font size" onChange={(value) => onStyleChange("fontSize", value)} options={options(getStyleLabProperty("fontSize")?.values ?? [])} value={styles.fontSize} />
      <BuilderSelect label="Font weight" onChange={(value) => onStyleChange("fontWeight", value)} options={options(getStyleLabProperty("fontWeight")?.values ?? [])} value={styles.fontWeight} />
      <BuilderColorField kind="text" label="Text color" onChange={(value) => onStyleChange("textColor", value)} value={styles.textColor} />
      <BuilderSelect label="Line height" onChange={(value) => onStyleChange("lineHeight", value)} options={options(getStyleLabProperty("lineHeight")?.values ?? [])} value={styles.lineHeight} />
      <BuilderSelect label="Letter spacing" onChange={(value) => onStyleChange("letterSpacing", value)} options={options(getStyleLabProperty("letterSpacing")?.values ?? [])} value={styles.letterSpacing} />
      <BuilderSelect label="Text alignment" onChange={(value) => onStyleChange("textAlign", value)} options={options(getStyleLabProperty("textAlign")?.values ?? [])} value={styles.textAlign} />
    </div>
  );
}

function ContainerControls({ node, onResetSize, onStyleChange }: { node: StyleLabBuilderContainerNode; onResetSize: () => void; onStyleChange: (key: string, value: string) => void }) {
  return (
    <div className="grid gap-2">
      <SectionHeading>Layout</SectionHeading>
      <BuilderSelect label="Layout" onChange={(value) => onStyleChange("layout", value)} options={options(STYLE_LAB_BUILDER_LAYOUTS)} value={node.styles.layout} />
      {node.styles.layout === "grid" ? <BuilderSelect label="Grid columns" onChange={(value) => onStyleChange("gridColumns", value)} options={options(STYLE_LAB_BUILDER_GRID_COLUMNS)} value={String(node.styles.gridColumns)} /> : null}
      <BuilderSelect label="Gap" onChange={(value) => onStyleChange("gap", value)} options={options(getStyleLabProperty("gap")?.values ?? [])} value={node.styles.gap} />
      <BuilderSelect label="Padding X" onChange={(value) => onStyleChange("paddingX", value)} options={options(getStyleLabProperty("paddingX")?.values ?? [])} value={node.styles.paddingX} />
      <BuilderSelect label="Padding Y" onChange={(value) => onStyleChange("paddingY", value)} options={options(getStyleLabProperty("paddingY")?.values ?? [])} value={node.styles.paddingY} />
      <BuilderSelect label="Align items" onChange={(value) => onStyleChange("alignItems", value)} options={options(getStyleLabProperty("alignItems")?.values ?? [])} value={node.styles.alignItems} />
      <BuilderSelect label="Justify content" onChange={(value) => onStyleChange("justifyContent", value)} options={options(getStyleLabProperty("justifyContent")?.values ?? [])} value={node.styles.justifyContent} />
      <BuilderDimensionInput key={`width-${node.id}-${node.styles.width}`} label="Width" onChange={(value) => onStyleChange("width", value)} value={node.styles.width} />
      <BuilderDimensionInput key={`height-${node.id}-${node.styles.height}`} label="Height" onChange={(value) => onStyleChange("height", value)} value={node.styles.height} />
      <div className="flex justify-end">
        <AdhdChip onClick={onResetSize} type="button">Reset size</AdhdChip>
      </div>
      <BuilderSelect label="Min width" onChange={(value) => onStyleChange("minWidth", value)} options={options(getStyleLabProperty("minWidth")?.values ?? [])} value={node.styles.minWidth} />
      <BuilderSelect label="Max width" onChange={(value) => onStyleChange("maxWidth", value)} options={options([...(getStyleLabProperty("maxWidth")?.values ?? []), "none"])} value={node.styles.maxWidth} />
      <SectionHeading>Surface</SectionHeading>
      <BuilderColorField kind="background" label="Background" onChange={(value) => onStyleChange("backgroundColor", value)} value={node.styles.backgroundColor} />
      <BuilderSelect label="Radius" onChange={(value) => onStyleChange("radius", value)} options={labeledOptions(STYLE_LAB_BUILDER_RADIUS_OPTIONS)} value={node.styles.radius} />
      <BuilderSelect label="Border" onChange={(value) => onStyleChange("border", value)} options={labeledOptions(STYLE_LAB_BUILDER_BORDER_OPTIONS)} value={node.styles.border} />
      <BuilderSelect label="Shadow" onChange={(value) => onStyleChange("shadow", value)} options={labeledOptions(STYLE_LAB_BUILDER_SHADOW_OPTIONS)} value={node.styles.shadow} />
    </div>
  );
}

async function copyBuilderText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    return true;
  } catch {
    console.info(value);
    return false;
  }
}

type BuilderResizeInteraction = {
  axis: StyleLabBuilderResizeAxis;
  captureElement: HTMLButtonElement;
  completed: boolean;
  nodeId: string;
  pointerId: number;
  startDraft: StyleLabBuilderDraft;
  startHeight: number;
  startWidth: number;
  startX: number;
  startY: number;
};

type BuilderDragVisual = {
  candidateRect: StyleLabBuilderDragRect | null;
  columnLines: number[];
  insertionIndex: number;
  insertionLine?: { orientation: "horizontal" | "vertical"; position: number };
  layout: "row" | "column" | "grid";
  originLeft: number;
  originTop: number;
  occupiedRects: StyleLabBuilderDragRect[];
  rowLines: number[];
  targetId: string;
  targetRect: StyleLabBuilderDragRect;
  valid: boolean;
};

type BuilderDragInteraction = {
  active: boolean;
  captureElement: HTMLElement;
  completed: boolean;
  pointerId: number;
  pointerX: number;
  pointerY: number;
  sourceId: string;
  startDraft: StyleLabBuilderDraft;
  startX: number;
  startY: number;
};

function localRect(rect: StyleLabBuilderDragRect, originLeft: number, originTop: number): CSSProperties {
  return {
    height: Math.max(1, rect.height),
    left: rect.left - originLeft,
    top: rect.top - originTop,
    width: Math.max(1, rect.width),
  };
}

function BuilderDragOverlay({ visual }: { visual: BuilderDragVisual }) {
  const { originLeft, originTop } = visual;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-30 overflow-visible" data-builder-drag-grid data-builder-drag-grid-valid={visual.valid ? "true" : "false"}>
      <div className={`absolute rounded-xl border ${visual.valid ? "border-[#8f7bf6]/25 bg-[#8f7bf6]/[0.045]" : "border-[#d65775]/35 bg-[#d65775]/[0.055]"}`} style={localRect(visual.targetRect, originLeft, originTop)} />
      {visual.rowLines.map((line, index) => <span className="absolute border-t border-dashed border-[#6f57f6]/35 dark:border-[#cabfff]/30" data-builder-drag-row-guide={index} key={`builder-drag-row-${index}`} style={{ left: visual.targetRect.left - originLeft, top: line - originTop, width: visual.targetRect.width }} />)}
      {visual.columnLines.map((line, index) => <span className="absolute border-l border-dashed border-[#6f57f6]/30 dark:border-[#cabfff]/25" data-builder-drag-column-guide={index} key={`builder-drag-column-${index}`} style={{ height: visual.targetRect.height, left: line - originLeft, top: visual.targetRect.top - originTop }} />)}
      {visual.occupiedRects.map((rect) => <div className="absolute rounded-lg border border-slate-400/25 bg-slate-500/[0.035] dark:border-slate-300/20 dark:bg-slate-300/[0.035]" data-builder-drag-occupied={rect.id} key={`builder-drag-occupied-${rect.id}`} style={localRect(rect, originLeft, originTop)} />)}
      {visual.insertionLine ? <span className={`absolute ${visual.insertionLine.orientation === "horizontal" ? "h-0.5 w-full" : "h-full w-0.5"} rounded-full ${visual.valid ? "bg-[#6f57f6]/75" : "bg-[#d65775]/80"}`} data-builder-drag-insertion-line style={visual.insertionLine.orientation === "horizontal" ? { left: visual.targetRect.left - originLeft, top: visual.insertionLine.position - originTop, width: visual.targetRect.width } : { left: visual.insertionLine.position - originLeft, top: visual.targetRect.top - originTop, height: visual.targetRect.height }} /> : null}
      {visual.candidateRect ? (
        <div className={`absolute rounded-xl border-2 ${visual.valid ? "border-[#6f57f6] bg-[#6f57f6]/20 shadow-[0_0_0_3px_rgba(111,87,246,0.16)]" : "border-[#d65775] bg-[#d65775]/18 shadow-[0_0_0_3px_rgba(214,87,117,0.16)]"}`} data-builder-drag-candidate data-builder-drag-candidate-index={visual.insertionIndex} style={localRect(visual.candidateRect, originLeft, originTop)}>
          <span className={`absolute -top-5 left-1 rounded bg-current px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white shadow-sm ${visual.valid ? "text-[#6f57f6]" : "text-[#d65775]"}`}>{visual.valid ? "Drop here" : "Blocked"}</span>
        </div>
      ) : (
        <span className={`absolute -top-5 rounded px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white shadow-sm ${visual.valid ? "bg-[#6f57f6]" : "bg-[#d65775]"}`} style={{ left: visual.targetRect.left - originLeft, top: visual.targetRect.top - originTop }}>{visual.valid ? "Drop here" : "Blocked"}</span>
      )}
    </div>
  );
}

function BuilderLibraryPreviewNode({ draft, node }: { draft: StyleLabBuilderDraft; node: StyleLabBuilderNode }): ReactNode {
  if (node.type === "container") {
    return (
      <div className="grid min-w-0 gap-1 rounded-md border border-[#e3dcf5] bg-white/70 p-1.5 dark:border-white/10 dark:bg-white/[0.05]">
        {getStyleLabBuilderChildren(draft, node.id).slice(0, 4).map((child) => <BuilderLibraryPreviewNode draft={draft} key={child.id} node={child} />)}
      </div>
    );
  }
  if (node.type === "chip") return <span className="inline-flex max-w-full truncate rounded-full border border-[#ddd2ff] bg-[#f1ecff] px-2 py-1 text-[9px] font-semibold text-[#6f57f6]">{node.text}</span>;
  if (node.type === "icon-button") return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#ddd2ff] bg-[#f7f3ff] text-[9px] text-[#6f57f6]">＋</span>;
  if (node.type === "divider") return <span className="block h-px w-full bg-[#d8d0ec]" />;
  return <span className="truncate text-[10px] text-[#5f5876] dark:text-white/70">{node.text}</span>;
}

function BuilderLibraryPanel({
  mode,
  onClose,
  onInsert,
  onStart,
}: {
  mode: "start" | "insert";
  onClose: () => void;
  onInsert: (entry: StyleLabBuilderLibraryEntry) => void;
  onStart: (entry: StyleLabBuilderLibraryEntry) => void;
}) {
  // The former "Start from template" chooser now resolves through this catalog.
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<StyleLabBuilderLibraryCategory>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const results = useMemo(() => searchStyleLabBuilderLibrary(query, category), [category, query]);
  const selectedEntry = results.find((entry) => entry.id === selectedId) ?? results[0] ?? null;
  const selectedDraft = selectedEntry?.createDraft() ?? null;

  return (
    <div aria-label={`${mode === "start" ? "Start From" : "Insert"} UI Library`} className="absolute left-0 top-full z-40 mt-2 w-[min(46rem,calc(100vw-2rem))] rounded-[1.25rem] border border-[#e4dcfb] bg-white p-3 shadow-[0_20px_60px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#1b1530]" role="dialog">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold text-[#5f5876] dark:text-white/80">ADHDice UI Library</p>
          <p className="mt-0.5 text-[10px] text-[#8d82a7] dark:text-white/45">{mode === "start" ? "Choose a visual starting point for this module." : "Insert a Builder-safe UI tree at the current selection."}</p>
        </div>
        <button aria-label="Close UI Library" className="rounded-full p-1 text-[#8d82a7] hover:bg-[#f3efff] dark:hover:bg-white/10" onClick={onClose} type="button"><X aria-hidden="true" className="h-3.5 w-3.5" /></button>
      </div>
      <label className="mt-3 flex items-center gap-2 rounded-lg border border-[#e6e0f4] bg-[#fbfaff] px-2.5 dark:border-white/10 dark:bg-white/[0.04]">
        <Search aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[#9a91b1]" />
        <input aria-label="Search UI Library" className="h-8 min-w-0 flex-1 bg-transparent text-xs text-[#3f3856] outline-none dark:text-white" onChange={(event) => setQuery(event.target.value)} placeholder="Search label, source, tags, or category" type="search" value={query} />
      </label>
      <div aria-label="UI Library categories" className="mt-2 flex gap-1 overflow-x-auto pb-1" role="tablist">
        {STYLE_LAB_BUILDER_LIBRARY_CATEGORIES.map((item) => <button aria-selected={category === item} className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${category === item ? "bg-[#6f57f6] text-white" : "bg-[#f3efff] text-[#6f57f6] dark:bg-white/[0.08] dark:text-[#cabfff]"}`} key={item} onClick={() => setCategory(item)} role="tab" type="button">{item}</button>)}
      </div>
      <div className="mt-2 grid max-h-64 min-w-0 gap-1 overflow-y-auto pr-1 sm:grid-cols-2" role="listbox">
        {results.map((entry) => {
          const entryDraft = entry.createDraft();
          const root = getStyleLabBuilderNode(entryDraft, STYLE_LAB_BUILDER_ROOT_ID)!;
          return <button aria-selected={selectedEntry?.id === entry.id} className={`grid min-w-0 gap-1 rounded-lg border p-2 text-left ${selectedEntry?.id === entry.id ? "border-[#b9a9ff] bg-[#f7f3ff] dark:border-[#6f57f6] dark:bg-white/[0.08]" : "border-[#eeeaf8] hover:border-[#d9cffb] dark:border-white/10 dark:hover:border-white/20"}`} key={entry.id} onClick={() => setSelectedId(entry.id)} role="option" type="button">
            <span className="flex min-w-0 items-center justify-between gap-2"><span className="truncate text-[11px] font-semibold text-[#4c4565] dark:text-white/80">{entry.label}</span><span className="shrink-0 text-[9px] text-[#9a91b1]">{entry.category}</span></span>
            <span className="truncate text-[9px] text-[#8d82a7] dark:text-white/45">{entry.sourceComponent}</span>
            {root ? <BuilderLibraryPreviewNode draft={entryDraft} node={root} /> : null}
          </button>;
        })}
        {results.length === 0 ? <p className="col-span-full rounded-lg border border-dashed border-[#e4dcfb] p-4 text-center text-[11px] text-[#8d82a7]">No UI Library items match this search.</p> : null}
      </div>
      {selectedEntry && selectedDraft ? (
        <div className="mt-2 grid gap-2 rounded-lg border border-[#e4dcfb] bg-[#fbfaff] p-2.5 dark:border-white/10 dark:bg-white/[0.04]">
          <div className="grid gap-0.5"><p className="text-[11px] font-semibold text-[#4c4565] dark:text-white/80">{selectedEntry.label}</p><p className="text-[10px] text-[#8d82a7]">{selectedEntry.description}</p><p className="text-[9px] text-[#8d82a7] dark:text-white/45">Source: {selectedEntry.sourceComponent} · {selectedEntry.sourcePath}</p></div>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[9px] text-[#8d82a7]">Tags: {selectedEntry.tags.join(", ")}</span><span className="flex gap-1.5"><AdhdChip onClick={() => onStart(selectedEntry)} tone="purple" type="button">Start From</AdhdChip><AdhdChip onClick={() => onInsert(selectedEntry)} type="button">Insert</AdhdChip></span></div>
        </div>
      ) : null}
    </div>
  );
}

export function StyleLabBuilder() {
  if (process.env.NODE_ENV !== "development") return null;
  return <StyleLabBuilderWorkspace />;
}

function StyleLabBuilderWorkspace() {
  const [draft, setDraft] = useState<StyleLabBuilderDraft>(createDefaultStyleLabBuilderDraft);
  const [selectedId, setSelectedId] = useState(STYLE_LAB_BUILDER_ROOT_ID);
  const [hydrated, setHydrated] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [libraryMode, setLibraryMode] = useState<"start" | "insert" | null>(null);
  const [fontLoadStatus, setFontLoadStatus] = useState<"loading" | "loaded" | "fallback">("loading");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragVisual, setDragVisual] = useState<BuilderDragVisual | null>(null);
  const textEditCancelledRef = useRef(false);
  const textEditOriginalRef = useRef<string | null>(null);
  const resizeInteractionRef = useRef<BuilderResizeInteraction | null>(null);
  const dragInteractionRef = useRef<BuilderDragInteraction | null>(null);
  const dragVisualRef = useRef<BuilderDragVisual | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const link = document.createElement("link");
    link.dataset.styleLabBuilderFonts = "true";
    link.href = STYLE_LAB_BUILDER_WEB_FONT_STYLESHEET;
    link.rel = "stylesheet";
    const handleLoad = () => setFontLoadStatus("loaded");
    const handleError = () => setFontLoadStatus("fallback");
    link.addEventListener("load", handleLoad);
    link.addEventListener("error", handleError);
    document.head.appendChild(link);
    return () => {
      link.removeEventListener("load", handleLoad);
      link.removeEventListener("error", handleError);
      link.remove();
    };
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDraft(readStyleLabBuilderDraft(window.localStorage));
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (hydrated) writeStyleLabBuilderDraft(window.localStorage, draft);
  }, [draft, hydrated]);

  const activeSelectedId = getStyleLabBuilderNode(draft, selectedId) ? selectedId : STYLE_LAB_BUILDER_ROOT_ID;
  const selectedNode = getStyleLabBuilderNode(draft, activeSelectedId)!;
  const selectedParent = selectedNode.parentId ? getStyleLabBuilderNode(draft, selectedNode.parentId) : null;
  const iconOptions = useMemo(() => [{ label: "None", value: "" }, ...STYLE_LAB_ICON_OPTIONS.map((option) => ({ label: option.label, value: option.key }))], []);

  function commit(nextDraft: StyleLabBuilderDraft) {
    setDraft(normalizeStyleLabBuilderDraft(nextDraft));
    setCopyStatus(null);
  }

  function beginTextEdit(nodeId: string) {
    const node = getStyleLabBuilderNode(draft, nodeId);
    if (!node || (node.type !== "text" && node.type !== "chip")) return;
    textEditCancelledRef.current = false;
    textEditOriginalRef.current = node.text;
    setSelectedId(nodeId);
    setEditingNodeId(nodeId);
    setEditingValue(node.text);
  }

  function commitTextEdit() {
    if (!editingNodeId) return;
    if (textEditCancelledRef.current) {
      textEditCancelledRef.current = false;
      textEditOriginalRef.current = null;
      setEditingNodeId(null);
      return;
    }
    textEditOriginalRef.current = null;
    setEditingNodeId(null);
  }

  function cancelTextEdit() {
    textEditCancelledRef.current = true;
    const originalText = textEditOriginalRef.current;
    if (editingNodeId && originalText !== null) {
      setDraft((current) => updateStyleLabBuilderNode(current, editingNodeId, { text: originalText }));
    }
    textEditOriginalRef.current = null;
    setEditingNodeId(null);
  }

  function handleInlineValueChange(value: string) {
    setEditingValue(value);
    if (editingNodeId) setDraft((current) => updateStyleLabBuilderNode(current, editingNodeId, { text: value }));
  }

  function handleResizeStart(event: PointerEvent<HTMLButtonElement>, nodeId: string, axis: StyleLabBuilderResizeAxis) {
    if (event.button !== 0 || resizeInteractionRef.current) return;
    const container = event.currentTarget.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeInteractionRef.current = {
      axis,
      captureElement: event.currentTarget,
      completed: false,
      nodeId,
      pointerId: event.pointerId,
      startDraft: draft,
      startHeight: rect.height,
      startWidth: rect.width,
      startX: event.clientX,
      startY: event.clientY,
    };
    setSelectedId(nodeId);
  }

  function handleResizeMove(event: PointerEvent<HTMLButtonElement>) {
    const interaction = resizeInteractionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const nextSize = resizeStyleLabBuilderDimensions(
      interaction.startWidth,
      interaction.startHeight,
      event.clientX - interaction.startX,
      event.clientY - interaction.startY,
      interaction.axis,
    );
    const styles: Record<string, unknown> = { maxWidth: "none" };
    if (interaction.axis !== "height") styles.width = nextSize.width;
    if (interaction.axis !== "width") styles.height = nextSize.height;
    setDraft((current) => updateStyleLabBuilderNode(current, interaction.nodeId, { styles }));
  }

  function releaseResizePointer(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleResizeEnd(event: PointerEvent<HTMLButtonElement>) {
    const interaction = resizeInteractionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    interaction.completed = true;
    releaseResizePointer(event);
    resizeInteractionRef.current = null;
  }

  function handleResizeCancel(event: PointerEvent<HTMLButtonElement>) {
    const interaction = resizeInteractionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    interaction.completed = true;
    setDraft(interaction.startDraft);
    releaseResizePointer(event);
    resizeInteractionRef.current = null;
  }

  function handleResizeLostCapture(event: PointerEvent<HTMLButtonElement>) {
    const interaction = resizeInteractionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId || interaction.completed) return;
    setDraft(interaction.startDraft);
    resizeInteractionRef.current = null;
  }

  function getBuilderNodeElement(id: string): HTMLElement | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return Array.from(canvas.querySelectorAll<HTMLElement>("[data-builder-node-id]")).find((element) => element.dataset.builderNodeId === id) ?? null;
  }

  function getBuilderNodeDepth(sourceDraft: StyleLabBuilderDraft, id: string): number {
    let depth = 0;
    let node = getStyleLabBuilderNode(sourceDraft, id);
    const visited = new Set<string>();
    while (node?.parentId && !visited.has(node.id)) {
      visited.add(node.id);
      depth += 1;
      node = getStyleLabBuilderNode(sourceDraft, node.parentId);
    }
    return depth;
  }

  function getBuilderRect(id: string): StyleLabBuilderDragRect | null {
    const element = getBuilderNodeElement(id);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { bottom: rect.bottom, height: rect.height, id, left: rect.left, right: rect.right, top: rect.top, width: rect.width };
  }

  function getBuilderStyleNumber(element: HTMLElement, property: "paddingLeft" | "paddingRight" | "paddingTop", fallback: number): number {
    const value = window.getComputedStyle(element)[property];
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function updateBuilderDragPreview(interaction: BuilderDragInteraction) {
    const sourceDraft = interaction.startDraft;
    const sourceRect = getBuilderRect(interaction.sourceId);
    const source = getStyleLabBuilderNode(sourceDraft, interaction.sourceId);
    if (!source || !sourceRect) {
      dragVisualRef.current = null;
      setDragVisual(null);
      return;
    }
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const originLeft = (canvasRect?.left ?? 0) - (canvasRef.current?.scrollLeft ?? 0);
    const originTop = (canvasRect?.top ?? 0) - (canvasRef.current?.scrollTop ?? 0);
    const containerGeometries: StyleLabBuilderDragContainerGeometry[] = sourceDraft.nodes.flatMap((node) => {
      if (node.type !== "container") return [];
      const rect = getBuilderRect(node.id);
      if (!rect) return [];
      return [{ ...rect, depth: getBuilderNodeDepth(sourceDraft, node.id), gridColumns: node.styles.gridColumns, layout: node.styles.layout, parentId: node.parentId }];
    });
    const target = getStyleLabBuilderDropContainer(
      containerGeometries,
      interaction.pointerX,
      interaction.pointerY,
      interaction.sourceId,
      getStyleLabBuilderDescendantIds(sourceDraft, interaction.sourceId),
    );
    if (!target) {
      dragVisualRef.current = null;
      setDragVisual(null);
      return;
    }
    const targetNode = getStyleLabBuilderNode(sourceDraft, target.container.id);
    const targetElement = getBuilderNodeElement(target.container.id);
    const moveValidation = targetNode?.type === "container" ? canStyleLabBuilderMoveNode(sourceDraft, interaction.sourceId, target.container.id) : { valid: false as const, reason: "INVALID_TARGET" as const };
    const valid = target.valid && moveValidation.valid;
    const childNodes = targetNode?.type === "container" ? getStyleLabBuilderChildren(sourceDraft, targetNode.id) : [];
    const childRects = childNodes.flatMap((child, index) => {
      if (child.id === interaction.sourceId) return [];
      const rect = getBuilderRect(child.id);
      return rect ? [{ ...rect, index }] : [];
    });
    const sourceSpan = source.placement.gridColumnSpan;
    if (targetNode?.type === "container" && targetNode.styles.layout === "grid" && targetElement) {
      const computed = window.getComputedStyle(targetElement);
      const paddingLeft = getBuilderStyleNumber(targetElement, "paddingLeft", 0);
      const paddingRight = getBuilderStyleNumber(targetElement, "paddingRight", 0);
      const contentLeft = target.container.left + paddingLeft;
      const contentTop = target.container.top + getBuilderStyleNumber(targetElement, "paddingTop", 0);
      const contentWidth = Math.max(1, target.container.width - paddingLeft - paddingRight);
      const gap = Number.parseFloat(computed.columnGap) || Number.parseFloat(computed.gap) || 12;
      const rowGap = Number.parseFloat(computed.rowGap) || gap;
      const gridTarget = getStyleLabBuilderGridDropTarget({
        children: childNodes.map((child) => ({ gridColumnSpan: child.placement.gridColumnSpan, height: getBuilderRect(child.id)?.height ?? sourceRect.height, id: child.id })),
        columns: targetNode.styles.gridColumns,
        contentLeft,
        contentTop,
        contentWidth,
        gap,
        pointerX: interaction.pointerX,
        pointerY: interaction.pointerY,
        rowGap,
        sourceHeight: sourceRect.height,
        sourceId: interaction.sourceId,
        sourceSpan,
      });
      const absoluteItem = (item: { bottom: number; height: number; id: string; left: number; top: number; width: number }): StyleLabBuilderDragRect => ({ bottom: item.bottom + contentTop, height: item.height, id: item.id, left: item.left + contentLeft, right: item.left + item.width + contentLeft, top: item.top + contentTop, width: item.width });
      const columnLines = Array.from({ length: gridTarget.preview.columns }, (_, index) => contentLeft + index * (gridTarget.preview.trackWidth + gap));
      const rowLines = gridTarget.preview.rows.map((row) => contentTop + row.top);
      const visual = {
        candidateRect: absoluteItem(gridTarget.candidate),
        columnLines,
        insertionIndex: gridTarget.insertionIndex,
        layout: "grid",
        originLeft,
        originTop,
        occupiedRects: gridTarget.occupied.items.map(absoluteItem),
        rowLines,
        targetId: target.container.id,
        targetRect: target.container,
        valid,
      } satisfies BuilderDragVisual;
      dragVisualRef.current = visual;
      setDragVisual(visual);
      return;
    }
    if (targetNode?.type === "container" && (targetNode.styles.layout === "row" || targetNode.styles.layout === "column")) {
      const linearTarget = getStyleLabBuilderLinearDropTarget({
        childRects,
        container: target.container,
        layout: targetNode.styles.layout,
        pointerX: interaction.pointerX,
        pointerY: interaction.pointerY,
        sourceHeight: sourceRect.height,
        sourceWidth: sourceRect.width,
      });
      const visual = {
        candidateRect: linearTarget.candidate,
        columnLines: targetNode.styles.layout === "row" ? [linearTarget.insertionLine] : [],
        insertionIndex: linearTarget.insertionIndex,
        insertionLine: { orientation: targetNode.styles.layout === "row" ? "vertical" : "horizontal", position: linearTarget.insertionLine },
        layout: targetNode.styles.layout,
        originLeft,
        originTop,
        occupiedRects: childRects,
        rowLines: targetNode.styles.layout === "column" ? [linearTarget.insertionLine] : [],
        targetId: target.container.id,
        targetRect: target.container,
        valid,
      } satisfies BuilderDragVisual;
      dragVisualRef.current = visual;
      setDragVisual(visual);
      return;
    }
    const visual = {
      candidateRect: null,
      columnLines: [],
      insertionIndex: 0,
      layout: target.container.layout,
      originLeft,
      originTop,
      occupiedRects: [],
      rowLines: [],
      targetId: target.container.id,
      targetRect: target.container,
      valid,
    } satisfies BuilderDragVisual;
    dragVisualRef.current = visual;
    setDragVisual(visual);
  }

  function cancelBuilderAutoScroll() {
    if (autoScrollFrameRef.current !== null && typeof window !== "undefined") window.cancelAnimationFrame(autoScrollFrameRef.current);
    autoScrollFrameRef.current = null;
  }

  function runBuilderAutoScroll() {
    autoScrollFrameRef.current = null;
    const interaction = dragInteractionRef.current;
    if (!interaction?.active || typeof window === "undefined" || typeof document === "undefined") return;
    const scrollingElement = document.scrollingElement ?? document.documentElement;
    const scrollTop = window.scrollY;
    const scrollHeight = Math.max(scrollingElement.scrollHeight, document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0);
    const delta = getPageShellDragAutoScrollDelta(interaction.pointerY, window.innerHeight, scrollTop, scrollHeight);
    if (!delta) return;
    window.scrollTo({ behavior: "auto", top: Math.max(0, scrollTop + delta) });
    updateBuilderDragPreview(interaction);
    autoScrollFrameRef.current = window.requestAnimationFrame(runBuilderAutoScroll);
  }

  function scheduleBuilderAutoScroll() {
    const interaction = dragInteractionRef.current;
    if (!interaction?.active || typeof window === "undefined" || typeof document === "undefined") return;
    const scrollingElement = document.scrollingElement ?? document.documentElement;
    const delta = getPageShellDragAutoScrollDelta(interaction.pointerY, window.innerHeight, window.scrollY, Math.max(scrollingElement.scrollHeight, document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0));
    if (!delta) {
      cancelBuilderAutoScroll();
      return;
    }
    if (autoScrollFrameRef.current === null) autoScrollFrameRef.current = window.requestAnimationFrame(runBuilderAutoScroll);
  }

  function releaseBuilderPointer(interaction: BuilderDragInteraction) {
    if (interaction.captureElement.hasPointerCapture(interaction.pointerId)) interaction.captureElement.releasePointerCapture(interaction.pointerId);
  }

  function cleanupBuilderDrag(restore: boolean) {
    const interaction = dragInteractionRef.current;
    if (!interaction) return;
    interaction.completed = true;
    if (restore && interaction.active) setDraft(interaction.startDraft);
    cancelBuilderAutoScroll();
    releaseBuilderPointer(interaction);
    dragInteractionRef.current = null;
    dragVisualRef.current = null;
    setDraggingId(null);
    setDragVisual(null);
  }

  function handleNodePointerDown(event: PointerEvent<HTMLElement>, nodeId: string) {
    if ((event.pointerType === "mouse" && event.button !== 0) || resizeInteractionRef.current || dragInteractionRef.current) return;
    event.stopPropagation();
    setSelectedId(nodeId);
    const interaction: BuilderDragInteraction = {
      active: false,
      captureElement: event.currentTarget,
      completed: false,
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      sourceId: nodeId,
      startDraft: draft,
      startX: event.clientX,
      startY: event.clientY,
    };
    dragInteractionRef.current = interaction;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      dragInteractionRef.current = null;
    }
  }

  function handleNodePointerMove(event: PointerEvent<HTMLElement>) {
    const interaction = dragInteractionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    interaction.pointerX = event.clientX;
    interaction.pointerY = event.clientY;
    if (!interaction.active) {
      if (Math.hypot(event.clientX - interaction.startX, event.clientY - interaction.startY) < 6) return;
      interaction.active = true;
      event.preventDefault();
      event.stopPropagation();
      setDraggingId(interaction.sourceId);
      updateBuilderDragPreview(interaction);
    } else {
      event.preventDefault();
      event.stopPropagation();
      updateBuilderDragPreview(interaction);
    }
    scheduleBuilderAutoScroll();
  }

  function handleNodePointerUp(event: PointerEvent<HTMLElement>) {
    const interaction = dragInteractionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (!interaction.active) {
      cleanupBuilderDrag(false);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const visual = dragVisualRef.current;
    if (visual?.valid) {
      const plan = applyStyleLabBuilderDrop(interaction.startDraft, interaction.sourceId, visual.targetId, visual.insertionIndex);
      const validation = canStyleLabBuilderMoveNode(interaction.startDraft, interaction.sourceId, visual.targetId);
      if (validation.valid) commit(plan);
    }
    suppressClickRef.current = true;
    cleanupBuilderDrag(false);
  }

  function handleNodePointerCancel() {
    cleanupBuilderDrag(true);
  }

  function handleNodeLostPointerCapture() {
    const interaction = dragInteractionRef.current;
    if (!interaction || interaction.completed) return;
    cleanupBuilderDrag(true);
  }

  function handlePreviewSelect(id: string) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setSelectedId(id);
  }

  function shouldSuppressClick() {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  }

  function handleAdd(type: StyleLabBuilderNodeType) {
    const nextDraft = addStyleLabBuilderNode(draft, type, activeSelectedId);
    const currentIds = new Set(draft.nodes.map((node) => node.id));
    const addedNode = nextDraft.nodes.find((node) => !currentIds.has(node.id));
    commit(nextDraft);
    if (addedNode) setSelectedId(addedNode.id);
  }

  function handleNewModule() {
    if (!isStyleLabBuilderBlank(draft) && !window.confirm("Clear the current Builder module?")) return;
    commit(createDefaultStyleLabBuilderDraft());
    setSelectedId(STYLE_LAB_BUILDER_ROOT_ID);
    setLibraryMode(null);
  }

  function handleLibraryStart(entry: StyleLabBuilderLibraryEntry) {
    if (!isStyleLabBuilderBlank(draft) && !window.confirm("Replace the current Builder module with this template?")) return;
    commit(entry.createDraft());
    setSelectedId(STYLE_LAB_BUILDER_ROOT_ID);
    setEditingNodeId(null);
    setLibraryMode(null);
  }

  function handleLibraryInsert(entry: StyleLabBuilderLibraryEntry) {
    const result = insertStyleLabBuilderDraft(draft, entry.createDraft(), activeSelectedId);
    if (!result.insertedRootId) {
      setCopyStatus("This UI cannot be inserted here without exceeding Builder limits.");
      return;
    }
    commit(result.draft);
    setSelectedId(result.insertedRootId);
    setEditingNodeId(null);
    setLibraryMode(null);
  }

  function handleDelete() {
    if (selectedNode.id === STYLE_LAB_BUILDER_ROOT_ID) return;
    const hasChildren = selectedNode.type === "container" && draft.nodes.some((node) => node.parentId === selectedNode.id);
    if (hasChildren && !window.confirm("Delete this container and all of its Builder descendants?")) return;
    commit(deleteStyleLabBuilderNode(draft, selectedNode.id));
    setSelectedId(selectedNode.parentId ?? STYLE_LAB_BUILDER_ROOT_ID);
  }

  function handleDuplicate() {
    if (selectedNode.id === STYLE_LAB_BUILDER_ROOT_ID) return;
    const nextDraft = duplicateStyleLabBuilderNode(draft, selectedNode.id);
    const currentIds = new Set(draft.nodes.map((node) => node.id));
    const duplicate = nextDraft.nodes.find((node) => !currentIds.has(node.id));
    commit(nextDraft);
    if (duplicate) setSelectedId(duplicate.id);
  }

  function handleStyleChange(key: string, value: string | number | boolean) {
    commit(updateStyleLabBuilderNode(draft, selectedNode.id, { styles: { [key]: key === "gridColumns" ? Number(value) : value } }));
  }

  function handlePlacementChange(key: string, value: string) {
    commit(updateStyleLabBuilderNode(draft, selectedNode.id, { placement: { [key]: Number(value) } }));
  }

  function handleResetSize() {
    commit(updateStyleLabBuilderNode(draft, selectedNode.id, { styles: { height: "auto", maxWidth: "100%", width: "100%" } }));
  }

  function handleTextStyleChange(key: keyof StyleLabBuilderTextStyles, value: string) {
    handleStyleChange(key, value);
  }

  async function handleCopy(value: string, status: string) {
    const copied = await copyBuilderText(value);
    setCopyStatus(copied ? status : "Clipboard unavailable; reference logged to the browser console.");
  }

  useEffect(() => {
    const cancelDragFromWindow = () => {
      const interaction = dragInteractionRef.current;
      if (!interaction) return;
      interaction.completed = true;
      if (interaction.active) setDraft(interaction.startDraft);
      if (autoScrollFrameRef.current !== null) window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
      if (interaction.captureElement.hasPointerCapture(interaction.pointerId)) interaction.captureElement.releasePointerCapture(interaction.pointerId);
      dragInteractionRef.current = null;
      dragVisualRef.current = null;
      setDraggingId(null);
      setDragVisual(null);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (resizeInteractionRef.current) {
        const interaction = resizeInteractionRef.current;
        interaction.completed = true;
        setDraft(interaction.startDraft);
        if (interaction.captureElement.hasPointerCapture(interaction.pointerId)) interaction.captureElement.releasePointerCapture(interaction.pointerId);
        resizeInteractionRef.current = null;
        return;
      }
      cancelDragFromWindow();
    };
    const handleWindowBlur = () => {
      cancelDragFromWindow();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleWindowBlur);
      if (autoScrollFrameRef.current !== null) window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    };
  }, []);

  return (
    <div className="mt-5 grid w-full min-w-0 gap-4" data-style-lab-builder>
      <section className={SUBPANEL_CLASS}>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[12rem] flex-1">
            <span className="mb-1 block text-[10px] font-semibold text-[#8d82b6] dark:text-white/45">Module name</span>
            <input aria-label="Module name" className={INPUT_CLASS} onChange={(event) => setDraft((current) => normalizeStyleLabBuilderDraft({ ...current, moduleName: event.target.value }))} type="text" value={draft.moduleName} />
          </label>
          <BuilderSelect label="Canvas" onChange={(value) => commit({ ...draft, canvasWidth: value as StyleLabBuilderCanvasWidth })} options={options(STYLE_LAB_BUILDER_CANVAS_WIDTHS)} value={draft.canvasWidth} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <AdhdChip onClick={handleNewModule} type="button">New</AdhdChip>
          <AdhdChip onClick={handleNewModule} type="button">Clear Module</AdhdChip>
          <div className="relative">
            <div className="flex flex-wrap gap-1.5">
              <AdhdChip onClick={() => setLibraryMode((current) => current === "start" ? null : "start")} tone="purple" type="button">Start From UI</AdhdChip>
              <AdhdChip onClick={() => setLibraryMode((current) => current === "insert" ? null : "insert")} type="button">Insert UI</AdhdChip>
            </div>
            {libraryMode ? <BuilderLibraryPanel mode={libraryMode} onClose={() => setLibraryMode(null)} onInsert={handleLibraryInsert} onStart={handleLibraryStart} /> : null}
          </div>
          <AdhdChip icon={<Copy aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => { void handleCopy(buildStyleLabModuleSpec(draft), "Module Spec copied."); }} tone="purple" type="button">Copy Module Spec</AdhdChip>
          <AdhdChip icon={<Copy aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => { void handleCopy(buildStyleLabReferenceCode(draft), "Reference Code copied."); }} tone="purple" type="button">Copy Reference Code</AdhdChip>
          <span className="self-center text-[10px] text-[#8d82a7] dark:text-white/45">{fontLoadStatus === "loaded" ? "Web fonts ready" : fontLoadStatus === "fallback" ? "Web fonts unavailable; using fallbacks" : "Loading web fonts…"}</span>
        </div>
      </section>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(20rem,1.15fr)_minmax(24rem,0.85fr)] xl:grid-cols-[minmax(24rem,1.2fr)_minmax(28rem,0.8fr)]">
        <section className={`${SUBPANEL_CLASS} min-w-0 lg:sticky lg:top-4 lg:self-start`}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <SectionHeading>Live canvas</SectionHeading>
              <p className="text-[10px] text-[#807898] dark:text-white/45">Preview width: {draft.canvasWidth === "fit" ? "Fit" : `${draft.canvasWidth}px`}</p>
            </div>
            <span className="text-[10px] text-[#9a91b1] dark:text-white/35">{draft.nodes.length}/60 nodes</span>
          </div>
          <div className="relative mt-3 min-w-0 overflow-x-auto rounded-[1rem] border border-dashed border-[#dcd3f2] bg-[#f7f4ff] p-4 sm:p-6 dark:border-white/15 dark:bg-white/[0.03]" onClick={(event) => { if (event.target === event.currentTarget) setSelectedId(STYLE_LAB_BUILDER_ROOT_ID); }} ref={canvasRef}>
            <div className="mx-auto min-h-[20rem] max-w-full" onClick={(event) => { if (event.target === event.currentTarget) setSelectedId(STYLE_LAB_BUILDER_ROOT_ID); }} style={{ width: draft.canvasWidth === "fit" ? "100%" : `${draft.canvasWidth}px` }}>
              <BuilderPreviewNode
                draft={draft}
                draggingId={draggingId}
                editingNodeId={editingNodeId}
                editingValue={editingValue}
                node={getStyleLabBuilderNode(draft, STYLE_LAB_BUILDER_ROOT_ID)!}
                onBeginTextEdit={beginTextEdit}
                onCancelTextEdit={cancelTextEdit}
                onCommitTextEdit={commitTextEdit}
                onNodeLostPointerCapture={handleNodeLostPointerCapture}
                onNodePointerCancel={handleNodePointerCancel}
                onNodePointerDown={handleNodePointerDown}
                onNodePointerMove={handleNodePointerMove}
                onNodePointerUp={handleNodePointerUp}
                onInlineValueChange={handleInlineValueChange}
                onResizeCancel={handleResizeCancel}
                onResizeEnd={handleResizeEnd}
                onResizeLostCapture={handleResizeLostCapture}
                onResizeMove={handleResizeMove}
                onResizeStart={handleResizeStart}
                onSelect={handlePreviewSelect}
                shouldSuppressClick={shouldSuppressClick}
                selectedId={activeSelectedId}
              />
            </div>
            {dragVisual ? <BuilderDragOverlay visual={dragVisual} /> : null}
          </div>
          {copyStatus ? <p className="mt-2 text-[11px] text-[#4d8c68] dark:text-[#a5d7b8]" role="status">{copyStatus}</p> : null}
        </section>

        <div className="grid min-w-0 gap-4">
          <section className={SUBPANEL_CLASS}>
            <div className="flex items-center justify-between gap-2">
              <SectionHeading>Structure</SectionHeading>
              <span className="text-[10px] text-[#9a91b1] dark:text-white/35">{selectedNode.type}</span>
            </div>
            <div className="grid gap-0.5 rounded-md border border-[#eeeaf8] bg-white/70 p-1 dark:border-white/10 dark:bg-white/[0.03]" role="tree">
              <BuilderTreeNode depth={0} draft={draft} node={getStyleLabBuilderNode(draft, STYLE_LAB_BUILDER_ROOT_ID)!} onSelect={setSelectedId} selectedId={activeSelectedId} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {(["container", "text", "chip", "icon-button", "divider"] as const).map((type) => <AdhdChip icon={<Plus aria-hidden="true" className="h-3 w-3" />} key={type} onClick={() => handleAdd(type)} type="button">Add {type === "icon-button" ? "Icon Button" : type[0]!.toUpperCase() + type.slice(1)}</AdhdChip>)}
            </div>
            <div className="mt-2 flex items-center gap-1 border-t border-[#eeeaf8] pt-2 dark:border-white/10">
              <AdhdIconButton aria-label="Move selected node earlier" disabled={selectedNode.id === STYLE_LAB_BUILDER_ROOT_ID} onClick={() => commit(moveStyleLabBuilderNode(draft, selectedNode.id, "earlier"))} size="sm" tone="ghost" variant="rowToolbar"><ArrowUp aria-hidden="true" /></AdhdIconButton>
              <AdhdIconButton aria-label="Move selected node later" disabled={selectedNode.id === STYLE_LAB_BUILDER_ROOT_ID} onClick={() => commit(moveStyleLabBuilderNode(draft, selectedNode.id, "later"))} size="sm" tone="ghost" variant="rowToolbar"><ArrowDown aria-hidden="true" /></AdhdIconButton>
              <AdhdIconButton aria-label="Duplicate selected node" disabled={selectedNode.id === STYLE_LAB_BUILDER_ROOT_ID} onClick={handleDuplicate} size="sm" tone="ghost" variant="rowToolbar"><Copy aria-hidden="true" /></AdhdIconButton>
              <AdhdIconButton aria-label="Delete selected node" disabled={selectedNode.id === STYLE_LAB_BUILDER_ROOT_ID} onClick={handleDelete} size="sm" tone="danger" variant="rowToolbar"><Trash2 aria-hidden="true" /></AdhdIconButton>
              <span className="ml-1 text-[10px] text-[#8d82a7] dark:text-white/45">Select a row or preview element to edit.</span>
            </div>
          </section>

          <section className={SUBPANEL_CLASS}>
            <SectionHeading>Selected element</SectionHeading>
            {selectedParent?.type === "container" && selectedParent.styles.layout === "grid" ? <BuilderSelect label="Column span" onChange={(value) => handlePlacementChange("gridColumnSpan", value)} options={options(Array.from({ length: selectedParent.styles.gridColumns }, (_, index) => index + 1))} value={String(selectedNode.placement.gridColumnSpan)} /> : null}
            {selectedNode.type === "container" ? <ContainerControls node={selectedNode} onResetSize={handleResetSize} onStyleChange={handleStyleChange} /> : null}
            {selectedNode.type === "text" ? (
              <div className="grid gap-3">
                <BuilderTextInput label="Text" onChange={(value) => commit(updateStyleLabBuilderNode(draft, selectedNode.id, { text: value }))} value={selectedNode.text} />
                <TypographyControls onStyleChange={handleTextStyleChange} styles={selectedNode.styles} />
              </div>
            ) : null}
            {selectedNode.type === "chip" ? (
              <div className="grid gap-3">
                <BuilderTextInput label="Label" onChange={(value) => commit(updateStyleLabBuilderNode(draft, selectedNode.id, { text: value }))} value={selectedNode.text} />
                <BuilderSelect label="Tone" onChange={(value) => handleStyleChange("tone", value)} options={options(STYLE_LAB_BUILDER_CHIP_TONES)} value={selectedNode.styles.tone} />
                <BuilderSelect label="Icon" onChange={(value) => handleStyleChange("iconName", value)} options={iconOptions} value={selectedNode.styles.iconName ?? ""} />
                <label className="flex items-center gap-2 text-[11px] font-medium text-[#6f6785] dark:text-white/60"><input checked={selectedNode.styles.selected} onChange={(event) => handleStyleChange("selected", event.target.checked)} type="checkbox" /> Selected</label>
                <TypographyControls onStyleChange={handleTextStyleChange} styles={selectedNode.styles} />
              </div>
            ) : null}
            {selectedNode.type === "icon-button" ? (
              <div className="grid gap-2">
                <BuilderTextInput label="Accessibility label" onChange={(value) => commit(updateStyleLabBuilderNode(draft, selectedNode.id, { ariaLabel: value }))} value={selectedNode.ariaLabel} />
                <BuilderSelect label="Icon" onChange={(value) => handleStyleChange("iconName", value)} options={options(STYLE_LAB_ICON_OPTIONS.map((option) => option.key))} value={selectedNode.styles.iconName} />
                <BuilderSelect label="Size" onChange={(value) => handleStyleChange("size", value)} options={options(STYLE_LAB_BUILDER_ICON_BUTTON_SIZES)} value={selectedNode.styles.size} />
                <BuilderSelect label="Tone" onChange={(value) => handleStyleChange("tone", value)} options={options(STYLE_LAB_BUILDER_ICON_BUTTON_TONES)} value={selectedNode.styles.tone} />
              </div>
            ) : null}
            {selectedNode.type === "divider" ? (
              <div className="grid gap-2">
                <BuilderSelect label="Orientation" onChange={(value) => handleStyleChange("orientation", value)} options={options(STYLE_LAB_BUILDER_DIVIDER_ORIENTATIONS)} value={selectedNode.styles.orientation} />
                <BuilderColorField kind="divider" label="Color" onChange={(value) => handleStyleChange("color", value)} value={selectedNode.styles.color} />
                <BuilderSelect label="Width" onChange={(value) => handleStyleChange("width", value)} options={options(STYLE_LAB_BUILDER_DIVIDER_WIDTHS)} value={selectedNode.styles.width} />
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
