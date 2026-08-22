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
  assert.match(health, /<div className=\{`\$\{HEALTH_COMPACT_CONTROL_CLASS\} flex min-w-0 max-w-full items-center max-sm:!h-\[32px\] max-sm:!min-h-\[32px\]`\}>\s*<input\s+className="block min-w-0 w-full max-w-full box-border border-0 bg-transparent p-0[\s\S]*text-\[13px\] leading-normal[\s\S]*max-sm:!text-\[16px\] max-sm:!leading-normal/);
  assert.doesNotMatch(health, /HealthMealDateTimeInput[\s\S]*!h-\[26px\][\s\S]*max-sm/);
  assert.equal((health.match(/<HealthMealDateTimeInput/g) ?? []).length, 6);

  assert.match(health, /<section className="-mx-\[15px\] px-3 pb-32 sm:mx-0 sm:px-4">/);
  assert.match(health, /px-3 pb-4 pt-3 sm:px-5 sm:pb-5 sm:pt-4/);
  assert.match(chart, /isEmbedded \? "w-\[640px\] min-w-\[640px\] sm:w-full sm:min-w-0"/);
  assert.doesNotMatch(chart, /className=\{`block \$\{isEmbedded \? "w-full/);
  assert.match(chart, /overflow-x-auto/);

  assert.match(home, /grid min-w-0 grid-cols-\[auto_auto_auto_minmax\(0,1fr\)_auto_auto_auto\] items-center gap-x-0\.5/);
  assert.match(home, /<span className="-ml-1 shrink-0">\{handle\}<\/span>[\s\S]*flex h-7 w-7 shrink-0/);
  assert.match(home, /renderTaskStatusCircle\(displayStatus, "sm", \{ className: "!h-7 !w-7", glyphClassName: "!h-4 !w-4 !text-sm" \}\)/);
  assert.doesNotMatch(home, /flex shrink-0 flex-col items-center/);
  assert.doesNotMatch(home, /basis-full/);
  assert.match(home, /min-w-0 max-w-full text-left/);
  assert.match(home, /<ArrowUpToLine aria-hidden="true" \/>/);
  assert.match(home, /<ArrowDownToLine aria-hidden="true" \/>/);
  assert.doesNotMatch(home, /<ArrowUp aria-hidden/);
  assert.doesNotMatch(home, /<ArrowDown aria-hidden/);
  assert.match(home, /\{index !== 0 \? \(/);
  assert.match(home, /\{index !== todoTasks\.length - 1 \? \(/);
  assert.match(home, /title="Move task to Bottom"/);
  assert.match(home, /aria-label=\{`Remove \$\{task\.title \|\| "Untitled task"\} from Home To-do`\}/);
  assert.match(home, /<Minus aria-hidden="true" \/>/);
  assert.equal((home.match(/size="sm"/g) ?? []).length, 3);
  assert.match(home, /tone="danger"/);
  assert.doesNotMatch(home, /variant="rowToolbar"/);
  assert.match(home, /-mx-\[15px\] w-auto max-w-4xl px-3 pb-32 pt-6 sm:mx-auto sm:px-4/);
  assert.doesNotMatch(home, /Search your Tasks and arrange the order you want to work through\./);
  assert.match(home, /<div className="relative mt-2" ref=\{searchRef\}>/);
  assert.match(home, /break-words text-sm font-semibold leading-5/);
});
