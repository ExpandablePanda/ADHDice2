import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { writeLocalStorageEntries } from "../src/lib/health-local-storage.ts";

const focusSource = readFileSync(new URL("../src/hooks/useFocus.ts", import.meta.url), "utf8");

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

class QuotaStorage extends MemoryStorage {
  override setItem() {
    throw new DOMException("The quota has been exceeded", "QuotaExceededError");
  }
}

test("Focus category and legacy history cache writes use quota-safe best-effort storage", () => {
  const storage = new QuotaStorage();
  assert.doesNotThrow(() => writeLocalStorageEntries(storage, [
    ["adhdice_focus_categories", "[]"],
    ["adhdice_focus_history", "[]"],
  ]));
  assert.equal(storage.getItem("adhdice_focus_categories"), null);
  assert.equal(storage.getItem("adhdice_focus_history"), null);
  assert.match(focusSource, /export function saveFocusCategories\(categories: FocusCategory\[\]\)[\s\S]*?writeFocusStorageValue/);
  assert.match(focusSource, /export function saveFocusHistory\(history: HistoricalFocusSession\[\]\)[\s\S]*?void history/);
});

test("Focus counter, countdown, active-session, and runtime-operation writes use the safe storage seam", () => {
  assert.match(focusSource, /function saveFocusCounters[\s\S]*?writeFocusStorageValue/);
  assert.match(focusSource, /function saveFocusCounterHistory[\s\S]*?writeFocusStorageValue/);
  assert.match(focusSource, /function writeCountdownMetadata[\s\S]*?writeFocusStorageValue/);
  assert.match(focusSource, /function writeLocalActiveSession[\s\S]*?writeFocusStorageValue/);
  assert.match(focusSource, /getMigrationOperationId[\s\S]*?writeLocalStorageEntries/);
  assert.doesNotMatch(focusSource, /window\.localStorage\.(?:getItem|setItem|removeItem)/);
});

test("Focus completion updates memory after the single durable RPC without cache retry", () => {
  const start = focusSource.indexOf("async function handleFinishTimer");
  const end = focusSource.indexOf("async function handleManualFocusEntry", start);
  const completion = focusSource.slice(start, end);

  assert.equal((completion.match(/client\.rpc\("adhdice_complete_focus_runtime"/g) ?? []).length, 1);
  assert.match(completion, /client\.rpc\("adhdice_complete_focus_runtime"[\s\S]*?setFocusHistory/);
  assert.match(completion, /setFocusHistory\(\(prev\) =>[\s\S]*?return nextHistory/);
  assert.doesNotMatch(completion, /saveFocusHistory|adhdice_complete_focus_runtime[\s\S]*?retry/i);
});

test("Supabase Focus History hydration remains authoritative and retires the unbounded writer", () => {
  const start = focusSource.indexOf("useEffect(() => {\n    if (!client || !userId || !historyActive");
  const end = focusSource.indexOf("  }, [client, historyActive, userId]);", start);
  const hydration = focusSource.slice(start, end);

  assert.match(hydration, /from\("adhdice_focus_sessions"\)/);
  assert.match(hydration, /select\("id,user_id,category_id,title_snapshot,focus_type_snapshot,focus_subtype_snapshot,focus_subtype_2_snapshot,session_date,duration_seconds,notes,started_at,ended_at,source,runtime_session_id,created_at"\)/);
  assert.match(hydration, /mergeStoredFocusHistory/);
  assert.match(hydration, /setFocusHistory\(next\)/);
  assert.match(focusSource, /const remoteIds = new Set\(history\.map\(\(entry\) => entry\.id\)\)/);
  assert.match(focusSource, /storedHistory\.every\(\(entry\) => remoteIds\.has\(entry\.id\)\)/);
  assert.doesNotMatch(hydration, /saveFocusHistory/);
  assert.equal((focusSource.match(/saveFocusHistory\(/g) ?? []).length, 1);
});
