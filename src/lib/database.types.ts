export type TaskStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "missed"
  | "did_my_best"
  | "upcoming"
  | "not_due"
  | "archived"
  | "trashed";
export type TaskPriority = "low" | "normal" | "high";
export type TaskEnergy = "none" | "low" | "medium" | "high";
export type TaskRepeatFrequency = "none" | "daily" | "weekly" | "monthly" | "custom";
export type TaskSubtaskStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "missed"
  | "did_my_best"
  | "upcoming"
  | "not_due";
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

export type TaskListKind = "system" | "smart" | "custom";
export type TaskListMembershipMode = "manual" | "rules" | "hybrid";

export type TaskList = {
  id: string;
  user_id: string;
  built_in_key: string | null;
  name: string;
  list_type: TaskListKind;
  membership_mode: TaskListMembershipMode;
  is_deletable: boolean;
  is_editable: boolean;
  is_visible: boolean;
  sort_order: number;
  rules_json: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskListInsert = {
  id: string;
  user_id: string;
  built_in_key?: string | null;
  name: string;
  list_type?: TaskListKind;
  membership_mode?: TaskListMembershipMode;
  is_deletable?: boolean;
  is_editable?: boolean;
  is_visible?: boolean;
  sort_order?: number;
  rules_json?: string | null;
};

export type TaskListUpdate = Partial<
  Pick<
    TaskList,
    | "built_in_key"
    | "name"
    | "list_type"
    | "membership_mode"
    | "is_deletable"
    | "is_editable"
    | "is_visible"
    | "sort_order"
    | "rules_json"
  >
>;

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
  energy: TaskEnergy;
  is_urgent: boolean;
  is_important: boolean;
  due_on: string | null;
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
  sort_order: number;
  completed_at: string | null;
  trashed_at: string | null;
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
  energy?: TaskEnergy;
  is_urgent?: boolean;
  is_important?: boolean;
  due_on?: string | null;
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
    | "energy"
    | "is_urgent"
    | "is_important"
    | "due_on"
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
};

export type ActiveTaskTimerUpdate = Partial<
  Pick<ActiveTaskTimer, "title_snapshot" | "start_time" | "accumulated_seconds" | "started_actual_seconds" | "is_running">
>;

export type TaskSubtask = {
  id: string;
  task_id: string;
  user_id: string;
  title: string;
  status: TaskSubtaskStatus;
  sort_order: number;
  parent_subtask_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskSubtaskInsert = {
  id?: string;
  task_id: string;
  user_id: string;
  title: string;
  status?: TaskSubtaskStatus;
  sort_order?: number;
  parent_subtask_id?: string | null;
};

export type TaskSubtaskUpdate = Partial<
  Pick<TaskSubtask, "title" | "status" | "sort_order">
>;

export type TaskHistory = {
  id: string;
  task_id: string;
  user_id: string;
  entry_date: string;
  status: TaskStatus;
  was_completed: boolean;
  created_at: string;
  updated_at: string;
};

export type TaskHistoryInsert = {
  id?: string;
  task_id: string;
  user_id: string;
  entry_date: string;
  status: TaskStatus;
  was_completed: boolean;
};

export type TaskHistoryUpdate = Partial<
  Pick<TaskHistory, "status" | "was_completed">
>;

export type TaskActualTimeEntry = {
  id: string;
  task_id: string;
  user_id: string;
  entry_date: string;
  title_snapshot: string;
  duration_seconds: number;
  notes: string | null;
  created_at: string;
};

export type TaskActualTimeEntryInsert = {
  id?: string;
  task_id: string;
  user_id: string;
  entry_date: string;
  title_snapshot: string;
  duration_seconds: number;
  notes?: string | null;
};

export type TaskActualTimeEntryUpdate = Partial<
  Pick<TaskActualTimeEntry, "entry_date" | "title_snapshot" | "duration_seconds" | "notes">
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
  subtask_id: string | null;
  reward_roll_id: string;
  reward_date: string;
  awarded_token: boolean;
  created_at: string;
};

export type TaskRewardClaimInsert = {
  id?: string;
  user_id: string;
  task_id: string;
  subtask_id?: string | null;
  reward_roll_id: string;
  reward_date: string;
  awarded_token?: boolean;
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
  sort_order?: number;
};

export type FocusCategoryUpdate = Partial<
  Pick<
    FocusCategory,
    "title" | "focus_type" | "focus_subtype" | "focus_subtype_2" | "color" | "icon" | "daily_goal_seconds" | "weekly_goal_seconds" | "sort_order"
  >
>;

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
};

export type FocusSessionUpdate = Partial<
  Pick<
    FocusSession,
    "category_id" | "title_snapshot" | "focus_type_snapshot" | "focus_subtype_snapshot" | "focus_subtype_2_snapshot" | "session_date" | "duration_seconds" | "notes" | "started_at" | "ended_at" | "source"
  >
>;

export type ActiveFocusSession = {
  user_id: string;
  category_id: string;
  start_time: string | null;
  accumulated_seconds: number;
  is_running: boolean;
  updated_at: string;
};

export type ActiveFocusSessionInsert = {
  user_id: string;
  category_id: string;
  start_time?: string | null;
  accumulated_seconds?: number;
  is_running?: boolean;
};

export type ActiveFocusSessionUpdate = Partial<
  Pick<ActiveFocusSession, "start_time" | "accumulated_seconds" | "is_running">
>;

export type PrizeCell = {
  id: string;
  user_id: string;
  cell_number: number;
  label: string;
  is_claimed: boolean;
  created_at: string;
  updated_at: string;
};

export type PrizeCellInsert = {
  id?: string;
  user_id: string;
  cell_number: number;
  label?: string;
  is_claimed?: boolean;
};

export type PrizeCellUpdate = Partial<Pick<PrizeCell, "label" | "is_claimed">>;

export type RollHistoryEntry = {
  id: string;
  user_id: string;
  roll_result: number;
  points_spent: number;
  prize_label: string | null;
  rolled_at: string;
};

export type RollHistoryInsert = {
  id?: string;
  user_id: string;
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

export type RollMasterPrize = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RollMasterPrizeInsert = {
  id?: string;
  name: string;
  sort_order?: number;
  is_active?: boolean;
};

export type RollMasterPrizeUpdate = Partial<
  Pick<RollMasterPrize, "name" | "sort_order" | "is_active">
>;

export type RollBoardAssignmentTier = "small" | "big" | "master";

export type RollBoardAssignment = {
  id: string;
  user_id: string;
  cell_number: number;
  prize_tier: RollBoardAssignmentTier;
  prize_id: string;
  created_at: string;
  updated_at: string;
};

export type RollBoardAssignmentInsert = {
  id?: string;
  user_id: string;
  cell_number: number;
  prize_tier: RollBoardAssignmentTier;
  prize_id: string;
};

export type RollBoardAssignmentUpdate = Partial<
  Pick<RollBoardAssignment, "prize_tier" | "prize_id">
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

export type HealthProfile = {
  user_id: string;
  preferred_weight_unit: HealthWeightUnit;
  calorie_goal: number | null;
  protein_goal_grams: number | null;
  carbs_goal_grams: number | null;
  fat_goal_grams: number | null;
  movement_goal: number | null;
  sleep_goal_minutes: number | null;
  target_weight_kg: number | null;
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
  sleep_goal_minutes?: number | null;
  target_weight_kg?: number | null;
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
    | "sleep_goal_minutes"
    | "target_weight_kg"
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

export type HealthFoodLibraryItem = {
  id: string;
  user_id: string;
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
  created_at: string;
  updated_at: string;
};

export type HealthFoodLibraryItemInsert = {
  id?: string;
  user_id: string;
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
};

export type HealthFoodLibraryItemUpdate = Partial<
  Pick<
    HealthFoodLibraryItem,
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
  >
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
  created_at: string;
  updated_at: string;
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

export type AchievementUnlock = {
  id: string;
  user_id: string;
  achievement_id: string;
  achievement_kind: "face" | "charged_die";
  set_code: string;
  face_level: number | null;
  title: string;
  description: string;
  encouragement: string;
  reward_xp: number;
  earned_at: string;
  created_at: string;
};

export type AchievementUnlockInsert = {
  id?: string;
  user_id: string;
  achievement_id: string;
  achievement_kind: "face" | "charged_die";
  set_code: string;
  face_level?: number | null;
  title: string;
  description: string;
  encouragement: string;
  reward_xp?: number;
  earned_at?: string;
};

export type AchievementUnlockUpdate = Record<string, never>;

export type Database = {
  public: {
    Tables: {
      adhdice_clean_tasks: {
        Row: Task;
        Insert: TaskInsert;
        Update: TaskUpdate;
        Relationships: [];
      };
      adhdice_task_subtasks: {
        Row: TaskSubtask;
        Insert: TaskSubtaskInsert;
        Update: TaskSubtaskUpdate;
        Relationships: [];
      };
      adhdice_task_history: {
        Row: TaskHistory;
        Insert: TaskHistoryInsert;
        Update: TaskHistoryUpdate;
        Relationships: [];
      };
      adhdice_task_actual_time_entries: {
        Row: TaskActualTimeEntry;
        Insert: TaskActualTimeEntryInsert;
        Update: TaskActualTimeEntryUpdate;
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
      adhdice_focus_active_sessions: {
        Row: ActiveFocusSession;
        Insert: ActiveFocusSessionInsert;
        Update: ActiveFocusSessionUpdate;
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
      adhdice_notes: {
        Row: Note;
        Insert: NoteInsert;
        Update: NoteUpdate;
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
      adhdice_health_food_library: {
        Row: HealthFoodLibraryItem;
        Insert: HealthFoodLibraryItemInsert;
        Update: HealthFoodLibraryItemUpdate;
        Relationships: [];
      };
      adhdice_health_meal_entries: {
        Row: HealthMealEntry;
        Insert: HealthMealEntryInsert;
        Update: HealthMealEntryUpdate;
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
      adhdice_achievement_unlocks: {
        Row: AchievementUnlock;
        Insert: AchievementUnlockInsert;
        Update: AchievementUnlockUpdate;
        Relationships: [];
      };
      adhdice_prize_board: {
        Row: PrizeCell;
        Insert: PrizeCellInsert;
        Update: PrizeCellUpdate;
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
      adhdice_roll_board_assignments: {
        Row: RollBoardAssignment;
        Insert: RollBoardAssignmentInsert;
        Update: RollBoardAssignmentUpdate;
        Relationships: [];
      };
      adhdice_roll_master_prizes: {
        Row: RollMasterPrize;
        Insert: RollMasterPrizeInsert;
        Update: RollMasterPrizeUpdate;
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
    Functions: Record<string, never>;
    Enums: {
      adhdice_clean_task_status: TaskStatus;
      adhdice_clean_task_priority: TaskPriority;
      adhdice_clean_task_energy: TaskEnergy;
      adhdice_clean_task_subtask_status: TaskSubtaskStatus;
      adhdice_clean_task_repeat_frequency: TaskRepeatFrequency;
      adhdice_clean_focus_source: "timer" | "manual" | "import";
    };
    CompositeTypes: Record<string, never>;
  };
};
