import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dropdownSource = readFileSync(new URL("../src/components/task-app/health-dropdown.tsx", import.meta.url), "utf8");
const healthPageSource = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
const healthDropdownSource = dropdownSource.slice(dropdownSource.indexOf("export function HealthDropdown"));

test("HealthDropdown opens on focus only when opted in and highlights the selected option", () => {
  assert.match(dropdownSource, /openOnFocus = false/);
  assert.match(dropdownSource, /openOnFocus\?: boolean/);
  assert.match(dropdownSource, /if \(openOnFocus && !pointerActivationRef\.current\) \{\s+setHighlightedIndex\(selectedIndex\);\s+setIsOpen\(true\);/);
  assert.match(healthPageSource, /ariaLabel="Measurement"[\s\S]*?openOnFocus/);
  assert.doesNotMatch(dropdownSource, /openOnFocus = true/);
});

test("HealthDropdown options are not Tab stops and Tab closes without trapping focus", () => {
  assert.match(dropdownSource, /shouldCloseDropdownOnTab\(event\.key, isOpen\)[\s\S]*setIsOpen\(false\);/);
  assert.match(dropdownSource, /role="option"\s+tabIndex=\{-1\}/);
  const tabBranch = healthDropdownSource.slice(healthDropdownSource.indexOf("} else if (event.key === \"Tab\")"), healthDropdownSource.indexOf("} else if (event.key === \"Escape\")"));
  assert.doesNotMatch(tabBranch, /event\.preventDefault\(\)/);
});

test("HealthDropdown closes when focus leaves its root without selecting or trapping focus", () => {
  assert.match(dropdownSource, /shouldCloseDropdownOnFocusLeave\(rootRef\.current, event\.relatedTarget\)[\s\S]*setIsOpen\(false\);/);
  const blurHandler = dropdownSource.slice(dropdownSource.indexOf("onBlur={(event) =>"), dropdownSource.indexOf("ref={rootRef}") );
  assert.doesNotMatch(blurHandler, /preventDefault\(\)|chooseOption\(|onChange\(/);
});

test("HealthDropdown pointer opening focuses the existing trigger without page scrolling", () => {
  assert.match(dropdownSource, /const triggerRef = useRef<HTMLButtonElement \| null>\(null\);/);
  assert.match(dropdownSource, /focusDropdownControl\(triggerRef\.current\)/);
  assert.match(dropdownSource, /ref=\{triggerRef\}/);
  assert.match(dropdownSource, /ref=\{panelRef\}/);
  assert.doesNotMatch(dropdownSource, /scrollIntoView/);
});

test("HealthDropdown pointer option selection prevents focus transfer and closes after choosing", () => {
  const optionSource = healthDropdownSource.slice(healthDropdownSource.indexOf("{options.map"));
  const chooseOptionSource = healthDropdownSource.slice(healthDropdownSource.indexOf("function chooseOption"), healthDropdownSource.indexOf("\n  return ("));

  assert.match(optionSource, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(optionSource, /onClick=\{\(\) => chooseOption\(index\)\}/);
  assert.match(chooseOptionSource, /onChange\(option\.value\);\s+setHighlightedIndex\(index\);\s+setIsOpen\(false\);/);
});

test("HealthDropdown trailing actions are generic sibling controls that cannot select an option", () => {
  assert.match(dropdownSource, /trailingAction\?: HealthDropdownTrailingAction/);
  assert.match(dropdownSource, /export type HealthDropdownTrailingAction/);
  assert.match(dropdownSource, /ariaLabel: string;[\s\S]*content: ReactNode;[\s\S]*onClick: \(\) => void;/);

  const actionRowStart = dropdownSource.indexOf('<div className="w-full" key={option.value} role="none">');
  assert.ok(actionRowStart >= 0);
  const actionRow = dropdownSource.slice(actionRowStart, dropdownSource.indexOf("</div>", actionRowStart) + 6);
  assert.match(actionRow, /\{optionButton\}/);
  assert.match(actionRow, /aria-label=\{option\.trailingAction\.ariaLabel\}/);
  assert.match(actionRow, /event\.stopPropagation\(\);\s+option\.trailingAction\?\.onClick\(\);/);
  assert.doesNotMatch(actionRow, /chooseOption\(index\)/);
  assert.match(dropdownSource, /if \(!option\.trailingAction\) \{\s+return optionButton;\s+\}/);
});

test("HealthPage uses neutral composite fields for every HealthDropdown", () => {
  const healthDropdownCount = (healthPageSource.match(/<HealthDropdown/g) ?? []).length;
  const compositeFieldCount = (healthPageSource.match(/<Field composite label=/g) ?? []).length;

  assert.equal(healthDropdownCount, 7);
  assert.equal(compositeFieldCount, healthDropdownCount);
  assert.doesNotMatch(healthPageSource, /<Field(?! composite) label="[^"]+">(?:(?!<Field\b|<\/Field>)[\s\S])*<HealthDropdown/);
});

test("Journal symptom dropdowns use the composite field mode while ordinary fields keep implicit labels", () => {
  assert.match(healthPageSource, /<Field composite label="Symptom">\s+<HealthDropdown[\s\S]*?ariaLabel="Symptom"/);
  assert.match(healthPageSource, /<Field composite label="Symptom">\s+<HealthDropdown[\s\S]*?ariaLabel="Trend symptom"/);

  const fieldSource = healthPageSource.slice(healthPageSource.indexOf("function Field("), healthPageSource.indexOf("function HealthMealDateTimeInput"));
  assert.match(fieldSource, /composite = false/);
  assert.match(fieldSource, /return composite \? <div className="grid gap-2">\{content\}<\/div> : <label className="grid gap-2">\{content\}<\/label>/);
});

test("HealthDropdown keeps current Arrow, Enter, Space, and Escape behavior", () => {
  assert.match(dropdownSource, /event\.key === "ArrowDown"/);
  assert.match(dropdownSource, /event\.key === "ArrowUp"/);
  assert.match(dropdownSource, /event\.key === "Home"/);
  assert.match(dropdownSource, /event\.key === "End"/);
  assert.match(dropdownSource, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(dropdownSource, /event\.key === "Escape"/);
});
