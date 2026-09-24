import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { WORKSPACE_POSTGRES_CHANGES_TABLES } from "../src/lib/workspace-realtime-publication-contract.ts";

const workspaceSource = readFileSync(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../supabase/patch_workspace_realtime_publication_7_15_38.sql", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const workspaceChannelSource = workspaceSource.slice(
  workspaceSource.indexOf("const workspaceChannel = client.channel"),
  workspaceSource.indexOf("return () => {", workspaceSource.indexOf("const workspaceChannel = client.channel")),
);

function sliceWorkspaceHandler(table: string) {
  const tableStart = workspaceChannelSource.indexOf(`table: "${table}"`);
  assert.ok(tableStart >= 0, `missing workspace handler for ${table}`);
  const nextHandler = workspaceChannelSource.indexOf("      .on(", tableStart);
  return workspaceChannelSource.slice(tableStart, nextHandler >= 0 ? nextHandler : undefined);
}

test("the shared workspace table list is the publication contract", () => {
  assert.deepEqual(WORKSPACE_POSTGRES_CHANGES_TABLES, [
    "adhdice_task_list_folders",
    "adhdice_task_content_folders",
    "adhdice_task_list_containers",
    "adhdice_task_list_rail_items",
    "adhdice_focus_categories",
    "adhdice_task_focus_days",
    "adhdice_task_lists",
    "adhdice_task_list_manual_memberships",
    "adhdice_notes",
    "adhdice_task_history_facts",
  ]);

  const subscribedTables = [...workspaceChannelSource.matchAll(/table: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(subscribedTables, [...WORKSPACE_POSTGRES_CHANGES_TABLES]);
  assert.equal(new Set(subscribedTables).size, subscribedTables.length);
});

test("the publication repair is additive, idempotent, and covers every shared binding", () => {
  for (const table of WORKSPACE_POSTGRES_CHANGES_TABLES) {
    assert.match(migrationSource, new RegExp(`'${table}'`));
    assert.ok(schemaSource.includes(table) || migrationSource.includes(table), `missing SQL expectation for ${table}`);
  }
  assert.match(migrationSource, /begin;[\s\S]*do \$\$[\s\S]*commit;/);
  assert.match(migrationSource, /from pg_publication[\s\S]*supabase_realtime/);
  assert.match(migrationSource, /not exists \([\s\S]*from pg_publication_rel/);
  assert.match(migrationSource, /to_regclass\(format\('public\.%I', table_name\)\)/);
  assert.match(migrationSource, /execute format\([\s\S]*alter publication supabase_realtime add table/);
  assert.doesNotMatch(migrationSource, /drop publication|drop table/i);
});

test("Focus days, Content Folders, Task Lists, and Focus route through scoped refreshers", () => {
  const expectedScopedCalls: Record<string, string> = {
    adhdice_task_list_folders: "requestTaskListDomainRefresh",
    adhdice_task_content_folders: "requestTaskContentFolderDomainRefresh",
    adhdice_task_list_containers: "requestTaskListDomainRefresh",
    adhdice_task_list_rail_items: "requestTaskListDomainRefresh",
    adhdice_focus_categories: "requestFocusDomainRefresh",
    adhdice_task_focus_days: "requestFocusDomainRefresh",
    adhdice_task_lists: "requestTaskListDomainRefresh",
    adhdice_task_list_manual_memberships: "requestTaskListDomainRefresh",
  };

  for (const [table, scopedCall] of Object.entries(expectedScopedCalls)) {
    const handler = sliceWorkspaceHandler(table);
    assert.doesNotMatch(handler, /requestCoreWorkspaceRefresh/);
    assert.match(handler, new RegExp(`${scopedCall}\\("${table}"\\)`));
  }
});

test("every shared workspace Postgres Changes callback emits a table-level diagnostic first", () => {
  for (const table of WORKSPACE_POSTGRES_CHANGES_TABLES) {
    const handler = sliceWorkspaceHandler(table);
    assert.match(
      handler,
      new RegExp(`\\(payload\\) => \\{\\s*recordWorkspacePostgresEvent\\("${table}", payload\\.eventType\\);`),
    );
  }
  assert.match(workspaceSource, /kind: "workspace_postgres_event_received"/);
});

test("workspace subscription diagnostics retain CHANNEL_ERROR and TIMED_OUT errors without console fallback", () => {
  assert.match(workspaceChannelSource, /\.subscribe\(\(status, error\) =>/);
  assert.match(workspaceChannelSource, /status === "CHANNEL_ERROR" \|\| status === "TIMED_OUT"/);
  assert.match(workspaceChannelSource, /kind: "workspace_channel_subscription_error"/);
  assert.match(workspaceChannelSource, /subscriptionError: describeRealtimeSubscriptionError\(error\)/);
  assert.doesNotMatch(workspaceChannelSource, /setInterval|setTimeout/);
});

test("the shared workspace channel remains the only multi-table workspace channel", () => {
  assert.match(workspaceChannelSource, /client\.channel\(`adhdice_workspace:\$\{userId\}`\)/);
  assert.doesNotMatch(workspaceChannelSource, /client\.channel\(`adhdice_(?:task_list|task_content|focus)/);
  assert.doesNotMatch(workspaceChannelSource, /requestCoreWorkspaceRefresh/);
});
