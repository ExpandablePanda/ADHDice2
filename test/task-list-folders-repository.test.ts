import assert from "node:assert/strict";
import test from "node:test";
import {
  createTaskListFolder,
  deleteTaskListFolder,
  isTaskListFolderConflict,
  getTaskListContainerRevision,
  ROOT_TASK_LIST_CONTAINER_KEY,
  moveNormalTaskList,
  moveTaskListFolder,
  renameTaskListFolder,
  TaskListFolderConflictError,
} from "@/lib/task-list-folders";

type RpcCall = {
  args: Record<string, unknown>;
  name: string;
};

function createRpcClient(response: { data: Record<string, unknown> | null; error: Record<string, unknown> | null }) {
  const calls: RpcCall[] = [];
  return {
    calls,
    client: {
      async rpc(name: string, args: Record<string, unknown>) {
        calls.push({ args, name });
        return response;
      },
    },
  };
}

test("folder repository maps every authoritative mutation to the shared RPC", async () => {
  const mock = createRpcClient({ data: { status: "ok" }, error: null });
  const client = mock.client as never;

  await createTaskListFolder(client, {
    expectedContainerRevision: 2,
    name: "Projects",
    parentFolderId: null,
  });
  await renameTaskListFolder(client, {
    expectedFolderRevision: 1,
    folderId: "10000000-0000-4000-8000-000000000001",
    name: "Active Projects",
  });
  await moveTaskListFolder(client, {
    destinationFolderId: null,
    expectedDestinationRevision: 4,
    expectedSourceRevision: 3,
    folderId: "10000000-0000-4000-8000-000000000001",
    targetIndex: 1,
  });
  await moveNormalTaskList(client, {
    destinationFolderId: "10000000-0000-4000-8000-000000000001",
    expectedDestinationRevision: 5,
    expectedSourceRevision: 4,
    listId: "3962c720-01be-4c4e-afc0-25fce2b0ac02",
    targetIndex: 0,
  });
  await deleteTaskListFolder(client, {
    expectedContentsRevision: 6,
    expectedParentRevision: 7,
    folderId: "10000000-0000-4000-8000-000000000001",
  });

  assert.deepEqual(mock.calls.map((call) => call.name), Array(5).fill("adhdice_mutate_task_list_structure"));
  assert.deepEqual(mock.calls.map((call) => call.args.p_action), [
    "create_folder",
    "rename_folder",
    "move_folder",
    "move_list",
    "delete_folder",
  ]);
  assert.deepEqual(mock.calls[3].args.p_payload, {
    destination_folder_id: "10000000-0000-4000-8000-000000000001",
    expected_destination_revision: 5,
    expected_source_revision: 4,
    list_id: "3962c720-01be-4c4e-afc0-25fce2b0ac02",
    target_index: 0,
  });
});

test("root container revisions use the canonical key while retaining null RPC identity", () => {
  const containers = [
    { folder_id: undefined, revision: 9 },
    { folder_id: "10000000-0000-4000-8000-000000000001", revision: 4 },
  ] as never;
  assert.equal(ROOT_TASK_LIST_CONTAINER_KEY, "__root__");
  assert.equal(getTaskListContainerRevision(containers, null), 9);
  assert.equal(getTaskListContainerRevision(containers, "10000000-0000-4000-8000-000000000001"), 4);
});

test("root reorder invokes the RPC with raw entity ID, null root, and both root revisions", async () => {
  const mock = createRpcClient({ data: { status: "ok" }, error: null });
  const rawListId = "3962c720-01be-4c4e-afc0-25fce2b0ac02";
  await moveNormalTaskList(mock.client as never, {
    destinationFolderId: null,
    expectedDestinationRevision: 5,
    expectedSourceRevision: 5,
    listId: rawListId,
    targetIndex: 2,
  });
  assert.deepEqual(mock.calls[0], {
    name: "adhdice_mutate_task_list_structure",
    args: {
      p_action: "move_list",
      p_payload: {
        destination_folder_id: null,
        expected_destination_revision: 5,
        expected_source_revision: 5,
        list_id: rawListId,
        target_index: 2,
      },
    },
  });
  assert.doesNotMatch(JSON.stringify(mock.calls[0]), /list:|folder:|__root__/);
});

test("repository recognizes PostgreSQL serialization conflicts and the stable marker", () => {
  assert.equal(isTaskListFolderConflict({ code: "40001", message: "serialization failure" }), true);
  assert.equal(isTaskListFolderConflict({ message: "ADHDICE_LIST_FOLDER_REVISION_CONFLICT" }), true);
  assert.equal(isTaskListFolderConflict({ code: "23503", message: "foreign key violation" }), false);
  assert.equal(isTaskListFolderConflict(new TaskListFolderConflictError()), true);
});

test("repository converts stale RPC errors without returning partial success", async () => {
  const mock = createRpcClient({
    data: null,
    error: { code: "40001", message: "ADHDICE_LIST_FOLDER_REVISION_CONFLICT" },
  });

  await assert.rejects(
    moveNormalTaskList(mock.client as never, {
      destinationFolderId: null,
      expectedDestinationRevision: 8,
      expectedSourceRevision: 8,
      listId: "3962c720-01be-4c4e-afc0-25fce2b0ac02",
      targetIndex: 2,
    }),
    (error: unknown) => error instanceof TaskListFolderConflictError,
  );
});
