import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const healthPageSource = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");

test("Health text controls restore keyboard focus visibility after the global reset", () => {
  const resetIndex = css.indexOf(".health-input:focus,");
  const focusVisibleIndex = css.indexOf("input.health-input:not([type=\"checkbox\"]):not([type=\"radio\"]):not([type=\"range\"]):focus-visible,");
  const focusVisibleBlock = css.slice(focusVisibleIndex, css.indexOf("}", focusVisibleIndex) + 1);

  assert.ok(resetIndex >= 0, "the existing global focus reset should remain present");
  assert.ok(focusVisibleIndex > resetIndex, "Health focus-visible rules should follow the global reset");
  assert.match(focusVisibleBlock, /textarea\.health-input:focus-visible/);
  assert.match(focusVisibleBlock, /textarea\.health-journal-textarea:focus-visible/);
  assert.match(focusVisibleBlock, /border-color: var\(--accent\) !important/);
  assert.match(focusVisibleBlock, /outline: 2px solid color-mix\(in srgb, var\(--accent\) 72%, transparent\) !important/);
  assert.match(focusVisibleBlock, /outline-offset: 2px/);
});

test("Journal textareas use the Health keyboard-focus hook without changing base styling", () => {
  assert.equal((healthPageSource.match(/health-journal-textarea/g) ?? []).length, 2);
  assert.doesNotMatch(healthPageSource, /health-journal-textarea[^\"]*\bhealth-input\b/);
});
