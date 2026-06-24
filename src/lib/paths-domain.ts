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
  sortOrder: number;
  title: string;
};

export type PathRecord = {
  nodes: PathNode[];
  path: Path;
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

export interface PathsStorageAdapter {
  archivePath(args: ArchivePathArgs): Promise<PathRecord | null>;
  deletePath(args: GetPathArgs): Promise<boolean>;
  getPath(args: GetPathArgs): Promise<PathRecord | null>;
  listPaths(args: ListPathsArgs): Promise<PathRecord[]>;
  savePath(args: SavePathRecordArgs): Promise<PathRecord>;
}

const DEFAULT_PATH_TYPE: PathType = "reset_flow";
export const LOCAL_PATHS_PROTOTYPE_USER_ID = "local-prototype-user";
const UNTITLED_PATH_TITLE = "Untitled path";
const UNTITLED_NODE_TITLE = "Untitled node";

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

export function createPrototypePathsStorageAdapter(
  seedRecords: readonly { nodes?: readonly unknown[] | null; path: unknown }[] = DEFAULT_PROTOTYPE_PATH_RECORDS,
): PathsStorageAdapter {
  const recordsById = new Map(
    normalizePathRecords(seedRecords).map((record) => [record.path.id, clonePathRecord(record)]),
  );

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
      return true;
    },

    async getPath({ pathId, userId }) {
      const existing = recordsById.get(pathId);
      if (!existing || existing.path.userId !== userId) {
        return null;
      }

      return clonePathRecord(existing);
    },

    async listPaths({ userId }) {
      return [...recordsById.values()]
        .filter((record) => record.path.userId === userId)
        .sort(comparePathRecordOrder)
        .map(clonePathRecord);
    },

    async savePath({ nodes, path }) {
      const normalizedRecord = normalizePathRecordBundle({ nodes, path });
      recordsById.set(normalizedRecord.path.id, normalizedRecord);
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
        sortOrder: 0,
        title: "Drink water",
      },
      {
        id: "path-morning-reset-node-face",
        linkedTaskId: "task-skincare-am",
        nextNodeIds: ["path-morning-reset-node-counter"],
        note: "Linked task stays reference-only in PATHS v1.",
        pathId: "path-morning-reset",
        sortOrder: 1,
        title: "Face routine",
      },
      {
        id: "path-morning-reset-node-counter",
        linkedTaskId: null,
        nextNodeIds: [],
        note: "Reset the immediate environment before choosing the next path.",
        pathId: "path-morning-reset",
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
    })),
    path: { ...record.path },
  };
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
