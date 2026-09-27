export const WORKSPACE_POSTGRES_CHANGES_TABLES = [
  "adhdice_task_list_folders",
  "adhdice_task_content_folders",
  "adhdice_task_list_containers",
  "adhdice_task_list_rail_items",
  "adhdice_focus_categories",
  "adhdice_task_focus_days",
  "adhdice_task_lists",
  "adhdice_task_list_manual_memberships",
  "adhdice_notes",
  "adhdice_task_history_facts",
] as const;

export type WorkspacePostgresChangesTable = typeof WORKSPACE_POSTGRES_CHANGES_TABLES[number];
