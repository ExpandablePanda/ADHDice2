import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("7.10.22 narrow layouts contain PATHS, On-Time, and Health controls", async () => {
  const [paths, onTime, health, healthPage] = await Promise.all([
    readFile(new URL("../src/components/task-app/paths-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/on-time-planner-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/health-dropdown.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(paths, /grid min-w-0 max-w-full gap-0 lg:h-\[720px\] lg:grid-cols-\[minmax\(0,1fr\)_320px\]/);
  assert.match(paths, /h-\[min\(60vh,720px\)\] min-h-\[360px\] max-w-full overflow-auto/);
  assert.match(paths, /min-w-0 max-w-full min-h-0 overflow-y-auto border-t[\s\S]*lg:border-l lg:border-t-0/);
  assert.match(paths, /min-h-\[720px\] min-w-\[1180px\]/);

  assert.match(onTime, /grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2/);
  assert.match(onTime, /TASK_TABLE_INPUT_CLASS} min-w-0 max-w-full/);

  assert.match(health, /HEALTH_COMPACT_INPUT_CLASS = `\$\{HEALTH_COMPACT_CONTROL_CLASS\} max-sm:!text-\[16px\]`/);
  assert.match(health, /className=\{`\$\{HEALTH_COMPACT_CONTROL_CLASS\} flex items-center/);
  assert.match(healthPage, /className=\{`\$\{HEALTH_COMPACT_CONTROL_CLASS\} flex min-w-0 max-w-full items-center max-sm:!h-\[32px\] max-sm:!min-h-\[32px\]`\}/);
});
