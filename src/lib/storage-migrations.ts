// Versioned localStorage migration utility.
//
// How it works:
//   - A single key ("adhdice-storage-version") stores the last version number
//     that was applied on this browser.
//   - Each entry in MIGRATIONS runs exactly once, in order, for any device
//     whose stored version is lower than the migration's version number.
//   - Call runStorageMigrations() once at app startup, before reading any
//     other localStorage keys.
//
// Adding a new migration:
//   1. Push a new object into MIGRATIONS with the next version number.
//   2. Write the migration function — read old data, transform it, write back.
//   3. Bump CURRENT_VERSION to match.

import {
  getSafeLocalStorage,
  readLocalStorageValue,
  removeLocalStorageItem,
  writeLocalStorageEntries,
  type LocalStorageWriter,
} from "@/lib/health-local-storage";

const VERSION_KEY = "adhdice-storage-version";
const CURRENT_VERSION = 5;

type MigrationStorage = LocalStorageWriter & {
  length: number;
  key: (index: number) => string | null;
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
};

type Migration = {
  version: number;
  description: string;
  run: (storage: MigrationStorage) => void;
};

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: "Rename task view 'list' → 'grid' in stored UI state",
    run: (storage) => {
      // Task UI state is scoped per user, so we scan all keys.
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith("adhdice-task-ui:")) continue;
        try {
          const raw = storage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw) as { view?: string };
          if (parsed.view === "list") {
            parsed.view = "grid";
            storage.setItem(key, JSON.stringify(parsed));
          }
        } catch {
          // Corrupt entry — leave it alone; parseStoredJson will clear it on next read.
        }
      }
    },
  },
  {
    version: 2,
    description: "Remove legacy unscoped task-ui and task-focus keys",
    run: (storage) => {
      // Early versions stored these without a :userId suffix. Safe to delete
      // because the scoped versions (adhdice-task-ui:<userId>) are authoritative.
      storage.removeItem("adhdice-task-ui");
      storage.removeItem("adhdice-task-focus");
    },
  },
  {
    version: 3,
    description: "Restore task view default to list in stored UI state",
    run: (storage) => {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith("adhdice-task-ui:")) continue;
        try {
          const raw = storage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw) as { view?: string };
          if (parsed.view === "grid") {
            parsed.view = "list";
            storage.setItem(key, JSON.stringify(parsed));
          }
        } catch {
          // Corrupt entry — leave it alone; parseStoredJson will clear it on next read.
        }
      }
    },
  },
  {
    version: 4,
    description: "Rename persisted task view 'list' → 'table' in stored UI state",
    run: (storage) => {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith("adhdice-task-ui:")) continue;
        try {
          const raw = storage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw) as { view?: string };
          if (parsed.view === "list") {
            parsed.view = "table";
            storage.setItem(key, JSON.stringify(parsed));
          }
        } catch {
          // Corrupt entry — leave it alone; parseStoredJson will clear it on next read.
        }
      }
    },
  },
  {
    version: 5,
    description: "Remove obsolete unscoped profile cache",
    run: (storage) => {
      // The current profile cache is scoped by user. Remove only the obsolete
      // exact key without reading or rewriting its potentially large value.
      removeLocalStorageItem(storage, "adhdice-profile");
    },
  },
];

export function runStorageMigrations(): void {
  const storage = getSafeLocalStorage();
  if (!storage) return;

  const stored = readLocalStorageValue(storage, VERSION_KEY);
  const appliedVersion = stored ? parseInt(stored, 10) : 0;

  if (appliedVersion >= CURRENT_VERSION) return;

  for (const migration of MIGRATIONS) {
    if (migration.version <= appliedVersion) continue;
    try {
      migration.run(storage);
    } catch (err) {
      console.warn(`[storage-migration v${migration.version}] failed:`, err);
      // Continue — a failed migration is better than a broken app.
    }
  }

  writeLocalStorageEntries(storage, [[VERSION_KEY, String(CURRENT_VERSION)]]);
}
