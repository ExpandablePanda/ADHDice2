import { withSupabase } from "npm:@supabase/server@1.4.1";
import { userIdFromContext } from "./auth.ts";
import {
  executeTrustedTaskStateCommand,
  executeHistoryOutcomeBatch,
  type TrustedTaskStateCommandClient,
} from "./orchestration.ts";
import {
  validateHistoryOutcomeBatchIntent,
  validateTaskStateCommandIntent,
} from "./domain.ts";

const MAX_BODY_BYTES = 32 * 1024;

function json(payload: unknown, status: number) {
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
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
    const batchIntent = validateHistoryOutcomeBatchIntent(body);
    if (batchIntent) {
      const result = await executeHistoryOutcomeBatch({
        userId,
        intent: batchIntent,
        adminClient: context.supabaseAdmin as unknown as TrustedTaskStateCommandClient,
      });
      return json(result.body, result.status);
    }

    const intent = validateTaskStateCommandIntent(body);
    if (!intent) return json({ error: { code: "invalid_request", message: "Command intent is malformed or contains privileged persistence fields." } }, 400);

    const result = await executeTrustedTaskStateCommand({
      userId,
      intent,
      adminClient: context.supabaseAdmin as unknown as TrustedTaskStateCommandClient,
    });
    return json(result.body, result.status);
  }),
};
