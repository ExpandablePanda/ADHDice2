import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  buildLocalQaProfileFixtures,
  LOCAL_QA_SEED_METADATA_KEY,
  LOCAL_QA_SEED_VERSION,
} from "@/lib/local-qa-profile-fixtures";

const userId = "70000000-0000-4000-8000-000000000001";
const now = new Date("2026-07-19T12:00:00.000Z");
const appRouteUrl = new URL("../src/app/api/local-qa-session/route.ts", import.meta.url);
const handlerSource = readFileSync(new URL("../scripts/local-qa-session-handler.ts", import.meta.url), "utf8");
const devServerSource = readFileSync(new URL("../scripts/dev-server.mjs", import.meta.url), "utf8");
const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");

test("local QA fixtures form one coherent user-scoped profile", () => {
  const fixtures = buildLocalQaProfileFixtures(userId, now);
  const taskIds = new Set(fixtures.tasks.map((task) => task.id));
  const categoryIds = new Set(fixtures.focusCategories.map((category) => category.id));
  const listIds = new Set(fixtures.lists.map((list) => list.id));

  assert.equal(fixtures.profile.user_id, userId);
  assert.equal(fixtures.profile.display_name, "Local Guest QA");
  assert.ok(fixtures.tasks.length >= 15);
  assert.ok(fixtures.focusSessions.length >= 5);
  assert.ok(fixtures.notes.length >= 2);
  assert.ok(fixtures.tasks.some((task) => task.parent_task_id));
  assert.ok(fixtures.tasks.some((task) => task.parent_task_id && fixtures.tasks.find((parent) => parent.id === task.parent_task_id)?.parent_task_id));

  for (const task of fixtures.tasks) {
    assert.equal(task.user_id, userId);
    if (task.parent_task_id) assert.ok(taskIds.has(task.parent_task_id));
  }
  for (const membership of fixtures.listMemberships) {
    assert.equal(membership.user_id, userId);
    assert.ok(taskIds.has(membership.task_id));
    assert.ok(listIds.has(membership.list_id));
  }
  for (const session of fixtures.focusSessions) {
    assert.equal(session.user_id, userId);
    assert.ok(session.category_id && categoryIds.has(session.category_id));
    assert.ok(session.duration_seconds > 0);
  }
  for (const history of fixtures.taskHistory) {
    assert.equal(history.user_id, userId);
    assert.ok(taskIds.has(history.task_id));
  }
});

test("fixture dates remain useful relative to the login date", () => {
  const fixtures = buildLocalQaProfileFixtures(userId, now);
  assert.ok(fixtures.tasks.some((task) => task.due_on === "2026-07-19"));
  assert.ok(fixtures.tasks.some((task) => task.due_on === "2026-07-20"));
  assert.ok(fixtures.taskHistory.some((entry) => entry.entry_date === "2026-07-18"));
  assert.ok(fixtures.focusSessions.some((session) => session.session_date === "2026-07-19"));
});

test("local QA login stays outside the App Router, server-side, and development-only", async () => {
  assert.equal(existsSync(appRouteUrl), false);
  assert.match(devServerSource, /LOCAL_QA_PATH = "\/api\/local-qa-session"/);
  assert.match(devServerSource, /isDevelopment: true/);
  assert.match(handlerSource, /process\.env\.ADHDICE_LOCAL_QA_EMAIL/);
  assert.match(handlerSource, /process\.env\.ADHDICE_LOCAL_QA_PASSWORD/);
  assert.doesNotMatch(handlerSource, /NEXT_PUBLIC_ADHDICE_LOCAL_QA/);
  assert.match(handlerSource, /!isDevelopment/);
  assert.match(handlerSource, /process\.env\.NODE_ENV === "production"/);
  assert.match(handlerSource, /signInWithPassword/);
  assert.match(taskAppSource, /supabase\.auth\.setSession/);
  assert.doesNotMatch(taskAppSource, /TaskViewsGuestWorkspace/);

  const { handleLocalQaSession } = await import("../scripts/local-qa-session-handler.ts");
  const productionResponse = await handleLocalQaSession(new Request("http://localhost/api/local-qa-session", { method: "POST" }));
  assert.equal(productionResponse.status, 404);
});

test("the idempotent seed marker and explicit restore action remain available", () => {
  assert.equal(LOCAL_QA_SEED_METADATA_KEY, "adhdice_local_qa_seed_version");
  assert.equal(LOCAL_QA_SEED_VERSION, 1);
  assert.match(handlerSource, /resetFixtures/);
  assert.match(taskAppSource, /Restore QA fixtures/);
});
