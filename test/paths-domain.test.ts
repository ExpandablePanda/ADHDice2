import assert from "node:assert/strict";
import test from "node:test";
import {
  createLocalStoragePathsStorageAdapter,
  createPrototypePathsStorageAdapter,
  getLocalPathDateKey,
  LOCAL_PATHS_STORAGE_KEY_PREFIX,
  normalizePathRecordBundle,
  normalizePathProgress,
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
        position: { x: -20, y: 95.6 },
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
      position: node.position,
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
        position: { x: 32, y: 96 },
        sortOrder: 0,
        title: "Check linked task",
      },
      {
        id: "node-3",
        linkedTaskId: null,
        nextNodeIds: [],
        note: null,
        pathId: "path-1",
        position: { x: 400, y: 140 },
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
    nodes: [{ id: "node-b", linkedTaskId: "task-2", nextNodeIds: [], pathId: "path-b", position: { x: 440, y: 260 }, title: "Node B" }],
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
  assert.deepEqual(saved.nodes[0]?.position, { x: 440, y: 260 });

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
  assert.deepEqual(fetched?.nodes[0]?.position, { x: 440, y: 260 });

  const deleted = await adapter.deletePath({ pathId: "path-a", userId: "user-1" });
  assert.equal(deleted, true);
  assert.deepEqual(
    (await adapter.listPaths({ userId: "user-1" })).map((record) => record.path.id),
    ["path-b"],
  );
});

test("path progress normalizes to PATHS nodes without mutating linked tasks", () => {
  const progress = normalizePathProgress(
    {
      completedNodeIds: ["node-a", "node-missing", "node-a"],
      dateKey: "2026-06-24",
      pathId: "path-a",
      userId: "user-1",
    },
    {
      dateKey: "2026-06-24",
      nodeIds: new Set(["node-a", "node-b"]),
      pathId: "path-a",
      userId: "user-1",
    },
  );

  assert.deepEqual(progress.completedNodeIds, ["node-a"]);
  assert.equal(progress.dateKey, "2026-06-24");
  assert.equal(progress.pathId, "path-a");
});

test("localStorage adapter persists records and daily progress under a user scoped key", async () => {
  const storage = createMemoryStorage();
  const adapter = createLocalStoragePathsStorageAdapter({
    seedRecords: [
      {
        nodes: [
          { id: "node-a", linkedTaskId: "task-a", pathId: "path-a", title: "Node A" },
          { id: "node-b", linkedTaskId: null, pathId: "path-a", title: "Node B" },
        ],
        path: {
          createdAt: "2026-06-24T00:00:00.000Z",
          id: "path-a",
          pathType: "daily_reset",
          sortOrder: 0,
          title: "Path A",
          updatedAt: "2026-06-24T00:00:00.000Z",
          userId: "seed-user-is-rewritten",
        },
      },
    ],
    storage,
    userId: "user-1",
  });

  const todayKey = getLocalPathDateKey(new Date("2026-06-24T12:00:00"));
  const listed = await adapter.listPaths({ userId: "user-1" });
  assert.deepEqual(listed.map((record) => record.path.id), ["path-a"]);
  assert.equal(listed[0]?.path.userId, "user-1");

  await adapter.savePathProgress({
    completedNodeIds: ["node-a", "task-a"],
    dateKey: todayKey,
    pathId: "path-a",
    userId: "user-1",
  });

  const secondAdapter = createLocalStoragePathsStorageAdapter({ storage, userId: "user-1" });
  const progress = await secondAdapter.getPathProgress({
    dateKey: todayKey,
    pathId: "path-a",
    userId: "user-1",
  });

  assert.deepEqual(progress.completedNodeIds, ["node-a"]);
  assert.ok(storage.getItem(`${LOCAL_PATHS_STORAGE_KEY_PREFIX}:user-1`)?.includes("path-a"));
});

function createMemoryStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}
