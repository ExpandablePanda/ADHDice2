import type { TaskStatus } from "@/lib/database.types";

/** UI-only active status projection; never persist `unscheduled` as TaskStatus. */
export type TaskDisplayStatus = TaskStatus | "unscheduled";
export type TaskDisplayStatusByTaskId = Record<string, TaskDisplayStatus>;
