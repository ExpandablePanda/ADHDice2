export type TaskStatus = "active" | "done" | "archived";
export type TaskPriority = "low" | "normal" | "high";
export type TaskEnergy = "low" | "medium" | "high";

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

export type Database = {
  public: {
    Tables: {
      tasks: {
        Row: Task;
        Insert: TaskInsert;
        Update: TaskUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      task_status: TaskStatus;
      task_priority: TaskPriority;
      task_energy: TaskEnergy;
    };
    CompositeTypes: Record<string, never>;
  };
};
