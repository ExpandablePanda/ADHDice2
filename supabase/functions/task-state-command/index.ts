import { withSupabase } from "npm:@supabase/server@1.4.1";
import { logicalDateForTimestamp } from "../../../src/lib/task-state-engine/calendar.ts";
import {
  CanonicalCommandPlanningError,
  planTaskStateCommand,
  serializeCanonicalTaskStateCommandForRpc,
} from "../../../src/lib/task-state-canonical/command-service.ts";
import { buildCanonicalTaskStateEngineInput } from "../../../src/lib/task-state-canonical/engine-input.ts";
import { loadCanonicalTaskState, type CanonicalReadClient } from "../../../src/lib/task-state-canonical/read-model.ts";
import {
  buildTrustedTaskStateCommand,
  validateTaskStateCommandIntent,
} from "./domain.ts";

const MAX_BODY_BYTES = 32 * 1024;

function json(payload: unknown, status: number) {
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

function userIdFromContext(context: { userClaims?: { sub?: unknown } }) {
  return typeof context.userClaims?.sub === "string" && context.userClaims.sub.length > 0
    ? context.userClaims.sub
    : null;
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
    const intent = validateTaskStateCommandIntent(body);
    if (!intent) return json({ error: { code: "invalid_request", message: "Command intent is malformed or contains privileged persistence fields." } }, 400);

    const adminClient = context.supabaseAdmin as unknown as CanonicalReadClient;
    const readResult = await loadCanonicalTaskState(adminClient, {
      userId,
      taskId: intent.task_id,
      includeLegacyHistoryEvidence: false,
    });
    if (readResult.error || !readResult.data) {
      return json({ error: { code: "canonical_state_unavailable", message: "Canonical Task State is unavailable." } }, 503);
    }

    try {
      const now = new Date().toISOString();
      const logicalDate = logicalDateForTimestamp(now, readResult.data.logicalDayProfile.timezone, readResult.data.logicalDayProfile.day_start_time);
      const logicalDay = {
        identity: `logical-day:${userId}:${readResult.data.logicalDayProfile.settings_revision}:${readResult.data.logicalDayProfile.timezone}:${readResult.data.logicalDayProfile.day_start_time}:${logicalDate}`,
        logicalDate,
        timezone: readResult.data.logicalDayProfile.timezone,
        dayStartTime: readResult.data.logicalDayProfile.day_start_time,
        settingsRevision: readResult.data.logicalDayProfile.settings_revision,
      };
      const engineInput = buildCanonicalTaskStateEngineInput(readResult.data, {
        now,
        timezone: logicalDay.timezone,
        logicalDayRollover: logicalDay.dayStartTime,
      });
      const command = buildTrustedTaskStateCommand({ intent, userId, readModel: readResult.data, logicalDay, now });
      const plan = planTaskStateCommand({ task: readResult.data.task, engineInput }, command);
      const rpcCommand = serializeCanonicalTaskStateCommandForRpc(plan);
      const rpcResult = await context.supabaseAdmin.rpc("adhdice_execute_task_state_command", {
        p_user_id: userId,
        p_command: rpcCommand,
      });
      if (rpcResult.error) {
        const status = rpcResult.error.code === "40001" ? 409 : rpcResult.error.code === "42501" ? 403 : 422;
        return json({ error: { code: "command_rejected", message: "Canonical Task State command was rejected." } }, status);
      }
      return json(rpcResult.data, 200);
    } catch (error) {
      if (error instanceof CanonicalCommandPlanningError) {
        const status = error.code === "STALE_REVISION" ? 409 : 422;
        return json({ error: { code: error.code, message: error.message } }, status);
      }
      return json({ error: { code: "canonical_state_unavailable", message: "Canonical Task State could not be planned." } }, 503);
    }
  }),
};
