/* eslint-disable react-hooks/immutability */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SetStateAction } from "react";

import type { BatchTaskEditDraft } from "../src/components/task-app/task-batch-edit-modal.tsx";
import { useTaskBatchEditAction } from "../src/hooks/useTaskBatchEditAction.ts";
import {
  completeBatchEditProgress,
  createBatchEditProgress,
  formatBatchEditProgressDetail,
  formatBatchEditProgressText,
  recordBatchEditPlan,
  type BatchEditProgress,
} from "../src/lib/task-batch-edit-progress.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import type { Task } from "../src/lib/database.types.ts";
import type { TaskRewardCandidate } from "../src/lib/task-rewards.ts";

function task(id: string, status: Task["status"] = "pending", dueOn: string | null = null) {
  return createTask({
    created_at: "2026-08-16T09:00:00.000Z",
    due_on: dueOn,
    id,
    sort_order: 1,
    status,
    title: id,
  });
}

function draft(overrides: Partial<BatchTaskEditDraft> = {}): BatchTaskEditDraft {
  return {
    dueOn: "",
    dueOnMode: "unchanged",
    energy: "unchanged",
    estimatedMinutes: "",
    estimatedMinutesMode: "unchanged",
    focusToday: "unchanged",
    oneStepAtATime: "unchanged",
    priority: "1",
    repeatDayOfMonth: "",
    repeatDaysOfWeek: [],
    repeatFrequency: "unchanged",
    repeatInterval: "1",
    route: "unchanged",
    status: "unchanged",
    subtasksAutoReset: "unchanged",
    tags: [],
    tagsMode: "unchanged",
    ...overrides,
  };
}

function useBatchEditTestHarness(
  selectedTasks: Task[],
  options: {
    onTasksCompleted?: (candidates: TaskRewardCandidate[]) => Promise<void>;
    syncTaskHistoryEntry?: (taskId: string) => Promise<boolean>;
    updateTask?: (task: Task) => Promise<{ data: Task | null; error: { message: string } | null; usedEnergyFallback?: boolean }>;
  } = {},
) {
  let localTasks = [...selectedTasks];
  let progress: BatchEditProgress | null = null;
  const progressSnapshots: Array<BatchEditProgress | null> = [];
  const events: string[] = [];
  const actions = useTaskBatchEditAction({
    canonicalCommandsEnabled: false,
    clearListTaskSelection: () => { events.push("selection:cleared"); },
    currentDayKey: "2026-08-16",
    dayStartTime: "06:00",
    focusedTaskIds: [],
    onTasksCompleted: options.onTasksCompleted ?? (async () => {}),
    parseDayOfMonth: () => null,
    parsePositiveInteger: (value) => Number.parseInt(value, 10) || null,
    routeTask: (taskId) => { events.push(`route:${taskId}`); },
    saveFocusSelection: async () => {},
    selectedListTasks: selectedTasks,
    setBatchEditProgress: (update: SetStateAction<BatchEditProgress | null>) => {
      progress = typeof update === "function" ? update(progress) : update;
      progressSnapshots.push(progress);
    },
    setIsBatchEditModalOpen: (open) => { events.push(`modal:${String(open)}`); },
    setMessage: () => {},
    setTasks: (update) => {
      localTasks = typeof update === "function" ? update(localTasks) : update;
    },
    sortTasksForUi: (nextTasks) => nextTasks,
    syncTaskHistoryEntry: async (taskId) => options.syncTaskHistoryEntry?.(taskId) ?? true,
    tasks: selectedTasks,
    timezone: "UTC",
    updateTaskRowWithLegacyEnergyFallback: async (taskId) => {
      const currentTask = selectedTasks.find((candidate) => candidate.id === taskId) ?? selectedTasks[0]!;
      events.push(`execute:${taskId}`);
      const result = await options.updateTask?.(currentTask) ?? { data: { ...currentTask, priority_level: 1 }, error: null };
      return {
        data: result.data,
        error: result.error,
        usedActualSecondsFallback: false,
        usedEnergyFallback: result.usedEnergyFallback ?? false,
      };
    },
  });
  return {
    actions,
    events,
    get localTasks() { return localTasks; },
    get progress() { return progress; },
    progressSnapshots,
  };
}

test("progress transitions use real plan accounting and preserve fallback separately", () => {
  let progress = createBatchEditProgress(5);
  progress = recordBatchEditPlan(progress, { success: true });
  assert.deepEqual(progress, { ...createBatchEditProgress(5), processed: 1, remaining: 4, updated: 1 });
  progress = recordBatchEditPlan(progress, { errorMessage: "failed", success: false, fallbackUsed: true });
  assert.equal(progress.processed, 2);
  assert.equal(progress.remaining, 3);
  assert.equal(progress.updated, 1);
  assert.equal(progress.failed, 1);
  assert.equal(progress.fallbackCount, 1);
  assert.equal(formatBatchEditProgressText(progress), "Batch Edit: 2/5 processed · 3 remaining · 1 failed");
  const complete = completeBatchEditProgress(progress);
  assert.equal(complete.phase, "complete");
  assert.equal(formatBatchEditProgressText(complete), "1 updated · 1 failed");
  assert.match(formatBatchEditProgressDetail(complete) ?? "", /used low energy/);
});

test("preflight failure leaves the modal open and does not initialize progress", async () => {
  const selected = task("preflight-failure");
  const harnessState = useBatchEditTestHarness([selected]);
  await harnessState.actions.applyBatchTaskEdit(draft({ status: "missed" }));
  assert.equal(harnessState.events.includes("modal:false"), false);
  assert.deepEqual(harnessState.progressSnapshots, [null]);
  assert.equal(harnessState.events.some((event) => event.startsWith("execute:")), false);
});

test("successful preflight closes before the first plan and initializes 0/total progress", async () => {
  const selected = [task("first"), task("second")];
  const harnessState = useBatchEditTestHarness(selected);
  await harnessState.actions.applyBatchTaskEdit(draft());
  assert.ok(harnessState.events.indexOf("modal:false") < harnessState.events.indexOf("execute:first"));
  assert.deepEqual(harnessState.progressSnapshots[1], createBatchEditProgress(2));
});

test("mixed plans count successes and failures as processed", async () => {
  const selected = [task("success"), task("failure"), task("history-failure")];
  const harnessState = useBatchEditTestHarness(selected, {
    updateTask: async (currentTask) => currentTask.id === "failure"
      ? { data: null, error: { message: "Task write failed." } }
      : { data: { ...currentTask, priority_level: 1 }, error: null },
  });
  await harnessState.actions.applyBatchTaskEdit(draft());
  assert.equal(harnessState.progress?.phase, "complete");
  assert.equal(harnessState.progress?.processed, 3);
  assert.equal(harnessState.progress?.remaining, 0);
  assert.equal(harnessState.progress?.updated, 2);
  assert.equal(harnessState.progress?.failed, 1);
});

test("required History save failure is a failed plan, not a simultaneous success", async () => {
  const selected = task("history-failure", "pending", "2026-08-16");
  const harnessState = useBatchEditTestHarness([selected], {
    syncTaskHistoryEntry: async () => false,
    updateTask: async (currentTask) => ({ data: { ...currentTask, priority_level: 3 }, error: null }),
  });
  await harnessState.actions.applyBatchTaskEdit(draft({ status: "did_my_best" }));
  assert.equal(harnessState.progress?.processed, 1);
  assert.equal(harnessState.progress?.remaining, 0);
  assert.equal(harnessState.progress?.updated, 0);
  assert.equal(harnessState.progress?.failed, 1);
  assert.equal(harnessState.localTasks[0]?.priority_level, 3);
});

test("mixed full success and History failure reconcile both committed Task rows", async () => {
  const selected = [
    task("full-success", "pending", "2026-08-16"),
    task("history-failure", "pending", "2026-08-16"),
  ];
  let completedCandidateCount = 0;
  const harnessState = useBatchEditTestHarness(selected, {
    onTasksCompleted: async (candidates) => { completedCandidateCount = candidates.length; },
    syncTaskHistoryEntry: async (taskId) => taskId !== "history-failure",
    updateTask: async (currentTask) => ({
      data: { ...currentTask, priority_level: currentTask.id === "full-success" ? 2 : 3 },
      error: null,
    }),
  });
  await harnessState.actions.applyBatchTaskEdit(draft({ status: "did_my_best" }));
  assert.equal(harnessState.progress?.processed, 2);
  assert.equal(harnessState.progress?.updated, 1);
  assert.equal(harnessState.progress?.failed, 1);
  assert.equal(harnessState.localTasks.find((candidate) => candidate.id === "full-success")?.priority_level, 2);
  assert.equal(harnessState.localTasks.find((candidate) => candidate.id === "history-failure")?.priority_level, 3);
  assert.equal(completedCandidateCount, 1);
});

test("a genuine Task-row write failure does not fabricate local mutation", async () => {
  const selected = task("write-failure");
  const harnessState = useBatchEditTestHarness([selected], {
    updateTask: async () => ({ data: null, error: { message: "Task write failed." } }),
  });
  await harnessState.actions.applyBatchTaskEdit(draft({ priority: "3" }));
  assert.equal(harnessState.progress?.processed, 1);
  assert.equal(harnessState.progress?.failed, 1);
  assert.equal(harnessState.localTasks[0]?.priority_level, selected.priority_level);
});

test("a no-row-mutation routing plan is successful without route confirmation", async () => {
  const selected = [task("route-only")];
  const harnessState = useBatchEditTestHarness(selected);
  await harnessState.actions.applyBatchTaskEdit(draft({ priority: "unchanged", route: "today" }));
  assert.equal(harnessState.progress?.processed, 1);
  assert.equal(harnessState.progress?.updated, 1);
  assert.equal(harnessState.progress?.failed, 0);
  assert.equal(harnessState.events.includes("route:route-only"), true);
});

test("finalization exceptions become terminal warnings with plan counts", async () => {
  const harnessState = useBatchEditTestHarness([task("finalize", "pending", "2026-08-16")], {
    onTasksCompleted: async () => { throw new Error("Reward finalization failed."); },
  });
  await harnessState.actions.applyBatchTaskEdit(draft({ status: "did_my_best" }));
  assert.equal(harnessState.progress?.phase, "warning");
  assert.equal(harnessState.progress?.processed, 1);
  assert.equal(harnessState.progress?.updated, 1);
  assert.equal(harnessState.progress?.failed, 0);
  assert.equal(harnessState.progress?.finalizationErrorMessage, "Reward finalization failed.");
});

test("batch progress has no timer or simulated increment mechanism", () => {
  const source = readFileSync(new URL("../src/lib/task-batch-edit-progress.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /setTimeout|setInterval|Date\.now/);
});
