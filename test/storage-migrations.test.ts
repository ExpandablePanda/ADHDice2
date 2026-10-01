import assert from "node:assert/strict";
import test from "node:test";

import { PROFILE_STORAGE_KEY } from "../src/lib/profile-store.ts";
import { runStorageMigrations } from "../src/lib/storage-migrations.ts";

class MemoryStorage {
  readonly values = new Map<string, string>();
  removeCalls: string[] = [];

  get length() {
    return this.values.size;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.removeCalls.push(key);
    this.values.delete(key);
  }
}

class VersionWriteFailureStorage extends MemoryStorage {
  override setItem(key: string, value: string) {
    if (key === "adhdice-storage-version") {
      throw new DOMException("The quota has been exceeded", "QuotaExceededError");
    }
    super.setItem(key, value);
  }
}

function installWindow(localStorage: MemoryStorage) {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage },
    writable: true,
  });
  return () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
      writable: true,
    });
  };
}

test("storage migration v5 removes only the obsolete unscoped profile cache", () => {
  const storage = new MemoryStorage();
  storage.setItem("adhdice-storage-version", "4");
  storage.setItem(PROFILE_STORAGE_KEY, "x".repeat(100_000));
  storage.setItem(`${PROFILE_STORAGE_KEY}:user-1`, JSON.stringify({ displayName: "Nora" }));
  const restore = installWindow(storage);

  try {
    runStorageMigrations();

    assert.equal(storage.getItem(PROFILE_STORAGE_KEY), null);
    assert.deepEqual(JSON.parse(storage.getItem(`${PROFILE_STORAGE_KEY}:user-1`) ?? "{}"), { displayName: "Nora" });
    assert.equal(storage.getItem("adhdice-storage-version"), "5");
  } finally {
    restore();
  }
});

test("storage migration v5 is idempotent", () => {
  const storage = new MemoryStorage();
  storage.setItem("adhdice-storage-version", "4");
  storage.setItem(PROFILE_STORAGE_KEY, "legacy");
  const restore = installWindow(storage);

  try {
    runStorageMigrations();
    runStorageMigrations();

    assert.equal(storage.getItem(PROFILE_STORAGE_KEY), null);
    assert.equal(storage.removeCalls.filter((key) => key === PROFILE_STORAGE_KEY).length, 1);
    assert.equal(storage.getItem("adhdice-storage-version"), "5");
  } finally {
    restore();
  }
});

test("storage-version write failure is nonfatal", () => {
  const storage = new VersionWriteFailureStorage();
  storage.setItem(PROFILE_STORAGE_KEY, "legacy");
  const restore = installWindow(storage);

  try {
    assert.doesNotThrow(() => runStorageMigrations());
    assert.equal(storage.getItem(PROFILE_STORAGE_KEY), null);
    assert.equal(storage.getItem("adhdice-storage-version"), null);
  } finally {
    restore();
  }
});
