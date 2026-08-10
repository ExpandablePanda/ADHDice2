import type { FocusSession, Task, TaskHistory } from "@/lib/database.types";
import type {
  RecordEventKind,
  RecordMetricKey,
  RecordScopeKind,
  RecordUnit,
} from "./persisted-types.ts";

export type {
  PersistedRecordCurrent,
  PersistedRecordEvent,
  RecordEventKind,
  RecordMetricKey,
  RecordScopeKind,
  RecordUnit,
} from "./persisted-types.ts";

export const RECORDS_RULES_VERSION = "records-v1";

export type RecordEvidence = Readonly<{
  identities: string[];
  sourceRows: Array<Record<string, unknown>>;
}>;

export type EvaluatedRecordCandidate = Readonly<{
  candidateIdentity: string;
  creditedDate: string;
  evidence: RecordEvidence;
  evidenceFingerprint: string;
  firstQualifiedAt: string;
  metricKey: RecordMetricKey;
  periodEnd: string | null;
  periodKey: string | null;
  periodStart: string | null;
  scopeId: string | null;
  scopeKind: RecordScopeKind;
  titleSnapshot: string | null;
  unit: RecordUnit;
  value: number;
}>;

export type DurableCurrentRecord = EvaluatedRecordCandidate & Readonly<{
  firstAchievedAt: string;
  recalculatedAt: string;
  rulesVersion: typeof RECORDS_RULES_VERSION;
}>;

export type DurableRecordEvent = EvaluatedRecordCandidate & Readonly<{
  eventIdentity: string;
  eventKind: RecordEventKind;
  firstAchievedAt: string;
  rulesVersion: typeof RECORDS_RULES_VERSION;
  validityState: "valid";
}>;

export type ProvisionalRecordCandidate = EvaluatedRecordCandidate & Readonly<{ status: "provisional" }>;

export type RecordsEvaluation = Readonly<{
  currentRecords: DurableCurrentRecord[];
  evaluatedAt: string;
  events: DurableRecordEvent[];
  provisionalCandidates: ProvisionalRecordCandidate[];
  warnings: string[];
}>;

export type RecordsEvaluationInput = Readonly<{
  evaluatedAt?: string;
  focusSessions: readonly FocusSession[];
  logicalDayStart: string;
  openLogicalDate: string;
  taskHistory: readonly TaskHistory[];
  tasks: readonly Task[];
  timezone: string;
}>;

export const RECORD_METRICS: Record<RecordMetricKey, { label: string; section: "tasks" | "streaks" | "focus" | "per_task" }> = {
  parent_tasks_day: { label: "Most parent Tasks completed in one day", section: "tasks" },
  parent_tasks_week: { label: "Most parent Tasks completed in one week", section: "tasks" },
  parent_tasks_month: { label: "Most parent Tasks completed in one month", section: "tasks" },
  permanent_completes_day: { label: "Most permanent Completes in one day", section: "tasks" },
  steps_day: { label: "Most Steps completed in one day", section: "tasks" },
  steps_week: { label: "Most Steps completed in one week", section: "tasks" },
  steps_month: { label: "Most Steps completed in one month", section: "tasks" },
  parent_completion_day_streak: { label: "Longest parent-Task completion-day streak", section: "streaks" },
  step_completion_day_streak: { label: "Longest Step completion-day streak", section: "streaks" },
  combined_completion_day_streak: { label: "Longest parent-or-Step completion-day streak", section: "streaks" },
  focus_active_day_streak: { label: "Longest Focus active-day streak", section: "streaks" },
  longest_focus_session: { label: "Longest individual Focus session", section: "focus" },
  focus_duration_day: { label: "Most Focus duration in one day", section: "focus" },
  focus_duration_week: { label: "Most Focus duration in one week", section: "focus" },
  focus_duration_month: { label: "Most Focus duration in one month", section: "focus" },
  focus_sessions_day: { label: "Most Focus sessions in one day", section: "focus" },
  task_occurrence_streak: { label: "Longest successful occurrence streak", section: "per_task" },
  task_biggest_comeback: { label: "Biggest Comeback", section: "per_task" },
};
