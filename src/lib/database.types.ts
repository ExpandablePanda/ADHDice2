export type TaskStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "missed"
  | "did_my_best"
  | "upcoming"
  | "not_due"
  | "archived";
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

export type Task = {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  energy: TaskEnergy;
  is_urgent: boolean;
  is_important: boolean;
  due_on: string | null;
  due_time: string | null;
  estimated_minutes: number | null;
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
  created_at: string;
  updated_at: string;
};

export type TaskInsert = {
  id?: string;
  user_id: string;
  title: string;
  notes?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  energy?: TaskEnergy;
  is_urgent?: boolean;
  is_important?: boolean;
  due_on?: string | null;
  due_time?: string | null;
  estimated_minutes?: number | null;
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
};

export type TaskUpdate = Partial<
  Pick<
    Task,
    | "title"
    | "notes"
    | "status"
    | "priority"
    | "energy"
    | "is_urgent"
    | "is_important"
    | "due_on"
    | "due_time"
    | "estimated_minutes"
    | "tags"
    | "external_link_label"
    | "external_link_url"
    | "one_step_at_a_time"
    | "subtasks_auto_reset"
    | "repeat_frequency"
    | "repeat_interval"
    | "repeat_days_of_week"
    | "repeat_day_of_month"
    | "sort_order"
    | "completed_at"
  >
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

export type UserProfile = {
  user_id: string;
  display_name: string | null;
  avatar_src: string | null;
  logo_src: string | null;
  level: number;
  xp: number;
  points: number;
  tokens: number;
  created_at: string;
  updated_at: string;
};

export type UserProfileInsert = {
  user_id: string;
  display_name?: string | null;
  avatar_src?: string | null;
  logo_src?: string | null;
  level?: number;
  xp?: number;
  points?: number;
  tokens?: number;
};

export type UserProfileUpdate = Partial<
  Pick<UserProfile, "display_name" | "avatar_src" | "logo_src" | "level" | "xp" | "points" | "tokens">
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

export type PointLedgerSource = "task" | "focus" | "roll" | "manual" | "system";

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
      adhdice_task_focus_days: {
        Row: TaskFocusDay;
        Insert: TaskFocusDayInsert;
        Update: TaskFocusDayUpdate;
        Relationships: [];
      };
      adhdice_task_grid_layouts: {
        Row: TaskGridLayout;
        Insert: TaskGridLayoutInsert;
        Update: TaskGridLayoutUpdate;
        Relationships: [];
      };
      adhdice_focus_active_sessions: {
        Row: ActiveFocusSession;
        Insert: ActiveFocusSessionInsert;
        Update: ActiveFocusSessionUpdate;
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
      adhdice_notes: {
        Row: Note;
        Insert: NoteInsert;
        Update: NoteUpdate;
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
