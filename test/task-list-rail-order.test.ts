import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveTaskListRailCrossContainerMove,
  resolveTaskListRailSiblingMove,
} from "@/lib/task-list-rail-order";

const keys = ["folder:a", "system:all", "system:recurring", "system:priority_5", "list:custom", "folder:b"];

const cases = [
  ["backward before", "list:custom", "system:all", "before", 1, ["folder:a", "list:custom", "system:all", "system:recurring", "system:priority_5", "folder:b"]],
  ["backward after", "list:custom", "system:all", "after", 2, ["folder:a", "system:all", "list:custom", "system:recurring", "system:priority_5", "folder:b"]],
  ["forward before", "system:all", "list:custom", "before", 3, ["folder:a", "system:recurring", "system:priority_5", "system:all", "list:custom", "folder:b"]],
  ["forward after", "system:all", "list:custom", "after", 4, ["folder:a", "system:recurring", "system:priority_5", "list:custom", "system:all", "folder:b"]],
  ["before first", "list:custom", "folder:a", "before", 0, ["list:custom", "folder:a", "system:all", "system:recurring", "system:priority_5", "folder:b"]],
  ["after last", "system:all", "folder:b", "after", 5, ["folder:a", "system:recurring", "system:priority_5", "list:custom", "folder:b", "system:all"]],
] as const;

for (const [label, source, target, intent, destinationIndex, finalStructuralKeys] of cases) {
  test(`canonical resolver: ${label}`, () => {
    const move = resolveTaskListRailSiblingMove(keys, source, target, intent);
    assert.equal(move.invalidReason, null);
    assert.equal(move.destinationIndex, destinationIndex);
    assert.deepEqual(move.finalStructuralKeys, finalStructuralKeys);
    assert.equal(Number.isInteger(move.destinationIndex), true);
  });
}

test("Recurring before Priority 5 is the required frozen-order no-op", () => {
  const frozen = [
    "system:all", "system:inbox", "system:today", "system:milestones",
    "system:focus", "system:priority_1_2", "system:priority_3_4", "list:3962c...",
    "system:recurring", "system:priority_5", "system:routine",
  ];
  const move = resolveTaskListRailSiblingMove(frozen, "system:recurring", "system:priority_5", "before");
  assert.equal(move.sourceRenderedIndex, 8);
  assert.equal(move.targetRenderedIndex, 9);
  assert.equal(move.reducedTargetIndex, 8);
  assert.equal(move.destinationIndex, 8);
  assert.deepEqual(move.finalStructuralKeys, frozen);
  assert.equal(move.samePosition, true);
});

test("adjacent before and after positions are exact sequence no-ops", () => {
  assert.equal(resolveTaskListRailSiblingMove(keys, "system:recurring", "system:priority_5", "before").samePosition, true);
  assert.equal(resolveTaskListRailSiblingMove(keys, "system:priority_5", "system:recurring", "after").samePosition, true);
});

test("missing and self targets return precise invalid reasons without mutation", () => {
  for (const [source, target, reason] of [
    ["missing", "system:all", "missing-source"],
    ["system:all", "missing", "missing-target"],
    ["system:all", "system:all", "source-is-target"],
  ] as const) {
    const move = resolveTaskListRailSiblingMove(keys, source, target, "before");
    assert.equal(move.invalidReason, reason);
    assert.equal(move.destinationIndex, null);
    assert.deepEqual(move.finalStructuralKeys, keys);
  }
});

test("folder, system, custom, and folder-sibling keys all use the same resolver", () => {
  for (const source of ["folder:a", "system:all", "list:custom", "folder:b"]) {
    const target = source === "folder:b" ? "folder:a" : "folder:b";
    assert.equal(resolveTaskListRailSiblingMove(keys, source, target, "before").invalidReason, null);
  }
});

test("cross-container resolver inserts before, after, and at bounded root end", () => {
  assert.equal(
    resolveTaskListRailCrossContainerMove(keys, "list:from-folder", "system:all", "before").destinationIndex,
    1,
  );
  assert.equal(
    resolveTaskListRailCrossContainerMove(keys, "list:from-folder", "system:all", "after").destinationIndex,
    2,
  );
  const append = resolveTaskListRailCrossContainerMove(keys, "list:from-folder", null, "after");
  assert.equal(append.destinationIndex, keys.length);
  assert.equal(Number.isSafeInteger(append.destinationIndex), true);
  assert.deepEqual(append.finalStructuralKeys, [...keys, "list:from-folder"]);
});
