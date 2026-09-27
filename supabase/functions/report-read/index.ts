import { withSupabase } from "npm:@supabase/server@1.4.1";
import { userIdFromContext } from "../task-state-command/auth.ts";
import { loadReportReadModel, parseReportReadRequest } from "./domain.ts";

function json(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

const reportRead = {
  fetch: withSupabase({ auth: "user" }, async (request, context) => {
    if (request.method !== "POST") return json({ error: { code: "invalid_request", message: "Only POST is supported." } }, 405);
    const userId = userIdFromContext(context);
    if (!userId) return json({ error: { code: "authentication_failure", message: "A verified Supabase user is required." } }, 401);
    let body: unknown;
    try {
      body = JSON.parse(await request.text());
    } catch {
      return json({ error: { code: "invalid_request", message: "Request body must be valid JSON." } }, 400);
    }
    const parsed = parseReportReadRequest(body);
    if (!parsed) return json({ error: { code: "invalid_request", message: "Report range is malformed." } }, 400);
    try {
      const model = await loadReportReadModel(context.supabase, userId, parsed);
      return json(model);
    } catch (error) {
      return json({ error: { code: "report_read_failed", message: error instanceof Error && error.message ? error.message : "Report read failed." } }, 500);
    }
  }),
};

export default reportRead;
