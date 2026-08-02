import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/components/task-app/tasks-page.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
new vm.Script(compiled).runInNewContext({
  exports,
  module: { exports },
  require: (id: string) => {
    if (id === "react") return { memo: (value: unknown) => value, startTransition: (callback: () => void) => callback(), useCallback: (value: unknown) => value, useEffect: () => undefined, useRef: (value: unknown) => ({ current: value }), useState: (value: unknown) => [value, () => undefined] };
    if (id === "react/jsx-runtime") return { Fragment: Symbol("Fragment"), jsx, jsxs: jsx };
    if (id === "lucide-react") return new Proxy({}, { get: () => () => null });
    if (id.startsWith("@/components") || id.startsWith("@/lib/task-list-rail-order") || id.startsWith("@/lib/task-ui-state") || id === "@/lib/task-search-controller") return {};
    if (id === "@/lib/task-list-folders") return { getTaskListContainerKey: () => "root" };
    return require(id);
  },
});

const { resolveTaskRailDropIntent } = (exports as { resolveTaskRailDropIntent: (type: "folder" | "list", pointerX: number, left: number, width: number) => string });
const { ReorderableTaskChipRail } = (exports as { ReorderableTaskChipRail: (props: Record<string, unknown>) => { props: Record<string, unknown> } });

function findButtons(node: unknown): Array<{ props: Record<string, unknown> }> {
  if (Array.isArray(node)) return node.flatMap(findButtons);
  if (!node || typeof node !== "object") return [];
  const element = node as { type?: unknown; props?: Record<string, unknown> };
  const children = element.props?.children;
  const childNodes = Array.isArray(children) ? children : [children];
  return [
    ...(element.type === "button" ? [element as { props: Record<string, unknown> }] : []),
    ...childNodes.flatMap(findButtons),
  ];
}

test("List Rail pointer zones retain list halves and folder 25/50/25 placement", () => {
  assert.equal(resolveTaskRailDropIntent("list", 49, 0, 100), "before");
  assert.equal(resolveTaskRailDropIntent("list", 50, 0, 100), "after");
  assert.equal(resolveTaskRailDropIntent("folder", 24, 0, 100), "before");
  assert.equal(resolveTaskRailDropIntent("folder", 25, 0, 100), "inside-folder");
  assert.equal(resolveTaskRailDropIntent("folder", 74, 0, 100), "inside-folder");
  assert.equal(resolveTaskRailDropIntent("folder", 75, 0, 100), "after");
});

test("List Rail normal and folder chip clicks execute their callbacks", () => {
  const selectedBuckets: string[] = [];
  const openedFolders: string[] = [];
  const rail = ReorderableTaskChipRail({
    lists: [
      { id: "list-1", label: "Inbox", structureKind: "list", count: 2 },
      { id: "folder-1", label: "Projects", structureKind: "folder" },
    ],
    onOpenFolder: (folderId: string) => openedFolders.push(folderId),
    onSelectBucket: (bucket: string) => selectedBuckets.push(bucket),
    selectedBucket: "all",
  });
  const buttons = findButtons(rail);
  assert.equal(buttons.length, 2);

  assert.doesNotThrow(() => buttons[0]?.props.onClick?.({ preventDefault() {} }));
  assert.doesNotThrow(() => buttons[1]?.props.onClick?.({ preventDefault() {} }));
  assert.deepEqual(selectedBuckets, ["list-1"]);
  assert.deepEqual(openedFolders, ["folder-1"]);
});

test("List Rail has no diagnostic panel, controls, callbacks, or pointer-move snapshot state", () => {
  assert.doesNotMatch(source, /RootRailDiagnosticsPanel|Copy Diagnostics|Reset Diagnostics|onDiagnostics|diagnosticPointerMoveCountRef/);
  assert.match(source, /TASK_RAIL_RELEASE_TOLERANCE_PX = 14/);
  assert.match(source, /setPointerCapture/);
  assert.match(source, /activeGenerationId !== drag\.generationId/);
  assert.match(source, /Number\.isSafeInteger\(rawFolderDestinationIndex\)/);
});
