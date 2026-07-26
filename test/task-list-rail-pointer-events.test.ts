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
new vm.Script(compiled).runInNewContext({
  exports,
  module: { exports },
  require: (id: string) => {
    if (id === "react") return { memo: (value: unknown) => value, startTransition: (callback: () => void) => callback(), useCallback: (value: unknown) => value, useEffect: () => undefined, useRef: (value: unknown) => ({ current: value }), useState: (value: unknown) => [value, () => undefined] };
    if (id === "react/jsx-runtime") return { Fragment: Symbol("Fragment"), jsx: () => null, jsxs: () => null };
    if (id === "lucide-react") return new Proxy({}, { get: () => () => null });
    if (id.startsWith("@/components") || id.startsWith("@/lib/task-list-folders") || id.startsWith("@/lib/task-list-rail-order") || id.startsWith("@/lib/task-ui-state")) return {};
    return require(id);
  },
});

const { resolveTaskRailDropIntent } = (exports as { resolveTaskRailDropIntent: (type: "folder" | "list", pointerX: number, left: number, width: number) => string });

test("List Rail pointer zones retain list halves and folder 25/50/25 placement", () => {
  assert.equal(resolveTaskRailDropIntent("list", 49, 0, 100), "before");
  assert.equal(resolveTaskRailDropIntent("list", 50, 0, 100), "after");
  assert.equal(resolveTaskRailDropIntent("folder", 24, 0, 100), "before");
  assert.equal(resolveTaskRailDropIntent("folder", 25, 0, 100), "inside-folder");
  assert.equal(resolveTaskRailDropIntent("folder", 74, 0, 100), "inside-folder");
  assert.equal(resolveTaskRailDropIntent("folder", 75, 0, 100), "after");
});

test("List Rail has no diagnostic panel, controls, callbacks, or pointer-move snapshot state", () => {
  assert.doesNotMatch(source, /RootRailDiagnosticsPanel|Copy Diagnostics|Reset Diagnostics|onDiagnostics|diagnosticPointerMoveCountRef/);
  assert.match(source, /TASK_RAIL_RELEASE_TOLERANCE_PX = 14/);
  assert.match(source, /setPointerCapture/);
  assert.match(source, /activeGenerationId !== drag\.generationId/);
  assert.match(source, /Number\.isSafeInteger\(rawFolderDestinationIndex\)/);
});
