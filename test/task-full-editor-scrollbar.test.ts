import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tableSource = readFileSync("src/components/ui/task-management-table-v2.tsx", "utf8");
const cssSource = readFileSync("src/app/globals.css", "utf8");

test("desktop and mobile full Edit Task scroll containers hide scrollbar chrome while retaining vertical scrolling", () => {
  const desktopFullEditor = tableSource.slice(
    tableSource.indexOf("const fullDesktopEditorNode"),
    tableSource.indexOf("const overlayContentClass"),
  );
  const mobileFullEditor = tableSource.slice(
    tableSource.indexOf(") : useMobileFullOverlay ? ("),
    tableSource.indexOf(") : overlayMode === \"full\" ? ("),
  );
  const overlayContentClassSource = tableSource.slice(
    tableSource.indexOf("const overlayContentClass"),
    tableSource.indexOf("return (", tableSource.indexOf("const overlayContentClass")),
  );
  const quickOverlayClassSource = overlayContentClassSource.slice(overlayContentClassSource.indexOf(": \"grid flex-1"));

  assert.match(desktopFullEditor, /className="pointer-events-auto relative[\s\S]*overflow-y-auto overscroll-contain[^\"]*adhdice-scrollbar-hidden/);
  assert.match(mobileFullEditor, /className="adhdice-scrollbar adhdice-scrollbar-hidden min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"/);
  assert.match(overlayContentClassSource, /overlayMode === "full"[\s\S]*\? "adhdice-scrollbar-hidden flex flex-1 items-start justify-center overflow-x-hidden overflow-y-auto/);
  assert.match(quickOverlayClassSource, /overflow-y-auto/);
  assert.doesNotMatch(quickOverlayClassSource, /adhdice-scrollbar-hidden/);
});

test("the dedicated scrollbar utility hides native chrome without disabling overflow", () => {
  const utility = cssSource.slice(
    cssSource.indexOf(".adhdice-scrollbar-hidden"),
    cssSource.indexOf(".adhdice-native-interaction-suppressed"),
  );

  assert.match(utility, /scrollbar-width:\s*none;/);
  assert.match(utility, /-ms-overflow-style:\s*none;/);
  assert.match(utility, /\.adhdice-scrollbar-hidden::-webkit-scrollbar\s*\{[\s\S]*display:\s*none;/);
  assert.doesNotMatch(utility, /overflow(?:-x|-y)?\s*:/);
});

test("quick overlays do not automatically receive the full-editor scrollbar treatment", () => {
  const quickOverlaySource = tableSource.slice(
    tableSource.indexOf(": \"grid flex-1", tableSource.indexOf("const overlayContentClass")),
    tableSource.indexOf(";", tableSource.indexOf(": \"grid flex-1", tableSource.indexOf("const overlayContentClass"))),
  );

  assert.match(quickOverlaySource, /overflow-y-auto/);
  assert.doesNotMatch(quickOverlaySource, /adhdice-scrollbar-hidden/);
});
