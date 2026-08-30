import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  focusDropdownControl,
  revealDropdownOptionWithinPanel,
  shouldCloseDropdownOnFocusLeave,
  shouldCloseDropdownOnTab,
} from "../src/lib/dropdown-interaction.ts";

function rect(top: number, bottom: number) {
  return { bottom, top };
}

test("focusDropdownControl establishes focus without requesting page scroll", () => {
  const calls: Array<FocusOptions | undefined> = [];
  const control = {
    focus(options?: FocusOptions) {
      calls.push(options);
    },
  };

  focusDropdownControl(control as unknown as HTMLElement);

  assert.deepEqual(calls, [{ preventScroll: true }]);
});

test("revealDropdownOptionWithinPanel leaves visible options and scrolls only the panel", () => {
  const panel = {
    scrollTop: 40,
    getBoundingClientRect: () => rect(100, 200),
  };
  let scrollIntoViewCalled = false;
  const visibleOption = {
    getBoundingClientRect: () => rect(120, 180),
    scrollIntoView: () => {
      scrollIntoViewCalled = true;
    },
  };

  revealDropdownOptionWithinPanel(visibleOption, panel);

  assert.equal(panel.scrollTop, 40);
  assert.equal(scrollIntoViewCalled, false);
});

test("revealDropdownOptionWithinPanel moves the panel for options above or below its viewport", () => {
  const panel = {
    scrollTop: 40,
    getBoundingClientRect: () => rect(100, 200),
  };

  revealDropdownOptionWithinPanel({ getBoundingClientRect: () => rect(70, 120) }, panel);
  assert.equal(panel.scrollTop, 10);

  revealDropdownOptionWithinPanel({ getBoundingClientRect: () => rect(180, 230) }, panel);
  assert.equal(panel.scrollTop, 40);
});

test("dropdown focus-leave and Tab decisions preserve normal focus traversal", () => {
  const inside = {};
  const outside = {};
  const root = { contains: (target: object | null) => target === inside } as unknown as HTMLElement;

  assert.equal(shouldCloseDropdownOnFocusLeave(root, inside), false);
  assert.equal(shouldCloseDropdownOnFocusLeave(root, outside), true);
  assert.equal(shouldCloseDropdownOnFocusLeave(root, null), true);
  assert.equal(shouldCloseDropdownOnTab("Tab", true), true);
  assert.equal(shouldCloseDropdownOnTab("Tab", false), false);
  assert.equal(shouldCloseDropdownOnTab("ArrowDown", true), false);
});

test("migrated production listboxes use panel-local reveal instead of document scrolling", () => {
  const sources = [
    "../src/components/task-app/health-dropdown.tsx",
    "../src/components/focus-form-controls.tsx",
    "../src/components/focus-page.tsx",
    "../src/components/task-app/navigator-search-inline.tsx",
    "../src/components/focus-history.tsx",
    "../src/components/focus-modals.tsx",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

  for (const source of sources) {
    assert.match(source, /revealDropdownOptionWithinPanel/);
    assert.doesNotMatch(source, /highlighted(?:Option|RangeOption)Ref\.current\?\.scrollIntoView/);
  }
});
