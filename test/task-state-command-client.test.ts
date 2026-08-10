import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  invokeTaskStateCommand,
  type TaskStateCommandClient,
  type TaskStateCommandIntent,
} from "../src/lib/task-state-command-client.ts";

const intent: TaskStateCommandIntent = {
  type: "start_in_progress",
  task_id: "task-1",
  replay_identity: "browser-action-1",
  expected_revision: 4,
  occurrence_key: "occurrence-1",
};

function committedPayload(overrides: Record<string, unknown> = {}) {
  return {
    state: "committed",
    task_id: "task-1",
    command_id: "command-1",
    expected_revision: 4,
    next_revision: 5,
    was_replayed: false,
    conflict_code: null,
    canonical_task_patch: { workflow_state: "in_progress" },
    compatibility_projection: { status: "in_progress", due_on: "2026-08-10" },
    history_fact_id: "history-1",
    schedule_boundary_id: null,
    occurrence_id: "occurrence-1",
    effective_override_id: null,
    calendar_override_id: null,
    reward_entitlement_id: "reward-1",
    ...overrides,
  };
}

function fakeClient(data: unknown, error: unknown = null) {
  const calls: Array<{ functionName: string; body: unknown }> = [];
  const client = {
    functions: {
      invoke: async (functionName: string, options: { body: unknown }) => {
        calls.push({ functionName, body: options.body });
        return { data, error };
      },
    },
  } as unknown as TaskStateCommandClient;
  return { client, calls };
}

test("reuses the existing browser Supabase client singleton", async () => {
  const previousClient = (globalThis as typeof globalThis & { __adhdiceSupabaseClient?: unknown }).__adhdiceSupabaseClient;
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const harness = fakeClient(committedPayload());
  (globalThis as typeof globalThis & { __adhdiceSupabaseClient?: unknown }).__adhdiceSupabaseClient = harness.client;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "publishable-test-key";

  try {
    const first = await invokeTaskStateCommand(intent);
    const second = await invokeTaskStateCommand({ ...intent, replay_identity: "browser-action-2" });
    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(harness.calls.length, 2);
  } finally {
    (globalThis as typeof globalThis & { __adhdiceSupabaseClient?: unknown }).__adhdiceSupabaseClient = previousClient;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousAnonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousAnonKey;
  }
});

test("invokes task-state-command with the supplied intent unchanged and normalizes a commit", async () => {
  const harness = fakeClient(committedPayload());
  const result = await invokeTaskStateCommand(intent, { client: harness.client });

  assert.equal(harness.calls[0]?.functionName, "task-state-command");
  assert.strictEqual(harness.calls[0]?.body, intent);
  assert.deepEqual(result, {
    success: true,
    state: "committed",
    task_id: "task-1",
    command_id: "command-1",
    expected_revision: 4,
    next_revision: 5,
    was_replayed: false,
    conflict_code: null,
    canonical_task_patch: { workflow_state: "in_progress" },
    compatibility_projection: { status: "in_progress", due_on: "2026-08-10" },
    side_effect_ids: {
      history_fact_id: "history-1",
      schedule_boundary_id: null,
      occurrence_id: "occurrence-1",
      effective_override_id: null,
      calendar_override_id: null,
      reward_entitlement_id: "reward-1",
    },
    error: null,
  });
});

test("preserves replayed responses and distinguishes canonical rejection", async () => {
  const replay = fakeClient(committedPayload({ was_replayed: true }));
  const replayed = await invokeTaskStateCommand(intent, { client: replay.client });
  assert.equal(replayed.success, true);
  assert.equal(replayed.was_replayed, true);

  const rejected = fakeClient({
    state: "rejected",
    command_id: "command-2",
    expected_revision: 4,
    next_revision: 6,
    was_replayed: false,
    conflict_code: "STALE_REVISION",
  });
  const conflict = await invokeTaskStateCommand(intent, { client: rejected.client });
  assert.equal(conflict.success, false);
  assert.equal(conflict.error.kind, "command_rejected");
  assert.equal(conflict.state, "rejected");
  assert.equal(conflict.conflict_code, "STALE_REVISION");
  assert.equal(conflict.next_revision, 6);
});

test("fails closed for an authentication/function failure and does not retry", async () => {
  let invocations = 0;
  const client = {
    functions: {
      invoke: async () => {
        invocations += 1;
        return {
          data: null,
          error: {
            message: "Function returned an error",
            context: new Response(JSON.stringify({ error: { code: "authentication_failure", message: "A verified Supabase user is required." } }), { status: 401 }),
          },
        };
      },
    },
  } as unknown as TaskStateCommandClient;

  const result = await invokeTaskStateCommand(intent, { client });
  assert.equal(result.success, false);
  assert.equal(result.error.kind, "authentication_failure");
  assert.equal(result.error.code, "authentication_failure");
  assert.equal(result.error.status, 401);
  assert.equal(invocations, 1);

  const thrownClient = {
    functions: {
      invoke: async () => {
        throw new Error("network unavailable");
      },
    },
  } as unknown as TaskStateCommandClient;
  const invocationFailure = await invokeTaskStateCommand(intent, { client: thrownClient });
  assert.equal(invocationFailure.success, false);
  assert.equal(invocationFailure.error.kind, "invocation_failure");
});

test("fails closed for unavailable clients and malformed success payloads", async () => {
  const unavailable = await invokeTaskStateCommand(intent, { client: null });
  assert.equal(unavailable.success, false);
  assert.equal(unavailable.error.kind, "client_unavailable");

  const malformed = fakeClient({ state: "committed", was_replayed: false });
  const result = await invokeTaskStateCommand(intent, { client: malformed.client });
  assert.equal(result.success, false);
  assert.equal(result.error.kind, "malformed_response");
  assert.equal(result.error.code, "MALFORMED_RESPONSE");
});

test("the browser client has no legacy mutation fallback or secret credential", () => {
  const source = readFileSync(new URL("../src/lib/task-state-command-client.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localStorage|service_role|service-role|SUPABASE_(SERVICE|SECRET)/i);
  assert.doesNotMatch(source, /\.rpc\s*\(|updateTask|deleteTask|insertTask/);
});
