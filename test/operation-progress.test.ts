import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getOperationProgressPercentage } from "../src/components/task-app/operation-progress.tsx";

const source = readFileSync(new URL("../src/components/task-app/operation-progress.tsx", import.meta.url), "utf8");

test("operation progress exposes determinate percentages and an indeterminate mode", () => {
  assert.equal(getOperationProgressPercentage(7, 15), 47);
  assert.equal(getOperationProgressPercentage(15, 15), 100);
  assert.equal(getOperationProgressPercentage(20, 15), 100);
  assert.equal(getOperationProgressPercentage(1, null), null);
});

test("operation progress uses accessible progressbar values for known counts", () => {
  assert.match(source, /role="progressbar"/);
  assert.match(source, /aria-valuemin=\{0\}/);
  assert.match(source, /aria-valuemax=\{progress\.total \?\? undefined\}/);
  assert.match(source, /aria-valuenow=\{percentage === null \? undefined : progress\.completed\}/);
  assert.match(source, /\$\{progress\.completed\} of \$\{progress\.total\}/);
  assert.match(source, /Working…/);
  assert.match(source, /animate-pulse/);
});
