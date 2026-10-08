import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  HealthJournalTrigger,
  HealthJournalTriggerEffect,
  HealthJournalTriggerLink,
  HealthJournalTriggerLinkInsert,
  HealthJournalTriggerLinkUpdate,
} from "@/lib/database.types";

export const HEALTH_JOURNAL_TRIGGER_EFFECTS = ["associated", "worsened", "improved"] as const;
export type {
  HealthJournalTrigger,
  HealthJournalTriggerEffect,
  HealthJournalTriggerInsert,
  HealthJournalTriggerLink,
  HealthJournalTriggerLinkInsert,
  HealthJournalTriggerLinkUpdate,
  HealthJournalTriggerUpdate,
} from "@/lib/database.types";
export type HealthJournalTriggerOccurrenceReference = Pick<HealthJournalTriggerLink, "symptom_occurrence_id" | "journal_signal_occurrence_id">;

type TriggerClient = SupabaseClient<Database> | null;
type TriggerClientArgument = TriggerClient | undefined;

export function normalizeHealthJournalTriggerName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function getHealthJournalTriggerNameIdentity(value: string) {
  return normalizeHealthJournalTriggerName(value).toLowerCase();
}

export function hasDuplicateHealthJournalTriggerName(value: string, existingNames: readonly string[]) {
  const identity = getHealthJournalTriggerNameIdentity(value);
  return identity.length > 0 && existingNames.some((name) => getHealthJournalTriggerNameIdentity(name) === identity);
}

export function isHealthJournalTriggerEffect(value: unknown): value is HealthJournalTriggerEffect {
  return typeof value === "string" && HEALTH_JOURNAL_TRIGGER_EFFECTS.includes(value as HealthJournalTriggerEffect);
}

export function validateHealthJournalTriggerName(value: unknown): { valid: true; name: string } | { valid: false; error: string } {
  if (typeof value !== "string") return { valid: false, error: "Trigger name must be text." };
  const name = normalizeHealthJournalTriggerName(value);
  return name ? { valid: true, name } : { valid: false, error: "Trigger name cannot be empty." };
}

export function normalizeHealthJournalTriggerPreviousScore(value: unknown): { valid: true; score: number | null } | { valid: false; error: string } {
  if (value === null || value === undefined) return { valid: true, score: null };
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 10) {
    return { valid: false, error: "Previous score must be an integer from 0 through 10, or empty." };
  }
  return { valid: true, score: value };
}

export function validateHealthJournalTriggerOccurrenceReference(
  reference: HealthJournalTriggerOccurrenceReference,
): boolean {
  return Number(reference.symptom_occurrence_id !== null) + Number(reference.journal_signal_occurrence_id !== null) === 1;
}

export function getHealthJournalTriggerAssociationIdentity(
  association: Pick<HealthJournalTriggerLink, "trigger_id" | "symptom_occurrence_id" | "journal_signal_occurrence_id">,
) {
  const occurrence = association.symptom_occurrence_id !== null
    ? `symptom:${association.symptom_occurrence_id}`
    : `feeling:${association.journal_signal_occurrence_id ?? ""}`;
  return `${association.trigger_id}:${occurrence}`;
}

export function hasDuplicateHealthJournalTriggerAssociations(
  associations: readonly Pick<HealthJournalTriggerLink, "trigger_id" | "symptom_occurrence_id" | "journal_signal_occurrence_id">[],
) {
  const seen = new Set<string>();
  for (const association of associations) {
    const identity = getHealthJournalTriggerAssociationIdentity(association);
    if (seen.has(identity)) return true;
    seen.add(identity);
  }
  return false;
}

async function resolveTriggerClient(client: TriggerClientArgument) {
  const resolvedClient = client === undefined
    ? (await import("@/lib/supabase")).createBrowserSupabaseClient()
    : client;
  if (!resolvedClient) throw new Error("Journal Trigger persistence is unavailable; no remote save was made.");
  return resolvedClient;
}

function requireTriggerClient(client: TriggerClient) {
  if (!client) throw new Error("Journal Trigger persistence is unavailable; no remote save was made.");
  return client;
}

function throwPersistenceError(action: string, error: { message: string }) {
  throw new Error(`Could not ${action}: ${error.message}`);
}

export async function listHealthJournalTriggers(userId: string, client?: TriggerClientArgument) {
  const { data, error } = await requireTriggerClient(await resolveTriggerClient(client))
    .from("adhdice_health_journal_triggers")
    .select("*")
    .eq("user_id", userId)
    .order("archived_at", { ascending: true, nullsFirst: true })
    .order("name", { ascending: true })
    .order("id", { ascending: true });
  if (error) throwPersistenceError("read Journal Triggers", error);
  return (data ?? []) as HealthJournalTrigger[];
}

export async function createHealthJournalTrigger(userId: string, value: string, client?: TriggerClientArgument) {
  const validation = validateHealthJournalTriggerName(value);
  if (!validation.valid) throw new Error(validation.error);
  const { data, error } = await requireTriggerClient(await resolveTriggerClient(client))
    .from("adhdice_health_journal_triggers")
    .insert({ user_id: userId, name: validation.name })
    .select("*")
    .single();
  if (error) throwPersistenceError("create Journal Trigger", error);
  return data as HealthJournalTrigger;
}

export async function renameHealthJournalTrigger(userId: string, triggerId: string, value: string, client?: TriggerClientArgument) {
  const validation = validateHealthJournalTriggerName(value);
  if (!validation.valid) throw new Error(validation.error);
  const { data, error } = await requireTriggerClient(await resolveTriggerClient(client))
    .from("adhdice_health_journal_triggers")
    .update({ name: validation.name })
    .eq("id", triggerId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throwPersistenceError("rename Journal Trigger", error);
  return data as HealthJournalTrigger;
}

export async function archiveHealthJournalTrigger(userId: string, triggerId: string, client?: TriggerClientArgument) {
  const { data, error } = await requireTriggerClient(await resolveTriggerClient(client))
    .from("adhdice_health_journal_triggers")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", triggerId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throwPersistenceError("archive Journal Trigger", error);
  return data as HealthJournalTrigger;
}

export async function readHealthJournalTriggerLinks(userId: string, client?: TriggerClientArgument) {
  const { data, error } = await requireTriggerClient(await resolveTriggerClient(client))
    .from("adhdice_health_journal_trigger_links")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throwPersistenceError("read Journal Trigger associations", error);
  return (data ?? []) as HealthJournalTriggerLink[];
}

export async function addHealthJournalTriggerLink(userId: string, input: Omit<HealthJournalTriggerLinkInsert, "user_id">, client?: TriggerClientArgument) {
  if (!validateHealthJournalTriggerOccurrenceReference({
    symptom_occurrence_id: input.symptom_occurrence_id ?? null,
    journal_signal_occurrence_id: input.journal_signal_occurrence_id ?? null,
  })) throw new Error("A Journal Trigger association must reference exactly one Feeling occurrence.");
  if (!isHealthJournalTriggerEffect(input.effect)) throw new Error("Journal Trigger association effect is invalid.");
  const previousScore = normalizeHealthJournalTriggerPreviousScore(input.previous_score);
  if (!previousScore.valid) throw new Error(previousScore.error);
  if (input.effect === "associated" && previousScore.score !== null) throw new Error("Associated Trigger links cannot include a previous score.");
  const { data, error } = await requireTriggerClient(await resolveTriggerClient(client))
    .from("adhdice_health_journal_trigger_links")
    .insert({ ...input, previous_score: previousScore.score, user_id: userId })
    .select("*")
    .single();
  if (error) throwPersistenceError("add Journal Trigger association", error);
  return data as HealthJournalTriggerLink;
}

export async function updateHealthJournalTriggerLink(userId: string, linkId: string, input: HealthJournalTriggerLinkUpdate, client?: TriggerClientArgument) {
  if (!isHealthJournalTriggerEffect(input.effect)) throw new Error("Journal Trigger association effect is invalid.");
  const previousScore = normalizeHealthJournalTriggerPreviousScore(input.previous_score);
  if (!previousScore.valid) throw new Error(previousScore.error);
  if (input.effect === "associated" && previousScore.score !== null) throw new Error("Associated Trigger links cannot include a previous score.");
  const { data, error } = await requireTriggerClient(await resolveTriggerClient(client))
    .from("adhdice_health_journal_trigger_links")
    .update({ effect: input.effect, previous_score: previousScore.score })
    .eq("id", linkId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throwPersistenceError("update Journal Trigger association", error);
  return data as HealthJournalTriggerLink;
}

export async function removeHealthJournalTriggerLink(userId: string, linkId: string, client?: TriggerClientArgument) {
  const { error } = await requireTriggerClient(await resolveTriggerClient(client))
    .from("adhdice_health_journal_trigger_links")
    .delete()
    .eq("id", linkId)
    .eq("user_id", userId);
  if (error) throwPersistenceError("remove Journal Trigger association", error);
}
