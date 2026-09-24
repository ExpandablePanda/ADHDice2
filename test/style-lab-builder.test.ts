import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  addStyleLabBuilderNode,
  createDefaultStyleLabBuilderDraft,
  deleteStyleLabBuilderNode,
  duplicateStyleLabBuilderNode,
  getStyleLabBuilderChildren,
  getStyleLabBuilderNode,
  moveStyleLabBuilderNode,
  normalizeStyleLabBuilderDraft,
  STYLE_LAB_BUILDER_MAX_DEPTH,
  STYLE_LAB_BUILDER_MAX_HEIGHT_PX,
  STYLE_LAB_BUILDER_MAX_WIDTH_PX,
  STYLE_LAB_BUILDER_MIN_HEIGHT_PX,
  STYLE_LAB_BUILDER_MIN_WIDTH_PX,
  STYLE_LAB_BUILDER_ROOT_ID,
  STYLE_LAB_BUILDER_STORAGE_KEY,
  normalizeStyleLabBuilderDimension,
  resizeStyleLabBuilderDimensions,
  updateStyleLabBuilderNode,
  readStyleLabBuilderDraft,
  type StyleLabBuilderDraft,
} from "@/components/style-lab/style-lab-builder-model";
import { buildStyleLabModuleSpec, buildStyleLabReferenceCode } from "@/components/style-lab/style-lab-builder-export";
import { createStyleLabBuilderTemplate, STYLE_LAB_BUILDER_TEMPLATES } from "@/components/style-lab/style-lab-builder-templates";
import { getStyleLabBackgroundColorCssValue, getStyleLabBuilderFontOption, getStyleLabTextColorCssValue, isStyleLabBuilderFontFamily, normalizeStyleLabCustomColor } from "@/components/style-lab/style-lab-registry";

const builderSource = readFileSync(new URL("../src/components/style-lab/style-lab-builder.tsx", import.meta.url), "utf8");
const colorControlSource = readFileSync(new URL("../src/components/style-lab/style-lab-builder-color-control.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../src/components/style-lab/style-lab-panel.tsx", import.meta.url), "utf8");
const devRootSource = readFileSync(new URL("../src/components/style-lab/style-lab-dev-root.tsx", import.meta.url), "utf8");

function storage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    removeItem: () => { value = null; },
    setItem: (_key: string, next: string) => { value = next; },
  };
}

function depthMap(draft: StyleLabBuilderDraft) {
  const depths = new Map<string, number>([[STYLE_LAB_BUILDER_ROOT_ID, 0]]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of draft.nodes) {
      if (node.id === STYLE_LAB_BUILDER_ROOT_ID || depths.has(node.id)) continue;
      const parentDepth = depths.get(node.parentId ?? STYLE_LAB_BUILDER_ROOT_ID);
      if (parentDepth !== undefined) {
        depths.set(node.id, parentDepth + 1);
        changed = true;
      }
    }
  }
  return depths;
}

test("blank Builder draft normalizes to a permanent root and default canvas", () => {
  const draft = normalizeStyleLabBuilderDraft(null);
  assert.equal(draft.moduleName, "Untitled Module");
  assert.equal(draft.canvasWidth, "390");
  assert.deepEqual(draft.nodes.map((node) => ({ id: node.id, type: node.type, parentId: node.parentId })), [{ id: "root", type: "container", parentId: null }]);
});

test("malformed storage and unknown node types fall back safely", () => {
  assert.equal(readStyleLabBuilderDraft(storage("not-json")).nodes.length, 1);
  const draft = normalizeStyleLabBuilderDraft({ nodes: [{ id: "bad", type: "script", parentId: "root" }] });
  assert.deepEqual(draft.nodes.map((node) => node.id), ["root"]);
});

test("duplicate IDs are normalized and invalid parents recover to root", () => {
  const draft = normalizeStyleLabBuilderDraft({
    nodes: [
      { id: "first", type: "text", parentId: "missing", order: 0, text: "First" },
      { id: "first", type: "text", parentId: "first", order: 1, text: "Second" },
      { id: "leaf-parent", type: "text", parentId: "root", order: 2, text: "Leaf" },
      { id: "child-of-leaf", type: "chip", parentId: "leaf-parent", order: 0, text: "Recovered" },
    ],
  });
  assert.equal(new Set(draft.nodes.map((node) => node.id)).size, draft.nodes.length);
  assert.equal(draft.nodes.find((node) => node.id === "first")?.parentId, "root");
  assert.equal(draft.nodes.find((node) => node.id === "child-of-leaf")?.parentId, "root");
});

test("cycles are removed and maximum nesting depth is enforced", () => {
  const cycle = normalizeStyleLabBuilderDraft({ nodes: [
    { id: "a", type: "container", parentId: "b", order: 0 },
    { id: "b", type: "container", parentId: "a", order: 0 },
  ] });
  assert.equal(cycle.nodes.find((node) => node.id === "a")?.parentId, "root");
  assert.equal(cycle.nodes.find((node) => node.id === "b")?.parentId, "root");

  const chain = [{ id: "root", type: "container", parentId: null, order: 0 }];
  for (let index = 1; index <= 10; index += 1) chain.push({ id: `level-${index}`, type: "container", parentId: `level-${index - 1}`, order: 0 });
  const normalized = normalizeStyleLabBuilderDraft({ nodes: chain });
  assert.ok(Math.max(...depthMap(normalized).values()) <= STYLE_LAB_BUILDER_MAX_DEPTH);
  const manyNodes = normalizeStyleLabBuilderDraft({ nodes: Array.from({ length: 80 }, (_, index) => ({ id: `node-${index}`, type: "text", parentId: "root", order: index, text: String(index) })) });
  assert.ok(manyNodes.nodes.length <= 60);
});

test("add, move, duplicate, and delete preserve row order and subtree ownership", () => {
  let draft = createDefaultStyleLabBuilderDraft("Metric Tile");
  draft = addStyleLabBuilderNode(draft, "text", "root");
  const firstText = draft.nodes.find((node) => node.type === "text")!.id;
  draft = addStyleLabBuilderNode(draft, "chip", "root");
  const chip = draft.nodes.find((node) => node.type === "chip")!.id;
  draft = addStyleLabBuilderNode(draft, "text", "root");
  const secondText = draft.nodes.filter((node) => node.type === "text")[1]!.id;
  assert.deepEqual(getStyleLabBuilderChildren(draft, "root").map((node) => node.id), [firstText, chip, secondText]);
  draft = moveStyleLabBuilderNode(draft, secondText, "earlier");
  assert.deepEqual(getStyleLabBuilderChildren(draft, "root").map((node) => node.id), [firstText, secondText, chip]);
  draft = addStyleLabBuilderNode(draft, "divider", firstText);
  const siblingAfterText = getStyleLabBuilderChildren(draft, "root").find((node) => node.type === "divider")!.id;
  assert.deepEqual(getStyleLabBuilderChildren(draft, "root").map((node) => node.id), [firstText, siblingAfterText, secondText, chip]);

  draft = addStyleLabBuilderNode(draft, "container", "root");
  const container = draft.nodes.find((node) => node.type === "container" && node.id !== "root")!.id;
  draft = addStyleLabBuilderNode(draft, "text", container);
  const nested = draft.nodes.find((node) => node.parentId === container)!.id;
  const duplicated = duplicateStyleLabBuilderNode(draft, container);
  const duplicateContainer = duplicated.nodes.find((node) => node.parentId === "root" && node.id !== container && node.id !== "root" && node.type === "container")!;
  assert.notEqual(duplicateContainer.id, container);
  assert.equal(duplicated.nodes.filter((node) => node.parentId === duplicateContainer.id).length, 1);
  assert.notEqual(duplicated.nodes.find((node) => node.parentId === duplicateContainer.id)!.id, nested);
  const deleted = deleteStyleLabBuilderNode(duplicated, container);
  assert.equal(getStyleLabBuilderNode(deleted, nested), null);
});

test("approved properties survive while arbitrary values and grid columns are rejected", () => {
  const draft = normalizeStyleLabBuilderDraft({
    nodes: [{ id: "root", type: "container", parentId: null, order: 0, styles: { layout: "grid", gridColumns: 3, gap: "0.5rem", backgroundColor: "Subtle", radius: "large" } }],
  });
  const root = getStyleLabBuilderNode(draft, "root")!;
  assert.equal(root.type, "container");
  if (root.type === "container") {
    assert.equal(root.styles.layout, "grid");
    assert.equal(root.styles.gridColumns, 3);
    assert.equal(root.styles.backgroundColor, "Subtle");
    assert.equal(root.styles.gap, "0.5rem");
  }
  const rejected = normalizeStyleLabBuilderDraft({ nodes: [{ id: "root", type: "container", parentId: null, styles: { layout: "float", gridColumns: 9, gap: "100vw", radius: "custom" } }] });
  const rejectedRoot = getStyleLabBuilderNode(rejected, "root")!;
  assert.equal(rejectedRoot.type === "container" ? rejectedRoot.styles.layout : "", "column");
  assert.equal(rejectedRoot.type === "container" ? rejectedRoot.styles.gridColumns : 0, 1);
  assert.equal(rejectedRoot.type === "container" ? rejectedRoot.styles.gap : "", "0.5rem");
  assert.equal(rejectedRoot.type === "container" ? rejectedRoot.styles.radius : "", "large");
});

test("legacy text nodes default to ADHDice font and known font IDs normalize safely", () => {
  const legacy = normalizeStyleLabBuilderDraft({ nodes: [{ id: "legacy", type: "text", parentId: "root", text: "Legacy", styles: {} }] });
  const known = normalizeStyleLabBuilderDraft({ nodes: [{ id: "known", type: "text", parentId: "root", text: "Inter", styles: { fontFamily: "inter" } }] });
  const unknown = normalizeStyleLabBuilderDraft({ nodes: [{ id: "unknown", type: "text", parentId: "root", text: "Fallback", styles: { fontFamily: "comic-sans" } }] });
  assert.equal(legacy.nodes.find((node) => node.id === "legacy")?.type === "text" ? legacy.nodes.find((node) => node.id === "legacy")?.styles.fontFamily : "", "adhdice");
  assert.equal(known.nodes.find((node) => node.id === "known")?.type === "text" ? known.nodes.find((node) => node.id === "known")?.styles.fontFamily : "", "inter");
  assert.equal(unknown.nodes.find((node) => node.id === "unknown")?.type === "text" ? unknown.nodes.find((node) => node.id === "unknown")?.styles.fontFamily : "", "adhdice");
  assert.equal(isStyleLabBuilderFontFamily("roboto"), true);
  assert.equal(isStyleLabBuilderFontFamily("not-a-font"), false);
  assert.equal(getStyleLabBuilderFontOption("lato").label, "Lato");
});

test("Builder colors preserve semantic tokens and normalize safe custom HEX values", () => {
  const draft = normalizeStyleLabBuilderDraft({
    nodes: [
      { id: "root", type: "container", parentId: null, styles: { backgroundColor: "#ABC" } },
      { id: "text", type: "text", parentId: "root", text: "Color", styles: { textColor: "#372F55" } },
      { id: "divider", type: "divider", parentId: "root", styles: { color: "#12abef" } },
    ],
  });
  const root = draft.nodes.find((node) => node.id === "root")!;
  const text = draft.nodes.find((node) => node.id === "text")!;
  const divider = draft.nodes.find((node) => node.id === "divider")!;
  assert.equal(root.type === "container" ? root.styles.backgroundColor : "", "#aabbcc");
  assert.equal(text.type === "text" ? text.styles.textColor : "", "#372f55");
  assert.equal(divider.type === "divider" ? divider.styles.color : "", "#12abef");
  assert.equal(normalizeStyleLabCustomColor("#abc"), "#aabbcc");
  assert.equal(normalizeStyleLabCustomColor("rgb(1, 2, 3)"), null);
  assert.equal(normalizeStyleLabCustomColor("#12345678"), null);
  const semantic = normalizeStyleLabBuilderDraft({ nodes: [{ id: "root", type: "container", parentId: null, styles: { backgroundColor: "Subtle" } }] });
  assert.equal(semantic.nodes[0]?.type === "container" ? semantic.nodes[0].styles.backgroundColor : "", "Subtle");
});

test("direct Builder dimensions normalize to bounded pixels and resize deltas", () => {
  assert.equal(normalizeStyleLabBuilderDimension("286", { fallback: "100%", min: STYLE_LAB_BUILDER_MIN_WIDTH_PX, max: STYLE_LAB_BUILDER_MAX_WIDTH_PX }), "286px");
  assert.equal(normalizeStyleLabBuilderDimension("94px", { fallback: "auto", min: STYLE_LAB_BUILDER_MIN_HEIGHT_PX, max: STYLE_LAB_BUILDER_MAX_HEIGHT_PX }), "94px");
  assert.equal(normalizeStyleLabBuilderDimension("2px", { fallback: "100%", min: STYLE_LAB_BUILDER_MIN_WIDTH_PX, max: STYLE_LAB_BUILDER_MAX_WIDTH_PX }), `${STYLE_LAB_BUILDER_MIN_WIDTH_PX}px`);
  assert.equal(normalizeStyleLabBuilderDimension("2000px", { fallback: "auto", min: STYLE_LAB_BUILDER_MIN_HEIGHT_PX, max: STYLE_LAB_BUILDER_MAX_HEIGHT_PX }), `${STYLE_LAB_BUILDER_MAX_HEIGHT_PX}px`);
  assert.equal(normalizeStyleLabBuilderDimension("url(javascript:bad)", { allowAuto: true, fallback: "auto", min: STYLE_LAB_BUILDER_MIN_HEIGHT_PX, max: STYLE_LAB_BUILDER_MAX_HEIGHT_PX }), "auto");
  assert.deepEqual(resizeStyleLabBuilderDimensions(260, 80, 26, 14, "both"), { width: "286px", height: "94px" });
  assert.equal(resizeStyleLabBuilderDimensions(260, 80, -400, 0, "width").width, `${STYLE_LAB_BUILDER_MIN_WIDTH_PX}px`);
  assert.equal(resizeStyleLabBuilderDimensions(260, 80, 0, 2000, "height").height, `${STYLE_LAB_BUILDER_MAX_HEIGHT_PX}px`);
});

test("curated starter templates normalize into bounded unique editable trees", () => {
  assert.deepEqual(STYLE_LAB_BUILDER_TEMPLATES.map((template) => template.label), ["Blank", "Page Shell", "ADHDice Card", "ADHDice Panel", "Metric Tile", "3-Column Metric Grid", "Task Detail Hero"]);
  for (const template of STYLE_LAB_BUILDER_TEMPLATES) {
    const draft = createStyleLabBuilderTemplate(template.id);
    const ids = draft.nodes.map((node) => node.id);
    const depths = depthMap(draft);
    assert.equal(new Set(ids).size, ids.length, `${template.id} IDs should be unique`);
    assert.ok(ids.length <= 60, `${template.id} should respect the node limit`);
    assert.ok(Math.max(...depths.values()) <= STYLE_LAB_BUILDER_MAX_DEPTH, `${template.id} should respect the depth limit`);
    assert.equal(draft.nodes[0]?.id, STYLE_LAB_BUILDER_ROOT_ID);
  }
  assert.equal(STYLE_LAB_BUILDER_STORAGE_KEY, "adhdice-style-lab:builder-draft");
});

test("module spec and reference code preserve hierarchy, order, text, styles, and semantic tokens", () => {
  let draft = createDefaultStyleLabBuilderDraft("Metric Tile");
  draft = addStyleLabBuilderNode(draft, "text", "root");
  const textId = draft.nodes.find((node) => node.type === "text")!.id;
  draft = updateStyleLabBuilderNode(draft, textId, { text: "Priority", styles: { fontSize: "12px", fontWeight: "400", textColor: "Muted", textAlign: "center" } });
  draft = addStyleLabBuilderNode(draft, "chip", "root");
  const spec = buildStyleLabModuleSpec(draft);
  const code = buildStyleLabReferenceCode(draft);
  assert.ok(spec.indexOf("Text —") === -1);
  assert.ok(spec.indexOf("Text\n") < spec.indexOf("Chip\n"));
  assert.match(spec, /Module: Metric Tile/);
  assert.match(spec, /Text: Priority/);
  assert.match(spec, /Font size: 12px/);
  assert.match(spec, /Text color: Muted/);
  assert.match(code, /<AdhdChip/);
  assert.match(code, /var\(--text-muted\)/);
  assert.match(code, /No source files were modified/);
  assert.equal(getStyleLabTextColorCssValue("Muted"), "var(--text-muted)");
  assert.equal(getStyleLabBackgroundColorCssValue("Subtle"), "var(--surface-muted)");
  assert.notEqual(STYLE_LAB_BUILDER_STORAGE_KEY, "adhdice-style-lab:overrides");
  assert.notEqual(STYLE_LAB_BUILDER_STORAGE_KEY, "adhdice-style-lab:mock-structure");
});

test("exports include custom colors, exact dimensions, and font family", () => {
  const draft = normalizeStyleLabBuilderDraft({
    moduleName: "Exact module",
    nodes: [
      { id: "root", type: "container", parentId: null, styles: { width: "286px", height: "94px", maxWidth: "none", backgroundColor: "#f1ecff" } },
      { id: "text", type: "text", parentId: "root", text: "Urgent", styles: { fontFamily: "inter", fontSize: "18px", fontWeight: "600", textColor: "#372f55", textAlign: "center" } },
    ],
  });
  const spec = buildStyleLabModuleSpec(draft);
  const code = buildStyleLabReferenceCode(draft);
  assert.match(spec, /Font family: Inter/);
  assert.match(spec, /Text color: #372f55/);
  assert.match(spec, /Width: 286px/);
  assert.match(spec, /Height: 94px/);
  assert.match(code, /fontFamily: "\\"Inter\\", sans-serif"/);
  assert.match(code, /color: "#372f55"/);
  assert.match(code, /width: "286px"/);
  assert.match(code, /height: "94px"/);
});

test("Builder is a separate development-only Test workspace and the panel stays Inspect-only", () => {
  assert.doesNotMatch(panelSource, /StyleLabBuilder|StyleLabMode|onModeChange|Build mode|Builder active|Local draft only/);
  assert.doesNotMatch(devRootSource, /StyleLabMode|handleModeChange|onModeChange|setMode\(/);
  assert.match(devRootSource, /setInspectionActive\(false\)/);
  assert.match(builderSource, /if \(process\.env\.NODE_ENV !== "development"\) return null;/);
  assert.match(builderSource, /<AdhdChip/);
  assert.match(builderSource, /<AdhdIconButton/);
  assert.match(builderSource, /data-style-lab-builder/);
  assert.match(builderSource, /lg:grid-cols-\[minmax\(20rem,1\.15fr\)_minmax\(24rem,0\.85fr\)\]/);
  assert.match(builderSource, /lg:sticky lg:top-4 lg:self-start/);
  assert.doesNotMatch(builderSource, /xl:sticky xl:top-4 xl:self-start/);
  assert.match(builderSource, /<StyleLabBuilderColorControl/);
  assert.match(colorControlSource, /type="color"/);
  assert.match(builderSource, /STYLE_LAB_BUILDER_WEB_FONT_STYLESHEET/);
  assert.match(builderSource, /Start from template/);
  assert.match(builderSource, /onDoubleClick/);
  assert.match(builderSource, /data-builder-inline-editor/);
  assert.match(builderSource, /updateStyleLabBuilderNode\(current, editingNodeId, \{ text: value \}\)/);
  assert.match(builderSource, /onPointerCancel/);
  assert.match(builderSource, /onLostPointerCapture/);
  assert.match(builderSource, /event.key !== "Escape"/);
  assert.match(builderSource, /maxWidth: "none"/);
  assert.match(builderSource, /buildStyleLabModuleSpec/);
  assert.match(builderSource, /buildStyleLabReferenceCode/);
});
