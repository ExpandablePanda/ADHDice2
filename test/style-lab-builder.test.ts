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
  STYLE_LAB_BUILDER_ROOT_ID,
  STYLE_LAB_BUILDER_STORAGE_KEY,
  updateStyleLabBuilderNode,
  readStyleLabBuilderDraft,
  type StyleLabBuilderDraft,
} from "@/components/style-lab/style-lab-builder-model";
import { buildStyleLabModuleSpec, buildStyleLabReferenceCode } from "@/components/style-lab/style-lab-builder-export";
import { getStyleLabBackgroundColorCssValue, getStyleLabTextColorCssValue } from "@/components/style-lab/style-lab-registry";

const builderSource = readFileSync(new URL("../src/components/style-lab/style-lab-builder.tsx", import.meta.url), "utf8");
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

test("Builder is a separate development-only Test workspace and the panel stays Inspect-only", () => {
  assert.doesNotMatch(panelSource, /StyleLabBuilder|StyleLabMode|onModeChange|Build mode|Builder active|Local draft only/);
  assert.doesNotMatch(devRootSource, /StyleLabMode|handleModeChange|onModeChange|setMode\(/);
  assert.match(devRootSource, /setInspectionActive\(false\)/);
  assert.match(builderSource, /if \(process\.env\.NODE_ENV !== "development"\) return null;/);
  assert.match(builderSource, /<AdhdChip/);
  assert.match(builderSource, /<AdhdIconButton/);
  assert.match(builderSource, /data-style-lab-builder/);
  assert.match(builderSource, /lg:grid-cols-\[minmax\(20rem,1\.15fr\)_minmax\(24rem,0\.85fr\)\]/);
  assert.match(builderSource, /buildStyleLabModuleSpec/);
  assert.match(builderSource, /buildStyleLabReferenceCode/);
});
