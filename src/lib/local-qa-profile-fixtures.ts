import type {
  FocusCategoryInsert,
  FocusSessionInsert,
  NoteInsert,
  TaskHistoryActionInput,
  TaskInsert,
  TaskListInsert,
  TaskListManualMembershipInsert,
  UserProfileInsert,
} from "@/lib/database.types";

export const LOCAL_QA_SEED_VERSION = 1;
export const LOCAL_QA_SEED_METADATA_KEY = "adhdice_local_qa_seed_version";

const IDS = {
  focus: {
    deepWork: "72000000-0000-4000-8000-000000000001",
    lifeAdmin: "72000000-0000-4000-8000-000000000002",
    recharge: "72000000-0000-4000-8000-000000000003",
  },
  lists: {
    home: "73000000-0000-4000-8000-000000000001",
    qa: "73000000-0000-4000-8000-000000000002",
  },
  notes: {
    qa: "74000000-0000-4000-8000-000000000001",
    weekly: "74000000-0000-4000-8000-000000000002",
  },
  tasks: {
    errands: "71000000-0000-4000-8000-000000000003",
    errandsFuel: "71000000-0000-4000-8000-000000000032",
    errandsGroceries: "71000000-0000-4000-8000-000000000031",
    inbox: "71000000-0000-4000-8000-000000000004",
    morning: "71000000-0000-4000-8000-000000000001",
    morningBuffer: "71000000-0000-4000-8000-000000000014",
    morningPriorities: "71000000-0000-4000-8000-000000000012",
    morningPriorityOptional: "71000000-0000-4000-8000-000000000121",
    morningPriorityTimer: "71000000-0000-4000-8000-000000000122",
    morningWater: "71000000-0000-4000-8000-000000000011",
    release: "71000000-0000-4000-8000-000000000002",
    releaseBackground: "71000000-0000-4000-8000-000000000023",
    releaseLongPress: "71000000-0000-4000-8000-000000000024",
    releaseSort: "71000000-0000-4000-8000-000000000021",
    releaseSticky: "71000000-0000-4000-8000-000000000022",
    releaseStickyBoundary: "71000000-0000-4000-8000-000000000221",
    releaseStickyPush: "71000000-0000-4000-8000-000000000222",
  },
} as const;

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shiftDate(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function timestampFor(date: Date, hour = 12) {
  const next = new Date(date);
  next.setUTCHours(hour, 0, 0, 0);
  return next.toISOString();
}

type LocalQaFixtures = {
  focusCategories: FocusCategoryInsert[];
  focusSessions: FocusSessionInsert[];
  listMemberships: TaskListManualMembershipInsert[];
  lists: TaskListInsert[];
  notes: NoteInsert[];
  profile: UserProfileInsert;
  taskHistory: TaskHistoryActionInput[];
  tasks: TaskInsert[];
};

export function buildLocalQaProfileFixtures(userId: string, now = new Date()): LocalQaFixtures {
  const today = toDateKey(now);
  const yesterday = toDateKey(shiftDate(now, -1));
  const twoDaysAgo = toDateKey(shiftDate(now, -2));
  const threeDaysAgo = toDateKey(shiftDate(now, -3));
  const tomorrow = toDateKey(shiftDate(now, 1));
  const nextWeek = toDateKey(shiftDate(now, 7));

  const task = (id: string, title: string, sortOrder: number, overrides: Partial<TaskInsert> = {}): TaskInsert => ({
    created_at: timestampFor(shiftDate(now, -14 + sortOrder), 10),
    energy: "medium",
    estimated_minutes: 20,
    id,
    priority: "normal",
    priority_level: 3,
    sort_order: sortOrder,
    status: "pending",
    tags: [],
    title,
    user_id: userId,
    ...overrides,
  });

  const tasks: TaskInsert[] = [
    task(IDS.tasks.morning, "Plan a calm morning launch", 0, { due_on: today, estimated_minutes: 35, is_important: true, tags: ["routine", "home"] }),
    task(IDS.tasks.morningWater, "Open the curtains and drink water", 0, { estimated_minutes: 5, parent_task_id: IDS.tasks.morning, priority_level: 2 }),
    task(IDS.tasks.morningPriorities, "Review today’s three priorities", 1, { estimated_minutes: 10, parent_task_id: IDS.tasks.morning, status: "in_progress" }),
    task(IDS.tasks.morningPriorityOptional, "Move one optional task to Later", 0, { estimated_minutes: 3, parent_task_id: IDS.tasks.morningPriorities, priority_level: 2 }),
    task(IDS.tasks.morningPriorityTimer, "Start the first priority timer", 1, { estimated_minutes: 2, parent_task_id: IDS.tasks.morningPriorities, priority_level: 4 }),
    task(IDS.tasks.morningBuffer, "Leave a five-minute buffer", 2, { estimated_minutes: 5, parent_task_id: IDS.tasks.morning }),
    task(IDS.tasks.release, "Prepare the Task Views QA release", 1, { due_on: tomorrow, estimated_minutes: 90, priority: "high", priority_level: 5, tags: ["adhdice", "qa"] }),
    task(IDS.tasks.releaseSort, "Verify List sorting controls", 0, { estimated_minutes: 20, parent_task_id: IDS.tasks.release, status: "done" }),
    task(IDS.tasks.releaseSticky, "Check sticky parent geometry", 1, { estimated_minutes: 30, parent_task_id: IDS.tasks.release, status: "in_progress" }),
    task(IDS.tasks.releaseStickyBoundary, "Scroll through the final descendant", 0, { estimated_minutes: 5, parent_task_id: IDS.tasks.releaseSticky }),
    task(IDS.tasks.releaseStickyPush, "Confirm the next parent pushes", 1, { estimated_minutes: 5, parent_task_id: IDS.tasks.releaseSticky }),
    task(IDS.tasks.releaseBackground, "Check Table row surfaces", 2, { estimated_minutes: 15, parent_task_id: IDS.tasks.release }),
    task(IDS.tasks.releaseLongPress, "Exercise long-press expansion", 3, { estimated_minutes: 15, parent_task_id: IDS.tasks.release }),
    task(IDS.tasks.errands, "Batch the afternoon errands", 2, { due_on: nextWeek, estimated_minutes: 55, priority_level: 2, tags: ["errands", "home"] }),
    task(IDS.tasks.errandsGroceries, "Pick up groceries", 0, { estimated_minutes: 30, parent_task_id: IDS.tasks.errands }),
    task(IDS.tasks.errandsFuel, "Refuel the car", 1, { estimated_minutes: 10, parent_task_id: IDS.tasks.errands }),
    task(IDS.tasks.inbox, "Capture an idea without a due date", 3, { due_on: null, estimated_minutes: 10, priority_level: 1, status: "upcoming", tags: ["inbox"] }),
  ];

  const lists: TaskListInsert[] = [
    { id: IDS.lists.qa, user_id: userId, name: "QA Release", list_type: "custom", membership_mode: "manual", sort_order: 10 },
    { id: IDS.lists.home, user_id: userId, name: "Home", list_type: "custom", membership_mode: "manual", sort_order: 20 },
  ];

  const listMemberships: TaskListManualMembershipInsert[] = [
    { id: "75000000-0000-4000-8000-000000000001", user_id: userId, list_id: IDS.lists.qa, task_id: IDS.tasks.release },
    { id: "75000000-0000-4000-8000-000000000002", user_id: userId, list_id: IDS.lists.home, task_id: IDS.tasks.morning },
    { id: "75000000-0000-4000-8000-000000000003", user_id: userId, list_id: IDS.lists.home, task_id: IDS.tasks.errands },
  ];

  const taskHistory: TaskHistoryActionInput[] = [
    { id: "76000000-0000-4000-8000-000000000001", task_id: IDS.tasks.morning, user_id: userId, entry_date: threeDaysAgo, status: "done", was_completed: true },
    { id: "76000000-0000-4000-8000-000000000002", task_id: IDS.tasks.morning, user_id: userId, entry_date: twoDaysAgo, status: "done", was_completed: true },
    { id: "76000000-0000-4000-8000-000000000003", task_id: IDS.tasks.morning, user_id: userId, entry_date: yesterday, status: "done", was_completed: true },
    { id: "76000000-0000-4000-8000-000000000004", task_id: IDS.tasks.releaseSort, user_id: userId, entry_date: today, status: "done", was_completed: true },
  ];

  const focusCategories: FocusCategoryInsert[] = [
    { id: IDS.focus.deepWork, user_id: userId, title: "Deep Work", focus_type: "Work", focus_subtype: "Build", color: "#6f57f6", icon: "Brain", daily_goal_seconds: 5400, weekly_goal_seconds: 27000, priority_level: 5, target_distribution_mode: "auto", weekday_target_seconds: {}, sort_order: 0 },
    { id: IDS.focus.lifeAdmin, user_id: userId, title: "Life Admin", focus_type: "Personal", focus_subtype: "Maintenance", color: "#2f9e7f", icon: "ClipboardCheck", daily_goal_seconds: 1800, weekly_goal_seconds: 7200, priority_level: 3, target_distribution_mode: "auto", weekday_target_seconds: {}, sort_order: 1 },
    { id: IDS.focus.recharge, user_id: userId, title: "Recharge", focus_type: "Health", focus_subtype: "Recovery", color: "#db8a34", icon: "Coffee", daily_goal_seconds: 1200, weekly_goal_seconds: 7200, priority_level: 2, target_distribution_mode: "auto", weekday_target_seconds: {}, sort_order: 2 },
  ];

  const focusSession = (id: string, categoryId: string, dateKey: string, durationSeconds: number, title: string, type: string): FocusSessionInsert => ({
    category_id: categoryId,
    duration_seconds: durationSeconds,
    ended_at: `${dateKey}T16:00:00.000Z`,
    focus_type_snapshot: type,
    id,
    notes: "Local QA fixture session",
    session_date: dateKey,
    source: "manual",
    started_at: `${dateKey}T15:00:00.000Z`,
    title_snapshot: title,
    user_id: userId,
  });

  const focusSessions: FocusSessionInsert[] = [
    focusSession("78000000-0000-4000-8000-000000000001", IDS.focus.deepWork, threeDaysAgo, 4200, "Deep Work", "Work"),
    focusSession("78000000-0000-4000-8000-000000000002", IDS.focus.lifeAdmin, twoDaysAgo, 1500, "Life Admin", "Personal"),
    focusSession("78000000-0000-4000-8000-000000000003", IDS.focus.deepWork, yesterday, 5100, "Deep Work", "Work"),
    focusSession("78000000-0000-4000-8000-000000000004", IDS.focus.recharge, yesterday, 1200, "Recharge", "Health"),
    focusSession("78000000-0000-4000-8000-000000000005", IDS.focus.deepWork, today, 2700, "Deep Work", "Work"),
  ];

  const notes: NoteInsert[] = [
    { id: IDS.notes.qa, user_id: userId, title: "Task Views QA notes", body: "Check List sorting, sticky hierarchy release boundaries, Table row surfaces, and long-press expansion.", tags: ["qa", "adhdice"], linked_task_ids: [IDS.tasks.release] },
    { id: IDS.notes.weekly, user_id: userId, title: "Weekly reset", body: "Review completed Focus time, choose three priorities, and leave room for recovery.", tags: ["planning"], linked_task_ids: [IDS.tasks.morning] },
  ];

  return {
    focusCategories,
    focusSessions,
    listMemberships,
    lists,
    notes,
    profile: {
      accent_color: "#6f57f6",
      day_start_time: "06:00",
      display_name: "Local Guest QA",
      focus_alarm_enabled: false,
      focus_alarm_interval_minutes: 30,
      level: 7,
      low_stim_mode: false,
      points: 420,
      theme_preference: "light",
      timezone: "America/New_York",
      tokens: 12,
      user_id: userId,
      xp: 720,
    },
    taskHistory,
    tasks,
  };
}
