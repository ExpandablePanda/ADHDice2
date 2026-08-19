import type { TaskHistory } from "../database.types.ts";
import type { CanonicalTaskHistoryFact } from "./types.ts";

const SUCCESSFUL_OUTCOMES = new Set(["done", "did_my_best", "complete"]);

/**
 * Canonical facts are the persisted History authority when the command gate
 * is enabled.  This adapter intentionally projects explicit facts only;
 * calculated open-state Missed remains an engine/read-model result. Persisted
 * automatic Missed is projected only when it already exists as a canonical
 * authorized-automation fact.
 */
export function mapCanonicalTaskHistoryFact(fact: CanonicalTaskHistoryFact): TaskHistory {
  const occurrenceKey = fact.scheduled_due_on
    ? `task:${fact.entity_id}:occurrence:${fact.scheduled_due_on}`
    : null;
  return {
    id: fact.id,
    task_id: fact.entity_id,
    user_id: fact.user_id,
    entry_date: fact.logical_date,
    occurrence_key: occurrenceKey,
    occurrence_due_on: fact.scheduled_due_on,
    effective_due_on: fact.effective_due_on,
    status: fact.outcome,
    event_type: fact.event_kind === "terminal_complete" ? "completed_permanently" : "status",
    counted_as_due_occurrence: Boolean(fact.scheduled_due_on),
    was_completed: SUCCESSFUL_OUTCOMES.has(fact.outcome),
    created_at: fact.created_at,
    updated_at: fact.updated_at,
    canonical_fact_id: fact.id,
    canonical_occurrence_id: fact.occurrence_id,
    canonical_provenance_kind: fact.provenance_kind,
    canonical_command_id: fact.command_id,
    canonical_source: fact.source,
    recurrence_authoritative: fact.provenance_kind === "migration_reconstruction"
      && fact.outcome === "delayed"
      && fact.effective_due_on === null
      ? false
      : true,
  };
}

export function mapCanonicalTaskHistoryFacts(facts: readonly CanonicalTaskHistoryFact[]) {
  return facts.map(mapCanonicalTaskHistoryFact);
}
