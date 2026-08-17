import assert from "node:assert/strict";
import test from "node:test";
import { TaskRolloverSingleFlightCoordinator, type TaskRolloverRpcResult } from "@/lib/task-rollover-coordinator";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

const success: TaskRolloverRpcResult = { error: null };

test("Strict Mode replay and simultaneous callers share one rollover request", async () => {
  const coordinator = new TaskRolloverSingleFlightCoordinator();
  const pending = deferred<TaskRolloverRpcResult>();
  const client = {};
  let executions = 0;
  let settlements = 0;
  coordinator.setOwner(client, "user-a");
  const options = {
    client,
    execute: () => { executions += 1; return pending.promise; },
    logicalDayKey: "2026-07-19",
    onOwnedSettled: () => { settlements += 1; },
    userId: "user-a",
  };

  const first = coordinator.run(options);
  const replay = coordinator.run(options);
  const concurrent = coordinator.run(options);
  assert.equal(first, replay);
  assert.equal(first, concurrent);
  await Promise.resolve();
  assert.equal(executions, 1);
  pending.resolve(success);
  await first;
  assert.equal(settlements, 1);
});

test("completed no-op runs release the logical-day slot while simultaneous triggers remain single-flight", async () => {
  const coordinator = new TaskRolloverSingleFlightCoordinator();
  const client = {};
  let executions = 0;
  coordinator.setOwner(client, "user-a");
  const run = (logicalDayKey: string) => coordinator.run({
    client,
    execute: async () => { executions += 1; return success; },
    logicalDayKey,
    onOwnedSettled: () => {},
    userId: "user-a",
  });

  const completed = run("2026-07-19");
  await completed;
  const timer = run("2026-07-19");
  assert.notEqual(timer, completed);
  await timer;
  await run("2026-07-20");
  assert.equal(executions, 3);
});

test("different logical-day requests are serialized within one ownership session", async () => {
  const coordinator = new TaskRolloverSingleFlightCoordinator();
  const client = {};
  const firstPending = deferred<TaskRolloverRpcResult>();
  let activeExecutions = 0;
  let maximumActiveExecutions = 0;
  coordinator.setOwner(client, "user-a");
  const run = (logicalDayKey: string, execute: () => Promise<TaskRolloverRpcResult>) => coordinator.run({
    client,
    execute: async () => {
      activeExecutions += 1;
      maximumActiveExecutions = Math.max(maximumActiveExecutions, activeExecutions);
      const result = await execute();
      activeExecutions -= 1;
      return result;
    },
    logicalDayKey,
    onOwnedSettled: () => {},
    userId: "user-a",
  });
  const first = run("2026-07-19", () => firstPending.promise);
  const nextDay = run("2026-07-20", async () => success);
  await Promise.resolve();
  assert.equal(activeExecutions, 1);
  firstPending.resolve(success);
  await Promise.all([first, nextDay]);
  assert.equal(maximumActiveExecutions, 1);
});

test("auth switches and sign-out reject late results, while a new owner can run", async () => {
  const coordinator = new TaskRolloverSingleFlightCoordinator();
  const client = {};
  const userAPending = deferred<TaskRolloverRpcResult>();
  let userASettlements = 0;
  coordinator.setOwner(client, "user-a");
  const userA = coordinator.run({
    client,
    execute: () => userAPending.promise,
    logicalDayKey: "2026-07-19",
    onOwnedSettled: () => { userASettlements += 1; },
    userId: "user-a",
  });
  coordinator.setOwner(client, "user-b");
  userAPending.resolve(success);
  const userAResult = await userA;
  assert.ok(userAResult);
  assert.equal(userAResult.owned, false);
  assert.equal(userASettlements, 0);

  const signOutPending = deferred<TaskRolloverRpcResult>();
  let signedOutSettlements = 0;
  const userB = coordinator.run({
    client,
    execute: () => signOutPending.promise,
    logicalDayKey: "2026-07-19",
    onOwnedSettled: () => { signedOutSettlements += 1; },
    userId: "user-b",
  });
  coordinator.setOwner(client, null);
  signOutPending.resolve(success);
  const userBResult = await userB;
  assert.ok(userBResult);
  assert.equal(userBResult.owned, false);
  assert.equal(signedOutSettlements, 0);

  let newOwnerExecutions = 0;
  const replacementClient = {};
  coordinator.setOwner(replacementClient, "user-b");
  const userBAgain = await coordinator.run({
    client: replacementClient,
    execute: async () => { newOwnerExecutions += 1; return success; },
    logicalDayKey: "2026-07-19",
    onOwnedSettled: () => {},
    userId: "user-b",
  });
  assert.ok(userBAgain);
  assert.equal(userBAgain.owned, true);
  assert.equal(newOwnerExecutions, 1);
});

test("one failed single-flight request emits one owned error", async () => {
  const coordinator = new TaskRolloverSingleFlightCoordinator();
  const client = {};
  let messages = 0;
  coordinator.setOwner(client, "user-a");
  const options = {
    client,
    execute: async () => ({ error: { message: "canceling statement due to statement timeout" } }),
    logicalDayKey: "2026-07-19",
    onOwnedSettled: ({ error }: TaskRolloverRpcResult) => { if (error) messages += 1; },
    userId: "user-a",
  };
  await Promise.all([coordinator.run(options), coordinator.run(options), coordinator.run(options)]);
  assert.equal(messages, 1);
});

test("partial batch settlement preserves successful Tasks and retries only unresolved Tasks", async () => {
  const coordinator = new TaskRolloverSingleFlightCoordinator();
  const client = {};
  let executions = 0;
  const attemptedTaskIds: string[][] = [];
  coordinator.setOwner(client, "user-a");

  const run = () => coordinator.run({
    client,
    execute: async ({ settledTaskIds }) => {
      executions += 1;
      const candidates = ["task-a", "task-b", "task-c"].filter((taskId) => !settledTaskIds.has(taskId));
      attemptedTaskIds.push(candidates);
      return executions === 1
        ? { error: { message: "task-b failed" }, settledTaskIds: ["task-a", "task-c"] }
        : { error: null, settledTaskIds: ["task-b"] };
    },
    logicalDayKey: "2026-07-19",
    onOwnedSettled: () => {},
    userId: "user-a",
  });

  const first = await run();
  assert.equal(first?.result.error?.message, "task-b failed");
  const second = await run();
  assert.equal(second?.result.error, null);
  assert.deepEqual(attemptedTaskIds, [["task-a", "task-b", "task-c"], ["task-b"]]);
  assert.equal(executions, 2);
});
