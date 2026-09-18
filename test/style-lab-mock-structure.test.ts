import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getStyleLabRole } from "@/components/style-lab/style-lab-registry";
import {
  addStyleLabMockNode,
  createStyleLabMockNode,
  getStyleLabMockAllowedTypes,
  getStyleLabMockHostKind,
  getStyleLabMockSectionHostKey,
  getStyleLabPageShellMockHostKey,
  getStyleLabTasksRailMockHostKey,
  normalizeStyleLabMockDraft,
  readStyleLabMockDraft,
  removeStyleLabMockNode,
  reorderStyleLabMockNode,
  resolveStyleLabHiddenTargetElement,
  resolveStyleLabStructuralTarget,
  restoreAllStyleLabHiddenTargets,
  setStyleLabHiddenTarget,
  STYLE_LAB_MOCK_STRUCTURE_STORAGE_KEY,
  writeStyleLabMockDraft,
} from "@/components/style-lab/style-lab-mock-registry";
import {
  buildStyleLabCss,
  getStyleLabDesignSpec,
  readStyleLabOverrides,
  writeStyleLabOverrides,
  type StyleLabStorage,
} from "@/components/style-lab/style-lab-runtime";
import type { StyleLabMockDraft } from "@/components/style-lab/style-lab-mock-types";

class MemoryStorage implements StyleLabStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("mock roles are deliberate and do not reuse real chip styling authority", () => {
  assert.equal(getStyleLabRole("mock.chip")?.component, "Style Lab Mock Chip");
  assert.ok(getStyleLabRole("mock.section.body"));
  const css = buildStyleLabCss({ "mock.chip": { fontSize: "13px", backgroundColor: "#d357fe" } });
  assert.match(css, /data-style-role="mock\.chip"/);
  assert.doesNotMatch(css, /data-style-role="ui\.chip"/);
});

test("mock draft normalization rejects invalid types and normalizes safe defaults", () => {
  const draft = normalizeStyleLabMockDraft({
    nodes: [
      { id: "chip-1", parentHostKey: "page-shell:focus:body", type: "chip", text: "New List" },
      { id: "bad-1", parentHostKey: "page-shell:focus:body", type: "html", text: "Unsafe" },
      { id: "item-1", parentHostKey: "page-shell:focus:body", type: "item", text: "New item" },
    ],
  });
  assert.deepEqual(draft.nodes.map((node) => node.type), ["chip", "item"]);
  assert.equal(draft.nodes[0]?.icon, "plus");
  assert.equal(draft.nodes[1]?.subtitle, undefined);
});

test("approved host keys expose only their allowed mock child types", () => {
  assert.equal(getStyleLabPageShellMockHostKey("focus-goals"), "page-shell:focus-goals:body");
  assert.equal(getStyleLabTasksRailMockHostKey("root"), "tasks-rail:root");
  assert.equal(getStyleLabMockSectionHostKey("mock-3"), "mock-section:mock-3:body");
  assert.equal(getStyleLabMockHostKind("tasks-rail:root"), "tasks-rail");
  assert.deepEqual(getStyleLabMockAllowedTypes("tasks-rail"), ["chip"]);
  assert.deepEqual(getStyleLabMockAllowedTypes("page-shell-body"), ["chip", "item", "section"]);
});

test("safe structural target resolution hides the full Page Shell wrapper and stable rail chip", () => {
  const shell = {
    dataset: { pageShellId: "focus", pageShellLabel: "Focus" },
  } as unknown as HTMLElement;
  const pageSurface = {
    dataset: { styleRole: "page.shell.surface" },
    closest: (selector: string) => selector === "[data-page-shell-id]" ? shell : null,
  } as unknown as HTMLElement;
  const pageTarget = resolveStyleLabStructuralTarget(pageSurface);
  assert.equal(pageTarget?.key, "page-shell:focus");
  assert.equal(pageTarget?.element, shell);
  assert.equal(pageTarget?.stable, true);
  assert.equal(resolveStyleLabHiddenTargetElement({ querySelectorAll: () => [shell] }, {
    context: "Page Shell",
    key: "page-shell:focus",
    kind: "page-shell",
    label: "Focus",
    roleId: "page.shell.surface",
    stable: true,
  }), shell);

  const railChip = {
    dataset: { styleRole: "tasks.rail.chip", styleLabStructureKey: "list-1" },
    closest: () => null,
    textContent: "Today",
  } as unknown as HTMLElement;
  const chipTarget = resolveStyleLabStructuralTarget(railChip);
  assert.equal(chipTarget?.key, "tasks-rail-chip:list-1");
  assert.equal(chipTarget?.kind, "tasks-rail-chip");
  const pageTitle = { dataset: { styleRole: "page.shell.title" }, closest: () => shell } as unknown as HTMLElement;
  assert.equal(resolveStyleLabStructuralTarget(pageTitle), null);
});

test("mock add, nested section, sibling reorder, and subtree removal stay local to the draft", () => {
  const empty: StyleLabMockDraft = { hiddenTargets: [], nodes: [] };
  const shellKey = getStyleLabPageShellMockHostKey("home");
  const section = createStyleLabMockNode("section-1", "section", shellKey, 0);
  const item = createStyleLabMockNode("item-1", "item", shellKey, 1);
  const nested = createStyleLabMockNode("nested-chip", "chip", getStyleLabMockSectionHostKey(section.id), 0);
  const withNodes = addStyleLabMockNode(addStyleLabMockNode(addStyleLabMockNode(empty, section), item), nested);
  const reordered = reorderStyleLabMockNode(withNodes, item.id, "earlier");
  assert.deepEqual(reordered.nodes.filter((node) => node.parentHostKey === shellKey).map((node) => node.id), ["item-1", "section-1"]);
  const removed = removeStyleLabMockNode(reordered, section.id);
  assert.deepEqual(removed.nodes.map((node) => node.id), ["item-1"]);
});

test("mock structure persistence uses its own namespace and drops session-only hidden targets", () => {
  const storage = new MemoryStorage();
  writeStyleLabOverrides(storage, { "ui.chip": { fontSize: "14px" } });
  const stable = {
    context: "Page Shell",
    key: "page-shell:home",
    kind: "page-shell" as const,
    label: "Home",
    roleId: "page.shell.surface" as const,
    stable: true,
  };
  const sessionOnly = { ...stable, key: "session:card-1", kind: "card" as const, stable: false };
  const draft = setStyleLabHiddenTarget(
    setStyleLabHiddenTarget({ nodes: [], hiddenTargets: [] }, stable),
    sessionOnly,
  );
  writeStyleLabMockDraft(storage, draft);
  const restored = readStyleLabMockDraft(storage);
  assert.deepEqual(restored.hiddenTargets.map((target) => target.key), ["page-shell:home"]);
  assert.equal(storage.getItem(STYLE_LAB_MOCK_STRUCTURE_STORAGE_KEY)?.includes("session:card-1"), false);
  assert.deepEqual(readStyleLabOverrides(storage), { "ui.chip": { fontSize: "14px" } });
  assert.deepEqual(restoreAllStyleLabHiddenTargets(restored).hiddenTargets, []);
});

test("structural design specs describe add and remove intent without runtime selectors", () => {
  const node = createStyleLabMockNode("mock-1", "chip", "tasks-rail:root", 2);
  const addSpec = getStyleLabDesignSpec("mock.chip", { "mock.chip": { fontSize: "13px", backgroundColor: "#d357fe" } }, {
    structural: {
      action: "add",
      context: "Style Lab mock structure",
      node,
      parent: "Tasks page · Lists rail",
      position: 3,
      siblingCount: 4,
    },
  });
  assert.match(addSpec, /Action: Add/);
  assert.match(addSpec, /Type: Chip/);
  assert.match(addSpec, /Parent: Tasks page · Lists rail/);
  assert.match(addSpec, /Position: 3 of 4 mock elements/);
  assert.doesNotMatch(addSpec, /mock-1/);

  const hideSpec = getStyleLabDesignSpec("page.shell.surface", {}, {
    structural: { action: "hide", context: "Page Shell", label: "Focus", roleId: "page.shell.surface", target: "Page Shell" },
  });
  assert.match(hideSpec, /Action: Remove \/ hide existing element/);
  assert.match(hideSpec, /Target: Page Shell/);
  assert.match(hideSpec, /Scope: this instance/);
  assert.match(hideSpec, /No source files were modified\./);
});

test("production seams expose approved metadata and React portal structure without Page Shell persistence calls", () => {
  const pageShellSource = readFileSync(new URL("../src/components/ui-system/reorderable-page-shells.tsx", import.meta.url), "utf8");
  const railSource = readFileSync(new URL("../src/components/task-app/tasks-page.tsx", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("../src/components/style-lab/style-lab-mock-elements.tsx", import.meta.url), "utf8");
  const rootSource = readFileSync(new URL("../src/components/style-lab/style-lab-dev-root.tsx", import.meta.url), "utf8");
  assert.match(pageShellSource, /data-page-shell-label=\{shell\.label\}/);
  assert.match(railSource, /data-style-lab-structure-key=\{list\.structuralKey \?\? list\.id\}/);
  assert.match(runtimeSource, /createPortal/);
  assert.match(runtimeSource, /data-style-role="mock\.section\.body"/);
  assert.doesNotMatch(rootSource, /layout\.(set|save|commit|update)/);
});
