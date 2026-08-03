import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createTaskSearchCommitController } from "../src/lib/task-search-controller.ts";
import { createJiti } from "jiti";

const tableModule = await createJiti(import.meta.url, {
  alias: { "@": path.resolve(process.cwd(), "src") },
  jsx: { runtime: "automatic" },
}).import<{ shouldFocusTaskTableRevealTarget: typeof import("../src/components/ui/task-management-table-v2.tsx").shouldFocusTaskTableRevealTarget }>(
  "../src/components/ui/task-management-table-v2.tsx",
);
const { shouldFocusTaskTableRevealTarget } = tableModule;

type ElementNode = {
  children?: ElementNode[];
  focus: () => void;
  props: Record<string, unknown>;
  type: unknown;
};

type SearchInputProps = Record<string, unknown> & {
  onChange: (event: { target: { value: string } }) => void;
  onFocus: () => void;
  onKeyDown?: (event: { key: string; preventDefault: () => void }) => void;
  value: string;
};

const source = readFileSync(new URL("../src/components/task-app/tasks-page.tsx", import.meta.url), "utf8");
const tableSource = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
const Fragment = Symbol("Fragment");
const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });

function createHookRuntime() {
  type Instance = { cleanups: Array<(() => void) | undefined>; deps: unknown[][]; hooks: unknown[] };
  let activeInstance: Instance | null = null;
  let hookIndex = 0;
  let rerender: (() => void) | null = null;
  const instances = new Map<string, Instance>();

  function instanceFor(path: string) {
    const existing = instances.get(path);
    if (existing) return existing;
    const instance: Instance = { cleanups: [], deps: [], hooks: [] };
    instances.set(path, instance);
    return instance;
  }

  return {
    bindRerender(callback: () => void) {
      rerender = callback;
    },
    react: {
      memo: (component: unknown) => component,
      startTransition: (callback: () => void) => callback(),
      useEffect(effect: () => void | (() => void), dependencies?: unknown[]) {
        assert.ok(activeInstance);
        const index = hookIndex++;
        const previous = activeInstance.deps[index];
        const changed = !previous
          || !dependencies
          || dependencies.length !== previous.length
          || dependencies.some((dependency, dependencyIndex) => !Object.is(dependency, previous[dependencyIndex]));
        if (!changed) return;
        activeInstance.cleanups[index]?.();
        activeInstance.deps[index] = dependencies ?? [];
        activeInstance.cleanups[index] = effect() ?? undefined;
      },
      useRef<T>(value: T) {
        assert.ok(activeInstance);
        const index = hookIndex++;
        if (!(index in activeInstance.hooks)) activeInstance.hooks[index] = { current: value };
        return activeInstance.hooks[index] as { current: T };
      },
      useState<T>(initial: T | (() => T)) {
        assert.ok(activeInstance);
        const instance = activeInstance;
        const index = hookIndex++;
        if (!(index in instance.hooks)) instance.hooks[index] = typeof initial === "function" ? (initial as () => T)() : initial;
        const setState = (next: T | ((current: T) => T)) => {
          const current = instance.hooks[index] as T;
          instance.hooks[index] = typeof next === "function" ? (next as (current: T) => T)(current) : next;
          rerender?.();
        };
        return [instance.hooks[index] as T, setState] as const;
      },
    },
    renderComponent<T>(path: string, component: (props: T) => unknown, props: T) {
      const previousInstance = activeInstance;
      const previousHookIndex = hookIndex;
      activeInstance = instanceFor(path);
      hookIndex = 0;
      const result = component(props);
      activeInstance = previousInstance;
      hookIndex = previousHookIndex;
      return result;
    },
  };
}

function compileModule(runtime: ReturnType<typeof createHookRuntime>) {
  const testModule = { exports: {} as Record<string, unknown> };
  new vm.Script(ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText).runInNewContext({
    document: (globalThis as { document?: unknown }).document,
    exports: testModule.exports,
    module: testModule,
    require(id: string) {
      if (id === "react") return runtime.react;
      if (id === "react/jsx-runtime") return { Fragment, jsx, jsxs: jsx };
      if (id === "lucide-react") return new Proxy({}, { get: () => () => null });
      if (id === "@/components/ui/task-table-primitives") {
        return {
          TASK_TABLE_ACTIVE_LIST_CHIP_CLASS: "active",
          TASK_TABLE_CHIP_BASE_CLASS: "base",
          TASK_TABLE_CONTROL_FONT_CLASS: "font",
          TASK_TABLE_LIST_CHIP_CLASS: "list",
        };
      }
      if (id === "@/components/ui-system") return { AdhdChip: () => null, AdhdDropdownPanel: () => null };
      if (id === "@/lib/task-list-folders") return { getTaskListContainerKey: (folderId: string | null) => folderId ?? "root" };
      if (id === "@/lib/task-list-rail-order") {
        return {
          getTaskListRailIndicatorLeft: () => 0,
          reorderTaskListRailItemsByStructuralKeys: (lists: unknown[]) => lists,
          resolveTaskListRailCrossContainerMove: () => null,
          resolveTaskListRailSiblingMove: () => null,
        };
      }
      if (id === "@/lib/task-search-controller") return { createTaskSearchCommitController };
      throw new Error(`Unexpected Tasks header dependency: ${id}`);
    },
    window: (globalThis as { window?: unknown }).window,
  });
  return testModule.exports as { TaskOperationsHeader: (props: Record<string, unknown>) => unknown };
}

function materialize(
  value: unknown,
  path: string,
  runtime: ReturnType<typeof createHookRuntime>,
  nodes: Map<string, ElementNode>,
): ElementNode[] {
  if (Array.isArray(value)) return value.flatMap((child, index) => materialize(child, `${path}/${index}`, runtime, nodes));
  if (!value || typeof value !== "object") return [];
  const element = value as { props?: Record<string, unknown>; type?: unknown };
  if (element.type === Fragment) return materialize(element.props?.children, `${path}/fragment`, runtime, nodes);
  if (typeof element.type === "function" && "onSearchChange" in (element.props ?? {})) {
    return materialize(runtime.renderComponent(`${path}/search-box`, element.type as (props: Record<string, unknown>) => unknown, element.props ?? {}), `${path}/search-box-output`, runtime, nodes);
  }
  if (typeof element.type !== "string") return [];

  const node = nodes.get(path) ?? {
    children: [],
    focus() {
      (globalThis as { document?: { activeElement: ElementNode | null } }).document!.activeElement = node;
    },
    props: {},
    type: element.type,
  };
  node.props = element.props ?? {};
  node.children = materialize(node.props.children, `${path}/children`, runtime, nodes);
  nodes.set(path, node);
  const ref = node.props.ref as { current?: ElementNode } | undefined;
  if (ref) ref.current = node;
  return [node];
}

function findInput(nodes: ElementNode[]): ElementNode | null {
  for (const node of nodes) {
    if (node.type === "input") return node;
    const child = findInput(node.children ?? []);
    if (child) return child;
  }
  return null;
}

test("Tasks header search keeps focus and DOM identity across the 180ms commit", async () => {
  (globalThis as { window?: unknown }).window = { clearTimeout, setTimeout };
  (globalThis as { document?: { activeElement: ElementNode | null } }).document = { activeElement: null };

  const runtime = createHookRuntime();
  const components = compileModule(runtime);
  let committedSearch = "";
  const nodes = new Map<string, ElementNode>();
  let rendered: ElementNode[] = [];
  let submittedSearch = "";
  const props: Record<string, unknown> = {
    actionLabel: "Focus",
    activeCount: 1,
    allListDirectoryEntries: [],
    appVersion: "7.6.33",
    archiveCount: 0,
    currentFolderBreadcrumbs: [],
    currentFolderId: null,
    filterRowsNode: null,
    hideSearch: false,
    isKeyboardShortcutsMenuOpen: false,
    isRailHidden: false,
    isListColumnMenuOpen: false,
    keyboardShortcutsMenuRef: { current: null },
    listColumnLabels: {},
    listColumnMenuRef: { current: null },
    listColumnPickerColumns: [],
    listVisibleColumns: [],
    lists: [],
    metric: { doneTasks: [], label: "1", percent: 50, remainingTasks: [], summary: "1 task", totalCount: 1 },
    onCycleMomentum: () => undefined,
    onOpenArchive: () => undefined,
    onOpenComposer: () => undefined,
    onOpenFocusPlanner: () => undefined,
    onOpenImport: () => undefined,
    onOpenListSettings: () => undefined,
    onOpenMomentumDetails: () => undefined,
    onOpenTrash: () => undefined,
    onSelectBucket: () => undefined,
    onToggleRail: () => undefined,
    onExpandAllColumns: () => undefined,
    onShrinkAllColumns: () => undefined,
    onSearchChange: (value: string) => {
      committedSearch = value;
      render();
    },
    onSearchSubmit: (value: string) => { submittedSearch = value; },
    onViewChange: () => undefined,
    onToggleKeyboardShortcutsMenu: () => undefined,
    onToggleListColumn: () => undefined,
    onToggleListColumnMenu: () => undefined,
    onNavigateFolder: () => undefined,
    onMoveStructure: undefined,
    openFolderRails: [],
    search: committedSearch,
    selectedBucket: "all",
    shortcuts: [],
    trashCount: 0,
    todayCount: 1,
    view: "list",
  };
  function render() {
    props.search = committedSearch;
    rendered = materialize(
      runtime.renderComponent("header", components.TaskOperationsHeader, props),
      "header-output",
      runtime,
      nodes,
    );
  }
  runtime.bindRerender(render);
  render();

  const input = findInput(rendered);
  assert.ok(input);
  input.focus();
  const inputProps = input.props as SearchInputProps;
  inputProps.onFocus();
  inputProps.onChange({ target: { value: "a" } });
  await new Promise((resolve) => setTimeout(resolve, 220));

  const committedInput = findInput(rendered);
  assert.ok(committedInput);
  assert.equal((globalThis as { document: { activeElement: ElementNode | null } }).document.activeElement, input);
  assert.equal(committedInput, input);

  const committedInputProps = committedInput.props as SearchInputProps;
  committedInputProps.onChange({ target: { value: "ab" } });
  const latestInput = findInput(rendered);
  assert.ok(latestInput);
  assert.equal(latestInput, input);
  assert.equal((latestInput.props as SearchInputProps).value, "ab");
  (latestInput.props as SearchInputProps).onKeyDown?.({ key: "Enter", preventDefault() {} });
  assert.equal(submittedSearch, "ab");
});

test("real Table reveal gate does not focus a result while search owns focus", () => {
  const previousDocument = (globalThis as { document?: unknown }).document;
  const focusCalls: string[] = [];
  (globalThis as { document?: { activeElement: { id: string } } }).document = {
    activeElement: { id: "task-search-input" },
  };

  try {
    assert.equal(shouldFocusTaskTableRevealTarget(false), false);
    if (shouldFocusTaskTableRevealTarget(false)) focusCalls.push("passive-result");
    assert.deepEqual(focusCalls, []);

    assert.equal(shouldFocusTaskTableRevealTarget(true), true);
    if (shouldFocusTaskTableRevealTarget(true)) focusCalls.push("enter-result");
    assert.deepEqual(focusCalls, ["enter-result"]);

    (globalThis as { document?: { activeElement: { id: string } } }).document = {
      activeElement: { id: "other-control" },
    };
    assert.equal(shouldFocusTaskTableRevealTarget(false), false);
    assert.equal(shouldFocusTaskTableRevealTarget(undefined), true);
  } finally {
    (globalThis as { document?: unknown }).document = previousDocument;
  }
});

test("Table reveal uses the same passive guard through both animation frames and keeps requested focus paths", () => {
  const revealStart = tableSource.lastIndexOf("useEffect(() =>", tableSource.indexOf("const getHighlightedRowClassName"));
  const revealEnd = tableSource.indexOf("const getHighlightedRowClassName", revealStart);
  const revealEffect = tableSource.slice(revealStart, revealEnd);

  assert.match(revealEffect, /shouldFocusTaskTableRevealTarget\(highlightedRevealShouldFocus\)/);
  assert.match(revealEffect, /const firstFrameId = window\.requestAnimationFrame/);
  assert.match(revealEffect, /secondFrameId = window\.requestAnimationFrame\(revealTarget\)/);
  assert.match(tableSource, /input\.focus\(\{ preventScroll: true \}\)/);
  assert.match(tableSource, /requestedEditorFocus/);
});
