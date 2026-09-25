import { strict as assert } from "node:assert";
import test from "node:test";
import {
  applyStyleLabBuilderDrop,
  canStyleLabBuilderMoveNode,
  getStyleLabBuilderDescendantIds,
  getStyleLabBuilderDropContainer,
  getStyleLabBuilderGridDropTarget,
  getStyleLabBuilderLinearDropTarget,
  getStyleLabBuilderNodeDepth,
  packStyleLabBuilderGrid,
  planStyleLabBuilderDrop,
} from "@/components/style-lab/style-lab-builder-drag";
import {
  normalizeStyleLabBuilderDraft,
  normalizeStyleLabBuilderGridColumnSpan,
  STYLE_LAB_BUILDER_MAX_DEPTH,
  STYLE_LAB_BUILDER_STORAGE_KEY,
  type StyleLabBuilderDraft,
} from "@/components/style-lab/style-lab-builder-model";
import { buildStyleLabModuleSpec, buildStyleLabReferenceCode } from "@/components/style-lab/style-lab-builder-export";
import { createStyleLabBuilderTemplate } from "@/components/style-lab/style-lab-builder-templates";

function draftWithNodes(nodes: unknown[]): StyleLabBuilderDraft {
  return normalizeStyleLabBuilderDraft({ moduleName: "Drag test", canvasWidth: "390", nodes });
}

function linearDraft(layout: "row" | "column" = "column") {
  return draftWithNodes([
    { id: "root", type: "container", parentId: null, order: 0, styles: { layout, width: "100%" } },
    { id: "a", type: "text", parentId: "root", order: 0, text: "A" },
    { id: "b", type: "text", parentId: "root", order: 1, text: "B" },
    { id: "c", type: "text", parentId: "root", order: 2, text: "C" },
  ]);
}

test("Builder grid columns normalize across the 1-12 range", () => {
  assert.equal(normalizeStyleLabBuilderGridColumnSpan(0, 12), 1);
  assert.equal(normalizeStyleLabBuilderGridColumnSpan(7, 12), 7);
  assert.equal(normalizeStyleLabBuilderGridColumnSpan(99, 12), 12);
  const draft = normalizeStyleLabBuilderDraft({ nodes: [{ id: "root", type: "container", parentId: null, styles: { layout: "grid", gridColumns: 12 } }] });
  assert.equal(draft.nodes[0]?.type === "container" ? draft.nodes[0].styles.gridColumns : 0, 12);
});

test("legacy grid drafts default children to span one and clamp spans to parent columns", () => {
  const legacy = draftWithNodes([
    { id: "root", type: "container", parentId: null, styles: { layout: "grid", gridColumns: 3 } },
    { id: "legacy", type: "text", parentId: "root", order: 0, text: "Legacy" },
    { id: "too-wide", type: "text", parentId: "root", order: 1, text: "Too wide", placement: { gridColumnSpan: 9 } },
  ]);
  assert.equal(legacy.nodes.find((node) => node.id === "legacy")?.placement.gridColumnSpan, 1);
  assert.equal(legacy.nodes.find((node) => node.id === "too-wide")?.placement.gridColumnSpan, 3);
  const persisted = normalizeStyleLabBuilderDraft(JSON.parse(JSON.stringify(legacy)));
  assert.deepEqual(persisted, legacy);
  assert.equal(STYLE_LAB_BUILDER_STORAGE_KEY, "adhdice-style-lab:builder-draft");
});

test("packed grid geometry creates equal-span and mixed-span rows", () => {
  const equal = packStyleLabBuilderGrid([
    { id: "a", gridColumnSpan: 4, height: 20 },
    { id: "b", gridColumnSpan: 4, height: 20 },
    { id: "c", gridColumnSpan: 4, height: 20 },
  ], 12, 120, 0);
  assert.deepEqual(equal.items.map((item) => [item.id, item.rowIndex, item.columnStart, item.columnSpan]), [["a", 0, 1, 4], ["b", 0, 5, 4], ["c", 0, 9, 4]]);
  const mixed = packStyleLabBuilderGrid([
    { id: "a", gridColumnSpan: 6, height: 20 },
    { id: "b", gridColumnSpan: 3, height: 24 },
    { id: "c", gridColumnSpan: 3, height: 20 },
  ], 12, 120, 0);
  assert.deepEqual(mixed.items.map((item) => [item.id, item.rowIndex, item.columnStart, item.columnSpan]), [["a", 0, 1, 6], ["b", 0, 7, 3], ["c", 0, 10, 3]]);
});

test("row and column insertion candidates snap before, between, and after", () => {
  const children = [
    { id: "a", index: 0, bottom: 30, height: 30, left: 0, right: 100, top: 0, width: 100 },
    { id: "b", index: 1, bottom: 90, height: 30, left: 0, right: 100, top: 60, width: 100 },
    { id: "c", index: 2, bottom: 150, height: 30, left: 0, right: 100, top: 120, width: 100 },
  ];
  const container = { height: 180, left: 0, top: 0, width: 100 };
  assert.equal(getStyleLabBuilderLinearDropTarget({ childRects: children, container, layout: "column", pointerX: 50, pointerY: -10, sourceHeight: 30, sourceWidth: 100 }).insertionIndex, 0);
  assert.equal(getStyleLabBuilderLinearDropTarget({ childRects: children, container, layout: "column", pointerX: 50, pointerY: 75, sourceHeight: 30, sourceWidth: 100 }).insertionIndex, 2);
  assert.equal(getStyleLabBuilderLinearDropTarget({ childRects: children, container, layout: "column", pointerX: 50, pointerY: 170, sourceHeight: 30, sourceWidth: 100 }).insertionIndex, 3);
  const rowChildren = children.map((child, index) => ({ ...child, bottom: 30, height: 30, index, left: index * 60, right: index * 60 + 40, top: 0, width: 40 }));
  assert.equal(getStyleLabBuilderLinearDropTarget({ childRects: rowChildren, container: { ...container, height: 30, width: 220 }, layout: "row", pointerX: 5, pointerY: 15, sourceHeight: 30, sourceWidth: 40 }).insertionIndex, 0);
  assert.equal(getStyleLabBuilderLinearDropTarget({ childRects: rowChildren, container: { ...container, height: 30, width: 220 }, layout: "row", pointerX: 90, pointerY: 15, sourceHeight: 30, sourceWidth: 40 }).insertionIndex, 2);
  assert.equal(getStyleLabBuilderLinearDropTarget({ childRects: rowChildren, container: { ...container, height: 30, width: 220 }, layout: "row", pointerX: 210, pointerY: 15, sourceHeight: 30, sourceWidth: 40 }).insertionIndex, 3);
});

test("grid pointer candidates snap to packed legal cells", () => {
  const target = getStyleLabBuilderGridDropTarget({
    children: [
      { id: "a", gridColumnSpan: 4, height: 20 },
      { id: "b", gridColumnSpan: 4, height: 20 },
      { id: "c", gridColumnSpan: 4, height: 20 },
    ],
    columns: 12,
    contentLeft: 10,
    contentTop: 20,
    contentWidth: 120,
    gap: 0,
    pointerX: 60,
    pointerY: 30,
    rowGap: 0,
    sourceHeight: 20,
    sourceId: "c",
    sourceSpan: 4,
  });
  assert.equal(target.insertionIndex, 1);
  assert.equal(target.candidate.left, 50);
  assert.equal(target.candidate.columnStart, 5);
});

test("drop planning reorders row, column, and grid siblings and supports spans", () => {
  const column = linearDraft("column");
  assert.deepEqual(getStyleLabBuilderChildrenIds(planStyleLabBuilderDrop(column, "c", "root", 0).draft, "root"), ["c", "a", "b"]);
  const row = linearDraft("row");
  assert.deepEqual(getStyleLabBuilderChildrenIds(planStyleLabBuilderDrop(row, "a", "root", 2).draft, "root"), ["b", "c", "a"]);
  const grid = draftWithNodes([
    { id: "root", type: "container", parentId: null, styles: { layout: "grid", gridColumns: 12 } },
    { id: "a", type: "text", parentId: "root", order: 0, text: "A", placement: { gridColumnSpan: 4 } },
    { id: "b", type: "text", parentId: "root", order: 1, text: "B", placement: { gridColumnSpan: 4 } },
    { id: "c", type: "text", parentId: "root", order: 2, text: "C", placement: { gridColumnSpan: 4 } },
  ]);
  const reordered = planStyleLabBuilderDrop(grid, "c", "root", 1).draft;
  assert.deepEqual(getStyleLabBuilderChildrenIds(reordered, "root"), ["a", "c", "b"]);
  assert.equal(reordered.nodes.find((node) => node.id === "c")?.placement.gridColumnSpan, 4);
});

test("drop targeting chooses the deepest container and blocks cycles and depth overflow", () => {
  const draft = draftWithNodes([
    { id: "root", type: "container", parentId: null, styles: {} },
    { id: "source", type: "container", parentId: "root", order: 0, styles: {} },
    { id: "nested", type: "container", parentId: "source", order: 0, styles: {} },
    { id: "text", type: "text", parentId: "source", order: 1, text: "Text" },
  ]);
  const target = getStyleLabBuilderDropContainer([
    { id: "root", parentId: null, depth: 0, gridColumns: 1, layout: "column", left: 0, top: 0, width: 300, height: 300, right: 300, bottom: 300 },
    { id: "source", parentId: "root", depth: 1, gridColumns: 1, layout: "column", left: 20, top: 20, width: 200, height: 200, right: 220, bottom: 220 },
    { id: "nested", parentId: "source", depth: 2, gridColumns: 1, layout: "column", left: 40, top: 40, width: 100, height: 100, right: 140, bottom: 140 },
  ], 60, 60, "source", getStyleLabBuilderDescendantIds(draft, "source"));
  assert.equal(target?.container.id, "nested");
  assert.equal(target?.valid, false);
  assert.equal(target?.reason, "DESCENDANT");
  assert.equal(canStyleLabBuilderMoveNode(draft, "source", "nested").valid, false);

  const chainNodes: unknown[] = [{ id: "root", type: "container", parentId: null, styles: {} }, { id: "source", type: "container", parentId: "root", order: 0, styles: {} }];
  for (let index = 1; index <= STYLE_LAB_BUILDER_MAX_DEPTH; index += 1) chainNodes.push({ id: `deep-${index}`, type: "container", parentId: index === 1 ? "root" : `deep-${index - 1}`, order: index, styles: {} });
  const deepDraft = draftWithNodes(chainNodes);
  assert.equal(canStyleLabBuilderMoveNode(deepDraft, "source", "deep-6").reason, "DEPTH");
  assert.equal(getStyleLabBuilderNodeDepth(deepDraft, "deep-6"), STYLE_LAB_BUILDER_MAX_DEPTH);
});

test("cross-container and ancestor moves normalize parent/order without changing the storage architecture", () => {
  const draft = draftWithNodes([
    { id: "root", type: "container", parentId: null, styles: {} },
    { id: "left", type: "container", parentId: "root", order: 0, styles: {} },
    { id: "right", type: "container", parentId: "root", order: 1, styles: {} },
    { id: "nested", type: "container", parentId: "right", order: 0, styles: {} },
    { id: "move", type: "text", parentId: "left", order: 0, text: "Move" },
  ]);
  const intoNested = applyStyleLabBuilderDrop(draft, "move", "nested", 0);
  assert.equal(intoNested.nodes.find((node) => node.id === "move")?.parentId, "nested");
  const backToRoot = applyStyleLabBuilderDrop(intoNested, "move", "root", 0);
  assert.equal(backToRoot.nodes.find((node) => node.id === "move")?.parentId, "root");
  assert.equal(JSON.stringify(backToRoot).includes("candidate"), false);
});

test("cancel leaves the exact starting draft and successful grid exports include span metadata", () => {
  const draft = createStyleLabBuilderTemplate("metric-grid");
  assert.deepEqual(planStyleLabBuilderDrop(draft, "root", "root", 0).draft, draft);
  const spec = buildStyleLabModuleSpec(draft);
  const code = buildStyleLabReferenceCode(draft);
  assert.match(spec, /Grid columns: 12/);
  assert.match(spec, /Column span: 4/);
  assert.match(code, /gridColumn: "span 4"/);
  assert.match(code, /gridTemplateColumns: "repeat\(12, minmax\(0, 1fr\)\)"/);
});

function getStyleLabBuilderChildrenIds(draft: StyleLabBuilderDraft, parentId: string): string[] {
  return draft.nodes.filter((node) => node.parentId === parentId).sort((left, right) => left.order - right.order).map((node) => node.id);
}
