import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { TaskListFolder, TaskListRailItem } from "@/lib/database.types";
import {
  TASK_LIST_RAIL_MAX_SORT_ORDER,
  buildCanonicalTaskListRailTree,
  buildTaskListRailManifest,
  getTaskListRailFolderItemKey,
  getTaskListRailItemKey,
  moveTaskListRailItem,
  reconcileTaskListRailPlacements,
  seedMissingTaskListRailPlacements,
} from "@/lib/task-list-rail-placement";
import { TaskListFolderConflictError } from "@/lib/task-list-folders";
import { getBuiltInTaskLists, type TaskListDefinition } from "@/lib/task-lists";

const migration = readFileSync(new URL("../supabase/add_task_list_rail_placement_7_4_22.sql", import.meta.url), "utf8");
const integerPatch = readFileSync(new URL("../supabase/patch_task_list_rail_integer_order_7_4_25.sql", import.meta.url), "utf8");
const railSource = readFileSync(new URL("../src/components/task-app/tasks-page.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("../src/hooks/useTaskListFolderActions.ts", import.meta.url), "utf8");

function definition(
  id: TaskListDefinition["id"],
  type: TaskListDefinition["type"],
  membershipMode: TaskListDefinition["membershipMode"],
): TaskListDefinition {
  return {
    description: id,
    folderId: null,
    id,
    isDeletable: type === "custom",
    isEditable: true,
    isVisible: true,
    membershipMode,
    name: id,
    revision: 0,
    rules: null,
    sortOrder: 0,
    type,
  };
}

function folder(id: string, parent: string | null = null): TaskListFolder {
  return {
    created_at: "2026-07-26T00:00:00Z",
    id,
    name: id,
    parent_folder_id: parent,
    revision: 0,
    sort_order: 0,
    updated_at: "2026-07-26T00:00:00Z",
    user_id: "user",
  };
}

const folderA = folder("10000000-0000-4000-8000-000000000001");
const folderB = folder("10000000-0000-4000-8000-000000000002", folderA.id);
const smart = definition("list:20000000-0000-4000-8000-000000000001", "smart", "rules");
const rules = definition("list:20000000-0000-4000-8000-000000000002", "custom", "rules");
const hybrid = definition("list:20000000-0000-4000-8000-000000000003", "custom", "hybrid");
const manual = definition("list:20000000-0000-4000-8000-000000000004", "custom", "manual");
const visible = [...getBuiltInTaskLists(), smart, rules, hybrid, manual];

test("every built-in and custom subtype has a canonical draggable identity", () => {
  const manifest = buildTaskListRailManifest(visible, [folderA, folderB]);
  for (const list of visible) {
    const item = manifest.find((candidate) => candidate.item_key === getTaskListRailItemKey(list));
    assert.ok(item, list.id);
    assert.equal(item.item_type, "list");
  }
  assert.ok(manifest.some((item) => item.item_key === getTaskListRailFolderItemKey(folderA.id)));
  for (const id of [
    "all", "inbox", "today", "later", "waiting", "focus", "milestones",
    "routine", "quick_wins", "priority_1_2", "priority_3_4", "priority_5",
  ]) {
    assert.ok(manifest.some((item) => item.item_key === `system:${id}`), id);
  }
});

test("list subtype does not affect root or folder placement", () => {
  const manifest = buildTaskListRailManifest(visible, [folderA]);
  const placements = seedMissingTaskListRailPlacements("user", manifest, []).map((item) => (
    [smart.id, rules.id, hybrid.id, manual.id, "system:all"].includes(item.item_key)
      ? { ...item, container_folder_id: folderA.id }
      : item
  ));
  const tree = buildCanonicalTaskListRailTree(visible, [folderA], placements);
  assert.deepEqual(
    new Set(tree.mixedChildrenByFolderId.get(folderA.id)?.map((item) => item.itemKey)),
    new Set([smart.id, rules.id, hybrid.id, manual.id, "system:all"]),
  );
});

test("saved mixed order survives repeated derivation and ignores definition sort order", () => {
  const manifest = buildTaskListRailManifest(visible, [folderA]);
  const placements = seedMissingTaskListRailPlacements("user", manifest, []).map((item) => {
    if (item.item_key === "system:all") return { ...item, sort_order: 4 };
    if (item.item_key === manual.id) return { ...item, sort_order: 0 };
    if (item.item_key === `folder:${folderA.id}`) return { ...item, sort_order: 1 };
    return { ...item, sort_order: item.sort_order + 10 };
  });
  const first = buildCanonicalTaskListRailTree(visible, [folderA], placements);
  const second = buildCanonicalTaskListRailTree([...visible].reverse(), [folderA], placements);
  assert.deepEqual(
    first.mixedChildrenByFolderId.get(null)?.map((item) => item.itemKey),
    second.mixedChildrenByFolderId.get(null)?.map((item) => item.itemKey),
  );
});

test("missing-key reconciliation is idempotent and appends deterministically", () => {
  const manifest = buildTaskListRailManifest(visible, []);
  const saved = seedMissingTaskListRailPlacements("user", manifest.slice(0, 2), []);
  const first = seedMissingTaskListRailPlacements("user", manifest, saved);
  const second = seedMissingTaskListRailPlacements("user", manifest, first);
  assert.deepEqual(first, second);
  assert.equal(first[0], saved[0]);
  assert.equal(first[1], saved[1]);
  assert.deepEqual(
    first.slice(2).map((item) => item.sort_order),
    first.slice(2).map((_, index) => index + 2),
  );
});

test("repository reconciliation sends the complete production manifest", async () => {
  const calls: unknown[] = [];
  const rpc = async (name: string, args: unknown) => {
    calls.push([name, args]);
    return { data: [], error: null };
  };
  await reconcileTaskListRailPlacements({ rpc } as never, buildTaskListRailManifest(visible, [folderA]));
  assert.equal((calls[0] as unknown[])[0], "adhdice_reconcile_task_list_rail_items");
  assert.equal((((calls[0] as unknown[])[1] as { p_manifest: unknown[] }).p_manifest).length, visible.length + 1);
  assert.equal(buildTaskListRailManifest(visible, [folderA]).every((item) => Number.isInteger(item.default_sort_order)), true);
});

test("7.4.25 removes the exact 3.5 manifest-to-integer cast failure", () => {
  assert.doesNotMatch(readFileSync(new URL("../src/lib/task-lists.ts", import.meta.url), "utf8"), /sortOrder:\s*3\.5/);
  assert.doesNotMatch(migration, /definition->>'default_sort_order'\)::integer/);
  assert.doesNotMatch(integerPatch, /definition->>'default_sort_order'\)::integer/);
  assert.match(integerPatch, /jsonb_typeof\(v_item->'default_sort_order'\) <> 'number'/);
  assert.match(integerPatch, /Rail manifest sort order must be a bounded integer/);
  assert.doesNotMatch(integerPatch, /0\.5|3\.5|invalid input syntax for type integer/);
});

test("7.4.25 forward patch normalizes locations and mirrors contiguous integers", () => {
  assert.match(integerPatch, /partition by user_id, container_folder_id[\s\S]*row_number\(\)/i);
  assert.match(integerPatch, /next_sort_order::integer/i);
  assert.match(integerPatch, /parent_folder_id = placement\.container_folder_id,[\s\S]*sort_order = placement\.sort_order/i);
  assert.match(integerPatch, /folder_id = placement\.container_folder_id,[\s\S]*sort_order = placement\.sort_order/i);
  assert.match(integerPatch, /folder\.parent_folder_id is distinct from placement\.container_folder_id/i);
  assert.match(integerPatch, /list_row\.folder_id is distinct from placement\.container_folder_id/i);
});

test("7.4.25 mutation preserves atomic integer CAS, authorization, and cycles", () => {
  assert.match(integerPatch, /\nbegin;[\s\S]*commit;\s*$/i);
  assert.match(integerPatch, /v_target_index integer := \(p_payload->>'target_index'\)::integer/i);
  assert.match(integerPatch, /for update/i);
  assert.match(integerPatch, /v_source_revision <> v_expected_source_revision/i);
  assert.match(integerPatch, /v_destination_revision <> v_expected_destination_revision/i);
  assert.match(integerPatch, /auth\.uid\(\)/i);
  assert.match(integerPatch, /A folder cycle is not allowed/i);
  assert.match(integerPatch, /container_folder_id is not distinct from v_source_folder_id/i);
  assert.match(integerPatch, /container_folder_id is not distinct from v_destination_folder_id/i);
  assert.doesNotMatch(integerPatch, /sort_order = 1000000|Number\.MAX_SAFE_INTEGER|Infinity|\/\s*2/);
});

test("7.4.25 targets the applied 7.4.22 objects without replacing tables or rows", () => {
  assert.match(integerPatch, /add_task_list_rail_placement_7_4_22\.sql is already applied/i);
  assert.match(integerPatch, /create or replace function public\.adhdice_reconcile_task_list_rail_items/i);
  assert.match(integerPatch, /create or replace function public\.adhdice_mutate_task_list_rail_placement/i);
  assert.doesNotMatch(integerPatch, /drop table|truncate|delete from public\.adhdice_task_list_rail_items/i);
});

test("repository mutation accepts bounded integer destinations only", async () => {
  const calls: unknown[] = [];
  const rpc = async (name: string, args: unknown) => {
    calls.push([name, args]);
    return { data: { status: "ok" }, error: null };
  };
  await moveTaskListRailItem({ rpc } as never, {
    destinationContainerFolderId: folderA.id,
    expectedDestinationRevision: 2,
    expectedSourceRevision: 1,
    itemKey: "system:all",
    targetIndex: 3,
  });
  assert.equal((calls[0] as unknown[])[0], "adhdice_mutate_task_list_rail_placement");
  await assert.rejects(() => moveTaskListRailItem({ rpc } as never, {
    destinationContainerFolderId: null,
    expectedDestinationRevision: 1,
    expectedSourceRevision: 1,
    itemKey: "system:all",
    targetIndex: Number.MAX_SAFE_INTEGER,
  }), RangeError);
  assert.equal(calls.length, 1);
  assert.equal(TASK_LIST_RAIL_MAX_SORT_ORDER, 1_000_000);
});

test("stale mutation results remain distinguishable from ordinary failures", async () => {
  const conflictRpc = async () => ({
    data: { code: "ADHDICE_LIST_FOLDER_REVISION_CONFLICT", status: "conflict" },
    error: null,
  });
  await assert.rejects(() => moveTaskListRailItem({ rpc: conflictRpc } as never, {
    destinationContainerFolderId: null,
    expectedDestinationRevision: 1,
    expectedSourceRevision: 1,
    itemKey: "system:all",
    targetIndex: 0,
  }), TaskListFolderConflictError);
  assert.match(actionsSource, /await refresh\(\)/);
  assert.match(railSource, /mutationResult !== "stale-conflict"/);
});

test("migration defines owner-only authenticated placement persistence and realtime", () => {
  assert.match(migration, /primary key \(user_id, item_key\)/i);
  assert.match(migration, /force row level security/i);
  assert.match(migration, /to authenticated/i);
  assert.match(migration, /revoke all[\s\S]*from public, anon/i);
  assert.match(migration, /supabase_realtime add table public\.adhdice_task_list_rail_items/i);
});

test("migration backfills legacy folders and lists without overwriting saved placement", () => {
  assert.match(migration, /'folder:' \|\| folder\.id::text[\s\S]*folder\.parent_folder_id/i);
  assert.match(migration, /list_row\.folder_id/i);
  assert.match(migration, /on conflict \(user_id, item_key\) do nothing/gi);
  assert.match(migration, /Saved placement wins forever/i);
});

test("migration reconciliation safely handles new and deleted database identities", () => {
  assert.match(migration, /Non-manifest rows are ignored here/i);
  assert.match(migration, /Database delete triggers retire genuinely deleted entities/i);
  assert.match(migration, /adhdice_remove_deleted_task_list_rail_item/i);
  assert.match(migration, /coalesce\(max\(sort_order\) \+ 1, 0\)/i);
  assert.match(migration, /on conflict \(user_id, item_key\) do nothing/i);
  assert.match(migration, /get diagnostics v_inserted = row_count/i);
});

test("canonical RPC enforces ownership, fixed search path, CAS, bounds, and cycles", () => {
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(migration, /security definer[\s\S]*set search_path = pg_catalog, public/i);
  assert.match(migration, /pg_advisory_xact_lock[\s\S]*hashtextextended/i);
  assert.match(migration, /v_source_revision <> v_expected_source_revision/i);
  assert.match(migration, /v_destination_revision <> v_expected_destination_revision/i);
  assert.match(migration, /Expected source and destination revisions are required/i);
  assert.match(migration, /v_target_index > v_destination_count/i);
  assert.match(migration, /A folder cycle is not allowed/i);
});

test("canonical movement mirrors legacy columns transactionally without changing membership", () => {
  assert.match(migration, /Canonical placement is authoritative; legacy columns are compatibility mirrors only/i);
  assert.match(migration, /set parent_folder_id = placement\.container_folder_id/i);
  assert.match(migration, /set folder_id = placement\.container_folder_id/i);
  assert.doesNotMatch(migration, /manual_memberships|rules_json|adhdice_clean_tasks/);
});

test("folder deletion promotion remains canonical and deterministically reindexed", () => {
  assert.match(migration, /adhdice_promote_deleted_task_list_folder_rail_items/i);
  assert.match(migration, /container_folder_id = old\.parent_folder_id/i);
  assert.match(migration, /row_number\(\) over \(order by sort_order, item_key\) - 1/i);
});

test("root is persisted as null and no append sentinel reaches production movement", () => {
  assert.match(migration, /container_folder_id uuid/);
  assert.doesNotMatch(migration, /__root__|9223372036854775807|MAX_SAFE_INTEGER|Infinity/);
  assert.doesNotMatch(railSource, /Number\.MAX_SAFE_INTEGER|Infinity/);
  assert.doesNotMatch(actionsSource, /Number\.MAX_SAFE_INTEGER|Infinity/);
  assert.match(railSource, /data-rail-append-index=\{list\.destinationAppendIndex\}/);
});

test("root and active-folder rendering both consume the canonical tree", () => {
  assert.match(appSource, /canonicalTaskListRailTree\.mixedChildrenByFolderId\.get\(folderId\)/);
  assert.match(appSource, /primaryRail: buildStructureOptions\(null\)/);
  assert.match(appSource, /openFolderRails:[\s\S]*buildStructureOptions\(folder\.id\)/);
  assert.doesNotMatch(appSource, /primaryRail: \[\.\.\.fixedOptions/);
});

test("rail placement uses stable keys, real subtypes, and bounded indices", () => {
  assert.match(appSource, /listSubtype: item\.listSubtype/);
  assert.match(railSource, /Number\.isSafeInteger\(rawFolderDestinationIndex\)/);
  assert.match(railSource, /destinationIndex: validFolderDestination \? folderDestinationIndex : validSiblingMove!\.destinationIndex!/);
  assert.doesNotMatch(railSource, /onDiagnostics/);
});
