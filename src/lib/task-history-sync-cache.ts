import type { CanonicalTaskHistoryFact } from "./task-state-canonical/types";

export const TASK_HISTORY_CACHE_DATABASE_NAME = "adhdice canonical local data";
export const TASK_HISTORY_CACHE_SCHEMA_VERSION = 1;
export const TASK_HISTORY_SYNC_PROTOCOL_VERSION = "task-history-sync-v1" as const;

const TASK_HISTORY_FACT_STORE = "task-history-facts";
const TASK_HISTORY_METADATA_STORE = "task-history-cache-metadata";
const TASK_HISTORY_FACT_USER_INDEX = "userId";

export type TaskHistoryCacheCompleteness = "complete";

export type TaskHistoryCacheMetadata = {
  userId: string;
  cacheSchemaVersion: number;
  protocolVersion: typeof TASK_HISTORY_SYNC_PROTOCOL_VERSION;
  syncEpoch: string;
  validatedRevision: number;
  completeness: TaskHistoryCacheCompleteness;
  rowCount: number;
};

export type TaskHistoryCacheSnapshot = {
  metadata: TaskHistoryCacheMetadata;
  facts: CanonicalTaskHistoryFact[];
};

export type TaskHistoryCacheReadResult =
  | { status: "miss" }
  | { status: "invalid"; reason: string }
  | { status: "unavailable"; reason: string }
  | { status: "hit"; snapshot: TaskHistoryCacheSnapshot };

export type TaskHistoryCacheMutation = {
  operation: "upsert" | "delete";
  historyFactId: string;
  entityId: string;
  logicalDate: string;
  fact?: CanonicalTaskHistoryFact;
};

export type TaskHistoryCache = {
  read: (userId: string) => Promise<TaskHistoryCacheReadResult>;
  replaceSnapshot: (snapshot: TaskHistoryCacheSnapshot) => Promise<void>;
  applyDelta: (
    userId: string,
    mutations: TaskHistoryCacheMutation[],
    metadata: TaskHistoryCacheMetadata,
    expectedRevision?: number,
  ) => Promise<void>;
};

type StoredTaskHistoryFact = CanonicalTaskHistoryFact & {
  userId: string;
  historyFactId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown) {
  return value === null || typeof value === "string";
}

export function isCanonicalTaskHistoryFact(value: unknown, expectedUserId?: string): value is CanonicalTaskHistoryFact {
  if (!isRecord(value)) return false;
  const requiredStrings = [
    "id",
    "user_id",
    "entity_id",
    "entity_kind",
    "logical_date",
    "outcome",
    "event_kind",
    "provenance_kind",
    "actor_kind",
    "source",
    "timezone",
    "day_start_time",
    "idempotence_identity",
    "created_at",
    "updated_at",
  ];
  if (requiredStrings.some((key) => typeof value[key] !== "string" || value[key] === "")) return false;
  if (expectedUserId && value.user_id !== expectedUserId) return false;
  if (typeof value.logical_day_settings_revision !== "number"
    || !Number.isSafeInteger(value.logical_day_settings_revision)
    || value.logical_day_settings_revision < 1) return false;
  if (typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 1) return false;
  const nullableKeys = [
    "occurrence_id",
    "scheduled_due_on",
    "effective_due_on",
    "schedule_boundary_id",
    "recurrence_source_fingerprint",
    "actor_id",
    "command_id",
    "source_legacy_history_id",
    "migration_operation_id",
  ];
  if (nullableKeys.some((key) => Object.hasOwn(value, key) && !isNullableString(value[key]))) return false;
  return true;
}

function isValidMetadata(value: unknown, expectedUserId: string): value is TaskHistoryCacheMetadata {
  if (!isRecord(value)) return false;
  return value.userId === expectedUserId
    && value.cacheSchemaVersion === TASK_HISTORY_CACHE_SCHEMA_VERSION
    && value.protocolVersion === TASK_HISTORY_SYNC_PROTOCOL_VERSION
    && typeof value.syncEpoch === "string"
    && value.syncEpoch.length > 0
    && typeof value.validatedRevision === "number"
    && Number.isSafeInteger(value.validatedRevision)
    && value.validatedRevision >= 0
    && value.completeness === "complete"
    && typeof value.rowCount === "number"
    && Number.isSafeInteger(value.rowCount)
    && value.rowCount >= 0;
}

function unavailableReason(error: unknown) {
  return error instanceof Error && error.message ? error.message : "indexeddb-unavailable";
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionToPromise(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

function openDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available."));
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(TASK_HISTORY_CACHE_DATABASE_NAME, TASK_HISTORY_CACHE_SCHEMA_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const facts = database.objectStoreNames.contains(TASK_HISTORY_FACT_STORE)
        ? request.transaction?.objectStore(TASK_HISTORY_FACT_STORE)
        : database.createObjectStore(TASK_HISTORY_FACT_STORE, { keyPath: ["userId", "historyFactId"] });
      if (facts && !facts.indexNames.contains(TASK_HISTORY_FACT_USER_INDEX)) {
        facts.createIndex(TASK_HISTORY_FACT_USER_INDEX, "userId", { unique: false });
      }
      if (!database.objectStoreNames.contains(TASK_HISTORY_METADATA_STORE)) {
        database.createObjectStore(TASK_HISTORY_METADATA_STORE, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
    request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked."));
  });
}

function storedFact(fact: CanonicalTaskHistoryFact): StoredTaskHistoryFact {
  return { ...fact, userId: fact.user_id, historyFactId: fact.id };
}

function unstoreFact(value: unknown, expectedUserId: string): CanonicalTaskHistoryFact | null {
  if (!isRecord(value) || value.userId !== expectedUserId || value.historyFactId !== value.id || !isCanonicalTaskHistoryFact(value, expectedUserId)) return null;
  return value as CanonicalTaskHistoryFact;
}

export function createIndexedDbTaskHistoryCache(): TaskHistoryCache {
  let databasePromise: Promise<IDBDatabase> | null = null;
  const getDatabase = () => {
    if (!databasePromise) {
      databasePromise = openDatabase().catch((error) => {
        databasePromise = null;
        throw error;
      });
    }
    return databasePromise;
  };

  return {
    async read(userId) {
      if (!userId) return { status: "invalid", reason: "missing-cache-owner" };
      try {
        const database = await getDatabase();
        const transaction = database.transaction([TASK_HISTORY_FACT_STORE, TASK_HISTORY_METADATA_STORE], "readonly");
        const done = transactionToPromise(transaction);
        const metadata = await requestToPromise(transaction.objectStore(TASK_HISTORY_METADATA_STORE).get(userId));
        if (metadata === undefined) {
          await done;
          return { status: "miss" };
        }
        const storedFacts = await requestToPromise(
          transaction.objectStore(TASK_HISTORY_FACT_STORE).index(TASK_HISTORY_FACT_USER_INDEX).getAll(IDBKeyRange.only(userId)),
        );
        await done;
        if (!isValidMetadata(metadata, userId)) return { status: "invalid", reason: "invalid-cache-metadata" };
        const facts = (storedFacts as unknown[]).map((fact) => unstoreFact(fact, userId));
        if (facts.some((fact) => fact === null)) return { status: "invalid", reason: "malformed-canonical-history-fact" };
        const validFacts = facts as CanonicalTaskHistoryFact[];
        if (validFacts.length !== metadata.rowCount) return { status: "invalid", reason: "cache-row-count-mismatch" };
        return { status: "hit", snapshot: { metadata, facts: validFacts } };
      } catch (error) {
        return { status: "unavailable", reason: unavailableReason(error) };
      }
    },

    async replaceSnapshot(snapshot) {
      if (!isValidMetadata(snapshot.metadata, snapshot.metadata.userId)) {
        throw new Error("Invalid Task History cache metadata.");
      }
      if (snapshot.metadata.rowCount !== snapshot.facts.length
        || snapshot.facts.some((fact) => !isCanonicalTaskHistoryFact(fact, snapshot.metadata.userId))) {
        throw new Error("Invalid canonical Task History snapshot.");
      }
      try {
        const database = await getDatabase();
        const transaction = database.transaction([TASK_HISTORY_FACT_STORE, TASK_HISTORY_METADATA_STORE], "readwrite");
        const done = transactionToPromise(transaction);
        const factsStore = transaction.objectStore(TASK_HISTORY_FACT_STORE);
        const existingFacts = await requestToPromise(factsStore.index(TASK_HISTORY_FACT_USER_INDEX).getAll(IDBKeyRange.only(snapshot.metadata.userId))) as StoredTaskHistoryFact[];
        for (const fact of existingFacts) factsStore.delete([snapshot.metadata.userId, fact.historyFactId]);
        for (const fact of snapshot.facts) factsStore.put(storedFact(fact));
        transaction.objectStore(TASK_HISTORY_METADATA_STORE).put(snapshot.metadata);
        await done;
      } catch (error) {
        throw new Error(`IndexedDB Task History snapshot replacement failed: ${unavailableReason(error)}`);
      }
    },

    async applyDelta(userId, mutations, metadata, expectedRevision) {
      if (!isValidMetadata(metadata, userId) || metadata.rowCount < 0) {
        throw new Error("Invalid Task History delta metadata.");
      }
      if (mutations.some((mutation) => mutation.operation === "upsert"
        ? !mutation.fact || !isCanonicalTaskHistoryFact(mutation.fact, userId) || mutation.fact.id !== mutation.historyFactId
        : mutation.fact !== undefined)) {
        throw new Error("Invalid Task History delta mutation.");
      }
      try {
        const database = await getDatabase();
        const transaction = database.transaction([TASK_HISTORY_FACT_STORE, TASK_HISTORY_METADATA_STORE], "readwrite");
        const done = transactionToPromise(transaction);
        const factsStore = transaction.objectStore(TASK_HISTORY_FACT_STORE);
        if (expectedRevision !== undefined) {
          const currentMetadata = await requestToPromise(transaction.objectStore(TASK_HISTORY_METADATA_STORE).get(userId));
          if (!isValidMetadata(currentMetadata, userId) || currentMetadata.validatedRevision !== expectedRevision) {
            throw new Error("IndexedDB Task History cache revision changed before delta application.");
          }
        }
        for (const mutation of mutations) {
          if (mutation.operation === "delete") {
            factsStore.delete([userId, mutation.historyFactId]);
          } else {
            factsStore.put(storedFact(mutation.fact!));
          }
        }
        transaction.objectStore(TASK_HISTORY_METADATA_STORE).put(metadata);
        await done;
      } catch (error) {
        throw new Error(`IndexedDB Task History delta application failed: ${unavailableReason(error)}`);
      }
    },
  };
}

export const indexedDbTaskHistoryCache = createIndexedDbTaskHistoryCache();
