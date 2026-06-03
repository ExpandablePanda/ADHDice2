import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAchievementMetricSnapshot,
  buildAchievementSetSummaries,
  buildHealthFaceSummaries,
  evaluateAchievements,
  getAchievedFaceIds,
  getChargedSetCodes,
  planAchievementUnlocks,
} from "../src/lib/achievements.ts";
import type { HealthAchievementAward, TaskHistory as DbTaskHistory } from "../src/lib/database.types.ts";
import { createTask } from "../src/lib/task-buckets.ts";
import { computeTaskHistoryStats } from "../src/lib/task-history.ts";

test("achievement evaluations unlock momentum, courage, recovery, and health faces from existing signals", () => {
  const taskHistory: DbTaskHistory[] = [
    { created_at: "2026-05-01T09:00:00.000Z", entry_date: "2026-05-01", id: "h1", task_id: "task-1", user_id: "u1", was_completed: true },
    { created_at: "2026-05-02T09:00:00.000Z", entry_date: "2026-05-02", id: "h2", task_id: "task-2", user_id: "u1", was_completed: true },
    { created_at: "2026-05-03T09:00:00.000Z", entry_date: "2026-05-03", id: "h3", task_id: "task-3", user_id: "u1", was_completed: true },
    { created_at: "2026-05-05T09:00:00.000Z", entry_date: "2026-05-05", id: "h4", task_id: "task-4", user_id: "u1", was_completed: true },
    { created_at: "2026-05-06T09:00:00.000Z", entry_date: "2026-05-06", id: "h5", task_id: "task-5", user_id: "u1", was_completed: true },
    { created_at: "2026-05-07T09:00:00.000Z", entry_date: "2026-05-07", id: "h6", task_id: "task-6", user_id: "u1", was_completed: true },
  ];
  const tasks = [
    createTask({
      completed_at: "2026-05-03T10:00:00.000Z",
      created_at: "2026-05-01T08:00:00.000Z",
      due_on: "2026-05-02",
      energy: "high",
      estimated_minutes: 90,
      id: "task-1",
      is_urgent: true,
      sort_order: 1,
      status: "done",
      title: "Hard task",
    }),
    createTask({
      completed_at: "2026-05-06T10:00:00.000Z",
      created_at: "2026-05-05T08:00:00.000Z",
      energy: "medium",
      id: "task-2",
      sort_order: 2,
      status: "done",
      title: "Regular task",
    }),
  ];
  const focusHistory = [
    { categoryId: null, date: "2026-05-01", durationSeconds: 1800, focusType: "Work", id: "f1", title: "Session 1" },
    { categoryId: null, date: "2026-05-02", durationSeconds: 2700, focusType: "Work", id: "f2", title: "Session 2" },
    { categoryId: null, date: "2026-05-03", durationSeconds: 3600, focusType: "Work", id: "f3", title: "Session 3" },
  ];
  const healthAwards: HealthAchievementAward[] = [
    {
      achievement_code: "first_check_in",
      awarded_points: 5,
      awarded_tokens: 0,
      awarded_xp: 10,
      created_at: "2026-05-01T08:00:00.000Z",
      description: "desc",
      earned_at: "2026-05-01T08:00:00.000Z",
      id: "ha-1",
      title: "First Check-In",
      user_id: "u1",
    },
    {
      achievement_code: "seven_gentle_days",
      awarded_points: 15,
      awarded_tokens: 0,
      awarded_xp: 25,
      created_at: "2026-05-07T08:00:00.000Z",
      description: "desc",
      earned_at: "2026-05-07T08:00:00.000Z",
      id: "ha-2",
      title: "Seven Gentle Days",
      user_id: "u1",
    },
  ];

  const metrics = buildAchievementMetricSnapshot({
    focusHistory,
    healthAwards,
    taskHistory,
    taskHistoryStats: computeTaskHistoryStats(taskHistory, "2026-05-07"),
    tasks,
  });
  const evaluations = evaluateAchievements(metrics);
  const unlockedIds = new Set(getAchievedFaceIds(evaluations));

  assert.equal(metrics.recoveryCount, 1);
  assert.ok(unlockedIds.has("momentum-2"));
  assert.ok(unlockedIds.has("focus-2"));
  assert.ok(unlockedIds.has("courage-1"));
  assert.ok(unlockedIds.has("recovery-1"));
  assert.ok(unlockedIds.has("health-2"));
});

test("charged sets resolve only after all six faces are unlocked", () => {
  const unlockedFaceIds = [
    "momentum-1",
    "momentum-2",
    "momentum-3",
    "momentum-4",
    "momentum-5",
    "momentum-6",
  ];

  const chargedSets = getChargedSetCodes(unlockedFaceIds);
  const summaries = buildAchievementSetSummaries({
    chargedSetCodes: chargedSets,
    evaluations: evaluateAchievements(buildAchievementMetricSnapshot({
      focusHistory: [],
      healthAwards: [],
      taskHistory: [],
      taskHistoryStats: computeTaskHistoryStats([], "2026-05-07"),
      tasks: [],
    })),
    unlockedFaceIds,
  });

  assert.deepEqual(chargedSets, ["momentum"]);
  assert.equal(summaries.find((summary) => summary.id === "momentum")?.isCharged, true);
});

test("health face summaries map earned and ready care milestones into dice faces", () => {
  const faces = buildHealthFaceSummaries({
    earnedCodes: ["first_check_in", "nourishment_notes"],
    readyCodes: ["scale_awareness", "care_week"],
  });

  assert.equal(faces.find((face) => face.definition.id === "health-1")?.status, "earned");
  assert.equal(faces.find((face) => face.definition.id === "health-3")?.status, "earned");
  assert.equal(faces.find((face) => face.definition.id === "health-5")?.status, "ready");
  assert.equal(faces.find((face) => face.definition.id === "health-6")?.status, "in_progress");
});

test("achievement unlock planning does not duplicate already-earned faces or charged dice", () => {
  const evaluations = evaluateAchievements(buildAchievementMetricSnapshot({
    focusHistory: [],
    healthAwards: [],
    taskHistory: [
      { created_at: "2026-05-01T09:00:00.000Z", entry_date: "2026-05-01", id: "s1", task_id: "t1", user_id: "u1", was_completed: true },
      { created_at: "2026-05-02T09:00:00.000Z", entry_date: "2026-05-02", id: "s2", task_id: "t2", user_id: "u1", was_completed: true },
      { created_at: "2026-05-03T09:00:00.000Z", entry_date: "2026-05-03", id: "s3", task_id: "t3", user_id: "u1", was_completed: true },
      { created_at: "2026-05-04T09:00:00.000Z", entry_date: "2026-05-04", id: "s4", task_id: "t4", user_id: "u1", was_completed: true },
      { created_at: "2026-05-05T09:00:00.000Z", entry_date: "2026-05-05", id: "s5", task_id: "t5", user_id: "u1", was_completed: true },
      { created_at: "2026-05-06T09:00:00.000Z", entry_date: "2026-05-06", id: "s6", task_id: "t6", user_id: "u1", was_completed: true },
      { created_at: "2026-05-07T09:00:00.000Z", entry_date: "2026-05-07", id: "s7", task_id: "t7", user_id: "u1", was_completed: true },
      { created_at: "2026-05-08T09:00:00.000Z", entry_date: "2026-05-08", id: "s8", task_id: "t8", user_id: "u1", was_completed: true },
      { created_at: "2026-05-09T09:00:00.000Z", entry_date: "2026-05-09", id: "s9", task_id: "t9", user_id: "u1", was_completed: true },
      { created_at: "2026-05-10T09:00:00.000Z", entry_date: "2026-05-10", id: "s10", task_id: "t10", user_id: "u1", was_completed: true },
      { created_at: "2026-05-11T09:00:00.000Z", entry_date: "2026-05-11", id: "s11", task_id: "t11", user_id: "u1", was_completed: true },
      { created_at: "2026-05-12T09:00:00.000Z", entry_date: "2026-05-12", id: "s12", task_id: "t12", user_id: "u1", was_completed: true },
      { created_at: "2026-05-13T09:00:00.000Z", entry_date: "2026-05-13", id: "s13", task_id: "t13", user_id: "u1", was_completed: true },
      { created_at: "2026-05-14T09:00:00.000Z", entry_date: "2026-05-14", id: "s14", task_id: "t14", user_id: "u1", was_completed: true },
    ],
    taskHistoryStats: computeTaskHistoryStats([
      { created_at: "2026-05-01T09:00:00.000Z", entry_date: "2026-05-01", id: "s1", task_id: "t1", user_id: "u1", was_completed: true },
      { created_at: "2026-05-02T09:00:00.000Z", entry_date: "2026-05-02", id: "s2", task_id: "t2", user_id: "u1", was_completed: true },
      { created_at: "2026-05-03T09:00:00.000Z", entry_date: "2026-05-03", id: "s3", task_id: "t3", user_id: "u1", was_completed: true },
      { created_at: "2026-05-04T09:00:00.000Z", entry_date: "2026-05-04", id: "s4", task_id: "t4", user_id: "u1", was_completed: true },
      { created_at: "2026-05-05T09:00:00.000Z", entry_date: "2026-05-05", id: "s5", task_id: "t5", user_id: "u1", was_completed: true },
      { created_at: "2026-05-06T09:00:00.000Z", entry_date: "2026-05-06", id: "s6", task_id: "t6", user_id: "u1", was_completed: true },
      { created_at: "2026-05-07T09:00:00.000Z", entry_date: "2026-05-07", id: "s7", task_id: "t7", user_id: "u1", was_completed: true },
      { created_at: "2026-05-08T09:00:00.000Z", entry_date: "2026-05-08", id: "s8", task_id: "t8", user_id: "u1", was_completed: true },
      { created_at: "2026-05-09T09:00:00.000Z", entry_date: "2026-05-09", id: "s9", task_id: "t9", user_id: "u1", was_completed: true },
      { created_at: "2026-05-10T09:00:00.000Z", entry_date: "2026-05-10", id: "s10", task_id: "t10", user_id: "u1", was_completed: true },
      { created_at: "2026-05-11T09:00:00.000Z", entry_date: "2026-05-11", id: "s11", task_id: "t11", user_id: "u1", was_completed: true },
      { created_at: "2026-05-12T09:00:00.000Z", entry_date: "2026-05-12", id: "s12", task_id: "t12", user_id: "u1", was_completed: true },
      { created_at: "2026-05-13T09:00:00.000Z", entry_date: "2026-05-13", id: "s13", task_id: "t13", user_id: "u1", was_completed: true },
      { created_at: "2026-05-14T09:00:00.000Z", entry_date: "2026-05-14", id: "s14", task_id: "t14", user_id: "u1", was_completed: true },
    ], "2026-05-14"),
    tasks: [],
  }));

  const firstPlan = planAchievementUnlocks({
    earnedAt: "2026-05-14T12:00:00.000Z",
    evaluations,
    existingChargedSetCodes: [],
    existingUnlockedFaceIds: [],
  });
  const secondPlan = planAchievementUnlocks({
    earnedAt: "2026-05-14T12:05:00.000Z",
    evaluations,
    existingChargedSetCodes: firstPlan.nextChargedSetCodes,
    existingUnlockedFaceIds: firstPlan.nextUnlockedFaceIds,
  });

  assert.ok(firstPlan.newFaceRecords.length > 0);
  assert.equal(secondPlan.newFaceRecords.length, 0);
  assert.equal(secondPlan.newChargedRecords.length, 0);
});
