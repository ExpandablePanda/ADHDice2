import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  addHealthJournalTriggerLink,
  getHealthJournalTriggerAssociationIdentity,
  hasDuplicateHealthJournalTriggerAssociations,
  hasDuplicateHealthJournalTriggerName,
  isHealthJournalTriggerEffect,
  normalizeHealthJournalTriggerName,
  normalizeHealthJournalTriggerPreviousScore,
  replaceHealthJournalTriggerAssociations,
  updateHealthJournalTriggerLink,
  validateHealthJournalTriggerAssociationDrafts,
  validateHealthJournalTriggerOccurrenceReference,
  validateHealthJournalTriggerName,
} from "../src/lib/health-journal-triggers.ts";

const migration = readFileSync(new URL("../supabase/add_health_journal_triggers_7_16_116.sql", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../src/lib/health-journal-triggers.ts", import.meta.url), "utf8");
const journalHook = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");
const eventCapture = readFileSync(new URL("../src/components/task-app/journal-event-capture.tsx", import.meta.url), "utf8");
const journalForm = readFileSync(new URL("../src/components/task-app/journal-check-in-form.tsx", import.meta.url), "utf8");
const healthPage = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
const replacementMigration = readFileSync(new URL("../supabase/replace_health_journal_trigger_associations_7_16_118.sql", import.meta.url), "utf8");

function makeTriggerLinkUpdateClient(response: { data: unknown; error: { message: string } | null }) {
  const updates: unknown[] = [];
  const query = {
    update(value: unknown) { updates.push(value); return this; },
    eq() { return this; },
    select() { return this; },
    single() { return Promise.resolve(response); },
  };
  return { client: { from: () => query } as never, updates };
}

test("Trigger names trim and collapse whitespace and reject normalized duplicates", () => {
  assert.equal(normalizeHealthJournalTriggerName("  listening\t\n to   music "), "listening to music");
  assert.deepEqual(validateHealthJournalTriggerName("  Showering  "), { valid: true, name: "Showering" });
  assert.equal(validateHealthJournalTriggerName(" \t ").valid, false);
  assert.equal(hasDuplicateHealthJournalTriggerName("BACK   Pain", ["Back Pain"]), true);
  assert.equal(hasDuplicateHealthJournalTriggerName("Back Painful", ["Back Pain"]), false);
  assert.match(migration, /unique index if not exists adhdice_health_journal_triggers_user_name_uidx[\s\S]*?\(user_id, lower\(name\)\)/);
  assert.ok(migration.includes("regexp_replace(btrim(new.name), '\\s+', ' ', 'g')"));
});

test("effect values and optional previous scores are narrowly validated", () => {
  for (const effect of ["associated", "worsened", "improved"]) assert.equal(isHealthJournalTriggerEffect(effect), true);
  for (const effect of ["triggered", "neutral", "", null]) assert.equal(isHealthJournalTriggerEffect(effect), false);
  assert.deepEqual(normalizeHealthJournalTriggerPreviousScore(null), { valid: true, score: null });
  assert.deepEqual(normalizeHealthJournalTriggerPreviousScore(0), { valid: true, score: 0 });
  assert.deepEqual(normalizeHealthJournalTriggerPreviousScore(10), { valid: true, score: 10 });
  for (const score of [-1, 11, 1.5, "0", Number.NaN]) assert.equal(normalizeHealthJournalTriggerPreviousScore(score).valid, false);
  assert.match(migration, /previous_score is null or previous_score between 0 and 10/);
  assert.match(migration, /effect <> 'associated' or previous_score is null/);
});

test("association requires exactly one occurrence reference", () => {
  assert.equal(validateHealthJournalTriggerOccurrenceReference({ symptom_occurrence_id: "s1", journal_signal_occurrence_id: null }), true);
  assert.equal(validateHealthJournalTriggerOccurrenceReference({ symptom_occurrence_id: null, journal_signal_occurrence_id: "f1" }), true);
  assert.equal(validateHealthJournalTriggerOccurrenceReference({ symptom_occurrence_id: null, journal_signal_occurrence_id: null }), false);
  assert.equal(validateHealthJournalTriggerOccurrenceReference({ symptom_occurrence_id: "s1", journal_signal_occurrence_id: "f1" }), false);
  assert.match(migration, /num_nonnulls\(symptom_occurrence_id, journal_signal_occurrence_id\) = 1/);
});

test("association identity rejects duplicate trigger-to-occurrence pairs while allowing many-to-many links", () => {
  const symptomA = { trigger_id: "t1", symptom_occurrence_id: "s1", journal_signal_occurrence_id: null };
  const symptomB = { trigger_id: "t2", symptom_occurrence_id: "s1", journal_signal_occurrence_id: null };
  const feelingA = { trigger_id: "t1", symptom_occurrence_id: null, journal_signal_occurrence_id: "f1" };
  const feelingB = { trigger_id: "t1", symptom_occurrence_id: null, journal_signal_occurrence_id: "f2" };
  assert.equal(getHealthJournalTriggerAssociationIdentity(symptomA), "t1:symptom:s1");
  assert.equal(hasDuplicateHealthJournalTriggerAssociations([symptomA, { ...symptomA }]), true);
  assert.equal(hasDuplicateHealthJournalTriggerAssociations([symptomA, symptomB]), false);
  assert.equal(hasDuplicateHealthJournalTriggerAssociations([feelingA, feelingB]), false);
  assert.match(migration, /create unique index if not exists adhdice_health_journal_trigger_links_symptom_uidx[\s\S]*?\(user_id, trigger_id, symptom_occurrence_id\)/);
  assert.match(migration, /create unique index if not exists adhdice_health_journal_trigger_links_signal_uidx[\s\S]*?\(user_id, trigger_id, journal_signal_occurrence_id\)/);
});

test("composite foreign keys enforce same-user ownership and occurrence deletion cascades links", () => {
  assert.match(migration, /foreign key \(user_id, trigger_id\)[\s\S]*?references public\.adhdice_health_journal_triggers \(user_id, id\)[\s\S]*?on delete cascade/);
  assert.match(migration, /foreign key \(user_id, symptom_occurrence_id\)[\s\S]*?references public\.adhdice_health_symptom_entries \(user_id, id\)[\s\S]*?on delete cascade/);
  assert.match(migration, /foreign key \(user_id, journal_signal_occurrence_id\)[\s\S]*?references public\.adhdice_health_journal_signal_occurrences \(user_id, id\)[\s\S]*?on delete cascade/);
  assert.match(migration, /alter table public\.adhdice_health_journal_triggers enable row level security/);
  assert.match(migration, /alter table public\.adhdice_health_journal_trigger_links enable row level security/);
  assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/);
});

test("archiving preserves historical links and legacy Journal omission does not clear data", () => {
  assert.match(persistence, /archiveHealthJournalTrigger[\s\S]*?\.update\(\{ archived_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.doesNotMatch(persistence.slice(persistence.indexOf("export async function archiveHealthJournalTrigger"), persistence.indexOf("export async function readHealthJournalTriggerLinks")), /\.delete\(/);
  assert.match(migration, /foreign key \(user_id, trigger_id\)[\s\S]*?on delete cascade/);
  assert.match(persistence, /export async function removeHealthJournalTriggerLink[\s\S]*?\.eq\("id", linkId\)[\s\S]*?\.eq\("user_id", userId\)/);
  assert.match(journalHook, /async function saveJournalEntry/);
  assert.match(journalHook, /const triggerReplacements = input\.triggerAssociationReplacements \?\? \[\]/);
  assert.match(journalHook, /if \(triggerReplacements\.length > 0\)/);
  assert.match(persistence, /\.insert\(\{ \.\.\.input, previous_score: previousScore\.score, user_id: userId \}\)/);
});

test("persistence refuses local-only success and propagates Supabase errors", async () => {
  const query = {
    insert() { return this; },
    select() { return this; },
    single() { return Promise.resolve({ data: null, error: { message: "remote rejected the link" } }); },
  };
  const failingClient = { from: () => query } as never;
  await assert.rejects(addHealthJournalTriggerLink("u1", {
    effect: "associated",
    previous_score: null,
    symptom_occurrence_id: "s1",
    journal_signal_occurrence_id: null,
    trigger_id: "t1",
  }, null), /persistence is unavailable; no remote save was made/);
  await assert.rejects(addHealthJournalTriggerLink("u1", {
    effect: "associated",
    previous_score: null,
    symptom_occurrence_id: "s1",
    journal_signal_occurrence_id: null,
    trigger_id: "t1",
  }, failingClient), /Could not add Journal Trigger association: remote rejected the link/);
  assert.match(persistence, /if \(error\) throwPersistenceError\("add Journal Trigger association", error\)/);
  assert.match(persistence, /function throwPersistenceError\(action: string, error: \{ message: string \}\)[\s\S]*?throw new Error/);
});

test("association update fully replaces effect and previous score", async () => {
  const persisted = { id: "link-1", effect: "improved", previous_score: 4 };
  const retainedScore = makeTriggerLinkUpdateClient({ data: persisted, error: null });
  await updateHealthJournalTriggerLink("u1", "link-1", { effect: "worsened", previous_score: 4 }, retainedScore.client);
  assert.deepEqual(retainedScore.updates, [{ effect: "worsened", previous_score: 4 }]);

  const clearedScore = makeTriggerLinkUpdateClient({ data: { ...persisted, previous_score: null }, error: null });
  await updateHealthJournalTriggerLink("u1", "link-1", { effect: "improved", previous_score: null }, clearedScore.client);
  assert.deepEqual(clearedScore.updates, [{ effect: "improved", previous_score: null }]);

  const zeroScore = makeTriggerLinkUpdateClient({ data: { ...persisted, previous_score: 0 }, error: null });
  await updateHealthJournalTriggerLink("u1", "link-1", { effect: "improved", previous_score: 0 }, zeroScore.client);
  assert.deepEqual(zeroScore.updates, [{ effect: "improved", previous_score: 0 }]);
});

test("association update rejects incomplete or invalid replacements before mutation", async () => {
  const client = makeTriggerLinkUpdateClient({ data: null, error: null });
  await assert.rejects(updateHealthJournalTriggerLink("u1", "link-1", { effect: "improved" } as never, client.client), /requires effect and previous_score fields/);
  await assert.rejects(updateHealthJournalTriggerLink("u1", "link-1", { effect: "improved", previous_score: undefined } as never, client.client), /requires effect and previous_score fields/);
  await assert.rejects(updateHealthJournalTriggerLink("u1", "link-1", { previous_score: null } as never, client.client), /requires effect and previous_score fields/);
  await assert.rejects(updateHealthJournalTriggerLink("u1", "link-1", { effect: "unknown", previous_score: null } as never, client.client), /effect is invalid/);
  await assert.rejects(updateHealthJournalTriggerLink("u1", "link-1", { effect: "associated", previous_score: 0 }, client.client), /cannot include a previous score/);
  await assert.rejects(updateHealthJournalTriggerLink("u1", "link-1", { effect: "improved", previous_score: 11 }, client.client), /integer from 0 through 10/);
  assert.deepEqual(client.updates, []);
});

test("association update propagates Supabase mutation failures and filters by owner", async () => {
  const queryCalls: string[][] = [];
  const query = {
    update() { return this; },
    eq(column: string, value: string) { queryCalls.push([column, value]); return this; },
    select() { return this; },
    single() { return Promise.resolve({ data: null, error: { message: "remote update failed" } }); },
  };
  const client = { from: () => query } as never;
  await assert.rejects(updateHealthJournalTriggerLink("u1", "link-1", { effect: "improved", previous_score: null }, client), /Could not update Journal Trigger association: remote update failed/);
  assert.deepEqual(queryCalls, [["id", "link-1"], ["user_id", "u1"]]);
});

test("Trigger persistence uses only occurrence identities and delegates replacement to the targeted transaction", () => {
  assert.match(persistence, /symptom_occurrence_id/);
  assert.match(persistence, /journal_signal_occurrence_id/);
  assert.doesNotMatch(persistence, /hashtag|reflection/);
  assert.match(persistence, /\.rpc\("adhdice_replace_health_journal_trigger_associations"/);
  assert.match(migration, /create table if not exists public\.adhdice_health_journal_trigger_links/);
});

test("one occurrence can have multiple Triggers and the same Trigger can belong to separate occurrences", () => {
  const oneOnPain = [
    { trigger_id: "shower", effect: "worsened", previous_score: 3 },
    { trigger_id: "stretching", effect: "improved", previous_score: 8 },
  ];
  const painAgain = [{ trigger_id: "shower", effect: "worsened", previous_score: 7 }];
  assert.equal(validateHealthJournalTriggerAssociationDrafts(oneOnPain).valid, true);
  assert.equal(validateHealthJournalTriggerAssociationDrafts(painAgain).valid, true);
  assert.equal(hasDuplicateHealthJournalTriggerAssociations([
    { trigger_id: "shower", symptom_occurrence_id: "pain-830", journal_signal_occurrence_id: null },
    { trigger_id: "shower", symptom_occurrence_id: "pain-915", journal_signal_occurrence_id: null },
  ]), false);
  assert.equal(hasDuplicateHealthJournalTriggerAssociations([
    { trigger_id: "shower", symptom_occurrence_id: "pain-830", journal_signal_occurrence_id: null },
    { trigger_id: "shower", symptom_occurrence_id: "pain-830", journal_signal_occurrence_id: null },
  ]), true);
  assert.match(eventCapture, /triggerAssociations: HealthJournalTriggerAssociationDraft\[\]/);
  assert.match(eventCapture, /triggerAssociationsEdited: boolean/);
});

test("positive and negative Feelings share the same explicit effect and score model", () => {
  for (const effect of ["associated", "worsened", "improved"] as const) {
    assert.equal(validateHealthJournalTriggerAssociationDrafts([{ trigger_id: "music", effect, previous_score: effect === "associated" ? null : 0 }]).valid, true);
  }
  assert.equal(validateHealthJournalTriggerAssociationDrafts([{ trigger_id: "music", effect: "associated", previous_score: 10 }]).valid, false);
  assert.equal(validateHealthJournalTriggerAssociationDrafts([{ trigger_id: "music", effect: "improved", previous_score: 10 }]).valid, true);
  assert.equal(validateHealthJournalTriggerAssociationDrafts([{ trigger_id: "music", effect: "unknown", previous_score: null }]).valid, false);
  assert.equal(validateHealthJournalTriggerAssociationDrafts([{ trigger_id: "music", effect: "worsened", previous_score: 11 }]).valid, false);
  assert.match(eventCapture, /Associated/);
  assert.match(eventCapture, /Worsened/);
  assert.match(eventCapture, /Improved/);
});

test("atomic RPC success returns refreshed links and rejection remains visible", async () => {
  const calls: Array<[string, unknown]> = [];
  const replacement = {
    occurrence_kind: "journal_signal" as const,
    occurrence_id: "occurrence-1",
    associations: [{ trigger_id: "trigger-1", effect: "associated" as const, previous_score: null }],
    expected_associations: [],
  };
  const successClient = { rpc(name: string, args: unknown) { calls.push([name, args]); return Promise.resolve({ data: { saved: true, target_count: 1, links: [] }, error: null }); } } as never;
  const result = await replaceHealthJournalTriggerAssociations("user-1", "entry-1", [replacement], successClient);
  assert.equal(calls[0]?.[0], "adhdice_replace_health_journal_trigger_associations");
  assert.deepEqual((result as { saved: boolean }).saved, true);
  const removalCalls: unknown[] = [];
  const removalClient = { rpc(_name: string, args: unknown) { removalCalls.push(args); return Promise.resolve({ data: { saved: true, target_count: 1, links: [] }, error: null }); } } as never;
  await replaceHealthJournalTriggerAssociations("user-1", "entry-1", [{ ...replacement, associations: [], expected_associations: replacement.associations }], removalClient);
  assert.deepEqual((removalCalls[0] as { p_replacements: Array<{ associations: unknown[] }> }).p_replacements[0]?.associations, []);
  await assert.rejects(replaceHealthJournalTriggerAssociations("user-1", "entry-1", [], removalClient), /at least one targeted occurrence/);
  assert.deepEqual(validateHealthJournalTriggerAssociationDrafts([
    { trigger_id: "trigger-1", effect: "associated", previous_score: null },
    { trigger_id: "trigger-1", effect: "improved", previous_score: 0 },
  ]).valid, false);
  const failingClient = { rpc() { return Promise.resolve({ data: null, error: { message: "RPC is not installed" } }); } } as never;
  await assert.rejects(replaceHealthJournalTriggerAssociations("user-1", "entry-1", [replacement], failingClient), /RPC is not installed/);
  assert.match(journalHook, /Trigger associations were not saved/);
  assert.match(journalHook, /No local-only Trigger save was made/);
});

test("event save retains stable UUIDs and only replaces explicitly edited occurrence links", () => {
  assert.match(journalForm, /createPersistedJournalUuid\(\)/);
  assert.match(journalForm, /occurrencesWithIds/);
  assert.match(journalForm, /triggerAssociationReplacements: eventOccurrenceInputs\.triggerAssociationReplacements/);
  assert.match(journalForm, /if \(draft\.triggerAssociationsEdited && draft\.id\)/);
  assert.match(journalForm, /expected_associations: draft\.expectedTriggerAssociations/);
  assert.match(journalForm, /eventSaveResult\.triggerAssociationError/);
  assert.match(journalForm, /triggerEditorDirtyEntryIdRef/);
  assert.match(journalForm, /const id = draft\.id \?\? createPersistedJournalUuid\(\)/);
  assert.match(journalHook, /requestedEntryId && existingRow[\s\S]*?\.update\(remoteCheckInFields\)[\s\S]*?: await client[\s\S]*?\.insert\(/);
  assert.match(journalHook, /replaceHealthJournalTriggerAssociations\(userId, nextRow\.id, triggerReplacements, client\)/);
  assert.match(journalHook, /replacementResult\.links/);
  assert.match(journalHook, /isCurrentOperation\(operation\)/);
  assert.ok(journalHook.indexOf("for (const occurrence of input.journalSignalOccurrences)") < journalHook.indexOf("const remoteCheckInFields"), "local occurrence validation must precede the Event write");
  assert.match(journalHook, /could not be confirmed for Trigger associations/);
});

test("legacy check-ins omit replacement and Start or End of Day linked Events keep their separate save", () => {
  const eventSave = journalForm.slice(journalForm.indexOf("const eventSaveResult = await saveJournalEntry"), journalForm.indexOf("const nextReflection"));
  const checkInSave = journalForm.slice(journalForm.indexOf("const saved = await saveJournalEntry"));
  assert.match(eventSave, /triggerAssociationReplacements:/);
  assert.doesNotMatch(checkInSave, /triggerAssociationReplacements/);
  assert.match(checkInSave, /journalSignalOccurrences: legacyFeelingOccurrences/);
  assert.match(journalForm, /nextAnswers\.linked_event_ids = \[nextEventId\]/);
  assert.match(journalHook, /if \(triggerReplacements\.length > 0\)/);
});

test("occurrence hydration and History map associations by persisted occurrence ID", () => {
  assert.match(eventCapture, /triggerLinks\s*\.filter\(\(link\) => kind === "symptom" \? link\.symptom_occurrence_id === occurrenceId : link\.journal_signal_occurrence_id === occurrenceId\)/);
  assert.match(healthPage, /link\.symptom_occurrence_id === occurrence\.id \|\| link\.journal_signal_occurrence_id === occurrence\.id/);
  assert.match(healthPage, /trigger\?\.name \?\? "Archived Trigger"/);
  assert.match(healthPage, /link\.previous_score \?\? "Unknown"/);
  assert.match(replacementMigration, /delete from public\.adhdice_health_journal_trigger_links as link/);
  assert.match(replacementMigration, /where link\.user_id = v_user_id[\s\S]*?link\.symptom_occurrence_id = v_occurrence_id/);
  assert.match(replacementMigration, /where link\.user_id = v_user_id[\s\S]*?link\.journal_signal_occurrence_id = v_occurrence_id/);
});

test("production overlay preserves scored hashtags and exposes archived historical Triggers", () => {
  assert.match(eventCapture, /const scoredTag = `#\$\{signalName\} \$\{scoreLabel\} `/);
  assert.match(eventCapture, /trigger\.archived_at === null/);
  assert.match(eventCapture, /trigger\?\.archived_at \? <span/);
  assert.match(eventCapture, /Escape/);
  assert.match(eventCapture, /pointerdown/);
  assert.match(replacementMigration, /security invoker/);
  assert.match(replacementMigration, /for update/);
  assert.match(replacementMigration, /40001/);
  assert.match(replacementMigration, /entry\.id = p_journal_entry_id[\s\S]*?entry\.user_id = v_user_id[\s\S]*?for update/);
  assert.match(replacementMigration, /grant execute on function public\.adhdice_replace_health_journal_trigger_associations\(uuid, jsonb\) to authenticated/);
  assert.match(replacementMigration, /from public, anon, authenticated/);
  assert.match(replacementMigration, /Archived Triggers cannot be added to new occurrences/);
});
