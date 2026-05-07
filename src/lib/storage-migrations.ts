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

const VERSION_KEY = "adhdice-storage-version";
const CURRENT_VERSION = 2;

type Migration = {
  version: number;
  description: string;
  run: () => void;
};

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: "Rename task view 'list' → 'grid' in stored UI state",
    run: () => {
      // Task UI state is scoped per user, so we scan all keys.
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith("adhdice-task-ui:")) continue;
        try {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw) as { view?: string };
          if (parsed.view === "list") {
            parsed.view = "grid";
            localStorage.setItem(key, JSON.stringify(parsed));
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
    run: () => {
      // Early versions stored these without a :userId suffix. Safe to delete
      // because the scoped versions (adhdice-task-ui:<userId>) are authoritative.
      localStorage.removeItem("adhdice-task-ui");
      localStorage.removeItem("adhdice-task-focus");
    },
  },
];

export function runStorageMigrations(): void {
  if (typeof window === "undefined") return;

  const stored = localStorage.getItem(VERSION_KEY);
  const appliedVersion = stored ? parseInt(stored, 10) : 0;

  if (appliedVersion >= CURRENT_VERSION) return;

  for (const migration of MIGRATIONS) {
    if (migration.version <= appliedVersion) continue;
    try {
      migration.run();
    } catch (err) {
      console.warn(`[storage-migration v${migration.version}] failed:`, err);
      // Continue — a failed migration is better than a broken app.
    }
  }

  localStorage.setItem(VERSION_KEY, String(CURRENT_VERSION));
}
