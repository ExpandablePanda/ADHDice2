import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_RECORDS_SECTION_EXPANDED_STATE,
  getRecordsSectionStorageKey,
  normalizeRecordsSectionExpandedState,
  readRecordsSectionExpandedState,
  writeRecordsSectionExpandedState,
} from "../src/lib/records/ui-preferences.ts";

const records = readFileSync(new URL("../src/components/task-app/records-tab.tsx", import.meta.url), "utf8");

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    values,
  };
}

test("Record sections normalize and persist independently without overwriting other preference keys", () => {
  const storage = createStorage();
  storage.setItem("unrelated", "keep");
  const next = { ...DEFAULT_RECORDS_SECTION_EXPANDED_STATE, focus: false, history: false };
  writeRecordsSectionExpandedState(storage, "user-1", next);

  assert.deepEqual(readRecordsSectionExpandedState(storage, "user-1"), next);
  assert.equal(storage.getItem("unrelated"), "keep");
  assert.equal(storage.values.size, 2);
  assert.equal(getRecordsSectionStorageKey("user-1"), "adhdice-records-sections:user-1");
});

test("Record section persistence repairs malformed or partial saved state", () => {
  assert.deepEqual(normalizeRecordsSectionExpandedState({ focus: false }), {
    ...DEFAULT_RECORDS_SECTION_EXPANDED_STATE,
    focus: false,
  });
  assert.deepEqual(normalizeRecordsSectionExpandedState({ focus: "false" }), DEFAULT_RECORDS_SECTION_EXPANDED_STATE);
});

test("Records uses five independent disclosures while leaving the Records hook mounted", () => {
  for (const id of ["global_tasks", "streaks", "focus", "per_task", "history"]) {
    assert.match(records, new RegExp(`id="${id}"`));
    assert.match(records, new RegExp(`toggleSection\\("${id}"\\)`));
  }
  assert.match(records, /const records = useRecords\(props\)/);
  assert.match(records, /aria-expanded=\{expanded\}/);
});

test("Record cards use the responsive compact grid and retain every required field", () => {
  assert.match(records, /grid-cols-1 gap-2 min-\[360px\]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6/);
  assert.match(records, /aspect-square min-h-\[10\.5rem\] w-full max-w-\[13rem\] min-w-0/);
  assert.match(records, /line-clamp-3 break-words/);
  for (const field of ["card.title", "card.value", "card.creditedDate", "card.change", "card.icon", "card.category"]) {
    assert.match(records, new RegExp(field.replace(".", "\\.")));
  }
});

test("Record cards retain the shared details interaction and empty states", () => {
  assert.match(records, /onClick=\{\(\) => onOpenDetails\(card\)\}/);
  assert.match(records, /role="dialog"/);
  assert.match(records, /RecordDetailOverlay/);
  assert.match(records, /No qualifying history is available yet/);
  assert.match(records, /No matching per-task records/);
  assert.match(records, /No record events yet/);
  assert.match(records, /Preparing Records/);
});
