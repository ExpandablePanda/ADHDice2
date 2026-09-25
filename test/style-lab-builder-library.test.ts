import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getStyleLabBuilderLibraryEntry,
  getStyleLabBuilderLibraryEntryForLegacyTemplate,
  getStyleLabBuilderRoleCoverage,
  normalizeStyleLabBuilderLibraryCategory,
  searchStyleLabBuilderLibrary,
  STYLE_LAB_BUILDER_LIBRARY,
  STYLE_LAB_BUILDER_LIBRARY_CATEGORIES,
  STYLE_LAB_BUILDER_ROLE_COVERAGE,
} from "@/components/style-lab/style-lab-builder-library";
import {
  getStyleLabUiInventoryCounts,
  STYLE_LAB_UI_INVENTORY,
  validateStyleLabUiInventory,
} from "@/components/style-lab/style-lab-ui-inventory";
import {
  createDefaultStyleLabBuilderDraft,
  getStyleLabBuilderChildren,
  getStyleLabBuilderNode,
  insertStyleLabBuilderDraft,
  normalizeStyleLabBuilderDraft,
  STYLE_LAB_BUILDER_MAX_DEPTH,
  STYLE_LAB_BUILDER_MAX_NODES,
  STYLE_LAB_BUILDER_ROOT_ID,
  STYLE_LAB_BUILDER_STORAGE_KEY,
} from "@/components/style-lab/style-lab-builder-model";
import { STYLE_LAB_ROLES } from "@/components/style-lab/style-lab-registry";
import { createStyleLabBuilderTemplate, STYLE_LAB_BUILDER_TEMPLATES } from "@/components/style-lab/style-lab-builder-templates";

const builderSource = readFileSync(new URL("../src/components/style-lab/style-lab-builder.tsx", import.meta.url), "utf8");

test("UI Library registry IDs are unique, categorized, and normalize", () => {
  const ids = STYLE_LAB_BUILDER_LIBRARY.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(normalizeStyleLabBuilderLibraryCategory("chips"), "Chips");
  assert.deepEqual(normalizeStyleLabBuilderLibraryCategory("not-a-category"), "All");
  assert.ok(STYLE_LAB_BUILDER_LIBRARY_CATEGORIES.includes("HUD"));
  assert.ok(STYLE_LAB_BUILDER_LIBRARY_CATEGORIES.includes("Journal"));
});

test("UI Library search matches labels, categories, sources, aliases, and tags", () => {
  assert.ok(searchStyleLabBuilderLibrary("status").some((item) => item.id === "primitive.chip.progress"));
  assert.ok(searchStyleLabBuilderLibrary("chip", "Chips").length >= 13);
  assert.ok(searchStyleLabBuilderLibrary("AdhdPanel").some((item) => item.id === "primitive.panel"));
  assert.ok(searchStyleLabBuilderLibrary("in progress").some((item) => item.id === "primitive.chip.progress"));
  assert.ok(searchStyleLabBuilderLibrary("HUD").every((item) => item.category === "HUD" || item.tags.includes("hud") || item.aliases?.includes("HUD")));
  assert.ok(searchStyleLabBuilderLibrary("menu").some((item) => item.id === "primitive.dropdown-panel"));
  assert.ok(searchStyleLabBuilderLibrary("journal").some((item) => item.id === "module.journal-entry-summary"));
});

test("legacy Builder templates resolve through the central library", () => {
  for (const template of STYLE_LAB_BUILDER_TEMPLATES) {
    const entry = getStyleLabBuilderLibraryEntryForLegacyTemplate(template.id);
    assert.ok(entry, `${template.id} should map to a catalog entry`);
    assert.deepEqual(createStyleLabBuilderTemplate(template.id), entry.createDraft());
    assert.equal(entry.coverageStatus, "ready");
  }
  assert.equal(getStyleLabBuilderLibraryEntry("template.blank")?.legacyTemplateId, "blank");
});

test("shared UI-system primitives and meaningful variants have ready adapters", () => {
  const sharedIds = [
    "primitive.card",
    "primitive.chip.default",
    "primitive.dropdown-panel",
    "primitive.dropdown-select",
    "primitive.icon-button.default",
    "header.entity",
    "primitive.panel",
    "shell.body-card",
  ];
  for (const id of sharedIds) {
    const entry = getStyleLabBuilderLibraryEntry(id);
    assert.ok(entry, `${id} should be cataloged`);
    assert.equal(entry.coverageStatus, "ready");
    assert.deepEqual(entry.createDraft(), normalizeStyleLabBuilderDraft(entry.createDraft()));
  }
  const chipTones = ["default", "purple", "pending", "progress", "delayed", "done", "best", "missed", "upcoming", "notDue", "complete", "archived", "danger"];
  for (const tone of chipTones) assert.ok(getStyleLabBuilderLibraryEntry(`primitive.chip.${tone}`), `${tone} chip tone should be represented`);
  for (const tone of ["default", "purple", "success", "warning", "danger", "ghost"]) assert.ok(getStyleLabBuilderLibraryEntry(`primitive.icon-button.${tone}`), `${tone} icon button tone should be represented`);
});

test("Start From produces normalized drafts and Insert preserves fresh IDs, hierarchy, spans, and selection root", () => {
  const source = getStyleLabBuilderLibraryEntry("pattern.metric-grid")!.createDraft();
  const base = createDefaultStyleLabBuilderDraft("Existing module");
  const result = insertStyleLabBuilderDraft(base, source, STYLE_LAB_BUILDER_ROOT_ID);
  assert.ok(result.insertedRootId);
  assert.deepEqual(result.draft, normalizeStyleLabBuilderDraft(result.draft));
  assert.equal(getStyleLabBuilderNode(result.draft, result.insertedRootId)?.parentId, STYLE_LAB_BUILDER_ROOT_ID);
  assert.equal(result.draft.nodes.length, base.nodes.length + source.nodes.length);
  const insertedChildren = getStyleLabBuilderChildren(result.draft, result.insertedRootId!);
  assert.equal(insertedChildren[0]?.type, "container");
  assert.equal(insertedChildren[0]?.parentId, result.insertedRootId);
  assert.equal(insertedChildren[0]?.placement.gridColumnSpan, 4);
  assert.equal(new Set(result.draft.nodes.map((node) => node.id)).size, result.draft.nodes.length);
});

test("Insert targets a selected Container, inserts after a selected leaf, and handles invalid selection at Root", () => {
  const source = getStyleLabBuilderLibraryEntry("primitive.chip.progress")!.createDraft();
  const containerDraft = normalizeStyleLabBuilderDraft({ nodes: [
    { id: "root", type: "container", parentId: null, order: 0, styles: {} },
    { id: "host", type: "container", parentId: "root", order: 0, styles: {} },
  ] });
  const inside = insertStyleLabBuilderDraft(containerDraft, source, "host");
  assert.equal(getStyleLabBuilderNode(inside.draft, inside.insertedRootId)?.parentId, "host");

  const leafDraft = normalizeStyleLabBuilderDraft({ nodes: [
    { id: "root", type: "container", parentId: null, order: 0, styles: {} },
    { id: "first", type: "text", parentId: "root", order: 0, text: "First" },
    { id: "second", type: "text", parentId: "root", order: 1, text: "Second" },
  ] });
  const after = insertStyleLabBuilderDraft(leafDraft, source, "first");
  const children = getStyleLabBuilderChildren(after.draft, STYLE_LAB_BUILDER_ROOT_ID);
  assert.equal(children[1]?.id, after.insertedRootId);
  assert.equal(children[2]?.id, "second");

  const invalid = insertStyleLabBuilderDraft(leafDraft, source, "missing");
  assert.equal(getStyleLabBuilderNode(invalid.draft, invalid.insertedRootId)?.parentId, STYLE_LAB_BUILDER_ROOT_ID);
});

test("Insert never exceeds the existing node and depth limits", () => {
  const manyNodes = normalizeStyleLabBuilderDraft({ nodes: [
    { id: "root", type: "container", parentId: null, order: 0, styles: {} },
    ...Array.from({ length: STYLE_LAB_BUILDER_MAX_NODES - 1 }, (_, index) => ({ id: `leaf-${index}`, type: "text", parentId: "root", order: index, text: String(index) })),
  ] });
  const source = getStyleLabBuilderLibraryEntry("primitive.card")!.createDraft();
  const nodeLimited = insertStyleLabBuilderDraft(manyNodes, source, "root");
  assert.equal(nodeLimited.insertedRootId, null);
  assert.equal(nodeLimited.draft.nodes.length, STYLE_LAB_BUILDER_MAX_NODES);

  const chain: unknown[] = [{ id: "root", type: "container", parentId: null, order: 0, styles: {} }];
  for (let index = 1; index <= STYLE_LAB_BUILDER_MAX_DEPTH; index += 1) chain.push({ id: `level-${index}`, type: "container", parentId: index === 1 ? "root" : `level-${index - 1}`, order: index, styles: {} });
  const depthLimited = insertStyleLabBuilderDraft(normalizeStyleLabBuilderDraft({ nodes: chain }), source, `level-${STYLE_LAB_BUILDER_MAX_DEPTH}`);
  assert.equal(depthLimited.insertedRootId, null);
});

test("Style Lab roles are classified without promoting temporary mock roles", () => {
  assert.equal(new Set(STYLE_LAB_BUILDER_ROLE_COVERAGE.map((item) => item.roleId)).size, STYLE_LAB_ROLES.length);
  for (const role of STYLE_LAB_ROLES) {
    const coverage = getStyleLabBuilderRoleCoverage(role.id);
    assert.ok(coverage, `${role.id} should be classified`);
    if (role.id.startsWith("mock.")) {
      assert.equal(coverage.coverageStatus, "intentionally-nonvisual");
      assert.deepEqual(coverage.libraryEntryIds, []);
    } else {
      assert.equal(coverage.coverageStatus, "ready");
      assert.ok(coverage.libraryEntryIds.every((id) => getStyleLabBuilderLibraryEntry(id)?.coverageStatus === "ready"));
    }
  }
});

test("wider ADHDice UI inventory is deterministic and has explicit coverage", () => {
  const validation = validateStyleLabUiInventory();
  assert.deepEqual(validation, { duplicateSourcePaths: [], invalidLibraryEntryLinks: [], missingReasons: [], unclassified: [] });
  assert.ok(STYLE_LAB_UI_INVENTORY.length >= 40);
  assert.ok(STYLE_LAB_UI_INVENTORY.some((item) => item.category === "Health" && item.coverageStatus === "adapter-needed"));
  assert.ok(STYLE_LAB_UI_INVENTORY.some((item) => item.category === "Journal" && item.coverageStatus === "ready"));
  assert.ok(Object.keys(getStyleLabUiInventoryCounts()).some((key) => key.endsWith(":unsupported-for-builder")));
  for (const item of STYLE_LAB_UI_INVENTORY) {
    if (item.coverageStatus === "ready") assert.ok(item.libraryEntryIds.length > 0);
    else assert.ok(item.reason?.trim());
  }
});

test("Builder exposes separate local Start From UI and Insert UI actions and preserves local storage", () => {
  assert.match(builderSource, /Start From UI/);
  assert.match(builderSource, /Insert UI/);
  assert.match(builderSource, /Search UI Library/);
  assert.match(builderSource, /Source: \{selectedEntry\.sourceComponent\}/);
  assert.equal(STYLE_LAB_BUILDER_STORAGE_KEY, "adhdice-style-lab:builder-draft");
});
