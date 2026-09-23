import { withSupabase } from "npm:@supabase/server@1.4.1";
import { userIdFromContext } from "../task-state-command/auth.ts";
import {
  parseCurrentProjectionBackfillRequest,
  runCurrentProjectionBackfill,
  type BackfillAdminClient,
} from "./domain.ts";

const MAX_BODY_BYTES = 16 * 1024;

function json(payload: unknown, status: number) {
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Current projection backfill failed.";
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
    const backfillRequest = parseCurrentProjectionBackfillRequest(body);
    if (!backfillRequest) {
      return json({ error: { code: "invalid_request", message: "Backfill request is malformed." } }, 400);
    }

    try {
      const result = await runCurrentProjectionBackfill({
        adminClient: context.supabaseAdmin as unknown as BackfillAdminClient,
        userId,
        request: backfillRequest,
      });
      return json(result, 200);
    } catch (error) {
      return json({ error: { code: "backfill_failed", message: errorMessage(error) } }, 500);
    }
  }),
};
