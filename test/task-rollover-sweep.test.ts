import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  chunkTaskRolloverCommands,
  TASK_ROLLOVER_SWEEP_BATCH_SIZE,
} from "../src/lib/task-rollover-batch.ts";

const sweepSource = readFileSync(new URL("../src/lib/task-rollover-sweep.ts", import.meta.url), "utf8");
const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");

function commands(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    task_id: `task-${String(index + 1).padStart(2, "0")}`,
    replay_identity: `rollover:task-${index + 1}:2026-09-26:4`,
  }));
}

test("33 rollover candidates become stable bounded chunks", () => {
  const input = commands(33);
  const chunks = chunkTaskRolloverCommands(input);

  assert.equal(TASK_ROLLOVER_SWEEP_BATCH_SIZE, 8);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [8, 8, 8, 8, 1]);
  assert.ok(chunks.every((chunk) => chunk.length <= TASK_ROLLOVER_SWEEP_BATCH_SIZE));
  assert.deepEqual(chunks.flat(), input);
});

test("rollover chunks are awaited serially and stop after the first failure", () => {
  assert.match(sweepSource, /for \(let chunkIndex = 0; chunkIndex < chunks\.length; chunkIndex \+= 1\)/);
  assert.match(sweepSource, /response = await \(input\.invoke \?\? invokeTaskRolloverSweep\)/);
  assert.match(sweepSource, /if \(failed\) \{[\s\S]*?break;/);
  assert.doesNotMatch(sweepSource, /Promise\.all/);
  assert.match(sweepSource, /settledTaskIds\.push\(\.\.\.response\.committedTaskIds\)/);
  assert.match(sweepSource, /settledTaskIds: \[\.\.\.new Set\(settledTaskIds\)\]/);
});

test("chunk replay identities are deterministic and preserve child replay identities", () => {
  assert.match(sweepSource, /createRolloverChunkReplayIdentity/);
  assert.match(sweepSource, /sha256Hex\(stableSerialize\(input\.chunk\.map\(\(command\) => command\.replay_identity\)\)\)/);
  assert.match(sweepSource, /:chunk:\$\{input\.chunkIndex \+ 1\}:\$\{chunkFingerprint\}/);
  assert.match(sweepSource, /same child identities/);
  assert.match(sweepSource, /Do not mark those Tasks settled/);
});

test("each committed chunk uses incremental Achievement finalization and no full evaluator", () => {
  assert.match(sweepSource, /achievementFinalizationPending = achievementFinalizationPending \|\| chunkFinalizationPending/);
  assert.match(sweepSource, /response\.achievementStatus === "failed"/);
  assert.match(sweepSource, /success: errorMessage === null/);
  assert.match(sweepSource, /Rollover Achievement finalization requires replayable child commands/);
  assert.doesNotMatch(sweepSource, /adhdice_rebuild_achievement_progress/);
});

test("development diagnostics expose bounded sweep progress without Task payloads", () => {
  for (const field of [
    "totalCandidateCount",
    "chunkCount",
    "chunkIndex",
    "chunkSize",
    "committedCount",
    "durationMs",
    "failureState",
  ]) {
    assert.match(sweepSource, new RegExp(field));
  }
  assert.doesNotMatch(sweepSource, /console\.info\([^\n]*title/);
});

test("chunk completion does not start a per-child projection repair", () => {
  assert.doesNotMatch(sweepSource, /reconcileRolloverWorkspace|requestCurrentTaskProjectionLogicalDayRefresh/);
  assert.match(taskAppSource, /onOwnedSettled:[\s\S]*await reconcileRolloverWorkspace\(\)/);
});
