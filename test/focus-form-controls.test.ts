import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/focus-form-controls.tsx", import.meta.url), "utf8");
const modalSource = readFileSync(new URL("../src/components/focus-modals.tsx", import.meta.url), "utf8");
const suggestionSource = source.slice(source.indexOf("export function FocusSuggestionInput"), source.indexOf("export function FocusPillSelect"));
const chevronButtonStart = suggestionSource.indexOf("        <button\n          aria-label={isOpen ?");
const chevronButtonEnd = suggestionSource.indexOf("</button>", chevronButtonStart) + "</button>".length;
const chevronSource = suggestionSource.slice(chevronButtonStart, chevronButtonEnd);
const manualSuggestionSource = modalSource.slice(modalSource.indexOf("function ManualSuggestionInput"), modalSource.indexOf("function ManualPillSelect"));
const manualChevronButtonStart = manualSuggestionSource.indexOf("        <button\n          aria-label={isOpen ?");
const manualChevronButtonEnd = manualSuggestionSource.indexOf("</button>", manualChevronButtonStart) + "</button>".length;
const manualChevronSource = manualSuggestionSource.slice(manualChevronButtonStart, manualChevronButtonEnd);

test("FocusSuggestionInput names its icon-only options trigger from the field label", () => {
  assert.match(chevronSource, /aria-label=\{isOpen \? `Close \$\{label\} options` : `Open \$\{label\} options`\}/);
  assert.match(chevronSource, /aria-expanded=\{isOpen\}/);
  assert.match(chevronSource, /<ChevronDown aria-hidden="true"/);
});

test("ManualSuggestionInput names its icon-only options trigger from the field label", () => {
  assert.match(manualChevronSource, /aria-label=\{isOpen \? `Close \$\{label\} options` : `Open \$\{label\} options`\}/);
  assert.match(manualChevronSource, /aria-expanded=\{isOpen\}/);
  assert.match(manualChevronSource, /setIsOpen\(\(current\) => !current\)/);
  assert.match(manualChevronSource, /<ChevronDown aria-hidden="true"/);
});

test("FocusSuggestionInput chevron opens a closed list after taking focus without toggling", () => {
  assert.match(chevronSource, /focusDropdownControl\(inputRef\.current\);\s+setIsOpen\(true\);/);
  assert.doesNotMatch(chevronSource, /setIsOpen\(\(current\) => !current\)/);
});

test("FocusSuggestionInput chevron deliberately closes an open list", () => {
  assert.match(chevronSource, /if \(isOpen\) \{\s+setIsOpen\(false\);\s+return;\s+\}/);
  assert.ok(chevronSource.indexOf("if (isOpen)") < chevronSource.indexOf("focusDropdownControl"));
});

test("FocusSuggestionInput keeps focus-open and panel-local arrow behavior", () => {
  assert.match(suggestionSource, /onFocus=\{\(\) => setIsOpen\(true\)\}/);
  assert.match(suggestionSource, /event\.key === "ArrowDown"[\s\S]*event\.preventDefault\(\)[\s\S]*setHighlightedIndex/);
  assert.match(suggestionSource, /event\.key === "ArrowUp"[\s\S]*event\.preventDefault\(\)[\s\S]*setHighlightedIndex/);
  assert.match(suggestionSource, /revealDropdownOptionWithinPanel\(highlightedOptionRef\.current, panelRef\.current\)/);
  assert.doesNotMatch(suggestionSource, /highlightedOptionRef\.current\?\.scrollIntoView/);
});
