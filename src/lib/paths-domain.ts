export const PATH_TYPES = ["one_time", "daily_reset", "reset_flow"] as const;

export type PathType = (typeof PATH_TYPES)[number];

export type Path = {
  archivedAt: string | null;
  createdAt: string;
  description: string | null;
  id: string;
  pathType: PathType;
  sortOrder: number;
  title: string;
  updatedAt: string;
  userId: string;
};

export type PathNode = {
  id: string;
  linkedTaskId: string | null;
  nextNodeIds: string[];
  note: string | null;
  pathId: string;
  position: PathNodePosition;
  sortOrder: number;
  title: string;
};

export type PathNodePosition = {
  x: number;
  y: number;
};

export type PathRecord = {
  nodes: PathNode[];
  path: Path;
};

export type PathProgress = {
  completedNodeIds: string[];
  dateKey: string | null;
  pathId: string;
  updatedAt: string;
  userId: string;
};

export type ListPathsArgs = {
  userId: string;
};

export type GetPathArgs = {
  pathId: string;
  userId: string;
};

export type SavePathRecordArgs = {
  nodes: readonly unknown[];
  path: unknown;
};

export type ArchivePathArgs = {
  archivedAt?: string | null;
  pathId: string;
  userId: string;
};

export type GetPathProgressArgs = {
  dateKey?: string | null;
  pathId: string;
  userId: string;
};

export type SavePathProgressArgs = GetPathProgressArgs & {
  completedNodeIds: readonly string[];
  updatedAt?: string;
};

export interface PathsStorageAdapter {
  archivePath(args: ArchivePathArgs): Promise<PathRecord | null>;
  deletePath(args: GetPathArgs): Promise<boolean>;
  getPath(args: GetPathArgs): Promise<PathRecord | null>;
  getPathProgress(args: GetPathProgressArgs): Promise<PathProgress>;
  listPaths(args: ListPathsArgs): Promise<PathRecord[]>;
  savePathProgress(args: SavePathProgressArgs): Promise<PathProgress>;
  savePath(args: SavePathRecordArgs): Promise<PathRecord>;
}

const DEFAULT_PATH_TYPE: PathType = "reset_flow";
export const LOCAL_PATHS_PROTOTYPE_USER_ID = "local-prototype-user";
export const LOCAL_PATHS_STORAGE_KEY_PREFIX = "adhdice-paths:v1";
const UNTITLED_PATH_TITLE = "Untitled path";
const UNTITLED_NODE_TITLE = "Untitled node";

type PathsLocalStorageSnapshot = {
  progress?: unknown[];
  records?: Array<{ nodes?: readonly unknown[] | null; path: unknown }>;
};

type PathsStorageArea = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function isPathType(value: unknown): value is PathType {
  return typeof value === "string" && PATH_TYPES.includes(value as PathType);
}

export function normalizePathType(value: unknown, fallback: PathType = DEFAULT_PATH_TYPE): PathType {
  return isPathType(value) ? value : fallback;
}

export function normalizePathRecord(input: unknown, index = 0): Path {
  const record = asRecord(input);
  const pathId = normalizeRequiredString(record.id, `path-${index + 1}`);
  const createdAt = normalizeOptionalString(record.createdAt) ?? buildStableTimestamp(index);
  const updatedAt = normalizeOptionalString(record.updatedAt) ?? createdAt;

  return {
    archivedAt: normalizeOptionalString(record.archivedAt),
    createdAt,
    description: normalizeOptionalString(record.description),
    id: pathId,
    pathType: normalizePathType(record.pathType),
    sortOrder: normalizeSortOrder(record.sortOrder, index),
    title: normalizeRequiredString(record.title, UNTITLED_PATH_TITLE),
    updatedAt,
    userId: normalizeRequiredString(record.userId, LOCAL_PATHS_PROTOTYPE_USER_ID),
  };
}

export function normalizePathNodeRecord(
  input: unknown,
  options: {
    fallbackPathId: string;
    index?: number;
  },
): PathNode {
  const { fallbackPathId, index = 0 } = options;
  const record = asRecord(input);

  return {
    id: normalizeRequiredString(record.id, `${fallbackPathId}-node-${index + 1}`),
    linkedTaskId: normalizeOptionalString(record.linkedTaskId),
    nextNodeIds: normalizeStringArray(record.nextNodeIds),
    note: normalizeOptionalString(record.note),
    pathId: normalizeRequiredString(record.pathId, fallbackPathId),
    position: normalizePathNodePosition(record.position, index),
    sortOrder: normalizeSortOrder(record.sortOrder, index),
    title: normalizeRequiredString(record.title, UNTITLED_NODE_TITLE),
  };
}

export function normalizePathRecordBundle(
  input: {
    nodes?: readonly unknown[] | null;
    path: unknown;
  },
  index = 0,
): PathRecord {
  const path = normalizePathRecord(input.path, index);
  const rawNodes = Array.isArray(input.nodes) ? input.nodes : [];
  const normalizedNodes = rawNodes
    .map((node, nodeIndex) => normalizePathNodeRecord(node, { fallbackPathId: path.id, index: nodeIndex }))
    .filter((node) => node.pathId === path.id);
  const nodeIds = new Set(normalizedNodes.map((node) => node.id));
  const nodes = normalizedNodes
    .map((node) => ({
      ...node,
      nextNodeIds: dedupeStrings(
        node.nextNodeIds.filter((nextNodeId) => nextNodeId !== node.id && nodeIds.has(nextNodeId)),
      ),
    }))
    .sort(comparePathNodeOrder);

  return {
    nodes,
    path,
  };
}

export function normalizePathRecords(records: readonly { nodes?: readonly unknown[] | null; path: unknown }[]) {
  return records
    .map((record, index) => normalizePathRecordBundle(record, index))
    .sort(comparePathOrder);
}

export function getLocalPathDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizePathProgress(
  input: unknown,
  options: {
    dateKey?: string | null;
    nodeIds?: ReadonlySet<string>;
    pathId: string;
    userId: string;
  },
): PathProgress {
  const record = asRecord(input);
  const dateKey = normalizeOptionalString(record.dateKey) ?? normalizeOptionalString(options.dateKey);
  const completedNodeIds = normalizeStringArray(record.completedNodeIds)
    .filter((nodeId) => !options.nodeIds || options.nodeIds.has(nodeId));

  return {
    completedNodeIds,
    dateKey,
    pathId: normalizeRequiredString(record.pathId, options.pathId),
    updatedAt: normalizeOptionalString(record.updatedAt) ?? new Date().toISOString(),
    userId: normalizeRequiredString(record.userId, options.userId),
  };
}

export function createPrototypePathsStorageAdapter(
  seedRecords: readonly { nodes?: readonly unknown[] | null; path: unknown }[] = DEFAULT_PROTOTYPE_PATH_RECORDS,
): PathsStorageAdapter {
  const recordsById = new Map(
    normalizePathRecords(seedRecords).map((record) => [record.path.id, clonePathRecord(record)]),
  );
  const progressByKey = new Map<string, PathProgress>();

  return {
    async archivePath({ archivedAt = null, pathId, userId }) {
      const existing = recordsById.get(pathId);
      if (!existing || existing.path.userId !== userId) {
        return null;
      }

      const nextRecord = normalizePathRecordBundle({
        nodes: existing.nodes,
        path: {
          ...existing.path,
          archivedAt,
          updatedAt: archivedAt ?? existing.path.updatedAt,
        },
      });
      recordsById.set(pathId, nextRecord);
      return clonePathRecord(nextRecord);
    },

    async deletePath({ pathId, userId }) {
      const existing = recordsById.get(pathId);
      if (!existing || existing.path.userId !== userId) {
        return false;
      }

      recordsById.delete(pathId);
      for (const key of progressByKey.keys()) {
        if (key.startsWith(`${userId}:${pathId}:`)) {
          progressByKey.delete(key);
        }
      }
      return true;
    },

    async getPath({ pathId, userId }) {
      const existing = recordsById.get(pathId);
      if (!existing || existing.path.userId !== userId) {
        return null;
      }

      return clonePathRecord(existing);
    },

    async getPathProgress({ dateKey = null, pathId, userId }) {
      const key = buildProgressKey({ dateKey, pathId, userId });
      return clonePathProgress(progressByKey.get(key) ?? buildEmptyPathProgress({ dateKey, pathId, userId }));
    },

    async listPaths({ userId }) {
      return [...recordsById.values()]
        .filter((record) => record.path.userId === userId)
        .sort(comparePathRecordOrder)
        .map(clonePathRecord);
    },

    async savePathProgress({ completedNodeIds, dateKey = null, pathId, updatedAt = new Date().toISOString(), userId }) {
      const nodeIds = new Set(recordsById.get(pathId)?.nodes.map((node) => node.id) ?? []);
      const progress = normalizePathProgress(
        { completedNodeIds, dateKey, pathId, updatedAt, userId },
        { dateKey, nodeIds, pathId, userId },
      );
      progressByKey.set(buildProgressKey(progress), progress);
      return clonePathProgress(progress);
    },

    async savePath({ nodes, path }) {
      const normalizedRecord = normalizePathRecordBundle({ nodes, path });
      recordsById.set(normalizedRecord.path.id, normalizedRecord);
      return clonePathRecord(normalizedRecord);
    },
  };
}

export function createLocalStoragePathsStorageAdapter({
  seedRecords = DEFAULT_PROTOTYPE_PATH_RECORDS,
  storage = getBrowserLocalStorage(),
  storageKey,
  userId,
}: {
  seedRecords?: readonly { nodes?: readonly unknown[] | null; path: unknown }[];
  storage?: PathsStorageArea | null;
  storageKey?: string;
  userId?: string | null;
} = {}): PathsStorageAdapter {
  const fallbackUserId = normalizeOptionalString(userId) ?? LOCAL_PATHS_PROTOTYPE_USER_ID;
  const key = storageKey ?? `${LOCAL_PATHS_STORAGE_KEY_PREFIX}:${fallbackUserId}`;
  const memoryAdapter = createPrototypePathsStorageAdapter(rewriteSeedUser(seedRecords, fallbackUserId));

  if (!storage) {
    return memoryAdapter;
  }

  function readSnapshot() {
    try {
      const raw = storage.getItem(key);
      if (!raw) {
        const initial = {
          progress: [],
          records: normalizePathRecords(rewriteSeedUser(seedRecords, fallbackUserId)),
        };
        writeSnapshot(initial);
        return initial;
      }

      const parsed = JSON.parse(raw) as PathsLocalStorageSnapshot;
      return {
        progress: Array.isArray(parsed.progress) ? parsed.progress.map((entry) => normalizePathProgress(entry, {
          pathId: normalizeRequiredString(asRecord(entry).pathId, ""),
          userId: normalizeRequiredString(asRecord(entry).userId, fallbackUserId),
        })) : [],
        records: normalizePathRecords(Array.isArray(parsed.records) ? parsed.records : []),
      };
    } catch {
      return {
        progress: [],
        records: normalizePathRecords(rewriteSeedUser(seedRecords, fallbackUserId)),
      };
    }
  }

  function writeSnapshot(snapshot: { progress: readonly PathProgress[]; records: readonly PathRecord[] }) {
    storage.setItem(key, JSON.stringify({
      progress: snapshot.progress.map(clonePathProgress),
      records: snapshot.records.map(clonePathRecord),
    }));
  }

  return {
    async archivePath({ archivedAt = null, pathId, userId: requestedUserId }) {
      const snapshot = readSnapshot();
      const existing = snapshot.records.find((record) => record.path.id === pathId && record.path.userId === requestedUserId);
      if (!existing) {
        return null;
      }

      const nextRecord = normalizePathRecordBundle({
        nodes: existing.nodes,
        path: {
          ...existing.path,
          archivedAt,
          updatedAt: archivedAt ?? existing.path.updatedAt,
        },
      });
      writeSnapshot({
        progress: snapshot.progress,
        records: snapshot.records.map((record) => record.path.id === pathId ? nextRecord : record),
      });
      return clonePathRecord(nextRecord);
    },

    async deletePath({ pathId, userId: requestedUserId }) {
      const snapshot = readSnapshot();
      const nextRecords = snapshot.records.filter((record) => !(record.path.id === pathId && record.path.userId === requestedUserId));
      if (nextRecords.length === snapshot.records.length) {
        return false;
      }

      writeSnapshot({
        progress: snapshot.progress.filter((progress) => !(progress.pathId === pathId && progress.userId === requestedUserId)),
        records: nextRecords,
      });
      return true;
    },

    async getPath({ pathId, userId: requestedUserId }) {
      const snapshot = readSnapshot();
      const existing = snapshot.records.find((record) => record.path.id === pathId && record.path.userId === requestedUserId);
      return existing ? clonePathRecord(existing) : null;
    },

    async getPathProgress({ dateKey = null, pathId, userId: requestedUserId }) {
      const snapshot = readSnapshot();
      const record = snapshot.records.find((entry) => entry.path.id === pathId && entry.path.userId === requestedUserId);
      const nodeIds = new Set(record?.nodes.map((node) => node.id) ?? []);
      const key = buildProgressKey({ dateKey, pathId, userId: requestedUserId });
      const progress = snapshot.progress.find((entry) => buildProgressKey(entry) === key);
      return clonePathProgress(normalizePathProgress(progress, { dateKey, nodeIds, pathId, userId: requestedUserId }));
    },

    async listPaths({ userId: requestedUserId }) {
      return readSnapshot().records
        .filter((record) => record.path.userId === requestedUserId)
        .sort(comparePathRecordOrder)
        .map(clonePathRecord);
    },

    async savePathProgress({ completedNodeIds, dateKey = null, pathId, updatedAt = new Date().toISOString(), userId: requestedUserId }) {
      const snapshot = readSnapshot();
      const record = snapshot.records.find((entry) => entry.path.id === pathId && entry.path.userId === requestedUserId);
      const nodeIds = new Set(record?.nodes.map((node) => node.id) ?? []);
      const progress = normalizePathProgress(
        { completedNodeIds, dateKey, pathId, updatedAt, userId: requestedUserId },
        { dateKey, nodeIds, pathId, userId: requestedUserId },
      );
      const progressKey = buildProgressKey(progress);
      writeSnapshot({
        progress: [
          ...snapshot.progress.filter((entry) => buildProgressKey(entry) !== progressKey),
          progress,
        ],
        records: snapshot.records,
      });
      return clonePathProgress(progress);
    },

    async savePath({ nodes, path }) {
      const snapshot = readSnapshot();
      const normalizedRecord = normalizePathRecordBundle({ nodes, path });
      writeSnapshot({
        progress: snapshot.progress,
        records: [
          ...snapshot.records.filter((record) => record.path.id !== normalizedRecord.path.id),
          normalizedRecord,
        ].sort(comparePathRecordOrder),
      });
      return clonePathRecord(normalizedRecord);
    },
  };
}

export const DEFAULT_PROTOTYPE_PATH_RECORDS = [
  {
    nodes: [
      {
        id: "path-morning-reset-node-water",
        linkedTaskId: null,
        nextNodeIds: ["path-morning-reset-node-face"],
        note: "Start with the lightest reset before deciding what needs more attention.",
        pathId: "path-morning-reset",
        position: { x: 280, y: 150 },
        sortOrder: 0,
        title: "Drink water",
      },
      {
        id: "path-morning-reset-node-face",
        linkedTaskId: "task-skincare-am",
        nextNodeIds: ["path-morning-reset-node-counter"],
        note: "Linked task stays reference-only in PATHS v1.",
        pathId: "path-morning-reset",
        position: { x: 540, y: 270 },
        sortOrder: 1,
        title: "Face routine",
      },
      {
        id: "path-morning-reset-node-counter",
        linkedTaskId: null,
        nextNodeIds: [],
        note: "Reset the immediate environment before choosing the next path.",
        pathId: "path-morning-reset",
        position: { x: 800, y: 150 },
        sortOrder: 2,
        title: "Clear the counter",
      },
    ],
    path: {
      archivedAt: null,
      createdAt: "2026-06-24T00:00:00.000Z",
      description: "A short guided reset for rebooting the day without touching task state.",
      id: "path-morning-reset",
      pathType: "daily_reset",
      sortOrder: 0,
      title: "Morning reset",
      updatedAt: "2026-06-24T00:00:00.000Z",
      userId: LOCAL_PATHS_PROTOTYPE_USER_ID,
    },
  },
] satisfies ReadonlyArray<{ nodes: readonly unknown[]; path: unknown }>;

function comparePathOrder(left: Path, right: Path) {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return left.title.localeCompare(right.title);
}

function comparePathNodeOrder(left: PathNode, right: PathNode) {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return left.title.localeCompare(right.title);
}

function comparePathRecordOrder(left: PathRecord, right: PathRecord) {
  return comparePathOrder(left.path, right.path);
}

function clonePathRecord(record: PathRecord): PathRecord {
  return {
    nodes: record.nodes.map((node) => ({
      ...node,
      nextNodeIds: [...node.nextNodeIds],
      position: { ...node.position },
    })),
    path: { ...record.path },
  };
}

function clonePathProgress(progress: PathProgress): PathProgress {
  return {
    ...progress,
    completedNodeIds: [...progress.completedNodeIds],
  };
}

function buildEmptyPathProgress({ dateKey = null, pathId, userId }: GetPathProgressArgs): PathProgress {
  return {
    completedNodeIds: [],
    dateKey,
    pathId,
    updatedAt: new Date().toISOString(),
    userId,
  };
}

function buildProgressKey({ dateKey = null, pathId, userId }: GetPathProgressArgs) {
  return `${userId}:${pathId}:${dateKey ?? "all"}`;
}

function getBrowserLocalStorage(): PathsStorageArea | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function rewriteSeedUser(
  records: readonly { nodes?: readonly unknown[] | null; path: unknown }[],
  userId: string,
) {
  return records.map((record) => ({
    nodes: record.nodes,
    path: {
      ...asRecord(record.path),
      userId,
    },
  }));
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredString(value: unknown, fallback: string) {
  return normalizeOptionalString(value) ?? fallback;
}

function normalizeSortOrder(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizePathNodePosition(value: unknown, index: number): PathNodePosition {
  const record = asRecord(value);
  const defaultPosition = buildDefaultNodePosition(index);

  return {
    x: clampPositionValue(record.x, defaultPosition.x),
    y: clampPositionValue(record.y, defaultPosition.y),
  };
}

function buildDefaultNodePosition(index: number): PathNodePosition {
  return {
    x: 160 + (index % 4) * 240,
    y: 140 + Math.floor(index / 4) * 150,
  };
}

function clampPositionValue(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(1800, Math.max(32, Math.round(value)));
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return dedupeStrings(value.map((entry) => normalizeOptionalString(entry)).filter((entry): entry is string => entry !== null));
}

function dedupeStrings(values: readonly string[]) {
  return [...new Set(values)];
}

function buildStableTimestamp(index: number) {
  return new Date(Date.UTC(2026, 0, 1 + index)).toISOString();
}
