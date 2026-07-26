import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/add_task_list_folders_7_4_10.sql", import.meta.url),
  "utf8",
);
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

for (const [label, sql] of [["migration", migration], ["schema", schema]] as const) {
  test(`${label}: folder ownership, hierarchy, RLS, and Realtime contracts`, () => {
    assert.match(sql, /create table public\.adhdice_task_list_folders/i);
    assert.match(sql, /primary key \(user_id, id\)/i);
    assert.match(sql, /foreign key \(user_id, parent_folder_id\)[\s\S]*on delete restrict/i);
    assert.match(sql, /name = trim\(name\)[\s\S]*char_length\(name\) between 1 and 120/i);
    assert.match(sql, /enable row level security/i);
    assert.match(sql, /Users can read their own task list folders[\s\S]*auth\.uid\(\) = user_id/i);
    assert.match(sql, /alter publication supabase_realtime add table public\.adhdice_task_list_folders/i);
  });

  test(`${label}: list compatibility and normal-list eligibility stay guarded`, () => {
    assert.match(sql, /(?:add column\s+|built_in_key text,\s*)folder_id uuid/i);
    assert.match(sql, /foreign key \(user_id, folder_id\)[\s\S]*on delete restrict/i);
    if (label === "migration") {
      assert.match(sql, /set folder_id = null/i);
      assert.match(sql, /invalid_users[\s\S]*count\(distinct sort_order\)[\s\S]*row_number\(\) over/i);
      assert.match(sql, /v_user_id uuid[\s\S]*group by lists\.user_id[\s\S]*values \(v_user_id, null\)/i);
    }
    assert.match(sql, /new\.list_type = 'custom'[\s\S]*new\.membership_mode = 'manual'[\s\S]*new\.built_in_key is null[\s\S]*new\.id like 'list:%'/i);
    assert.match(sql, /Only user-created normal lists can be placed in folders/i);
  });

  test(`${label}: direct writes and RPC moves reject malformed folder cycles`, () => {
    assert.match(sql, /adhdice_task_list_folders_not_self_check/i);
    assert.match(sql, /adhdice_guard_task_list_folder_cycle/i);
    assert.match(sql, /with recursive ancestors/i);
    assert.match(sql, /with recursive descendants/i);
    assert.match(sql, /A folder cannot move into its descendant/i);
  });

  test(`${label}: one mixed position domain is normalized deterministically`, () => {
    assert.match(sql, /adhdice_normalize_task_list_container/i);
    assert.match(sql, /select 'folder'::text as entity_type[\s\S]*union all[\s\S]*select 'list'/i);
    assert.match(sql, /order by sort_order, entity_type, entity_id/i);
    assert.match(sql, /set sort_order = ranked\.next_sort_order/i);
    assert.doesNotMatch(sql, /folder_order[^_]|list_order[^_]/i);
  });

  test(`${label}: root and nested container revisions protect atomic structural writes`, () => {
    assert.match(sql, /create table public\.adhdice_task_list_containers/i);
    assert.match(sql, /where folder_id is null/i);
    assert.match(sql, /adhdice_assert_task_list_container_revision/i);
    assert.match(sql, /for update/i);
    assert.match(sql, /ADHDICE_LIST_FOLDER_REVISION_CONFLICT/i);
    assert.match(sql, /v_expected_source_revision[\s\S]*v_expected_destination_revision/i);
    assert.match(sql, /folder_id is not distinct from v_source_folder_id[\s\S]*folder_id is not distinct from v_destination_folder_id/i);
  });

  test(`${label}: deletion promotes and splices direct mixed children only`, () => {
    assert.match(sql, /p_action = 'delete_folder'/i);
    assert.match(sql, /set parent_folder_id = v_parent_folder_id,[\s\S]*sort_order = v_deleted_position \+ sort_order/i);
    assert.match(sql, /set folder_id = v_parent_folder_id,[\s\S]*sort_order = v_deleted_position \+ sort_order/i);
    assert.match(sql, /delete from public\.adhdice_task_list_folders/i);
    assert.doesNotMatch(sql, /delete from public\.adhdice_(?:clean_tasks|task_lists|task_list_manual_memberships)/i);
  });
}

test("forward migration is transactional and intentionally leaves application to deployment", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);
  assert.match(migration, /notify pgrst, 'reload schema'/i);
});
