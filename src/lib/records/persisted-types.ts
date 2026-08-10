export type RecordMetricKey =
  | "parent_tasks_day" | "parent_tasks_week" | "parent_tasks_month"
  | "permanent_completes_day"
  | "steps_day" | "steps_week" | "steps_month"
  | "parent_completion_day_streak" | "step_completion_day_streak" | "combined_completion_day_streak" | "focus_active_day_streak"
  | "longest_focus_session" | "focus_duration_day" | "focus_duration_week" | "focus_duration_month" | "focus_sessions_day"
  | "task_occurrence_streak" | "task_biggest_comeback";

export type RecordUnit = "tasks" | "steps" | "days" | "seconds" | "sessions" | "occurrences";
export type RecordScopeKind = "global" | "task";
export type RecordEventKind = "break" | "tie";

export type PersistedRecordCurrent = {
  id: string;
  user_id: string;
  rules_version: string;
  metric_key: RecordMetricKey;
  scope_kind: RecordScopeKind;
  scope_id: string | null;
  title_snapshot: string | null;
  value: number;
  unit: RecordUnit;
  credited_date: string;
  period_key: string | null;
  period_start: string | null;
  period_end: string | null;
  candidate_identity: string;
  first_achieved_at: string;
  evidence_fingerprint: string;
  evidence_snapshot: Record<string, unknown>;
  timezone: string;
  logical_day_start: string;
  recalculated_at: string;
  created_at: string;
  updated_at: string;
};

export type PersistedRecordEvent = {
  id: string;
  user_id: string;
  rules_version: string;
  metric_key: RecordMetricKey;
  scope_kind: RecordScopeKind;
  scope_id: string | null;
  title_snapshot: string | null;
  event_kind: RecordEventKind;
  value: number;
  unit: RecordUnit;
  credited_date: string;
  period_key: string | null;
  period_start: string | null;
  period_end: string | null;
  event_identity: string;
  candidate_identity: string;
  evidence_fingerprint: string;
  evidence_snapshot: Record<string, unknown>;
  first_qualified_at: string;
  first_achieved_at: string;
  timezone: string;
  logical_day_start: string;
  validity_state: "valid" | "invalid" | "superseded";
  invalidated_at: string | null;
  invalidation_reason: string | null;
  superseded_by_event_identity: string | null;
  created_at: string;
  updated_at: string;
};
