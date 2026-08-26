import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/task-app/health-dropdown.tsx", import.meta.url), "utf8");
const autocompleteSource = source.slice(source.indexOf("export function HealthAutocomplete"), source.indexOf("export function HealthDropdown"));
const chooseSource = autocompleteSource.slice(autocompleteSource.indexOf("function chooseSuggestion"), autocompleteSource.indexOf("\n  return ("));
const keyHandlerSource = autocompleteSource.slice(autocompleteSource.indexOf("onKeyDown={(event) =>"), autocompleteSource.indexOf("role=\"combobox\""));

test("HealthAutocomplete options use arrow and Enter navigation instead of Tab stops", () => {
  assert.match(autocompleteSource, /role="option"/);
  assert.match(autocompleteSource, /tabIndex=\{-1\}/);
  assert.match(keyHandlerSource, /event\.key === "ArrowDown"[\s\S]*setHighlightedIndex/);
  assert.match(keyHandlerSource, /event\.key === "ArrowUp"[\s\S]*setHighlightedIndex/);
  assert.match(keyHandlerSource, /event\.key === "Enter"[\s\S]*chooseSuggestion\(highlightedIndex\)/);
});

test("HealthAutocomplete Tab commits the highlighted suggestion and leaves the Food control", () => {
  assert.match(keyHandlerSource, /event\.key === "Tab" && isOpen && matchingSuggestions\[highlightedIndex\][\s\S]*chooseSuggestion\(highlightedIndex\)/);
  assert.doesNotMatch(keyHandlerSource.slice(keyHandlerSource.indexOf('event.key === "Tab"'), keyHandlerSource.indexOf('event.key === "Escape"')), /preventDefault/);
  assert.match(chooseSource, /onChange\(suggestion\.label\)/);
  assert.match(chooseSource, /onSelect\?\.\(suggestion\)/);
  assert.match(chooseSource, /setIsOpen\(false\)/);
});

test("HealthAutocomplete keeps pointer selection predictable and Escape closes suggestions", () => {
  assert.match(autocompleteSource, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(keyHandlerSource, /event\.key === "Escape"[\s\S]*setIsOpen\(false\)/);
});
