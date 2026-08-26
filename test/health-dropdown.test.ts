import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dropdownSource = readFileSync(new URL("../src/components/task-app/health-dropdown.tsx", import.meta.url), "utf8");
const healthPageSource = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
const healthDropdownSource = dropdownSource.slice(dropdownSource.indexOf("export function HealthDropdown"));

test("HealthDropdown opens on focus only when opted in and highlights the selected option", () => {
  assert.match(dropdownSource, /openOnFocus = false/);
  assert.match(dropdownSource, /openOnFocus\?: boolean/);
  assert.match(dropdownSource, /if \(openOnFocus\) \{\s+setHighlightedIndex\(selectedIndex\);\s+setIsOpen\(true\);/);
  assert.match(healthPageSource, /ariaLabel="Measurement"[\s\S]*?openOnFocus/);
  assert.doesNotMatch(dropdownSource, /openOnFocus = true/);
});

test("HealthDropdown options are not Tab stops and Tab closes without trapping focus", () => {
  assert.match(dropdownSource, /event\.key === "Tab"\) \{\s+setIsOpen\(false\);/);
  assert.match(dropdownSource, /role="option"\s+tabIndex=\{-1\}/);
  const tabBranch = healthDropdownSource.slice(healthDropdownSource.indexOf("} else if (event.key === \"Tab\")"), healthDropdownSource.indexOf("} else if (event.key === \"Escape\")"));
  assert.doesNotMatch(tabBranch, /event\.preventDefault\(\)/);
});

test("HealthDropdown keeps current Arrow, Enter, Space, and Escape behavior", () => {
  assert.match(dropdownSource, /event\.key === "ArrowDown"/);
  assert.match(dropdownSource, /event\.key === "ArrowUp"/);
  assert.match(dropdownSource, /event\.key === "Home"/);
  assert.match(dropdownSource, /event\.key === "End"/);
  assert.match(dropdownSource, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(dropdownSource, /event\.key === "Escape"/);
});
