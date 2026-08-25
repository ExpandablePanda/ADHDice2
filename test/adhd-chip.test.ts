import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../src/components/ui-system/adhd-chip.tsx", import.meta.url), "utf8");

test("AdhdChip adds the shared compact gap only when an icon is present", () => {
  assert.match(source, /TASK_TABLE_ICON_LABEL_GAP_CLASS/);
  assert.match(source, /icon \? TASK_TABLE_ICON_LABEL_GAP_CLASS : null/);
  assert.match(source, /icon \? "pl-1\.5 pr-2" : null/);
  assert.match(source, /inline-flex items-center justify-center shrink-0/);
  assert.match(source, /count === undefined \? null/);
});
