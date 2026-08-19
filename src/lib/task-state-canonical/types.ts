/**
 * Runtime row types for the installed M1 canonical Task State schema.
 *
 * These types describe database facts and command envelopes only. They do not
 * create a second storage model or make the legacy Task/History path canonical.
 */

export type CanonicalJsonObject = Record<string, unknown>;

export type CanonicalEntityKind = "parent" | "step" | "substep";
export type CanonicalizationStatus =
  | "legacy_uninitialized"
  | "canonical_proven"
  | "canonical_runtime"
  | "needs_attention";
export type CanonicalTerminalState = "active" | "permanently_complete";
export type CanonicalContainerState = "active" | "archived" | "trashed";
export type CanonicalWorkflowState = "none" | "in_progress";
export type CanonicalPriorContainerState = "active" | "archived" | null;
export type CanonicalPriorContainerStateStatus =
  | "not_applicable"
  | "proven"
  | "unknown"
  | "contradictory";

export type CanonicalTaskStateColumns = {
  canonicalization_status: CanonicalizationStatus;
  entity_kind: CanonicalEntityKind | null;
  terminal_state: CanonicalTerminalState | null;
  container_state: CanonicalContainerState | null;
  prior_container_state: CanonicalPriorContainerState;
  prior_container_state_status: CanonicalPriorContainerStateStatus | null;
  terminal_completed_at: string | null;
  container_trashed_at: string | null;
  workflow_state: CanonicalWorkflowState | null;
  workflow_started_at: string | null;
  workflow_logical_date: string | null;
  workflow_occurrence_id: string | null;
  workflow_command_id: string | null;
  workflow_revision: number | null;
  canonical_revision: number | null;
  canonical_created_at: string | null;
  canonical_updated_at: string | null;
  projection_source_canonical_revision: number | null;
  projection_source_fingerprint: string | null;
  projection_version: string | null;
};

export type CanonicalTaskStateRecord = CanonicalTaskStateColumns & {
  id: string;
  user_id: string;
  revision: number;
};

export type CanonicalCommandType =
  | "set_outcome"
  | "clear_outcome"
  | "complete_task"
  | "delay_occurrence"
  | "set_due_date"
  | "set_repeat"
  | "calendar_override"
  | "archive_task"
  | "trash_task"
  | "restore_task"
  | "start_in_progress"
  | "clear_in_progress"
  | "reconcile_rollover"
  | "hierarchy_change";

export type CanonicalCommandOperationState =
  | "accepted"
  | "rejected"
  | "committed"
  | "failed_retryable"
  | "failed_permanent"
  | "needs_explicit_resolution";

export type CanonicalCommandSourceKind = "runtime" | "authorized_automation" | "repair";

export type CanonicalTaskCommandOperation = {
  id: string;
  user_id: string;
  entity_id: string | null;
  entity_kind: CanonicalEntityKind | null;
  command_id: string;
  command_type: CanonicalCommandType;
  idempotence_identity: string;
  accepted_payload_digest: string;
  logical_day_context_identity: string | null;
  requested_logical_date: string | null;
  requested_occurrence_key: string | null;
  expected_entity_revision: number | null;
  expected_history_revision: number | null;
  expected_boundary_sequence: number | null;
  expected_occurrence_revision: number | null;
  expected_facts_fingerprint: string | null;
  state: CanonicalCommandOperationState;
  result_digest: string | null;
  result_references: CanonicalJsonObject;
  conflict_code: string | null;
  source_kind: CanonicalCommandSourceKind;
  schema_contract_version: "task-state-schema-v1";
  created_at: string;
  completed_at: string | null;
};

export type CanonicalScheduleBoundaryType =
  | "initial"
  | "due_date_change"
  | "repeat_change"
  | "delay"
  | "correction"
  | "reopen";
export type CanonicalScheduleModel = "unscheduled" | "one_time" | "rolling" | "fixed";
export type CanonicalRepeatFrequency =
  | "none"
  | "daily"
  | "weekly"
  | "monthly"
  | "custom"
  | "daily_until_complete";
export type CanonicalScheduleAnchorKind =
  | "user_selected"
  | "first_schedule_boundary"
  | "reconstructed"
  | "migration_prospective"
  | "unknown";
export type CanonicalScheduleAnchorConfidence =
  | "proven"
  | "high_confidence"
  | "ambiguous"
  | "unavailable";
export type CanonicalCanonicalActorKind = "user" | "authorized_automation" | "migration" | "repair";

export type CanonicalTaskScheduleBoundary = {
  id: string;
  user_id: string;
  entity_id: string;
  entity_kind: CanonicalEntityKind;
  effective_from_logical_date: string;
  boundary_sequence: number;
  boundary_type: CanonicalScheduleBoundaryType;
  schedule_model: CanonicalScheduleModel;
  repeat_frequency: CanonicalRepeatFrequency;
  repeat_interval: number;
  repeat_days_of_week: number[];
  repeat_day_of_month: number | null;
  repeat_monthly_mode: "day_of_month" | "ordinal_weekday";
  repeat_monthly_ordinal: "first" | "second" | "third" | "fourth" | "last" | null;
  repeat_monthly_weekday: number | null;
  one_time_due_on: string | null;
  due_time: string | null;
  anchor_date: string | null;
  anchor_kind: CanonicalScheduleAnchorKind;
  anchor_confidence: CanonicalScheduleAnchorConfidence;
  historical_scope_known: boolean;
  prospective_only: boolean;
  prior_boundary_id: string | null;
  affected_occurrence_id: string | null;
  logical_day_settings_revision: number;
  timezone: string;
  day_start_time: string;
  actor_kind: CanonicalCanonicalActorKind;
  actor_id: string | null;
  source: string;
  command_id: string | null;
  idempotence_identity: string;
  schema_contract_version: "task-state-schema-v1";
  source_task_revision: number | null;
  revision: number;
  created_at: string;
  updated_at: string;
};

export type CanonicalOccurrenceResolutionState = "unresolved" | "resolved" | "superseded";
export type CanonicalOccurrenceOriginKind = "proven" | "reconstructed" | "legacy_ambiguous";
export type CanonicalProvenanceKind = "user" | "authorized_automation" | "migration_reconstruction" | "repair";

export type CanonicalTaskOccurrence = {
  id: string;
  user_id: string;
  entity_id: string;
  entity_kind: CanonicalEntityKind;
  occurrence_key: string;
  scheduled_due_on: string;
  source_boundary_id: string;
  recurrence_source_fingerprint: string;
  origin_kind: CanonicalOccurrenceOriginKind;
  origin_confidence: CanonicalScheduleAnchorConfidence;
  provenance_kind: CanonicalProvenanceKind;
  actor_kind: CanonicalCanonicalActorKind;
  actor_id: string | null;
  source: string;
  materialization_reason:
    | "explicit_outcome"
    | "delay"
    | "complete"
    | "migration_reconstruction"
    | "manual_correction"
    | "required_command_state";
  resolution_state: CanonicalOccurrenceResolutionState;
  resolved_logical_date: string | null;
  resolved_outcome: "done" | "did_my_best" | "missed" | "delayed" | "complete" | null;
  resolved_history_id: string | null;
  command_id: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
};

export type CanonicalTaskOccurrenceEffectiveOverride = {
  id: string;
  user_id: string;
  entity_id: string;
  occurrence_id: string;
  scheduled_due_on: string;
  effective_due_on: string;
  action_logical_date: string;
  delay_kind: "delay" | "correction";
  override_sequence: number;
  prior_override_id: string | null;
  prior_override_sequence: number | null;
  schedule_boundary_id: string;
  history_id: string | null;
  provenance_kind: CanonicalProvenanceKind;
  actor_kind: CanonicalCanonicalActorKind;
  actor_id: string | null;
  source: string;
  command_id: string | null;
  idempotence_identity: string;
  accepted_payload_digest: string;
  revision: number;
  created_at: string;
  updated_at: string;
};

export type CanonicalHistoryFactOutcome = "done" | "did_my_best" | "missed" | "delayed" | "complete";
export type CanonicalHistoryFactEventKind =
  | "explicit_outcome"
  | "terminal_complete"
  | "delay_audit"
  | "correction"
  | "authorized_automation";

export type CanonicalTaskHistoryFact = {
  id: string;
  user_id: string;
  entity_id: string;
  entity_kind: CanonicalEntityKind;
  logical_date: string;
  outcome: CanonicalHistoryFactOutcome;
  event_kind: CanonicalHistoryFactEventKind;
  occurrence_id: string | null;
  scheduled_due_on: string | null;
  effective_due_on: string | null;
  schedule_boundary_id: string | null;
  recurrence_source_fingerprint: string | null;
  provenance_kind: CanonicalProvenanceKind;
  actor_kind: CanonicalCanonicalActorKind;
  actor_id: string | null;
  source: string;
  logical_day_settings_revision: number;
  timezone: string;
  day_start_time: string;
  command_id: string | null;
  idempotence_identity: string;
  source_legacy_history_id: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
};

export type CanonicalCalendarOverrideState = "unscheduled" | "not_due" | "due_open";
export type CanonicalTaskCalendarOverride = {
  id: string;
  user_id: string;
  entity_id: string;
  entity_kind: CanonicalEntityKind;
  logical_date: string;
  override_state: CanonicalCalendarOverrideState;
  reason: string | null;
  is_active: boolean;
  cleared_at: string | null;
  cleared_by_command_id: string | null;
  provenance_kind: "manual" | "authorized_repair" | "migration";
  actor_kind: CanonicalCanonicalActorKind;
  actor_id: string | null;
  source: string;
  command_id: string | null;
  idempotence_identity: string;
  revision: number;
  created_at: string;
  updated_at: string;
};

export type CanonicalRewardEntitlementState = "pending" | "fulfilled" | "blocked";
export type CanonicalTaskRewardEntitlement = {
  id: string;
  user_id: string;
  entity_id: string;
  entity_kind: CanonicalEntityKind;
  logical_date: string;
  reward_program_version: string;
  canonical_history_id: string;
  canonical_command_id: string | null;
  canonical_event_identity: string;
  outcome_snapshot: "done" | "did_my_best" | "complete";
  effective_obligation_identity: string | null;
  eligibility_kind: "handled_success" | "authorized_automation";
  entitlement_source_kind: "runtime_command";
  state: CanonicalRewardEntitlementState;
  created_at: string;
  updated_at: string;
  fulfilled_at: string | null;
};

export type CanonicalTaskRewardGrant = {
  id: string;
  user_id: string;
  entitlement_id: string;
  grant_operation_identity: string;
  grant_kind: "banked_roll";
  units: number;
  grant_payload: CanonicalJsonObject;
  state: "pending" | "applied" | "failed" | "reconciled";
  last_error_code: string | null;
  last_error_message: string | null;
  economy_reference: string | null;
  created_at: string;
  applied_at: string | null;
  updated_at: string;
};

export type CanonicalTaskRewardClaimConsumption = {
  id: string;
  user_id: string;
  grant_id: string;
  claim_operation_identity: string;
  state: "pending" | "consumed" | "failed";
  economy_reference: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  consumed_at: string | null;
  updated_at: string;
};

export type CanonicalLogicalDayContext = {
  identity: string;
  logicalDate: string;
  timezone: string;
  dayStartTime: string;
  settingsRevision: number;
};
