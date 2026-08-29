import type { PersistedRecordCurrent, PersistedRecordEvent } from "./records/persisted-types.ts";
import type {
  CanonicalTaskCalendarOverride,
  CanonicalTaskCommandOperation,
  CanonicalTaskHistoryFact,
  CanonicalTaskOccurrence,
  CanonicalTaskOccurrenceEffectiveOverride,
  CanonicalTaskRewardClaimConsumption,
  CanonicalTaskRewardEntitlement,
  CanonicalTaskRewardGrant,
  CanonicalTaskScheduleBoundary,
  CanonicalTaskStateColumns,
} from "./task-state-canonical/types.ts";

export type RecordReconcileRun = {
  id: string;
  user_id: string;
  manifest_schema_version: 1;
  evidence_schema_version: 2;
  rules_version: string;
  manifest_digest: string;
  evaluation_digest: string;
  expected_partitions: unknown[];
  expected_chunk_count: number;
  expected_current_row_count: number;
  expected_event_row_count: number;
  evaluated_at: string;
  timezone: string;
  logical_day_start: string;
  status: "uploading" | "completed" | "invalid";
  expires_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RecordReconcileChunk = {
  run_id: string;
  user_id: string;
  row_kind: "current" | "event";
  section_key: "global_tasks" | "streaks" | "focus" | "per_task" | "record_history";
  chunk_index: number;
  chunk_digest: string;
  row_count: number;
  envelope_bytes: number;
  received_at: string;
};

export type RecordCurrentStage = Omit<PersistedRecordCurrent, "created_at" | "id" | "logical_day_start" | "recalculated_at" | "rules_version" | "timezone" | "updated_at"> & {
  run_id: string;
  record_identity: string;
};

export type RecordEventStage = Omit<PersistedRecordEvent, "created_at" | "id" | "invalidated_at" | "invalidation_reason" | "logical_day_start" | "rules_version" | "superseded_by_event_identity" | "timezone" | "updated_at" | "validity_state"> & {
  run_id: string;
  record_identity: string;
};

export type TaskStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "missed"
  | "did_my_best"
  | "upcoming"
  | "not_due"
  | "delayed"
  | "archived"
  | "trashed"
  | "complete";
export type TaskPriority = "low" | "normal" | "high";
export type TaskEnergy = "none" | "low" | "medium" | "high";
export type TaskRepeatFrequency = "none" | "daily" | "weekly" | "monthly" | "custom" | "daily_until_complete";
export type TaskRepeatMonthlyMode = "day_of_month" | "ordinal_weekday";
export type TaskRepeatMonthlyOrdinal = "first" | "second" | "third" | "fourth" | "last";
export type FocusType = string;
export type FocusSubtype = string;
export type TaskFocusDay = {
  user_id: string;
  focus_date: string;
  task_ids: string[];
  updated_at: string;
};

export type TaskFocusDayInsert = {
  user_id: string;
  focus_date: string;
  task_ids?: string[];
};

export type TaskFocusDayUpdate = Partial<
  Pick<TaskFocusDay, "task_ids">
>;

export type TaskGridLayout = {
  user_id: string;
  layout_json: string;
  updated_at: string;
};

export type TaskGridLayoutInsert = {
  user_id: string;
  layout_json?: string;
};

export type TaskGridLayoutUpdate = Partial<
  Pick<TaskGridLayout, "layout_json">
>;

export type HudUiSettings = {
  user_id: string;
  hud_state: Record<string, unknown> | null;
  client_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type HudUiSettingsInsert = {
  user_id: string;
  hud_state?: Record<string, unknown> | null;
  client_updated_at?: string | null;
};

export type HudUiSettingsUpdate = Partial<
  Pick<HudUiSettings, "hud_state" | "client_updated_at">
>;

export type OnTimePlanRow = {
  user_id: string;
  plan_state: Record<string, unknown>;
  client_updated_at: string;
  created_at: string;
  updated_at: string;
};

export type OnTimePlanInsert = {
  user_id: string;
  plan_state?: Record<string, unknown>;
  client_updated_at?: string;
};

export type OnTimePlanUpdate = Partial<Pick<OnTimePlanRow, "plan_state" | "client_updated_at">>;

export type HomeTodoStateRow = {
  user_id: string;
  state: Record<string, unknown>;
  client_updated_at: string;
  created_at: string;
  updated_at: string;
};

export type HomeTodoStateInsert = {
  user_id: string;
  state?: Record<string, unknown>;
  client_updated_at?: string;
};

export type HomeTodoStateUpdate = Partial<Pick<HomeTodoStateRow, "state" | "client_updated_at">>;

export type BrainstormStateRow = {
  user_id: string;
  source_markdown: string;
  answers: Record<string, unknown>;
  qa_state: Record<string, unknown>;
  client_updated_at: string;
  created_at: string;
  updated_at: string;
};

export type BrainstormStateInsert = {
  user_id: string;
  source_markdown?: string;
  answers?: Record<string, unknown>;
  qa_state?: Record<string, unknown>;
  client_updated_at: string;
};

export type BrainstormStateUpdate = Partial<Pick<BrainstormStateRow, "source_markdown" | "answers" | "qa_state" | "client_updated_at">>;

export type TaskListKind = "system" | "smart" | "custom";
export type TaskListMembershipMode = "manual" | "rules" | "hybrid";

export type TaskList = {
  id: string;
  user_id: string;
  built_in_key: string | null;
  folder_id: string | null;
  name: string;
  list_type: TaskListKind;
  membership_mode: TaskListMembershipMode;
  is_deletable: boolean;
  is_editable: boolean;
  is_visible: boolean;
  revision: number;
  sort_order: number;
  rules_json: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskListInsert = {
  id: string;
  user_id: string;
  built_in_key?: string | null;
  folder_id?: string | null;
  name: string;
  list_type?: TaskListKind;
  membership_mode?: TaskListMembershipMode;
  is_deletable?: boolean;
  is_editable?: boolean;
  is_visible?: boolean;
  revision?: number;
  sort_order?: number;
  rules_json?: string | null;
};

export type TaskListUpdate = Partial<
  Pick<
    TaskList,
    | "built_in_key"
    | "folder_id"
    | "name"
    | "list_type"
    | "membership_mode"
    | "is_deletable"
    | "is_editable"
    | "is_visible"
    | "revision"
    | "sort_order"
    | "rules_json"
  >
>;

export type TaskListFolder = {
  created_at: string;
  id: string;
  name: string;
  parent_folder_id: string | null;
  revision: number;
  sort_order: number;
  updated_at: string;
  user_id: string;
};

export type TaskListFolderInsert = {
  id?: string;
  name: string;
  parent_folder_id?: string | null;
  revision?: number;
  sort_order?: number;
  user_id: string;
};

export type TaskListFolderUpdate = Partial<
  Pick<TaskListFolder, "name" | "parent_folder_id" | "revision" | "sort_order">
>;

export type TaskListContainer = {
  created_at: string;
  folder_id: string | null;
  id: string;
  revision: number;
  updated_at: string;
  user_id: string;
};

export type TaskListRailItemType = "folder" | "list";

export type TaskListRailItem = {
  container_folder_id: string | null;
  created_at: string;
  entity_id: string | null;
  item_key: string;
  item_type: TaskListRailItemType;
  sort_order: number;
  updated_at: string;
  user_id: string;
};

export type TaskListRailItemInsert = {
  container_folder_id?: string | null;
  entity_id?: string | null;
  item_key: string;
  item_type: TaskListRailItemType;
  sort_order?: number;
  user_id: string;
};

export type TaskListManualMembership = {
  id: string;
  user_id: string;
  task_id: string;
  list_id: string;
  created_at: string;
};

export type TaskListManualMembershipInsert = {
  id?: string;
  user_id: string;
  task_id: string;
  list_id: string;
};

export type TaskListManualMembershipUpdate = Partial<
  Pick<TaskListManualMembership, "list_id">
>;

export type Task = {
  id: string;
  user_id: string;
  parent_task_id: string | null;
  revision: number;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  priority_level?: 0 | 1 | 2 | 3 | 4 | 5 | null;
  energy: TaskEnergy;
  is_urgent: boolean;
  is_important: boolean;
  due_on: string | null;
  active_status_logical_date: string | null;
  active_occurrence_due_on: string | null;
  scheduled_on: string | null;
  due_time: string | null;
  estimated_minutes: number | null;
  actual_seconds: number;
  tags: string[];
  external_link_label: string | null;
  external_link_url: string | null;
  one_step_at_a_time: boolean;
  subtasks_auto_reset: boolean;
  repeat_frequency: TaskRepeatFrequency;
  repeat_interval: number;
  repeat_days_of_week: number[];
  repeat_day_of_month: number | null;
  repeat_monthly_mode: TaskRepeatMonthlyMode;
  repeat_monthly_ordinal: TaskRepeatMonthlyOrdinal | null;
  repeat_monthly_weekday: number | null;
  pinned_at: string | null;
  pin_order: number | null;
  sort_order: number;
  completed_at: string | null;
  trashed_at: string | null;
  permanently_deleted_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskInsert = {
  id?: string;
  user_id: string;
  parent_task_id?: string | null;
  revision?: number;
  title: string;
  notes?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  priority_level?: 0 | 1 | 2 | 3 | 4 | 5;
  energy?: TaskEnergy;
  is_urgent?: boolean;
  is_important?: boolean;
  due_on?: string | null;
  active_status_logical_date?: string | null;
  active_occurrence_due_on?: string | null;
  scheduled_on?: string | null;
  due_time?: string | null;
  estimated_minutes?: number | null;
  actual_seconds?: number;
  tags?: string[];
  external_link_label?: string | null;
  external_link_url?: string | null;
  one_step_at_a_time?: boolean;
  subtasks_auto_reset?: boolean;
  repeat_frequency?: TaskRepeatFrequency;
  repeat_interval?: number;
  repeat_days_of_week?: number[];
  repeat_day_of_month?: number | null;
  repeat_monthly_mode?: TaskRepeatMonthlyMode;
  repeat_monthly_ordinal?: TaskRepeatMonthlyOrdinal | null;
  repeat_monthly_weekday?: number | null;
  pinned_at?: string | null;
  pin_order?: number | null;
  sort_order?: number;
  completed_at?: string | null;
  trashed_at?: string | null;
};

export type TaskUpdate = Partial<
  Pick<
    Task,
    | "revision"
    | "title"
    | "notes"
    | "status"
    | "priority"
    | "priority_level"
    | "energy"
    | "is_urgent"
    | "is_important"
    | "due_on"
    | "active_status_logical_date"
    | "active_occurrence_due_on"
    | "scheduled_on"
    | "due_time"
    | "estimated_minutes"
    | "actual_seconds"
    | "tags"
    | "external_link_label"
    | "external_link_url"
    | "one_step_at_a_time"
    | "subtasks_auto_reset"
    | "parent_task_id"
    | "repeat_frequency"
    | "repeat_interval"
    | "repeat_days_of_week"
    | "repeat_day_of_month"
    | "repeat_monthly_mode"
    | "repeat_monthly_ordinal"
    | "repeat_monthly_weekday"
    | "pinned_at"
    | "pin_order"
    | "sort_order"
    | "completed_at"
    | "trashed_at"
  >
>;

export type ActiveTaskTimer = {
  user_id: string;
  task_id: string;
  title_snapshot: string;
  start_time: string | null;
  accumulated_seconds: number;
  started_actual_seconds: number;
  is_running: boolean;
  occurrence_key: string | null;
  occurrence_due_on: string | null;
  created_at: string;
  updated_at: string;
};

export type ActiveTaskTimerInsert = {
  user_id: string;
  task_id: string;
  title_snapshot: string;
  start_time?: string | null;
  accumulated_seconds?: number;
  started_actual_seconds?: number;
  is_running?: boolean;
  occurrence_key?: string | null;
  occurrence_due_on?: string | null;
};

export type ActiveTaskTimerUpdate = Partial<
  Pick<ActiveTaskTimer, "title_snapshot" | "start_time" | "accumulated_seconds" | "started_actual_seconds" | "is_running" | "occurrence_key" | "occurrence_due_on">
>;

export type TaskHistory = {
  id: string;
  task_id: string;
  user_id: string;
  entry_date: string;
  occurrence_key: string | null;
  occurrence_due_on: string | null;
  /** Present only when this read row is projected from canonical History facts. */
  effective_due_on?: string | null;
  status: TaskStatus;
  event_type: TaskHistoryEventType;
  counted_as_due_occurrence: boolean;
  was_completed: boolean;
  created_at: string;
  updated_at: string;
  /** Present only when this read row is projected from canonical History facts. */
  canonical_fact_id?: string;
  canonical_occurrence_id?: string | null;
  canonical_provenance_kind?: string;
  canonical_command_id?: string | null;
  canonical_source?: string;
  /** Internal canonical-read transport only; this is not a persisted database column. */
  recurrence_authoritative?: boolean;
};

export type TaskHistoryEventType = "status" | "completed_permanently";

export type TaskHistoryActionInput = {
  id?: string;
  task_id: string;
  user_id: string;
  entry_date: string;
  occurrence_key?: string | null;
  occurrence_due_on?: string | null;
  status: TaskStatus;
  event_type?: TaskHistoryEventType;
  counted_as_due_occurrence?: boolean;
  was_completed?: boolean;
};

export type MilestoneStatus = "active" | "completed" | "abandoned";
export type MilestoneTier = "bronze" | "silver" | "gold" | "platinum";
export type MilestoneDeadlineKind = "none" | "preferred" | "firm";
export type MilestoneCompletionTiming = "on_time" | "grace_period" | "late";
export type MilestoneAuraKind = "none" | "standard" | "diamond";

export type Milestone = {
  id: string;
  user_id: string;
  task_id: string | null;
  task_title_snapshot: string;
  revision: number;
  status: MilestoneStatus;
  task_trashed_at: string | null;
  last_restored_at: string | null;
  rules_version: string;
  questions_version: string;
  answers_snapshot: Record<string, unknown>;
  recommendation_snapshot: Record<string, unknown>;
  recommended_tier: MilestoneTier;
  recommended_target_date: string;
  allowed_target_date_min: string;
  allowed_target_date_max: string;
  deadline_kind: MilestoneDeadlineKind;
  external_deadline: string | null;
  feasibility_warning: string | null;
  rules_explanation: string;
  initial_locked_tier: MilestoneTier;
  initial_locked_target_date: string;
  initial_aura_deadline: string;
  current_tier: MilestoneTier;
  current_target_date: string;
  current_aura_deadline: string;
  tier_raise_explanation: string | null;
  setup_correction_used: boolean;
  setup_corrected_at: string | null;
  completion_timezone: string;
  completion_timing: MilestoneCompletionTiming | null;
  completion_date_key: string | null;
  pre_completion_task_snapshot: Record<string, unknown> | null;
  trophy_awarded_at: string | null;
  trophy_revoked_at: string | null;
  aura_kind: MilestoneAuraKind | null;
  aura_awarded_at: string | null;
  aura_revoked_at: string | null;
  abandoned_at: string | null;
  abandonment_reason: string | null;
  promoted_at: string;
  locked_at: string;
  completed_at: string | null;
  reversed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MilestoneInsert = Omit<
  Milestone,
  "id" | "revision" | "setup_correction_used" | "promoted_at" | "locked_at" | "created_at" | "updated_at"
> & {
  id?: string;
  revision?: number;
  setup_correction_used?: boolean;
  promoted_at?: string;
  locked_at?: string;
  created_at?: string;
  updated_at?: string;
};

export type MilestoneUpdate = Partial<Omit<Milestone, "id" | "user_id" | "created_at">>;

export type MilestoneTaskMutationResult = {
  canonicalHistoryFactId?: string | null;
  canonicalRewardEntitlementId?: string | null;
  task_row: Task | null;
  milestone_row: Milestone;
  created_transition: boolean;
};

export type MilestoneOnlyMutationResult = {
  milestone_row: Milestone;
  created_transition: boolean;
};

export type MilestoneEventType =
  | "promoted"
  | "recommendation_generated"
  | "locked"
  | "corrected"
  | "tier_raised"
  | "completed_on_time"
  | "completed_grace_period"
  | "completed_late"
  | "award_granted"
  | "award_revoked"
  | "completion_reversed"
  | "abandoned"
  | "task_trashed"
  | "task_restored"
  | "task_deleted_permanently";

export type MilestoneEvent = {
  id: string;
  operation_id: string;
  user_id: string;
  milestone_id: string;
  task_id: string | null;
  event_type: MilestoneEventType;
  previous_state: Record<string, unknown> | null;
  next_state: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
};

export type MilestoneEventInsert = Omit<MilestoneEvent, "id" | "metadata" | "occurred_at" | "created_at"> & {
  id?: string;
  metadata?: Record<string, unknown>;
  occurred_at?: string;
  created_at?: string;
};

export type MilestoneEventUpdate = Record<string, never>;

export type MilestoneReminderKind = "seven_days" | "three_days" | "target_day" | "final_aura_day";
export type MilestoneReminderStatus = "pending" | "delivered" | "dismissed" | "canceled" | "skipped";

export type MilestoneReminder = {
  id: string;
  user_id: string;
  milestone_id: string;
  kind: MilestoneReminderKind;
  schedule_version: number;
  scheduled_date: string;
  status: MilestoneReminderStatus;
  delivered_at: string | null;
  dismissed_at: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MilestoneReminderInsert = Omit<
  MilestoneReminder,
  "id" | "schedule_version" | "status" | "created_at" | "updated_at"
> & {
  id?: string;
  schedule_version?: number;
  status?: MilestoneReminderStatus;
  created_at?: string;
  updated_at?: string;
};

export type MilestoneReminderUpdate = Partial<
  Pick<MilestoneReminder, "status" | "delivered_at" | "dismissed_at" | "canceled_at">
>;

export type UserProfile = {
  user_id: string;
  display_name: string | null;
  avatar_src: string | null;
  logo_src: string | null;
  accent_color: string | null;
  day_start_time: string;
  timezone: string;
  focus_alarm_enabled: boolean;
  focus_alarm_interval_minutes: number;
  level: number;
  low_stim_mode: boolean;
  xp: number;
  points: number;
  theme_preference: "light" | "dark";
  tokens: number;
  free_roll_bank: number;
  created_at: string;
  updated_at: string;
};

export type UserProfileInsert = {
  user_id: string;
  display_name?: string | null;
  avatar_src?: string | null;
  logo_src?: string | null;
  accent_color?: string | null;
  day_start_time?: string;
  timezone?: string;
  focus_alarm_enabled?: boolean;
  focus_alarm_interval_minutes?: number;
  level?: number;
  low_stim_mode?: boolean;
  xp?: number;
  points?: number;
  theme_preference?: "light" | "dark";
  tokens?: number;
  free_roll_bank?: number;
};

export type UserProfileUpdate = Partial<
  Pick<UserProfile, "display_name" | "avatar_src" | "logo_src" | "accent_color" | "day_start_time" | "timezone" | "focus_alarm_enabled" | "focus_alarm_interval_minutes" | "level" | "low_stim_mode" | "xp" | "points" | "theme_preference" | "tokens" | "free_roll_bank">
>;

export type TaskEventType = "completed" | "missed" | "streak_bonus";

export type TaskEvent = {
  id: string;
  user_id: string;
  task_id: string;
  event_type: TaskEventType;
  awarded_points: number;
  awarded_xp: number;
  created_at: string;
};

export type TaskEventInsert = {
  id?: string;
  user_id: string;
  task_id: string;
  event_type: TaskEventType;
  awarded_points?: number;
  awarded_xp?: number;
};

export type PointLedgerSource = "task" | "focus" | "roll" | "manual" | "system" | "health";

export type PointLedgerEntry = {
  id: string;
  user_id: string;
  delta: number;
  reason: string;
  balance_after: number;
  source: PointLedgerSource;
  ref_id: string | null;
  created_at: string;
};

export type PointLedgerInsert = {
  id?: string;
  user_id: string;
  delta: number;
  reason: string;
  balance_after: number;
  source: PointLedgerSource;
  ref_id?: string | null;
};

export type TaskRewardMode = "single" | "batch";

export type TaskRewardRoll = {
  id: string;
  user_id: string;
  reward_date: string;
  mode: TaskRewardMode;
  streak_tier_label: string | null;
  streak_length: number;
  eligible_task_count: number;
  base_rolls: number[];
  base_points: number;
  multiplier_roll: number;
  final_points: number;
  awarded_xp: number;
  awarded_tokens: number;
  created_at: string;
};

export type TaskRewardRollInsert = {
  id?: string;
  user_id: string;
  reward_date: string;
  mode: TaskRewardMode;
  streak_tier_label?: string | null;
  streak_length?: number;
  eligible_task_count: number;
  base_rolls: number[];
  base_points: number;
  multiplier_roll: number;
  final_points: number;
  awarded_xp: number;
  awarded_tokens: number;
};

export type TaskRewardClaim = {
  id: string;
  user_id: string;
  task_id: string;
  reward_roll_id: string;
  reward_date: string;
  awarded_token: boolean;
  created_at: string;
};

export type TaskRewardClaimInsert = {
  id?: string;
  user_id: string;
  task_id: string;
  reward_roll_id: string;
  reward_date: string;
  awarded_token?: boolean;
};

export type PendingRewardDiceAccount = {
  user_id: string;
  pending_dice: number;
  revision: number;
  updated_at: string;
};

export type PendingRewardDiceOperation = {
  id: string;
  user_id: string;
  operation_id: string;
  operation_type: "award" | "claim" | "legacy_migration";
  request_payload: unknown;
  result_payload: unknown;
  created_at: string;
};

export type PendingRewardDiceItem = {
  id: string;
  user_id: string;
  source_operation_id: string;
  source_item_index: number;
  dice_count: number;
  reward_payload: unknown;
  claimed_operation_id: string | null;
  created_at: string;
};

export type FocusCategory = {
  id: string;
  user_id: string;
  title: string;
  focus_type: string;
  focus_subtype: string | null;
  focus_subtype_2: string | null;
  color: string;
  icon: string;
  daily_goal_seconds: number | null;
  weekly_goal_seconds: number | null;
  priority_level: number;
  target_distribution_mode: "auto" | "manual";
  weekday_target_seconds: Record<string, number>;
  count_toward_productive_goal: boolean | null;
  allow_daily_surplus_reduction: boolean | null;
  weekly_surplus_carryover_mode: "off" | "cap25" | "cap50" | "full";
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type FocusCategoryInsert = {
  id?: string;
  user_id: string;
  title: string;
  focus_type: string;
  focus_subtype?: string | null;
  focus_subtype_2?: string | null;
  color: string;
  icon: string;
  daily_goal_seconds?: number | null;
  weekly_goal_seconds?: number | null;
  priority_level?: number;
  target_distribution_mode?: "auto" | "manual";
  weekday_target_seconds?: Record<string, number>;
  count_toward_productive_goal?: boolean | null;
  allow_daily_surplus_reduction?: boolean | null;
  weekly_surplus_carryover_mode?: "off" | "cap25" | "cap50" | "full";
  sort_order?: number;
};

export type FocusCategoryUpdate = Partial<
  Pick<
    FocusCategory,
    "title" | "focus_type" | "focus_subtype" | "focus_subtype_2" | "color" | "icon" | "daily_goal_seconds" | "weekly_goal_seconds" | "priority_level" | "target_distribution_mode" | "weekday_target_seconds" | "count_toward_productive_goal" | "allow_daily_surplus_reduction" | "weekly_surplus_carryover_mode" | "sort_order"
  >
>;

export type FocusDailyGoalAdjustment = {
  id: string;
  user_id: string;
  adjustment_date: string;
  source_category_id: string;
  target_category_id: string;
  source_session_id: string | null;
  reduction_seconds: number;
  reason: string;
  created_at: string;
  updated_at: string;
};

export type FocusDailyGoalAdjustmentInsert = {
  id?: string;
  user_id: string;
  adjustment_date: string;
  source_category_id: string;
  target_category_id: string;
  source_session_id?: string | null;
  reduction_seconds: number;
  reason?: string;
};

export type FocusDailyGoalAdjustmentUpdate = Partial<
  Pick<
    FocusDailyGoalAdjustment,
    "adjustment_date" | "source_category_id" | "target_category_id" | "source_session_id" | "reduction_seconds" | "reason"
  >
>;

export type FocusCounterRow = {
  id: string;
  user_id: string;
  title: string;
  color: string;
  icon: string;
  value: number;
  step: number;
  goal: number;
  sort_order: number;
  revision: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FocusCounterEventRow = {
  id: string;
  operation_id: string;
  user_id: string;
  counter_id: string;
  event_type: "create" | "adjust" | "set_value" | "update" | "delete" | "migrate";
  delta: number | null;
  previous_value: number | null;
  next_value: number | null;
  title_snapshot: string | null;
  step_snapshot: number | null;
  payload: Record<string, unknown> | null;
  client_created_at: string | null;
  created_at: string;
};

export type FocusSession = {
  id: string;
  user_id: string;
  category_id: string | null;
  title_snapshot: string;
  focus_type_snapshot: string;
  focus_subtype_snapshot: string | null;
  focus_subtype_2_snapshot: string | null;
  session_date: string;
  duration_seconds: number;
  notes: string | null;
  started_at: string | null;
  ended_at: string | null;
  source: "timer" | "manual" | "import";
  runtime_session_id: string | null;
  created_at: string;
};

export type FocusSessionInsert = {
  id?: string;
  user_id: string;
  category_id?: string | null;
  title_snapshot: string;
  focus_type_snapshot: string;
  focus_subtype_snapshot?: string | null;
  focus_subtype_2_snapshot?: string | null;
  session_date: string;
  duration_seconds: number;
  notes?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  source?: "timer" | "manual" | "import";
  runtime_session_id?: string | null;
};

export type FocusSessionUpdate = Partial<
  Pick<
    FocusSession,
    "category_id" | "title_snapshot" | "focus_type_snapshot" | "focus_subtype_snapshot" | "focus_subtype_2_snapshot" | "session_date" | "duration_seconds" | "notes" | "started_at" | "ended_at" | "source" | "runtime_session_id"
  >
>;

export type ActiveFocusSession = {
  session_id: string;
  user_id: string;
  runtime_kind: "category" | "standalone_countdown";
  category_id: string | null;
  mode: "count_up" | "countdown";
  mode_authoritative: boolean;
  countdown_target_seconds: number | null;
  state: "running" | "paused";
  current_run_started_at: string | null;
  start_time: string | null;
  accumulated_seconds: number;
  is_running: boolean;
  revision: number;
  closed_at: string | null;
  close_reason: "reset" | "completed" | "stopped" | null;
  created_at: string;
  updated_at: string;
};

export type ActiveFocusSessionInsert = {
  session_id?: string;
  user_id: string;
  runtime_kind?: "category" | "standalone_countdown";
  category_id?: string | null;
  mode?: "count_up" | "countdown";
  mode_authoritative?: boolean;
  countdown_target_seconds?: number | null;
  state?: "running" | "paused";
  current_run_started_at?: string | null;
  start_time?: string | null;
  accumulated_seconds?: number;
  is_running?: boolean;
  revision?: number;
  closed_at?: string | null;
  close_reason?: "reset" | "completed" | "stopped" | null;
};

export type ActiveFocusSessionUpdate = Partial<
  Pick<ActiveFocusSession, "mode" | "mode_authoritative" | "countdown_target_seconds" | "state" | "current_run_started_at" | "start_time" | "accumulated_seconds" | "is_running" | "revision" | "closed_at" | "close_reason">
>;

export type FocusRuntimeOperation = {
  user_id: string;
  operation_id: string;
  operation_kind: string;
  runtime_session_id: string | null;
  result_payload: unknown;
  created_at: string;
};

export type RollHistoryEntry = {
  id: string;
  user_id: string;
  operation_id: string | null;
  reward_applied: boolean;
  reward_free_rolls: number;
  reward_tokens: number;
  roll_result: number;
  points_spent: number;
  prize_label: string | null;
  rolled_at: string;
};

export type RollHistoryInsert = {
  id?: string;
  user_id: string;
  operation_id?: string | null;
  reward_applied?: boolean;
  reward_free_rolls?: number;
  reward_tokens?: number;
  roll_result: number;
  points_spent?: number;
  prize_label?: string | null;
};

export type RollRewardPoolTier = "small" | "big";

export type RollPrizeBasketTier = "small" | "big" | "master";

export type RollPrizeBasketEntry = {
  id: string;
  user_id: string;
  prize_name: string;
  prize_tier: RollPrizeBasketTier;
  quantity: number;
  source_label: string | null;
  roll_result: number | null;
  is_claimed: boolean;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RollPrizeBasketEntryInsert = {
  id?: string;
  user_id: string;
  prize_name: string;
  prize_tier: RollPrizeBasketTier;
  quantity?: number;
  source_label?: string | null;
  roll_result?: number | null;
  is_claimed?: boolean;
};

export type RollPrizeBasketEntryUpdate = Partial<
  Pick<RollPrizeBasketEntry, "claimed_at" | "is_claimed" | "prize_name" | "prize_tier" | "quantity" | "roll_result" | "source_label">
>;

export type RollRewardPoolPrize = {
  id: string;
  user_id: string;
  tier: RollRewardPoolTier;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type RollRewardPoolPrizeInsert = {
  id?: string;
  user_id: string;
  tier?: RollRewardPoolTier;
  name: string;
  sort_order?: number;
};

export type RollRewardPoolPrizeUpdate = Partial<
  Pick<RollRewardPoolPrize, "name" | "sort_order" | "tier">
>;

export type RollDailyBoardAssignmentTier = "small" | "big" | "master";

export type RollDailyBoardAssignment = {
  cell_number: number;
  prize_tier: RollDailyBoardAssignmentTier;
  prize_id: string;
};

export type RollDailyBoard = {
  id: string;
  user_id: string;
  board_date: string;
  assignments_json: string;
  claimed_prize_keys: string[];
  created_at: string;
  updated_at: string;
};

export type RollDailyBoardInsert = {
  id?: string;
  user_id: string;
  board_date: string;
  assignments_json: string;
  claimed_prize_keys?: string[];
};

export type RollDailyBoardUpdate = Partial<
  Pick<RollDailyBoard, "assignments_json" | "claimed_prize_keys">
>;

export type VaultPrizeTier = "small" | "big" | "master";

export type VaultPrize = {
  id: string;
  user_id: string;
  name: string;
  tier: VaultPrizeTier;
  token_cost: number;
  linked_task_ids: string[];
  is_claimed: boolean;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VaultPrizeInsert = {
  id?: string;
  user_id: string;
  name: string;
  tier?: VaultPrizeTier;
  token_cost?: number;
  linked_task_ids?: string[];
  is_claimed?: boolean;
};

export type VaultPrizeUpdate = Partial<Pick<VaultPrize, "name" | "tier" | "token_cost" | "linked_task_ids" | "is_claimed" | "claimed_at">>;

export type Note = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  tags: string[];
  linked_task_ids: string[];
  created_at: string;
  updated_at: string;
};

export type NoteInsert = {
  id?: string;
  user_id: string;
  title?: string;
  body?: string;
  tags?: string[];
  linked_task_ids?: string[];
};

export type NoteUpdate = Partial<Pick<Note, "title" | "body" | "tags" | "linked_task_ids">>;

export type ScratchNoteStatus = "active" | "resolved" | "trashed";

export type ScratchNote = {
  id: string;
  user_id: string;
  title: string | null;
  body: string;
  status: ScratchNoteStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  trashed_at: string | null;
};

export type ScratchNoteInsert = {
  id?: string;
  user_id: string;
  title?: string | null;
  body?: string;
  status?: ScratchNoteStatus;
};

export type ScratchNoteUpdate = Partial<Pick<ScratchNote, "title" | "body" | "status" | "resolved_at" | "trashed_at" | "updated_at">>;

export type ScratchNoteTaskLink = {
  id: string;
  note_id: string;
  task_id: string;
  user_id: string;
  created_at: string;
};

export type ScratchNoteTaskLinkInsert = {
  id?: string;
  note_id: string;
  task_id: string;
  user_id: string;
};

export type ScratchNoteTaskLinkUpdate = Record<string, never>;

export type HealthWeightUnit = "lb" | "kg";
export type HealthMetricType = "steps" | "active_energy_kcal" | "exercise_minutes" | "sleep_minutes" | "body_mass_kg";
export type HealthMetricSource = "apple_health_import" | "manual";
export type HealthWeightSource = "manual" | "apple_health_import";
export type HealthMealSlot = "breakfast" | "lunch" | "dinner" | "snack";
export type HealthAchievementCode =
  | "first_check_in"
  | "seven_gentle_days"
  | "nourishment_notes"
  | "scale_awareness"
  | "connected_care"
  | "rest_noticed"
  | "motion_noticed"
  | "care_week"
  | "care_month";

/**
 * Additional Nutrition Facts values. The four primary macros remain the
 * canonical top-level fields on foods and meal snapshots.
 *
 * Optional properties preserve the distinction between an unknown nutrient
 * and a provider/manual value of zero.
 */
export type HealthNutritionDetails = {
  saturated_fat_g?: number | null;
  trans_fat_g?: number | null;
  monounsaturated_fat_g?: number | null;
  polyunsaturated_fat_g?: number | null;
  cholesterol_mg?: number | null;
  sodium_mg?: number | null;
  dietary_fiber_g?: number | null;
  soluble_fiber_g?: number | null;
  insoluble_fiber_g?: number | null;
  total_sugars_g?: number | null;
  added_sugars_g?: number | null;
  sugar_alcohol_g?: number | null;
  vitamin_a_mcg_rae?: number | null;
  vitamin_c_mg?: number | null;
  vitamin_d_mcg?: number | null;
  vitamin_e_mg?: number | null;
  vitamin_k_mcg?: number | null;
  thiamin_b1_mg?: number | null;
  riboflavin_b2_mg?: number | null;
  niacin_b3_mg?: number | null;
  pantothenic_acid_b5_mg?: number | null;
  vitamin_b6_mg?: number | null;
  biotin_b7_mcg?: number | null;
  folate_b9_mcg_dfe?: number | null;
  vitamin_b12_mcg?: number | null;
  choline_mg?: number | null;
  calcium_mg?: number | null;
  iron_mg?: number | null;
  magnesium_mg?: number | null;
  phosphorus_mg?: number | null;
  potassium_mg?: number | null;
  zinc_mg?: number | null;
  copper_mg?: number | null;
  manganese_mg?: number | null;
  selenium_mcg?: number | null;
  iodine_mcg?: number | null;
  chromium_mcg?: number | null;
  molybdenum_mcg?: number | null;
  chloride_mg?: number | null;
  caffeine_mg?: number | null;
  omega_3_g?: number | null;
  omega_6_g?: number | null;
};

export type HealthNutritionDetailKey = keyof HealthNutritionDetails;

export type HealthProfile = {
  user_id: string;
  preferred_weight_unit: HealthWeightUnit;
  calorie_goal: number | null;
  protein_goal_grams: number | null;
  carbs_goal_grams: number | null;
  fat_goal_grams: number | null;
  movement_goal: number | null;
  movement_goal_calories: number | null;
  movement_goal_minutes: number | null;
  sleep_goal_minutes: number | null;
  target_weight_kg: number | null;
  workout_type_options: string[];
  workout_title_options: string[];
  created_at: string;
  updated_at: string;
};

export type HealthProfileInsert = {
  user_id: string;
  preferred_weight_unit?: HealthWeightUnit;
  calorie_goal?: number | null;
  protein_goal_grams?: number | null;
  carbs_goal_grams?: number | null;
  fat_goal_grams?: number | null;
  movement_goal?: number | null;
  movement_goal_calories?: number | null;
  movement_goal_minutes?: number | null;
  sleep_goal_minutes?: number | null;
  target_weight_kg?: number | null;
  workout_type_options?: string[];
  workout_title_options?: string[];
};

export type HealthProfileUpdate = Partial<
  Pick<
    HealthProfile,
    | "preferred_weight_unit"
    | "calorie_goal"
    | "protein_goal_grams"
    | "carbs_goal_grams"
    | "fat_goal_grams"
    | "movement_goal"
    | "movement_goal_calories"
    | "movement_goal_minutes"
    | "sleep_goal_minutes"
    | "target_weight_kg"
    | "workout_type_options"
    | "workout_title_options"
  >
>;

export type HealthCheckIn = {
  id: string;
  user_id: string;
  entry_date: string;
  mood_score: number | null;
  energy_score: number | null;
  symptom_tags: string[];
  reflection: string;
  created_at: string;
  updated_at: string;
};

export type HealthCheckInInsert = {
  id?: string;
  user_id: string;
  entry_date: string;
  mood_score?: number | null;
  energy_score?: number | null;
  symptom_tags?: string[];
  reflection?: string;
};

export type HealthCheckInUpdate = Partial<
  Pick<HealthCheckIn, "mood_score" | "energy_score" | "symptom_tags" | "reflection">
>;

export type HealthSymptom = {
  id: string;
  user_id: string;
  name: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type HealthSymptomInsert = {
  id?: string;
  user_id: string;
  name: string;
  archived_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type HealthSymptomUpdate = Partial<Pick<HealthSymptom, "name" | "archived_at">>;

export type HealthSymptomEntry = {
  id: string;
  user_id: string;
  symptom_id: string;
  entry_date: string;
  logged_at: string;
  severity: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type HealthSymptomEntryInsert = {
  id?: string;
  user_id: string;
  symptom_id: string;
  entry_date: string;
  logged_at?: string;
  severity: number;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type HealthSymptomEntryUpdate = Partial<
  Pick<HealthSymptomEntry, "symptom_id" | "entry_date" | "logged_at" | "severity" | "note">
>;

export type HealthFoodLibraryItem = {
  id: string;
  user_id: string;
  food_name: string;
  brand_name: string | null;
  category: string | null;
  food_category: string;
  serving_label: string | null;
  serving_size: string | null;
  serving_quantity: number;
  serving_unit: string;
  serving_measure_value: number | null;
  serving_measure_unit: HealthServingMeasureUnit | null;
  serving_weight_amount: number | null;
  serving_weight_unit: HealthServingWeightUnit | null;
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  nutrition_details?: HealthNutritionDetails | null;
  barcode: string | null;
  provider: string;
  provider_item_id: string | null;
  attribution: string | null;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
};

export type HealthFoodLibraryItemInsert = {
  id?: string;
  user_id: string;
  food_name: string;
  brand_name?: string | null;
  category?: string | null;
  food_category?: string | null;
  serving_label?: string | null;
  serving_size?: string | null;
  serving_quantity?: number;
  serving_unit?: string;
  serving_measure_value?: number | null;
  serving_measure_unit?: HealthServingMeasureUnit | null;
  serving_weight_amount?: number | null;
  serving_weight_unit?: HealthServingWeightUnit | null;
  calories: number;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  nutrition_details?: HealthNutritionDetails | null;
  barcode?: string | null;
  provider?: string;
  provider_item_id?: string | null;
  attribution?: string | null;
  is_favorite?: boolean;
};

export type HealthFoodLibraryItemUpdate = Partial<
  Pick<
    HealthFoodLibraryItem,
    | "food_name"
    | "brand_name"
    | "category"
    | "food_category"
    | "serving_label"
    | "serving_size"
    | "serving_quantity"
    | "serving_unit"
    | "serving_measure_value"
    | "serving_measure_unit"
    | "serving_weight_amount"
    | "serving_weight_unit"
    | "calories"
    | "protein_g"
    | "carbs_g"
    | "fat_g"
    | "nutrition_details"
    | "barcode"
    | "provider"
    | "provider_item_id"
    | "attribution"
    | "is_favorite"
  >
>;

export type HealthRecipeIngredient = {
  food_id: string | null;
  food_name: string;
  serving_label: string | null;
  quantity: number;
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  nutrition_details?: HealthNutritionDetails | null;
};

export type HealthRecipe = {
  id: string;
  user_id: string;
  name: string;
  notes: string;
  servings: number;
  ingredients: HealthRecipeIngredient[];
  created_at: string;
  updated_at: string;
};

export type HealthRecipeInsert = {
  id?: string;
  user_id: string;
  name: string;
  notes?: string;
  servings: number;
  ingredients: HealthRecipeIngredient[];
};

export type HealthRecipeUpdate = Partial<
  Pick<HealthRecipe, "name" | "notes" | "servings" | "ingredients">
>;

export type HealthSavedMealItem = {
  source_id: string | null;
  source_type: "food" | "recipe";
  name: string;
  serving_label: string | null;
  quantity: number;
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  nutrition_details?: HealthNutritionDetails | null;
};

export type HealthSavedMeal = {
  id: string;
  user_id: string;
  name: string;
  default_meal_slot: HealthMealSlot;
  items: HealthSavedMealItem[];
  created_at: string;
  updated_at: string;
};

export type HealthSavedMealInsert = {
  id?: string;
  user_id: string;
  name: string;
  default_meal_slot: HealthMealSlot;
  items: HealthSavedMealItem[];
};

export type HealthSavedMealUpdate = Partial<
  Pick<HealthSavedMeal, "name" | "default_meal_slot" | "items">
>;

export type HealthWaterUnit = "cup" | "fl_oz";
export type HealthServingMeasureUnit = "g" | "oz" | "ml" | "fl_oz";
export type HealthServingWeightUnit = "g" | "oz" | "fl_oz";

export type HealthWaterEntry = {
  id: string;
  user_id: string;
  entry_date: string;
  logged_at: string;
  amount: number;
  unit: HealthWaterUnit;
  amount_ml: number;
  created_at: string;
};

export type HealthWaterEntryInsert = {
  id?: string;
  user_id: string;
  entry_date: string;
  logged_at?: string;
  amount: number;
  unit: HealthWaterUnit;
  amount_ml: number;
};

export type HealthWaterEntryUpdate = Partial<
  Pick<HealthWaterEntry, "entry_date" | "logged_at" | "amount" | "unit" | "amount_ml">
>;

export type HealthMealEntry = {
  id: string;
  user_id: string;
  entry_date: string;
  meal_slot: HealthMealSlot;
  logged_at: string;
  food_name: string;
  brand_name: string | null;
  serving_label: string | null;
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  barcode: string | null;
  provider: string;
  provider_item_id: string | null;
  attribution: string | null;
  source_food_id?: string | null;
  consumed_quantity?: number | null;
  consumed_unit?: string | null;
  serving_fraction?: number | null;
  food_snapshot?: HealthMealFoodSnapshot | null;
  nutrition_snapshot?: HealthMealNutritionSnapshot | null;
  created_at: string;
  updated_at: string;
};

export type HealthMealFoodSnapshot = {
  source_food_id: string | null;
  food_name: string;
  brand_name: string | null;
  food_category: string | null;
  serving_label: string | null;
  serving_quantity: number;
  serving_unit: string;
  serving_measure_value: number | null;
  serving_measure_unit: HealthServingMeasureUnit | null;
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  nutrition_details?: HealthNutritionDetails | null;
  barcode: string | null;
  provider: string;
  provider_item_id: string | null;
  attribution: string | null;
};

export type HealthMealNutritionSnapshot = {
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  nutrition_details?: HealthNutritionDetails | null;
};

export type HealthMealEntryInsert = {
  id?: string;
  user_id: string;
  entry_date: string;
  meal_slot: HealthMealSlot;
  logged_at?: string;
  food_name: string;
  brand_name?: string | null;
  serving_label?: string | null;
  calories: number;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  barcode?: string | null;
  provider?: string;
  provider_item_id?: string | null;
  attribution?: string | null;
  source_food_id?: string | null;
  consumed_quantity?: number | null;
  consumed_unit?: string | null;
  serving_fraction?: number | null;
  food_snapshot?: HealthMealFoodSnapshot | null;
  nutrition_snapshot?: HealthMealNutritionSnapshot | null;
};

export type HealthMealEntryUpdate = Partial<
  Pick<
    HealthMealEntry,
    | "entry_date"
    | "meal_slot"
    | "logged_at"
    | "food_name"
    | "brand_name"
    | "serving_label"
    | "calories"
    | "protein_g"
    | "carbs_g"
    | "fat_g"
    | "barcode"
    | "provider"
    | "provider_item_id"
    | "attribution"
    | "source_food_id"
    | "consumed_quantity"
    | "consumed_unit"
    | "serving_fraction"
    | "food_snapshot"
    | "nutrition_snapshot"
  >
>;

export type HealthMealPlanEntry = {
  id: string;
  user_id: string;
  planned_date: string;
  meal_slot: HealthMealSlot;
  planned_time: string;
  planned_at: string;
  food_name: string;
  brand_name: string | null;
  serving_label: string | null;
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  barcode: string | null;
  provider: string;
  provider_item_id: string | null;
  attribution: string | null;
  source_food_id?: string | null;
  consumed_quantity?: number | null;
  consumed_unit?: string | null;
  serving_fraction?: number | null;
  food_snapshot?: HealthMealFoodSnapshot | null;
  nutrition_snapshot?: HealthMealNutritionSnapshot | null;
  confirmed_at: string | null;
  confirmed_meal_entry_id: string | null;
  created_at: string;
  updated_at: string;
};

export type HealthMealPlanEntryInsert = {
  id?: string;
  user_id: string;
  planned_date: string;
  meal_slot: HealthMealSlot;
  planned_time: string;
  planned_at: string;
  food_name: string;
  brand_name?: string | null;
  serving_label?: string | null;
  calories: number;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  barcode?: string | null;
  provider?: string;
  provider_item_id?: string | null;
  attribution?: string | null;
  source_food_id?: string | null;
  consumed_quantity?: number | null;
  consumed_unit?: string | null;
  serving_fraction?: number | null;
  food_snapshot?: HealthMealFoodSnapshot | null;
  nutrition_snapshot?: HealthMealNutritionSnapshot | null;
};

export type HealthMealPlanEntryUpdate = Partial<
  Pick<
    HealthMealPlanEntry,
    | "planned_date"
    | "meal_slot"
    | "planned_time"
    | "planned_at"
    | "food_name"
    | "brand_name"
    | "serving_label"
    | "calories"
    | "protein_g"
    | "carbs_g"
    | "fat_g"
    | "barcode"
    | "provider"
    | "provider_item_id"
    | "attribution"
    | "source_food_id"
    | "consumed_quantity"
    | "consumed_unit"
    | "serving_fraction"
    | "food_snapshot"
    | "nutrition_snapshot"
  >
>;

export type HealthWeightEntry = {
  id: string;
  user_id: string;
  entry_date: string;
  logged_at: string;
  weight_kg: number;
  source: HealthWeightSource;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type HealthWeightEntryInsert = {
  id?: string;
  user_id: string;
  entry_date: string;
  logged_at?: string;
  weight_kg: number;
  source?: HealthWeightSource;
  note?: string | null;
};

export type HealthWeightEntryUpdate = Partial<
  Pick<HealthWeightEntry, "entry_date" | "logged_at" | "weight_kg" | "source" | "note">
>;

export type HealthMetricEntry = {
  id: string;
  user_id: string;
  metric_type: HealthMetricType;
  metric_date: string;
  metric_value: number;
  source: HealthMetricSource;
  source_fingerprint: string;
  created_at: string;
  updated_at: string;
};

export type HealthMetricEntryInsert = {
  id?: string;
  user_id: string;
  metric_type: HealthMetricType;
  metric_date: string;
  metric_value: number;
  source?: HealthMetricSource;
  source_fingerprint: string;
};

export type HealthMetricEntryUpdate = Partial<
  Pick<HealthMetricEntry, "metric_value" | "source" | "source_fingerprint">
>;

export type HealthWorkout = {
  id: string;
  user_id: string;
  workout_date: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number;
  title: string;
  workout_type: string;
  active_calories: number | null;
  notes: string;
  source: string;
  source_external_id: string | null;
  created_at: string;
  updated_at: string;
};

export type HealthWorkoutInsert = {
  id?: string;
  user_id: string;
  workout_date: string;
  started_at?: string | null;
  ended_at?: string | null;
  duration_seconds: number;
  title: string;
  workout_type: string;
  active_calories?: number | null;
  notes?: string;
  source?: string;
  source_external_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type HealthWorkoutUpdate = Partial<
  Pick<HealthWorkout, "workout_date" | "started_at" | "ended_at" | "duration_seconds" | "title" | "workout_type" | "active_calories" | "notes">
>;

export type HealthFitnessMeasurement = "reps" | "duration";
export type HealthFitnessPerformanceMetric =
  | "single_set_reps"
  | "session_total_reps"
  | "longest_set_duration"
  | "session_total_duration";

export type HealthExercise = {
  id: string;
  user_id: string;
  name: string;
  default_measurement: HealthFitnessMeasurement;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type HealthExerciseInsert = {
  id?: string;
  user_id: string;
  name: string;
  default_measurement: HealthFitnessMeasurement;
  sort_order?: number;
  archived_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type HealthExerciseUpdate = Partial<Pick<HealthExercise, "name" | "sort_order" | "archived_at">>;

export type HealthWorkoutExercise = {
  id: string;
  user_id: string;
  workout_id: string;
  exercise_id: string;
  exercise_name: string;
  measurement_type: HealthFitnessMeasurement;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type HealthWorkoutExerciseInsert = {
  id?: string;
  user_id: string;
  workout_id: string;
  exercise_id: string;
  exercise_name: string;
  measurement_type: HealthFitnessMeasurement;
  sort_order?: number;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type HealthWorkoutExerciseUpdate = Partial<Pick<HealthWorkoutExercise, "exercise_id" | "exercise_name" | "measurement_type" | "sort_order" | "notes">>;

export type HealthWorkoutSet = {
  id: string;
  user_id: string;
  workout_exercise_id: string;
  sort_order: number;
  reps: number | null;
  duration_seconds: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type HealthWorkoutSetInsert = {
  id?: string;
  user_id: string;
  workout_exercise_id: string;
  sort_order?: number;
  reps?: number | null;
  duration_seconds?: number | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type HealthWorkoutSetUpdate = Partial<Pick<HealthWorkoutSet, "sort_order" | "reps" | "duration_seconds" | "notes">>;

export type HealthFitnessPlan = {
  id: string;
  user_id: string;
  name: string;
  starts_on: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type HealthFitnessPlanInsert = {
  id?: string;
  user_id: string;
  name: string;
  starts_on: string;
  archived_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type HealthFitnessPlanUpdate = Partial<Pick<HealthFitnessPlan, "name" | "starts_on" | "archived_at">>;

export type HealthFitnessPlanItem = {
  id: string;
  user_id: string;
  plan_id: string;
  day_of_week: number;
  workout_type: string;
  title: string | null;
  expected_duration_seconds: number | null;
  notes: string | null;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type HealthFitnessPlanItemInsert = {
  id?: string;
  user_id: string;
  plan_id: string;
  day_of_week: number;
  workout_type: string;
  title?: string | null;
  expected_duration_seconds?: number | null;
  notes?: string | null;
  sort_order?: number;
  archived_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type HealthFitnessPlanItemUpdate = Partial<Pick<HealthFitnessPlanItem, "day_of_week" | "workout_type" | "title" | "expected_duration_seconds" | "notes" | "sort_order" | "archived_at">>;

export type HealthWorkoutPlanItemLink = {
  id: string;
  user_id: string;
  workout_id: string;
  plan_item_id: string;
  created_at: string;
};

export type HealthWorkoutPlanItemLinkInsert = {
  id?: string;
  user_id: string;
  workout_id: string;
  plan_item_id: string;
  created_at?: string;
};

export type HealthWorkoutPlanItemLinkUpdate = Record<string, never>;

export type HealthFitnessGoal = {
  id: string;
  user_id: string;
  exercise_id: string;
  metric: HealthFitnessPerformanceMetric;
  title: string;
  target: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type HealthFitnessGoalInsert = {
  id?: string;
  user_id: string;
  exercise_id: string;
  metric: HealthFitnessPerformanceMetric;
  title: string;
  target: number;
  archived_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type HealthFitnessGoalUpdate = Partial<Pick<HealthFitnessGoal, "exercise_id" | "metric" | "title" | "target" | "archived_at">>;

export type HealthFitnessGoalLevel = {
  id: string;
  user_id: string;
  goal_id: string;
  label: string;
  target: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type HealthFitnessGoalLevelInsert = {
  id?: string;
  user_id: string;
  goal_id: string;
  label: string;
  target: number;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
};

export type HealthFitnessGoalLevelUpdate = Partial<Pick<HealthFitnessGoalLevel, "label" | "target" | "sort_order">>;

export type HealthImportAudit = {
  id: string;
  user_id: string;
  source: string;
  imported_count: number;
  duplicate_count: number;
  skipped_count: number;
  import_start_date: string | null;
  import_end_date: string | null;
  summary_text: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

export type HealthImportAuditInsert = {
  id?: string;
  user_id: string;
  source: string;
  imported_count?: number;
  duplicate_count?: number;
  skipped_count?: number;
  import_start_date?: string | null;
  import_end_date?: string | null;
  summary_text?: string | null;
  started_at?: string;
  completed_at?: string | null;
};

export type HealthImportAuditUpdate = Partial<
  Pick<
    HealthImportAudit,
    | "source"
    | "imported_count"
    | "duplicate_count"
    | "skipped_count"
    | "import_start_date"
    | "import_end_date"
    | "summary_text"
    | "started_at"
    | "completed_at"
  >
>;

export type HealthAchievementAward = {
  id: string;
  user_id: string;
  achievement_code: HealthAchievementCode;
  title: string;
  description: string;
  awarded_points: number;
  awarded_xp: number;
  awarded_tokens: number;
  earned_at: string;
  created_at: string;
};

export type HealthAchievementAwardInsert = {
  id?: string;
  user_id: string;
  achievement_code: HealthAchievementCode;
  title: string;
  description: string;
  awarded_points?: number;
  awarded_xp?: number;
  awarded_tokens?: number;
  earned_at?: string;
};

export type HealthAchievementAwardUpdate = Record<string, never>;

export type AchievementProfile = {
  user_id: string;
  activation_operation_id: string;
  activated_at: string;
  catalog_version: string;
  rules_version: string;
  launch_mastery_version: string;
  timezone: string;
  logical_day_start: string;
  created_at: string;
  updated_at: string;
};

export type AchievementProfileInsert = Omit<AchievementProfile, "created_at" | "updated_at"> & {
  created_at?: string;
  updated_at?: string;
};
export type AchievementProfileUpdate = Record<string, never>;

export type AchievementOccurrence = {
  id: string;
  user_id: string;
  source_kind: "task_history" | "focus_session" | "step_set";
  source_id: string;
  source_occurrence_key: string;
  dedupe_key: string;
  source_created_at: string | null;
  first_qualified_at: string;
  logical_date: string;
  week_key: string;
  week_start_date: string;
  week_end_date: string;
  month_key: string;
  month_start_date: string;
  month_end_date: string;
  timezone: string;
  logical_day_start: string;
  entity_kind: "parent_task" | "step" | "focus_session" | "parent_step_set";
  entity_id: string | null;
  root_parent_id: string | null;
  title_snapshot: string | null;
  outcome_snapshot: "done" | "complete" | "did_my_best" | null;
  active_duration_seconds: number | null;
  is_currently_qualifying: boolean;
  source_snapshot: Record<string, unknown>;
  evaluator_version: string;
  catalog_version: string;
  created_at: string;
};

export type AchievementOccurrenceInsert = Omit<AchievementOccurrence, "created_at" | "id" | "is_currently_qualifying" | "source_created_at" | "source_snapshot"> & {
  created_at?: string;
  id?: string;
  is_currently_qualifying?: boolean;
  source_created_at?: string | null;
  source_snapshot?: Record<string, unknown>;
};
export type AchievementOccurrenceUpdate = Record<string, never>;

export type AchievementOccurrenceMatch = {
  id: string;
  user_id: string;
  occurrence_id: string;
  track_id: string;
  catalog_version: string;
  matched_at: string;
};

export type AchievementOccurrenceMatchInsert = Omit<AchievementOccurrenceMatch, "id" | "matched_at"> & {
  id?: string;
  matched_at?: string;
};
export type AchievementOccurrenceMatchUpdate = Record<string, never>;

export type AchievementProgress = {
  id: string;
  user_id: string;
  track_id: string;
  current_value: number;
  current_streak: number;
  best_streak: number;
  current_streak_start: string | null;
  current_streak_end: string | null;
  best_streak_start: string | null;
  best_streak_end: string | null;
  source_watermark: Record<string, unknown>;
  recalculation_metadata: Record<string, unknown>;
  evaluator_version: string;
  catalog_version: string;
  last_recalculated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AchievementProgressInsert = Omit<AchievementProgress, "created_at" | "id" | "updated_at"> & {
  created_at?: string;
  id?: string;
  updated_at?: string;
};
export type AchievementProgressUpdate = Partial<Omit<AchievementProgress, "id" | "user_id" | "track_id" | "created_at">>;

export type AchievementEvaluationRun = {
  id: string;
  operation_id: string;
  user_id: string;
  mode: "immediate" | "recalculation";
  status: "running" | "completed" | "failed";
  catalog_version: string;
  rules_version: string;
  cursor_metadata: Record<string, unknown>;
  window_metadata: Record<string, unknown>;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

export type AchievementEvaluationRunInsert = Omit<AchievementEvaluationRun, "created_at" | "id" | "started_at"> & {
  created_at?: string;
  id?: string;
  started_at?: string;
};
export type AchievementEvaluationRunUpdate = Partial<Pick<AchievementEvaluationRun, "completed_at" | "cursor_metadata" | "error_code" | "error_message" | "status" | "window_metadata">>;

export type AchievementTierAward = {
  id: string;
  user_id: string;
  track_id: string;
  tier: "bronze" | "silver" | "gold" | "platinum";
  award_key: string;
  earned_at: string;
  triggering_occurrence_id: string | null;
  evaluation_run_id: string | null;
  evaluator_version: string;
  catalog_version: string;
  created_at: string;
};

export type AchievementTierAwardInsert = Omit<AchievementTierAward, "created_at" | "id"> & {
  created_at?: string;
  id?: string;
};
export type AchievementTierAwardUpdate = Record<string, never>;

export type AchievementCollectionAward = {
  id: string;
  user_id: string;
  collection_id: string;
  mastery_version: string;
  catalog_version: string;
  award_key: string;
  required_track_ids_snapshot: string[];
  required_tracks_fingerprint: string;
  earned_at: string;
  evaluation_run_id: string | null;
  created_at: string;
};

export type AchievementCollectionAwardInsert = Omit<AchievementCollectionAward, "created_at" | "id"> & {
  created_at?: string;
  id?: string;
};
export type AchievementCollectionAwardUpdate = Record<string, never>;

export type AchievementNotification = {
  id: string;
  user_id: string;
  award_kind: "tier" | "collection";
  tier_award_id: string | null;
  collection_award_id: string | null;
  dedupe_key: string;
  status: "pending" | "delivered" | "seen";
  created_at: string;
  delivered_at: string | null;
  seen_at: string | null;
};

export type AchievementNotificationInsert = Omit<AchievementNotification, "created_at" | "id" | "status"> & {
  created_at?: string;
  id?: string;
  status?: AchievementNotification["status"];
};
export type AchievementNotificationUpdate = Partial<Pick<AchievementNotification, "delivered_at" | "seen_at" | "status">>;

export type Database = {
  public: {
    Tables: {
      adhdice_clean_tasks: {
        Row: Task & CanonicalTaskStateColumns;
        Insert: TaskInsert;
        Update: TaskUpdate;
        Relationships: [];
      };
      adhdice_task_command_operations: {
        Row: CanonicalTaskCommandOperation;
        Insert: Partial<CanonicalTaskCommandOperation>;
        Update: Partial<CanonicalTaskCommandOperation>;
        Relationships: [];
      };
      adhdice_task_schedule_boundaries: {
        Row: CanonicalTaskScheduleBoundary;
        Insert: Partial<CanonicalTaskScheduleBoundary>;
        Update: Partial<CanonicalTaskScheduleBoundary>;
        Relationships: [];
      };
      adhdice_task_occurrences: {
        Row: CanonicalTaskOccurrence;
        Insert: Partial<CanonicalTaskOccurrence>;
        Update: Partial<CanonicalTaskOccurrence>;
        Relationships: [];
      };
      adhdice_task_occurrence_effective_overrides: {
        Row: CanonicalTaskOccurrenceEffectiveOverride;
        Insert: Partial<CanonicalTaskOccurrenceEffectiveOverride>;
        Update: Partial<CanonicalTaskOccurrenceEffectiveOverride>;
        Relationships: [];
      };
      adhdice_task_history_facts: {
        Row: CanonicalTaskHistoryFact;
        Insert: Partial<CanonicalTaskHistoryFact>;
        Update: Partial<CanonicalTaskHistoryFact>;
        Relationships: [];
      };
      adhdice_task_calendar_overrides: {
        Row: CanonicalTaskCalendarOverride;
        Insert: Partial<CanonicalTaskCalendarOverride>;
        Update: Partial<CanonicalTaskCalendarOverride>;
        Relationships: [];
      };
      adhdice_task_reward_entitlements: {
        Row: CanonicalTaskRewardEntitlement;
        Insert: Partial<CanonicalTaskRewardEntitlement>;
        Update: Partial<CanonicalTaskRewardEntitlement>;
        Relationships: [];
      };
      adhdice_task_reward_grants: {
        Row: CanonicalTaskRewardGrant;
        Insert: Partial<CanonicalTaskRewardGrant>;
        Update: Partial<CanonicalTaskRewardGrant>;
        Relationships: [];
      };
      adhdice_task_reward_claim_consumptions: {
        Row: CanonicalTaskRewardClaimConsumption;
        Insert: Partial<CanonicalTaskRewardClaimConsumption>;
        Update: Partial<CanonicalTaskRewardClaimConsumption>;
        Relationships: [];
      };
      adhdice_record_current: {
        Row: PersistedRecordCurrent;
        Insert: Omit<PersistedRecordCurrent, "created_at" | "id" | "updated_at"> & Partial<Pick<PersistedRecordCurrent, "created_at" | "id" | "updated_at">>;
        Update: Partial<PersistedRecordCurrent>;
        Relationships: [];
      };
      adhdice_record_events: {
        Row: PersistedRecordEvent;
        Insert: Omit<PersistedRecordEvent, "created_at" | "id" | "updated_at"> & Partial<Pick<PersistedRecordEvent, "created_at" | "id" | "updated_at">>;
        Update: Partial<PersistedRecordEvent>;
        Relationships: [];
      };
      adhdice_record_reconcile_runs: {
        Row: RecordReconcileRun;
        Insert: Omit<RecordReconcileRun, "completed_at" | "created_at" | "expires_at" | "id" | "status" | "updated_at"> & Partial<Pick<RecordReconcileRun, "completed_at" | "created_at" | "expires_at" | "id" | "status" | "updated_at">>;
        Update: Partial<RecordReconcileRun>;
        Relationships: [];
      };
      adhdice_record_reconcile_chunks: {
        Row: RecordReconcileChunk;
        Insert: Omit<RecordReconcileChunk, "received_at"> & Partial<Pick<RecordReconcileChunk, "received_at">>;
        Update: Partial<RecordReconcileChunk>;
        Relationships: [];
      };
      adhdice_record_current_stage: {
        Row: RecordCurrentStage;
        Insert: RecordCurrentStage;
        Update: Partial<RecordCurrentStage>;
        Relationships: [];
      };
      adhdice_record_event_stage: {
        Row: RecordEventStage;
        Insert: RecordEventStage;
        Update: Partial<RecordEventStage>;
        Relationships: [];
      };
      adhdice_milestones: {
        Row: Milestone;
        Insert: MilestoneInsert;
        Update: MilestoneUpdate;
        Relationships: [];
      };
      adhdice_milestone_events: {
        Row: MilestoneEvent;
        Insert: MilestoneEventInsert;
        Update: MilestoneEventUpdate;
        Relationships: [];
      };
      adhdice_milestone_reminders: {
        Row: MilestoneReminder;
        Insert: MilestoneReminderInsert;
        Update: MilestoneReminderUpdate;
        Relationships: [];
      };
      adhdice_task_focus_days: {
        Row: TaskFocusDay;
        Insert: TaskFocusDayInsert;
        Update: TaskFocusDayUpdate;
        Relationships: [];
      };
      adhdice_task_lists: {
        Row: TaskList;
        Insert: TaskListInsert;
        Update: TaskListUpdate;
        Relationships: [];
      };
      adhdice_task_list_folders: {
        Row: TaskListFolder;
        Insert: TaskListFolderInsert;
        Update: TaskListFolderUpdate;
        Relationships: [];
      };
      adhdice_task_list_containers: {
        Row: TaskListContainer;
        Insert: Omit<TaskListContainer, "created_at" | "id" | "revision" | "updated_at"> & Partial<Pick<TaskListContainer, "created_at" | "id" | "revision" | "updated_at">>;
        Update: Partial<Pick<TaskListContainer, "revision" | "updated_at">>;
        Relationships: [];
      };
      adhdice_task_list_manual_memberships: {
        Row: TaskListManualMembership;
        Insert: TaskListManualMembershipInsert;
        Update: TaskListManualMembershipUpdate;
        Relationships: [];
      };
      adhdice_task_grid_layouts: {
        Row: TaskGridLayout;
        Insert: TaskGridLayoutInsert;
        Update: TaskGridLayoutUpdate;
        Relationships: [];
      };
      adhdice_hud_ui_settings: {
        Row: HudUiSettings;
        Insert: HudUiSettingsInsert;
        Update: HudUiSettingsUpdate;
        Relationships: [];
      };
      adhdice_on_time_plans: {
        Row: OnTimePlanRow;
        Insert: OnTimePlanInsert;
        Update: OnTimePlanUpdate;
        Relationships: [];
      };
      adhdice_home_todo_state: {
        Row: HomeTodoStateRow;
        Insert: HomeTodoStateInsert;
        Update: HomeTodoStateUpdate;
        Relationships: [];
      };
      adhdice_brainstorm_state: {
        Row: BrainstormStateRow;
        Insert: BrainstormStateInsert;
        Update: BrainstormStateUpdate;
        Relationships: [];
      };
      adhdice_focus_active_sessions: {
        Row: ActiveFocusSession;
        Insert: ActiveFocusSessionInsert;
        Update: ActiveFocusSessionUpdate;
        Relationships: [];
      };
      adhdice_focus_runtime_operations: {
        Row: FocusRuntimeOperation;
        Insert: Omit<FocusRuntimeOperation, "created_at"> & { created_at?: string };
        Update: Partial<FocusRuntimeOperation>;
        Relationships: [];
      };
      adhdice_task_active_timers: {
        Row: ActiveTaskTimer;
        Insert: ActiveTaskTimerInsert;
        Update: ActiveTaskTimerUpdate;
        Relationships: [];
      };
      adhdice_focus_categories: {
        Row: FocusCategory;
        Insert: FocusCategoryInsert;
        Update: FocusCategoryUpdate;
        Relationships: [];
      };
      adhdice_focus_counters: {
        Row: FocusCounterRow;
        Insert: Omit<FocusCounterRow, "created_at" | "deleted_at" | "revision" | "updated_at"> & Partial<Pick<FocusCounterRow, "created_at" | "deleted_at" | "revision" | "updated_at">>;
        Update: Partial<FocusCounterRow>;
        Relationships: [];
      };
      adhdice_focus_counter_events: {
        Row: FocusCounterEventRow;
        Insert: Omit<FocusCounterEventRow, "created_at" | "id"> & Partial<Pick<FocusCounterEventRow, "created_at" | "id">>;
        Update: Partial<FocusCounterEventRow>;
        Relationships: [];
      };
      adhdice_focus_daily_goal_adjustments: {
        Row: FocusDailyGoalAdjustment;
        Insert: FocusDailyGoalAdjustmentInsert;
        Update: FocusDailyGoalAdjustmentUpdate;
        Relationships: [];
      };
      adhdice_focus_sessions: {
        Row: FocusSession;
        Insert: FocusSessionInsert;
        Update: FocusSessionUpdate;
        Relationships: [];
      };
      adhdice_user_profiles: {
        Row: UserProfile;
        Insert: UserProfileInsert;
        Update: UserProfileUpdate;
        Relationships: [];
      };
      adhdice_task_events: {
        Row: TaskEvent;
        Insert: TaskEventInsert;
        Update: Record<string, never>;
        Relationships: [];
      };
      adhdice_point_ledger: {
        Row: PointLedgerEntry;
        Insert: PointLedgerInsert;
        Update: Record<string, never>;
        Relationships: [];
      };
      adhdice_task_reward_rolls: {
        Row: TaskRewardRoll;
        Insert: TaskRewardRollInsert;
        Update: Record<string, never>;
        Relationships: [];
      };
      adhdice_task_reward_claims: {
        Row: TaskRewardClaim;
        Insert: TaskRewardClaimInsert;
        Update: Record<string, never>;
        Relationships: [];
      };
      adhdice_pending_reward_dice: {
        Row: PendingRewardDiceAccount;
        Insert: { user_id: string; pending_dice?: number; revision?: number; updated_at?: string };
        Update: Partial<Pick<PendingRewardDiceAccount, "pending_dice" | "revision" | "updated_at">>;
        Relationships: [];
      };
      adhdice_pending_reward_dice_operations: {
        Row: PendingRewardDiceOperation;
        Insert: Omit<PendingRewardDiceOperation, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      adhdice_pending_reward_dice_items: {
        Row: PendingRewardDiceItem;
        Insert: Omit<PendingRewardDiceItem, "id" | "created_at" | "claimed_operation_id"> & { id?: string; created_at?: string; claimed_operation_id?: string | null };
        Update: Pick<PendingRewardDiceItem, "claimed_operation_id">;
        Relationships: [];
      };
      adhdice_notes: {
        Row: Note;
        Insert: NoteInsert;
        Update: NoteUpdate;
        Relationships: [];
      };
      adhdice_scratch_notes: {
        Row: ScratchNote;
        Insert: ScratchNoteInsert;
        Update: ScratchNoteUpdate;
        Relationships: [];
      };
      adhdice_scratch_note_task_links: {
        Row: ScratchNoteTaskLink;
        Insert: ScratchNoteTaskLinkInsert;
        Update: ScratchNoteTaskLinkUpdate;
        Relationships: [];
      };
      adhdice_health_profiles: {
        Row: HealthProfile;
        Insert: HealthProfileInsert;
        Update: HealthProfileUpdate;
        Relationships: [];
      };
      adhdice_health_checkins: {
        Row: HealthCheckIn;
        Insert: HealthCheckInInsert;
        Update: HealthCheckInUpdate;
        Relationships: [];
      };
      adhdice_health_symptoms: {
        Row: HealthSymptom;
        Insert: HealthSymptomInsert;
        Update: HealthSymptomUpdate;
        Relationships: [];
      };
      adhdice_health_symptom_entries: {
        Row: HealthSymptomEntry;
        Insert: HealthSymptomEntryInsert;
        Update: HealthSymptomEntryUpdate;
        Relationships: [];
      };
      adhdice_health_food_library: {
        Row: HealthFoodLibraryItem;
        Insert: HealthFoodLibraryItemInsert;
        Update: HealthFoodLibraryItemUpdate;
        Relationships: [];
      };
      adhdice_health_recipes: {
        Row: HealthRecipe;
        Insert: HealthRecipeInsert;
        Update: HealthRecipeUpdate;
        Relationships: [];
      };
      adhdice_health_saved_meals: {
        Row: HealthSavedMeal;
        Insert: HealthSavedMealInsert;
        Update: HealthSavedMealUpdate;
        Relationships: [];
      };
      adhdice_health_water_entries: {
        Row: HealthWaterEntry;
        Insert: HealthWaterEntryInsert;
        Update: HealthWaterEntryUpdate;
        Relationships: [];
      };
      adhdice_health_meal_entries: {
        Row: HealthMealEntry;
        Insert: HealthMealEntryInsert;
        Update: HealthMealEntryUpdate;
        Relationships: [];
      };
      adhdice_health_meal_plan_entries: {
        Row: HealthMealPlanEntry;
        Insert: HealthMealPlanEntryInsert;
        Update: HealthMealPlanEntryUpdate;
        Relationships: [];
      };
      adhdice_health_weight_entries: {
        Row: HealthWeightEntry;
        Insert: HealthWeightEntryInsert;
        Update: HealthWeightEntryUpdate;
        Relationships: [];
      };
      adhdice_health_metric_entries: {
        Row: HealthMetricEntry;
        Insert: HealthMetricEntryInsert;
        Update: HealthMetricEntryUpdate;
        Relationships: [];
      };
      adhdice_health_workouts: {
        Row: HealthWorkout;
        Insert: HealthWorkoutInsert;
        Update: HealthWorkoutUpdate;
        Relationships: [];
      };
      adhdice_health_exercises: {
        Row: HealthExercise;
        Insert: HealthExerciseInsert;
        Update: HealthExerciseUpdate;
        Relationships: [];
      };
      adhdice_health_workout_exercises: {
        Row: HealthWorkoutExercise;
        Insert: HealthWorkoutExerciseInsert;
        Update: HealthWorkoutExerciseUpdate;
        Relationships: [];
      };
      adhdice_health_workout_sets: {
        Row: HealthWorkoutSet;
        Insert: HealthWorkoutSetInsert;
        Update: HealthWorkoutSetUpdate;
        Relationships: [];
      };
      adhdice_health_fitness_plans: {
        Row: HealthFitnessPlan;
        Insert: HealthFitnessPlanInsert;
        Update: HealthFitnessPlanUpdate;
        Relationships: [];
      };
      adhdice_health_fitness_plan_items: {
        Row: HealthFitnessPlanItem;
        Insert: HealthFitnessPlanItemInsert;
        Update: HealthFitnessPlanItemUpdate;
        Relationships: [];
      };
      adhdice_health_workout_plan_item_links: {
        Row: HealthWorkoutPlanItemLink;
        Insert: HealthWorkoutPlanItemLinkInsert;
        Update: HealthWorkoutPlanItemLinkUpdate;
        Relationships: [];
      };
      adhdice_health_fitness_goals: {
        Row: HealthFitnessGoal;
        Insert: HealthFitnessGoalInsert;
        Update: HealthFitnessGoalUpdate;
        Relationships: [];
      };
      adhdice_health_fitness_goal_levels: {
        Row: HealthFitnessGoalLevel;
        Insert: HealthFitnessGoalLevelInsert;
        Update: HealthFitnessGoalLevelUpdate;
        Relationships: [];
      };
      adhdice_health_import_audits: {
        Row: HealthImportAudit;
        Insert: HealthImportAuditInsert;
        Update: HealthImportAuditUpdate;
        Relationships: [];
      };
      adhdice_health_achievement_awards: {
        Row: HealthAchievementAward;
        Insert: HealthAchievementAwardInsert;
        Update: HealthAchievementAwardUpdate;
        Relationships: [];
      };
      adhdice_achievement_profiles: {
        Row: AchievementProfile;
        Insert: AchievementProfileInsert;
        Update: AchievementProfileUpdate;
        Relationships: [];
      };
      adhdice_achievement_occurrences: {
        Row: AchievementOccurrence;
        Insert: AchievementOccurrenceInsert;
        Update: AchievementOccurrenceUpdate;
        Relationships: [];
      };
      adhdice_achievement_occurrence_matches: {
        Row: AchievementOccurrenceMatch;
        Insert: AchievementOccurrenceMatchInsert;
        Update: AchievementOccurrenceMatchUpdate;
        Relationships: [];
      };
      adhdice_achievement_progress: {
        Row: AchievementProgress;
        Insert: AchievementProgressInsert;
        Update: AchievementProgressUpdate;
        Relationships: [];
      };
      adhdice_achievement_evaluation_runs: {
        Row: AchievementEvaluationRun;
        Insert: AchievementEvaluationRunInsert;
        Update: AchievementEvaluationRunUpdate;
        Relationships: [];
      };
      adhdice_achievement_tier_awards: {
        Row: AchievementTierAward;
        Insert: AchievementTierAwardInsert;
        Update: AchievementTierAwardUpdate;
        Relationships: [];
      };
      adhdice_achievement_collection_awards: {
        Row: AchievementCollectionAward;
        Insert: AchievementCollectionAwardInsert;
        Update: AchievementCollectionAwardUpdate;
        Relationships: [];
      };
      adhdice_achievement_notifications: {
        Row: AchievementNotification;
        Insert: AchievementNotificationInsert;
        Update: AchievementNotificationUpdate;
        Relationships: [];
      };
      adhdice_roll_history: {
        Row: RollHistoryEntry;
        Insert: RollHistoryInsert;
        Update: Record<string, never>;
        Relationships: [];
      };
      adhdice_roll_prize_basket: {
        Row: RollPrizeBasketEntry;
        Insert: RollPrizeBasketEntryInsert;
        Update: RollPrizeBasketEntryUpdate;
        Relationships: [];
      };
      adhdice_roll_daily_boards: {
        Row: RollDailyBoard;
        Insert: RollDailyBoardInsert;
        Update: RollDailyBoardUpdate;
        Relationships: [];
      };
      adhdice_roll_reward_pool_prizes: {
        Row: RollRewardPoolPrize;
        Insert: RollRewardPoolPrizeInsert;
        Update: RollRewardPoolPrizeUpdate;
        Relationships: [];
      };
      adhdice_vault_prizes: {
        Row: VaultPrize;
        Insert: VaultPrizeInsert;
        Update: VaultPrizeUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      adhdice_mark_tasks_permanently_deleted: {
        Args: { p_task_ids: string[] };
        Returns: string[];
      };
      adhdice_begin_records_reconciliation: {
        Args: { p_payload: unknown };
        Returns: unknown;
      };
      adhdice_upload_records_reconciliation_chunk: {
        Args: { p_payload: unknown };
        Returns: unknown;
      };
      adhdice_finalize_records_reconciliation: {
        Args: { p_payload: unknown };
        Returns: unknown;
      };
      adhdice_activate_achievement_profile: {
        Args: {
          p_operation_id: string;
          p_catalog_version: string;
          p_rules_version: string;
          p_launch_mastery_version: string;
          p_timezone: string;
          p_logical_day_start?: string;
        };
        Returns: AchievementProfile;
      };
      adhdice_claim_achievement_notifications: {
        Args: { p_limit?: number };
        Returns: AchievementNotification[];
      };
      adhdice_mark_achievement_notification_seen: {
        Args: { p_notification_id: string };
        Returns: Record<string, unknown>;
      };
      adhdice_recalculate_achievements: {
        Args: {
          p_operation_id: string;
          p_cursor?: Record<string, unknown>;
          p_batch_size?: number;
        };
        Returns: Record<string, unknown>;
      };
      adhdice_lock_milestone: {
        Args: {
          p_task_id: string;
          p_expected_task_revision: number;
          p_operation_id: string;
          p_questions_version: string;
          p_rules_version: string;
          p_answers_snapshot: Record<string, unknown>;
          p_recommendation_snapshot: Record<string, unknown>;
          p_recommended_tier: MilestoneTier;
          p_recommended_target_date: string;
          p_allowed_target_date_min: string;
          p_allowed_target_date_max: string;
          p_selected_tier: MilestoneTier;
          p_selected_target_date: string;
          p_deadline_kind: MilestoneDeadlineKind;
          p_external_deadline: string | null;
          p_feasibility_warning: string | null;
          p_rules_explanation: string;
          p_tier_raise_explanation: string | null;
          p_completion_timezone: string;
        };
        Returns: Milestone;
      };
      adhdice_correct_milestone_setup: {
        Args: {
          p_milestone_id: string;
          p_expected_revision: number;
          p_operation_id: string;
          p_corrected_tier: MilestoneTier;
          p_corrected_target_date: string;
          p_tier_raise_explanation: string | null;
        };
        Returns: Milestone;
      };
      adhdice_abandon_milestone: {
        Args: { p_milestone_id: string; p_expected_milestone_revision: number; p_operation_id: string; p_reason?: string | null };
        Returns: MilestoneOnlyMutationResult[];
      };
      adhdice_mutate_focus_counter: {
        Args: {
          p_operation_id: string;
          p_counter_id: string;
          p_expected_revision: number | null;
          p_action: string;
          p_action_payload?: unknown;
        };
        Returns: unknown;
      };
      adhdice_transition_focus_runtime: {
        Args: {
          p_operation_id: string;
          p_action: string;
          p_session_id?: string | null;
          p_expected_revision?: number | null;
          p_runtime_kind?: string | null;
          p_category_id?: string | null;
          p_mode?: string | null;
          p_countdown_target_seconds?: number | null;
          p_start?: boolean;
          p_delta_seconds?: number;
        };
        Returns: unknown;
      };
      adhdice_complete_focus_runtime: {
        Args: {
          p_operation_id: string;
          p_session_id: string;
          p_expected_revision: number;
          p_title: string;
          p_focus_type: string;
          p_focus_subtype?: string | null;
          p_focus_subtype_2?: string | null;
          p_notes?: string | null;
          p_session_date?: string;
        };
        Returns: unknown;
      };
      adhdice_migrate_focus_runtime: {
        Args: {
          p_operation_id: string;
          p_runtime_kind: string;
          p_category_id?: string | null;
          p_session_id?: string | null;
          p_expected_revision?: number | null;
          p_mode?: string;
          p_countdown_target_seconds?: number | null;
          p_legacy_started_at?: string | null;
          p_legacy_accumulated_seconds?: number;
          p_legacy_is_running?: boolean;
        };
        Returns: unknown;
      };
      adhdice_claim_pending_reward_dice: {
        Args: { p_operation_id: string };
        Returns: Array<{
          pending_dice: number;
          revision: number;
          updated_at: string;
          result_payload: unknown;
          was_replayed: boolean;
        }>;
      };
      adhdice_execute_roll: {
        Args: {
          p_operation_id: string;
          p_point_cost: number;
          p_requested_result: number;
          p_free_roll_award?: number;
          p_token_award?: number;
        };
        Returns: Array<{
          operation_id: string;
          history_id: string;
          roll_result: number;
          points_spent: number;
          free_roll_bank: number;
          points: number;
          xp: number;
          level: number;
          tokens: number;
          profile_updated_at: string;
          rolled_at: string;
          was_replayed: boolean;
        }>;
      };
      reorder_task_lists: {
        Args: { ordered_list_ids: string[] };
        Returns: TaskList[];
      };
      adhdice_mutate_task_list_structure: {
        Args: { p_action: string; p_payload: Record<string, unknown> };
        Returns: Record<string, unknown>;
      };
    };
    Enums: {
      adhdice_clean_task_status: TaskStatus;
      adhdice_clean_task_priority: TaskPriority;
      adhdice_clean_task_energy: TaskEnergy;
      adhdice_clean_task_repeat_frequency: TaskRepeatFrequency;
      adhdice_clean_task_repeat_monthly_mode: TaskRepeatMonthlyMode;
      adhdice_clean_task_repeat_monthly_ordinal: TaskRepeatMonthlyOrdinal;
      adhdice_clean_focus_source: "timer" | "manual" | "import";
    };
    CompositeTypes: Record<string, never>;
  };
};
