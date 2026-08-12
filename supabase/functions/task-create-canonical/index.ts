import { withSupabase } from "npm:@supabase/server@1.4.1";
import type { TaskInsert } from "../../../src/lib/database.types.ts";
import {
  buildCanonicalTaskCreationPlan,
  type CanonicalTaskCreationPlan,
} from "../../../src/lib/task-state-canonical/task-creation.ts";
import type { CanonicalEntityKind } from "../../../src/lib/task-state-canonical/types.ts";
import { userIdFromContext } from "../task-state-command/auth.ts";

const MAX_BODY_BYTES = 64 * 1024;
const TASK_KEYS = new Set([
  "parent_task_id", "title", "notes", "status", "priority", "priority_level", "energy",
  "is_urgent", "is_important", "due_on", "active_status_logical_date", "active_occurrence_due_on",
  "scheduled_on", "due_time", "estimated_minutes", "actual_seconds", "tags", "external_link_label",
  "external_link_url", "one_step_at_a_time", "subtasks_auto_reset", "repeat_frequency", "repeat_interval",
  "repeat_days_of_week", "repeat_day_of_month", "repeat_monthly_mode", "repeat_monthly_ordinal",
  "repeat_monthly_weekday", "pinned_at", "pin_order", "sort_order", "completed_at", "trashed_at",
]);
const FORBIDDEN_TASK_KEYS = new Set([
  "id", "user_id", "revision", "created_at", "updated_at", "canonicalization_status", "entity_kind",
  "terminal_state", "container_state", "prior_container_state", "prior_container_state_status",
  "terminal_completed_at", "container_trashed_at", "workflow_state", "workflow_started_at",
  "workflow_logical_date", "workflow_occurrence_id", "workflow_command_id", "workflow_revision",
  "canonical_revision", "canonical_created_at", "canonical_updated_at", "projection_source_canonical_revision",
  "projection_source_fingerprint", "projection_version",
]);
const UUID_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type QueryResult = { data: unknown; error: { message: string } | null };
type TrustedCreationQuery = {
  select(columns: string): TrustedCreationQuery;
  eq(column: string, value: string): TrustedCreationQuery;
  maybeSingle(): Promise<QueryResult>;
};
type TrustedCreationAdminClient = {
  from(table: string): TrustedCreationQuery;
  rpc(name: string, args: Record<string, unknown>): Promise<QueryResult>;
};
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function json(payload: unknown, status: number) {
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

function errorMessage(error: unknown, fallback: string) {
  return isRecord(error) && typeof error.message === "string" ? error.message : fallback;
}

function validTaskIntent(value: unknown): value is Omit<TaskInsert, "user_id"> {
  if (!isRecord(value)) return false;
  if (Object.keys(value).some((key) => !TASK_KEYS.has(key) || FORBIDDEN_TASK_KEYS.has(key))) return false;
  return typeof value.title === "string" && value.title.trim().length > 0;
}

function validProfile(value: unknown): value is { timezone: string; day_start_time: string; settings_revision: number } {
  return isRecord(value)
    && typeof value.timezone === "string"
    && value.timezone.trim().length > 0
    && typeof value.day_start_time === "string"
    && Number.isInteger(value.settings_revision)
    && value.settings_revision >= 1;
}

function isMissingEnergyEnumError(message: string) {
  return message.includes("adhdice_clean_task_energy")
    && message.includes("invalid input value for enum")
    && message.toLowerCase().includes("none");
}

function canonicalTaskFromRpc(value: unknown, userId: string) {
  if (!isRecord(value) || !isRecord(value.task)) return null;
  const task = value.task;
  if (
    task.user_id !== userId
    || typeof task.id !== "string"
    || task.revision !== 1
    || task.canonicalization_status !== "canonical_runtime"
    || task.canonical_revision !== 1
    || !["parent", "step", "substep"].includes(String(task.entity_kind))
    || !["active", "permanently_complete"].includes(String(task.terminal_state))
    || !["active", "archived", "trashed"].includes(String(task.container_state))
    || task.prior_container_state !== null
    || task.prior_container_state_status !== "not_applicable"
    || !["none", "in_progress"].includes(String(task.workflow_state))
    || task.workflow_revision !== 1
    || typeof task.canonical_created_at !== "string"
    || typeof task.canonical_updated_at !== "string"
  ) return null;
  return task;
}

async function readOwnerProfile(adminClient: TrustedCreationAdminClient, userId: string) {
  const result = await adminClient
    .from("adhdice_user_profiles")
    .select("timezone,day_start_time,settings_revision")
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!validProfile(result.data)) throw new Error("Canonical logical-day profile is unavailable or malformed.");
  return result.data;
}

async function deriveEntityKind(adminClient: TrustedCreationAdminClient, userId: string, parentTaskId: string | null | undefined): Promise<CanonicalEntityKind> {
  if (parentTaskId === null || parentTaskId === undefined) return "parent";
  if (!UUID_KEY.test(parentTaskId)) throw new Error("Task parent identity is invalid.");
  const result = await adminClient
    .from("adhdice_clean_tasks")
    .select("id,parent_task_id")
    .eq("user_id", userId)
    .eq("id", parentTaskId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!isRecord(result.data) || result.data.id !== parentTaskId) throw new Error("Imported parent Task was not found for this owner.");
  return result.data.parent_task_id === null ? "step" : "substep";
}

async function createWithPlan(adminClient: TrustedCreationAdminClient, userId: string, plan: CanonicalTaskCreationPlan) {
  const first = await adminClient.rpc("adhdice_create_canonical_task", {
    p_user_id: userId,
    p_plan: plan,
  });
  if (!first.error) return { ...first, usedEnergyFallback: false };
  if (plan.task.energy !== "none" || !isMissingEnergyEnumError(first.error.message)) return { ...first, usedEnergyFallback: false };

  const retryPlan: CanonicalTaskCreationPlan = {
    ...plan,
    task: { ...plan.task, energy: "low" },
  };
  const retry = await adminClient.rpc("adhdice_create_canonical_task", {
    p_user_id: userId,
    p_plan: retryPlan,
  });
  return { ...retry, usedEnergyFallback: !retry.error };
}

export default {
  fetch: withSupabase({ auth: "user" }, async (request, context) => {
    if (request.method !== "POST") return json({ error: { code: "invalid_request", message: "Only POST is supported." } }, 405);
    const userId = userIdFromContext(context);
    if (!userId) return json({ error: { code: "authentication_failure", message: "A verified Supabase user is required." } }, 401);

    let bodyText: string;
    try {
      bodyText = await request.text();
    } catch {
      return json({ error: { code: "invalid_request", message: "Request body could not be read." } }, 400);
    }
    if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) {
      return json({ error: { code: "invalid_request", message: "Request body is too large." } }, 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return json({ error: { code: "invalid_request", message: "Request body must be valid JSON." } }, 400);
    }
    if (!isRecord(body)
      || Object.keys(body).some((key) => key !== "task" && key !== "source")
      || !validTaskIntent(body.task)) {
      return json({ error: { code: "invalid_request", message: "Task creation intent is malformed or contains privileged fields." } }, 400);
    }
    const source =
      body.source === "task_import"
        ? "task_import"
        : body.source === "task_creation" || body.source === undefined
          ? "task_creation"
          : null;
    if (!source) return json({ error: { code: "invalid_request", message: "Task creation source is invalid." } }, 400);

    try {
      const adminClient = context.supabaseAdmin as unknown as TrustedCreationAdminClient;
      const profile = await readOwnerProfile(adminClient, userId);
      const entityKind = await deriveEntityKind(adminClient, userId, body.task.parent_task_id as string | null | undefined);
      const plan = buildCanonicalTaskCreationPlan({
        draft: body.task,
        entityKind,
        now: new Date().toISOString(),
        profile,
        source,
      });
      const result = await createWithPlan(adminClient, userId, plan);
      if (result.error) return json({ error: { code: "canonical_creation_failed", message: result.error.message } }, 422);
      const task = canonicalTaskFromRpc(result.data, userId);
      if (!task) return json({ error: { code: "malformed_response", message: "Canonical Task creation returned an unusable Task row." } }, 502);
      return json({ task, used_energy_fallback: result.usedEnergyFallback }, 200);
    } catch (error) {
      return json({ error: { code: "canonical_creation_rejected", message: errorMessage(error, "Canonical Task creation was rejected.") } }, 422);
    }
  }),
};
