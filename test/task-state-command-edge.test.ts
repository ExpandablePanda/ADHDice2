import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const edgeSource = readFileSync(new URL("../supabase/functions/task-state-command/index.ts", import.meta.url), "utf8");
const domainSource = readFileSync(new URL("../supabase/functions/task-state-command/domain.ts", import.meta.url), "utf8");

test("Edge boundary verifies the user, reads canonical state without legacy authority, and calls the backend RPC", () => {
  assert.match(edgeSource, /withSupabase\(\{ auth: "user" \}/);
  assert.match(edgeSource, /context\.userClaims\?\.sub/);
  assert.match(edgeSource, /context\.supabaseAdmin/);
  assert.match(edgeSource, /includeLegacyHistoryEvidence: false/);
  assert.match(edgeSource, /adhdice_execute_task_state_command/);
  assert.doesNotMatch(edgeSource, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY\s*=/);
  assert.doesNotMatch(edgeSource, /console\.(log|error|warn)/);
});

test("Edge intent validation owns the privileged-field rejection list", () => {
  assert.match(domainSource, /FORBIDDEN_KEYS/);
  assert.match(domainSource, /task_patch/);
  assert.match(domainSource, /accepted_payload_digest/);
  assert.match(domainSource, /migration_operation_id/);
  assert.match(domainSource, /source_kind/);
});
