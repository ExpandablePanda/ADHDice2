export type TaskStatus = "active" | "done" | "archived";
export type TaskPriority = "low" | "normal" | "high";
export type TaskEnergy = "low" | "medium" | "high";
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
  due_on: string | null;
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
  due_on?: string | null;
  sort_order?: number;
  completed_at?: string | null;
};

export type TaskUpdate = Partial<
  Pick<
    Task,
    "title" | "notes" | "status" | "priority" | "energy" | "due_on" | "sort_order" | "completed_at"
  >
>;

export type UserProfile = {
  user_id: string;
  display_name: string | null;
  avatar_src: string | null;
  logo_src: string | null;
  created_at: string;
  updated_at: string;
};

export type UserProfileInsert = {
  user_id: string;
  display_name?: string | null;
  avatar_src?: string | null;
  logo_src?: string | null;
};

export type UserProfileUpdate = Partial<
  Pick<UserProfile, "display_name" | "avatar_src" | "logo_src">
>;

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

export type Database = {
  public: {
    Tables: {
      adhdice_clean_tasks: {
        Row: Task;
        Insert: TaskInsert;
        Update: TaskUpdate;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      adhdice_clean_task_status: TaskStatus;
      adhdice_clean_task_priority: TaskPriority;
      adhdice_clean_task_energy: TaskEnergy;
      adhdice_clean_focus_source: "timer" | "manual" | "import";
    };
    CompositeTypes: Record<string, never>;
  };
};
