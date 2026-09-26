import { withSupabase } from "npm:@supabase/server@1.4.1";
import { userIdFromContext } from "../task-state-command/auth.ts";
import {
  parseRecordsRecalculateRequest,
  runRecordsRecalculation,
} from "./domain.ts";
import type { RecordsClient } from "../../../src/lib/record-repository.ts";

const MAX_BODY_BYTES = 16 * 1024;

function json(payload: unknown, status: number) {
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

function errorCode(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "records_recalculate_failed";
}

function errorMessage(error: unknown) {
  if (errorCode(error) === "RECORDS_BUSY") return "Records are already refreshing in another session.";
  if (errorCode(error) === "RECORDS_SOURCE_CHANGED" || errorCode(error) === "RECORDS_LOGICAL_DATE_CHANGED") {
    return "Records sources changed while refreshing. Please retry.";
  }
  if (errorCode(error) === "RECORDS_SOURCE_STATE_UNAVAILABLE") return "Records source state is unavailable. Please retry.";
  return error instanceof Error && error.message ? error.message : "Records recalculation failed.";
}

function statusForError(error: unknown) {
  const code = errorCode(error);
  if (code === "RECORDS_BUSY" || code === "RECORDS_SOURCE_CHANGED" || code === "RECORDS_LOGICAL_DATE_CHANGED") return 409;
  if (code === "RECORDS_SOURCE_STATE_UNAVAILABLE") return 503;
  return 500;
}

const recordsRecalculate = {
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
    const requestBody = parseRecordsRecalculateRequest(body);
    if (!requestBody) return json({ error: { code: "invalid_request", message: "Records recalculation request is malformed." } }, 400);

    try {
      const result = await runRecordsRecalculation({
        client: context.supabase as unknown as RecordsClient,
        request: requestBody,
        userId,
      });
      return json(result, 200);
    } catch (error) {
      return json({ error: { code: errorCode(error), message: errorMessage(error) } }, statusForError(error));
    }
  }),
};

export default recordsRecalculate;
