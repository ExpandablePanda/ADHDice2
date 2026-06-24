import assert from "node:assert/strict";
import test from "node:test";
import {
  createPrototypePathsStorageAdapter,
  normalizePathRecordBundle,
  normalizePathType,
} from "../src/lib/paths-domain.ts";

test("path normalization repairs malformed records without embedding task data", () => {
  const record = normalizePathRecordBundle({
    nodes: [
      {
        id: " node-2 ",
        linkedTaskId: "  task-123  ",
        nextNodeIds: ["node-2", "node-3", "", "node-3"],
        note: "  linked but read-only  ",
        pathId: " path-1 ",
        sortOrder: "bad",
        title: "  Check linked task  ",
      },
      {
        id: "node-3",
        linkedTaskId: { bad: true },
        nextNodeIds: ["missing-node"],
        note: " ",
        pathId: "path-1",
        sortOrder: 1,
        title: "",
      },
      {
        id: "node-off-path",
        pathId: "another-path",
        title: "skip me",
      },
    ],
    path: {
      archivedAt: " ",
      createdAt: "",
      description: "  Gentle reset  ",
      id: " path-1 ",
      pathType: "not-real",
      sortOrder: "bad",
      title: "  Morning reset  ",
      updatedAt: null,
      userId: " user-1 ",
    },
  });

  assert.equal(normalizePathType("daily_reset"), "daily_reset");
  assert.equal(normalizePathType("bad-value"), "reset_flow");
  assert.equal(record.path.id, "path-1");
  assert.equal(record.path.userId, "user-1");
  assert.equal(record.path.title, "Morning reset");
  assert.equal(record.path.description, "Gentle reset");
  assert.equal(record.path.pathType, "reset_flow");
  assert.equal(record.path.sortOrder, 0);
  assert.equal(record.path.archivedAt, null);
  assert.equal(record.nodes.length, 2);
  assert.deepEqual(
    record.nodes.map((node) => ({
      id: node.id,
      linkedTaskId: node.linkedTaskId,
      nextNodeIds: node.nextNodeIds,
      note: node.note,
      pathId: node.pathId,
      sortOrder: node.sortOrder,
      title: node.title,
    })),
    [
      {
        id: "node-2",
        linkedTaskId: "task-123",
        nextNodeIds: ["node-3"],
        note: "linked but read-only",
        pathId: "path-1",
        sortOrder: 0,
        title: "Check linked task",
      },
      {
        id: "node-3",
        linkedTaskId: null,
        nextNodeIds: [],
        note: null,
        pathId: "path-1",
        sortOrder: 1,
        title: "Untitled node",
      },
    ],
  );
});

test("prototype adapter exposes normalized path records and safe future persistence methods", async () => {
  const adapter = createPrototypePathsStorageAdapter([
    {
      nodes: [{ id: "node-a", linkedTaskId: "task-1", pathId: "path-a", title: "Node A" }],
      path: {
        createdAt: "2026-06-24T00:00:00.000Z",
        id: "path-a",
        pathType: "one_time",
        sortOrder: 1,
        title: "Path A",
        updatedAt: "2026-06-24T00:00:00.000Z",
        userId: "user-1",
      },
    },
  ]);

  const saved = await adapter.savePath({
    nodes: [{ id: "node-b", linkedTaskId: "task-2", nextNodeIds: [], pathId: "path-b", title: "Node B" }],
    path: {
      createdAt: "2026-06-25T00:00:00.000Z",
      id: "path-b",
      pathType: "daily_reset",
      sortOrder: 0,
      title: "Path B",
      updatedAt: "2026-06-25T00:00:00.000Z",
      userId: "user-1",
    },
  });

  assert.equal(saved.path.id, "path-b");
  assert.equal(saved.nodes[0]?.linkedTaskId, "task-2");

  const listed = await adapter.listPaths({ userId: "user-1" });
  assert.deepEqual(
    listed.map((record) => record.path.id),
    ["path-b", "path-a"],
  );

  const archived = await adapter.archivePath({
    archivedAt: "2026-06-26T00:00:00.000Z",
    pathId: "path-b",
    userId: "user-1",
  });
  assert.equal(archived?.path.archivedAt, "2026-06-26T00:00:00.000Z");

  const fetched = await adapter.getPath({ pathId: "path-b", userId: "user-1" });
  assert.equal(fetched?.nodes[0]?.linkedTaskId, "task-2");

  const deleted = await adapter.deletePath({ pathId: "path-a", userId: "user-1" });
  assert.equal(deleted, true);
  assert.deepEqual(
    (await adapter.listPaths({ userId: "user-1" })).map((record) => record.path.id),
    ["path-b"],
  );
});
