import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { mapTaskListRow } from "../src/lib/task-list-mappers.ts";
import type { TaskList } from "../src/lib/database.types.ts";

function attentionRow(rulesJson: string | null): TaskList {
  return {
    built_in_key: "attention",
    created_at: "2026-09-12T00:00:00.000Z",
    folder_id: null,
    id: "attention",
    is_deletable: false,
    is_editable: false,
    is_visible: true,
    list_type: "system",
    membership_mode: "manual",
    name: "Needs Action",
    revision: 1,
    rules_json: rulesJson,
    sort_order: 3,
    updated_at: "2026-09-12T00:00:00.000Z",
    user_id: "user-1",
  };
}

test("legacy persisted Attention null rules hydrate to the default overdue rule", () => {
  const mapped = mapTaskListRow(attentionRow(null));
  assert.ok(mapped);
  assert.equal(mapped?.id, "attention");
  assert.equal(mapped?.name, "Attention");
  assert.equal(mapped?.type, "system");
  assert.equal(mapped?.membershipMode, "system");
  assert.equal(mapped?.isEditable, true);
  assert.equal(mapped?.isDeletable, false);
  assert.deepEqual(mapped?.rules, { rules: [{ rule: { field: "due", op: "is_overdue" } }] });
});

test("persisted Attention rules preserve edited and explicit empty groups", () => {
  const editedRules = { rules: [{ rule: { field: "due", op: "is_today" } }] };
  const edited = mapTaskListRow(attentionRow(JSON.stringify(editedRules)));
  const empty = mapTaskListRow(attentionRow(JSON.stringify({ rules: [] })));

  assert.deepEqual(edited?.rules, { rules: [{ connector: undefined, rule: editedRules.rules[0]!.rule }] });
  assert.deepEqual(empty?.rules, { rules: [] });
});

test("Attention persistence uses the existing list row rules path and capability", () => {
  const actionsSource = readFileSync("src/hooks/useTaskListActions.ts", "utf8");
  assert.match(actionsSource, /getTaskListCapabilities/);
  assert.match(actionsSource, /capabilities\.usesRuleEvaluation \? \(input\.rules/);
  assert.match(actionsSource, /rules_json: savedDefinition\.rules \? JSON\.stringify\(savedDefinition\.rules\) : null/);
  assert.match(actionsSource, /membership_mode: getStoredTaskListMembershipMode/);
});
