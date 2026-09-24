"use client";

import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { AdhdChip, AdhdIconButton } from "@/components/ui-system";
import { TaskTypeIcon } from "@/components/ui/lucide-icon";
import {
  getStyleLabBackgroundColorCssValue,
  getStyleLabProperty,
  getStyleLabTextColorCssValue,
  STYLE_LAB_BACKGROUND_COLORS,
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
  STYLE_LAB_ICON_OPTIONS,
  STYLE_LAB_TEXT_COLORS,
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
  isStyleLabBuilderBlank,
  moveStyleLabBuilderNode,
  normalizeStyleLabBuilderDraft,
  readStyleLabBuilderDraft,
  STYLE_LAB_BUILDER_ROOT_ID,
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
const SUBPANEL_CLASS = "rounded-lg border border-[#e4dcfb] bg-[#fbfaff] px-2.5 py-2.5 dark:border-white/10 dark:bg-white/[0.04]";

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

function BuilderTextInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="w-24 shrink-0 text-[11px] font-medium text-[#6f6785] dark:text-white/60">{label}</span>
      <input aria-label={label} className={INPUT_CLASS} onChange={(event) => onChange(event.target.value)} type="text" value={value} />
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
    minWidth: styles.minWidth,
    paddingBottom: styles.paddingY,
    paddingLeft: styles.paddingX,
    paddingRight: styles.paddingX,
    paddingTop: styles.paddingY,
    width: styles.width,
  };
}

function selectedPreviewStyle(selected: boolean): CSSProperties {
  return selected ? { outline: "2px solid var(--accent)", outlineOffset: "2px" } : {};
}

function BuilderPreviewNode({ draft, node, onSelect, selectedId }: { draft: StyleLabBuilderDraft; node: StyleLabBuilderNode; onSelect: (id: string) => void; selectedId: string }) {
  const selected = node.id === selectedId;
  const select = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(node.id);
  };
  const children = node.type === "container"
    ? getStyleLabBuilderChildren(draft, node.id).map((child) => <BuilderPreviewNode draft={draft} key={child.id} node={child} onSelect={onSelect} selectedId={selectedId} />)
    : null;

  if (node.type === "container") {
    return <div aria-label={`Select ${node.id === STYLE_LAB_BUILDER_ROOT_ID ? "root container" : "container"}`} data-builder-node-id={node.id} onClick={select} role="group" style={{ ...containerStyle(node), ...selectedPreviewStyle(selected) }}>{children}</div>;
  }
  if (node.type === "text") {
    return <span data-builder-node-id={node.id} onClick={select} style={{ ...textStyle(node.styles), ...selectedPreviewStyle(selected) }}>{node.text}</span>;
  }
  if (node.type === "chip") {
    const icon = node.styles.iconName ? <TaskTypeIcon aria-hidden="true" className="h-3.5 w-3.5" iconKey={node.styles.iconName} /> : undefined;
    return <AdhdChip data-builder-node-id={node.id} icon={icon} iconName={node.styles.iconName ?? undefined} onClick={select} selected={node.styles.selected} style={{ ...textStyle(node.styles), ...selectedPreviewStyle(selected) }} tone={node.styles.tone} type="button">{node.text}</AdhdChip>;
  }
  if (node.type === "icon-button") {
    return <AdhdIconButton aria-label={node.ariaLabel} data-builder-node-id={node.id} onClick={select} size={node.styles.size} style={selectedPreviewStyle(selected)} tone={node.styles.tone} type="button"><TaskTypeIcon aria-hidden="true" iconKey={node.styles.iconName} /></AdhdIconButton>;
  }
  return <div aria-label="Select divider" data-builder-node-id={node.id} onClick={select} role="separator" style={{ background: getStyleLabTextColorCssValue(node.styles.color), height: node.styles.orientation === "horizontal" ? "1px" : node.styles.width, width: node.styles.orientation === "horizontal" ? node.styles.width : "1px", ...selectedPreviewStyle(selected) }} />;
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

function TypographyControls({ onStyleChange, styles }: { onStyleChange: (key: keyof StyleLabBuilderTextStyles, value: string) => void; styles: StyleLabBuilderTextStyles }) {
  return (
    <div className="grid gap-2">
      <SectionHeading>Typography</SectionHeading>
      <BuilderSelect label="Font size" onChange={(value) => onStyleChange("fontSize", value)} options={options(getStyleLabProperty("fontSize")?.values ?? [])} value={styles.fontSize} />
      <BuilderSelect label="Font weight" onChange={(value) => onStyleChange("fontWeight", value)} options={options(getStyleLabProperty("fontWeight")?.values ?? [])} value={styles.fontWeight} />
      <BuilderSelect label="Text color" onChange={(value) => onStyleChange("textColor", value)} options={options(STYLE_LAB_TEXT_COLORS)} value={styles.textColor} />
      <BuilderSelect label="Line height" onChange={(value) => onStyleChange("lineHeight", value)} options={options(getStyleLabProperty("lineHeight")?.values ?? [])} value={styles.lineHeight} />
      <BuilderSelect label="Letter spacing" onChange={(value) => onStyleChange("letterSpacing", value)} options={options(getStyleLabProperty("letterSpacing")?.values ?? [])} value={styles.letterSpacing} />
      <BuilderSelect label="Text alignment" onChange={(value) => onStyleChange("textAlign", value)} options={options(getStyleLabProperty("textAlign")?.values ?? [])} value={styles.textAlign} />
    </div>
  );
}

function ContainerControls({ node, onStyleChange }: { node: StyleLabBuilderContainerNode; onStyleChange: (key: string, value: string) => void }) {
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
      <BuilderSelect label="Width" onChange={(value) => onStyleChange("width", value)} options={options(getStyleLabProperty("width")?.values ?? [])} value={node.styles.width} />
      <BuilderSelect label="Min width" onChange={(value) => onStyleChange("minWidth", value)} options={options(getStyleLabProperty("minWidth")?.values ?? [])} value={node.styles.minWidth} />
      <BuilderSelect label="Max width" onChange={(value) => onStyleChange("maxWidth", value)} options={options(getStyleLabProperty("maxWidth")?.values ?? [])} value={node.styles.maxWidth} />
      <SectionHeading>Surface</SectionHeading>
      <BuilderSelect label="Background" onChange={(value) => onStyleChange("backgroundColor", value)} options={options(STYLE_LAB_BACKGROUND_COLORS)} value={node.styles.backgroundColor} />
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

export function StyleLabBuilder() {
  const [draft, setDraft] = useState<StyleLabBuilderDraft>(createDefaultStyleLabBuilderDraft);
  const [selectedId, setSelectedId] = useState(STYLE_LAB_BUILDER_ROOT_ID);
  const [hydrated, setHydrated] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

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
  const iconOptions = useMemo(() => [{ label: "None", value: "" }, ...STYLE_LAB_ICON_OPTIONS.map((option) => ({ label: option.label, value: option.key }))], []);

  function commit(nextDraft: StyleLabBuilderDraft) {
    setDraft(normalizeStyleLabBuilderDraft(nextDraft));
    setCopyStatus(null);
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

  function handleTextStyleChange(key: keyof StyleLabBuilderTextStyles, value: string) {
    handleStyleChange(key, value);
  }

  async function handleCopy(value: string, status: string) {
    const copied = await copyBuilderText(value);
    setCopyStatus(copied ? status : "Clipboard unavailable; reference logged to the browser console.");
  }

  return (
    <div className="mt-3 grid gap-3" data-style-lab-builder>
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
          <AdhdChip icon={<Copy aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => { void handleCopy(buildStyleLabModuleSpec(draft), "Module Spec copied."); }} tone="purple" type="button">Copy Module Spec</AdhdChip>
          <AdhdChip icon={<Copy aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => { void handleCopy(buildStyleLabReferenceCode(draft), "Reference Code copied."); }} tone="purple" type="button">Copy Reference Code</AdhdChip>
        </div>
      </section>

      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
        <section className={SUBPANEL_CLASS}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <SectionHeading>Live canvas</SectionHeading>
              <p className="text-[10px] text-[#807898] dark:text-white/45">Preview width: {draft.canvasWidth === "fit" ? "Fit" : `${draft.canvasWidth}px`}</p>
            </div>
            <span className="text-[10px] text-[#9a91b1] dark:text-white/35">{draft.nodes.length}/60 nodes</span>
          </div>
          <div className="mt-2 min-w-0 overflow-x-auto rounded-lg border border-dashed border-[#dcd3f2] bg-[#f7f4ff] p-2 dark:border-white/15 dark:bg-white/[0.03]">
            <div className="mx-auto min-h-[15rem] max-w-full" style={{ width: draft.canvasWidth === "fit" ? "100%" : `${draft.canvasWidth}px` }}>
              <BuilderPreviewNode draft={draft} node={getStyleLabBuilderNode(draft, STYLE_LAB_BUILDER_ROOT_ID)!} onSelect={setSelectedId} selectedId={activeSelectedId} />
            </div>
          </div>
          {copyStatus ? <p className="mt-2 text-[11px] text-[#4d8c68] dark:text-[#a5d7b8]" role="status">{copyStatus}</p> : null}
        </section>

        <div className="grid min-w-0 gap-3">
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
            {selectedNode.type === "container" ? <ContainerControls node={selectedNode} onStyleChange={handleStyleChange} /> : null}
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
                <BuilderSelect label="Color" onChange={(value) => handleStyleChange("color", value)} options={options(STYLE_LAB_TEXT_COLORS)} value={selectedNode.styles.color} />
                <BuilderSelect label="Width" onChange={(value) => handleStyleChange("width", value)} options={options(STYLE_LAB_BUILDER_DIVIDER_WIDTHS)} value={selectedNode.styles.width} />
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
