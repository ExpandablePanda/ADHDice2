import assert from "node:assert/strict";
import test from "node:test";
import { isTaskEditorChildRouteSettled, resolveTaskEditorFocusPhase } from "../src/lib/task-editor-focus-request.ts";

const estimatedRequest = { field: "estimated_time", taskId: "task-parent", token: 1 };
const readyState = {
  activeMetadataPanel: "estimated",
  handled: false,
  inputMounted: true,
  inputOwnsFocus: true,
  request: estimatedRequest,
  resolvedMetadataTaskId: "task-parent",
  visibleOwner: true,
};

test("a non-visible owner cannot advance an Estimated Time request", () => {
  assert.equal(resolveTaskEditorFocusPhase({ ...readyState, visibleOwner: false }), "not_owner");
});

test("a missing metadata target remains pending", () => {
  assert.equal(resolveTaskEditorFocusPhase({ ...readyState, resolvedMetadataTaskId: null }), "waiting_for_target");
});

test("a parent resolves to its own metadata key", () => {
  assert.equal(resolveTaskEditorFocusPhase(readyState), "acknowledge");
});

test("a Step resolves to the Step metadata key while its parent remains the shell owner", () => {
  assert.equal(resolveTaskEditorFocusPhase({
    ...readyState,
    request: { ...estimatedRequest, taskId: "step" },
    resolvedMetadataTaskId: "step",
  }), "acknowledge");
});

test("a nested Substep resolves to the nested metadata key", () => {
  assert.equal(resolveTaskEditorFocusPhase({
    ...readyState,
    request: { ...estimatedRequest, taskId: "nested-substep" },
    resolvedMetadataTaskId: "nested-substep",
  }), "acknowledge");
});

test("a mismatched requested task and metadata task remains pending", () => {
  assert.equal(resolveTaskEditorFocusPhase({ ...readyState, resolvedMetadataTaskId: "other-task" }), "waiting_for_target");
});

test("a resolved Due panel requests canonical Estimated Time selection", () => {
  assert.equal(resolveTaskEditorFocusPhase({ ...readyState, activeMetadataPanel: "due" }), "select_panel");
});

test("an active Estimated panel with no input remains pending", () => {
  assert.equal(resolveTaskEditorFocusPhase({ ...readyState, inputMounted: false, inputOwnsFocus: false }), "waiting_for_input");
});

test("a mounted input that does not own focus requests focus", () => {
  assert.equal(resolveTaskEditorFocusPhase({ ...readyState, inputOwnsFocus: false }), "focus_input");
});

test("an input that owns focus permits acknowledgement", () => {
  assert.equal(resolveTaskEditorFocusPhase(readyState), "acknowledge");
});

test("acknowledgement becomes inert after the token is marked handled", () => {
  assert.equal(resolveTaskEditorFocusPhase({ ...readyState, handled: true }), "handled");
});

test("the same handled token does nothing on an ordinary rerender", () => {
  assert.equal(resolveTaskEditorFocusPhase({ ...readyState, handled: true }), "handled");
});

test("a new token for the same task starts a fresh lifecycle", () => {
  assert.equal(resolveTaskEditorFocusPhase({
    ...readyState,
    activeMetadataPanel: "due",
    request: { ...estimatedRequest, token: 2 },
  }), "select_panel");
});

test("a normal editor open does not target Estimated Time", () => {
  assert.equal(resolveTaskEditorFocusPhase({ ...readyState, request: null }), "handled");
});

test("a Timer Go to Task request does not target Estimated Time", () => {
  assert.equal(resolveTaskEditorFocusPhase({
    ...readyState,
    request: { field: "normal_open", taskId: "task-parent", token: 3 },
  }), "handled");
});

test("a settled Step route is not reopened after its focus request clears", () => {
  assert.equal(isTaskEditorChildRouteSettled({
    metadataTargetTaskId: "step",
    requestedOpenTaskId: "step",
    selectedTaskId: "parent",
  }), true);
});

test("a settled nested Substep route is not reopened after its focus request clears", () => {
  assert.equal(isTaskEditorChildRouteSettled({
    metadataTargetTaskId: "nested-substep",
    requestedOpenTaskId: "nested-substep",
    selectedTaskId: "parent",
  }), true);
});

test("parent and unresolved child routes still use normal routing", () => {
  assert.equal(isTaskEditorChildRouteSettled({
    metadataTargetTaskId: null,
    requestedOpenTaskId: "parent",
    selectedTaskId: "parent",
  }), false);
  assert.equal(isTaskEditorChildRouteSettled({
    metadataTargetTaskId: null,
    requestedOpenTaskId: "step",
    selectedTaskId: "parent",
  }), false);
});
