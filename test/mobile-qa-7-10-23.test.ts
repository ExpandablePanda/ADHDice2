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

  assert.match(onTime, /<div className=\{`\$\{TASK_TABLE_INPUT_CLASS\} flex min-w-0 max-w-full items-center`\}><input className=\{`\$\{TASK_TABLE_CONTROL_FONT_CLASS\} \$\{TASK_TABLE_TEXT_CLASS\} block min-w-0 w-full max-w-full box-border border-0 bg-transparent p-0/);
  assert.doesNotMatch(onTime, /on-time-datetime-input/);
  assert.doesNotMatch(globals, /on-time-datetime-input|activity-chart-svg-embedded/);

  assert.match(globals, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="range"\]\):focus/);
  assert.match(globals, /outline: none !important/);
  assert.match(globals, /box-shadow: none !important/);
  assert.match(healthDropdown, /max-sm:!text-\[16px\]/);

  assert.match(health, /<section className="-mx-\[15px\] px-3 pb-32 sm:mx-0 sm:px-4">/);
  assert.match(health, /px-3 pb-4 pt-3 sm:px-5 sm:pb-5 sm:pt-4/);
  assert.match(chart, /isEmbedded \? "w-\[640px\] min-w-\[640px\] sm:w-full sm:min-w-0"/);
  assert.doesNotMatch(chart, /className=\{`block \$\{isEmbedded \? "w-full/);
  assert.match(chart, /overflow-x-auto/);

  assert.match(home, /flex shrink-0 flex-col items-center gap-1 sm:order-1 sm:flex-row/);
  assert.match(home, /flex h-8 w-8 shrink-0 items-center justify-center[\s\S]*sm:order-2/);
  assert.match(home, /<span className="mt-0.5 shrink-0 sm:order-1">\{handle\}<\/span>/);
  assert.match(home, /order-3 flex w-full basis-full flex-wrap justify-end gap-1\.5 sm:ml-auto sm:w-auto sm:basis-auto sm:shrink-0 sm:self-center/);
  assert.match(home, /<div className="flex items-start gap-1">/);
  assert.match(home, /break-words text-sm font-semibold leading-5/);
});
