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
  updateHealthJournalTriggerLink,
  validateHealthJournalTriggerOccurrenceReference,
  validateHealthJournalTriggerName,
} from "../src/lib/health-journal-triggers.ts";

const migration = readFileSync(new URL("../supabase/add_health_journal_triggers_7_16_116.sql", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../src/lib/health-journal-triggers.ts", import.meta.url), "utf8");
const journalHook = readFileSync(new URL("../src/hooks/useHealth.ts", import.meta.url), "utf8");

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
  assert.doesNotMatch(journalHook, /health_journal_trigger_links/);
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

test("Trigger persistence uses only occurrence identities and does not claim transaction atomicity", () => {
  assert.match(persistence, /symptom_occurrence_id/);
  assert.match(persistence, /journal_signal_occurrence_id/);
  assert.doesNotMatch(persistence, /journal_entry_id|hashtag|reflection/);
  assert.match(migration, /create table if not exists public\.adhdice_health_journal_trigger_links/);
});
