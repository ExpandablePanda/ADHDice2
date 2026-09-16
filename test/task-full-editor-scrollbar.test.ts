import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tableSource = readFileSync("src/components/ui/task-management-table-v2.tsx", "utf8");
const cssSource = readFileSync("src/app/globals.css", "utf8");

test("the normal Table scroll owner keeps canonical hidden chrome and scrolling enabled", () => {
  const tableScrollOwner = tableSource.slice(
    tableSource.indexOf('className="adhdice-scrollbar relative min-h'),
    tableSource.indexOf("variants={{", tableSource.indexOf('className="adhdice-scrollbar relative min-h')),
  );

  assert.match(tableScrollOwner, /className="adhdice-scrollbar relative min-h-\[min\(28rem,65vh\)\] max-h-\[65vh\] overflow-x-auto overflow-y-auto"/);
  assert.doesNotMatch(tableSource, /isFullInspectorOpen/);
  assert.doesNotMatch(tableScrollOwner, /overflow-hidden/);
  assert.doesNotMatch(tableScrollOwner, /(?:scrollTop|scrollLeft)\s*=[^=]|scrollTo\(|scrollIntoView\(/);
});

test("every full Edit Task scroll owner uses the canonical utility while retaining vertical scrolling", () => {
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

  assert.match(desktopFullEditor, /className="pointer-events-auto relative[\s\S]*overflow-y-auto overscroll-contain[^\"]*adhdice-scrollbar/);
  assert.match(mobileFullEditor, /className="adhdice-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"/);
  assert.match(overlayContentClassSource, /overlayMode === "full"[\s\S]*\? "adhdice-scrollbar flex flex-1 items-start justify-center overflow-x-hidden overflow-y-auto/);
  assert.match(quickOverlayClassSource, /overflow-y-auto/);
  assert.doesNotMatch(tableSource, /adhdice-scrollbar-hidden/);
  assert.doesNotMatch(desktopFullEditor, /scrollTo\(|scrollIntoView\(|(?:scrollTop|scrollLeft)\s*=/);
  assert.doesNotMatch(mobileFullEditor, /scrollTo\(|scrollIntoView\(|(?:scrollTop|scrollLeft)\s*=/);
});

test("the canonical scrollbar utility covers Firefox, legacy Edge, and WebKit chrome", () => {
  assert.match(cssSource, /\.adhdice-scrollbar\s*\{\s*scrollbar-width:\s*none;\s*-ms-overflow-style:\s*none;\s*\}/);
  assert.match(cssSource, /html::-webkit-scrollbar,[\s\S]*\.adhdice-scrollbar::-webkit-scrollbar\s*\{[\s\S]*display:\s*none;[\s\S]*width:\s*0 !important;[\s\S]*height:\s*0 !important;/);
  assert.match(cssSource, /html::-webkit-scrollbar-track,[\s\S]*\.adhdice-scrollbar::-webkit-scrollbar-track\s*\{[\s\S]*background:\s*transparent !important;/);
  assert.match(cssSource, /html::-webkit-scrollbar-thumb,[\s\S]*\.adhdice-scrollbar::-webkit-scrollbar-thumb\s*\{[\s\S]*background:\s*transparent !important;/);
  assert.match(cssSource, /html::-webkit-scrollbar-thumb:hover,[\s\S]*\.adhdice-scrollbar::-webkit-scrollbar-thumb:hover\s*\{[\s\S]*background:\s*transparent !important;/);
  assert.doesNotMatch(cssSource, /adhdice-scrollbar-hidden/);
});

test("full Edit Task does not reset scroll positions or depend on a duplicate utility", () => {
  const fullEditorSource = tableSource.slice(
    tableSource.indexOf("const fullDesktopEditorNode"),
    tableSource.indexOf("return (", tableSource.indexOf("const fullDesktopEditorNode")),
  );

  assert.doesNotMatch(fullEditorSource, /scrollTo\(|scrollIntoView\(|(?:scrollTop|scrollLeft)\s*=/);
  assert.doesNotMatch(tableSource, /adhdice-scrollbar-hidden/);
});
