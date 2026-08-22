import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("7.10.23 mobile responsive contracts stay on the active production seams", () => {
  const paths = source("src/components/task-app/paths-workspace.tsx");
  const onTime = source("src/components/task-app/on-time-planner-workspace.tsx");
  const health = source("src/components/task-app/health-page.tsx");
  const chart = source("src/components/activity-line-chart-card.tsx");
  const home = source("src/components/task-app/home-page.tsx");
  const healthDropdown = source("src/components/task-app/health-dropdown.tsx");
  const globals = source("src/app/globals.css");

  assert.match(paths, /data-path-node-drag-surface/);
  assert.match(paths, /touch-none/);
  assert.match(paths, /closest\("\[data-path-node-drag-surface\]"\)/);
  assert.match(paths, /setPointerCapture\(event\.pointerId\)/);
  assert.match(paths, /persistNodePosition\(node\.id, nextPosition\)/);
  assert.doesNotMatch(paths, /NODE_LONG_PRESS|beginNodeLongPress/);

  assert.match(onTime, /on-time-datetime-input/);
  assert.match(globals, /\.on-time-datetime-input::-webkit-date-and-time-value/);
  assert.match(globals, /box-sizing: border-box/);

  assert.match(globals, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="range"\]\):focus/);
  assert.match(globals, /outline: none !important/);
  assert.match(globals, /box-shadow: none !important/);
  assert.match(healthDropdown, /max-sm:!text-\[16px\]/);

  assert.match(health, /<section className="px-3 pb-32 sm:px-4">/);
  assert.match(health, /px-3 pb-4 pt-3 sm:px-5 sm:pb-5 sm:pt-4/);
  assert.match(chart, /activity-chart-svg-embedded/);
  assert.match(globals, /width: 640px/);
  assert.match(chart, /overflow-x-auto/);

  assert.match(home, /flex min-w-0 flex-wrap items-start gap-3/);
  assert.match(home, /w-full basis-full flex-wrap justify-start/);
  assert.match(home, /break-words text-sm font-semibold leading-5/);
});
