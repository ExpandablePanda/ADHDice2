import {
  buildUnifiedReportReadModel,
  type ReportCheckInSourceRow,
  type ReportFocusCategorySourceRow,
  type ReportFocusSourceRow,
  type ReportHealthProfileSourceRow,
  type ReportHistorySourceRow,
  type ReportMealSourceRow,
  type ReportMetricSourceRow,
  type ReportRecordSourceRow,
  type ReportSignalOccurrenceSourceRow,
  type ReportSignalSourceRow,
  type ReportSignalValueSourceRow,
  type ReportSymptomEntrySourceRow,
  type ReportSymptomSourceRow,
  type ReportTaskSourceRow,
  type ReportWaterSourceRow,
  type ReportWeightSourceRow,
  type ReportWorkoutSourceRow,
  type UnifiedReportReadModel,
  type UnifiedReportSourceRows,
} from "../../../src/lib/unified-report-read-model.ts";

const PAGE_SIZE = 1000;

export type ReportReadRequest = {
  endDateKey: string | null;
  startDateKey: string | null;
  todayDateKey: string;
};

type QueryClient = {
  from: (table: string) => ReportQuery;
  rpc: <T>(functionName: string, args: Record<string, unknown>) => ReportRpc<T>;
};

type ReportRpc<T> = PromiseLike<{ data: T[] | null; error: unknown | null }> & {
  range: (from: number, to: number) => ReportRpc<T>;
};

type ReportQuery = {
  eq: (column: string, value: unknown) => ReportQuery;
  gte: (column: string, value: unknown) => ReportQuery;
  in: (column: string, values: string[]) => ReportQuery;
  lte: (column: string, value: unknown) => ReportQuery;
  order: (column: string, options: { ascending: boolean }) => ReportQuery;
  range: (from: number, to: number) => Promise<{ data: unknown[] | null; error: unknown | null }>;
  select: (columns: string) => ReportQuery;
};

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dateBounds(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const todayDateKey = body.todayDateKey;
  const startDateKey = body.startDateKey;
  const endDateKey = body.endDateKey;
  if (!isDateKey(todayDateKey)) return null;
  if (startDateKey !== null && !isDateKey(startDateKey)) return null;
  if (endDateKey !== null && !isDateKey(endDateKey)) return null;
  if (isDateKey(startDateKey) && isDateKey(endDateKey) && startDateKey > endDateKey) return null;
  return { endDateKey: isDateKey(endDateKey) ? endDateKey : null, startDateKey: isDateKey(startDateKey) ? startDateKey : null, todayDateKey } satisfies ReportReadRequest;
}

export function parseReportReadRequest(value: unknown) {
  return dateBounds(value);
}

async function readRows<T>(
  client: QueryClient,
  table: string,
  columns: string,
  userId: string,
  configure?: (query: ReportQuery) => ReportQuery,
  orderColumn = "id",
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = client.from(table).select(columns).eq("user_id", userId);
    query = configure ? configure(query) : query;
    const ordered = orderColumn ? query.order(orderColumn, { ascending: true }) : query;
    const { data, error } = await ordered.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if ((data?.length ?? 0) < PAGE_SIZE) return rows;
  }
}

function inDateRange(column: string, startDateKey: string | null, endDateKey: string | null, includeStart = true) {
  return (query: ReportQuery) => {
    let next = query;
    if (includeStart && startDateKey) next = next.gte(column, startDateKey);
    if (endDateKey) next = next.lte(column, endDateKey);
    return next;
  };
}

function sourceDates(source: Omit<UnifiedReportSourceRows, "startDateKey" | "endDateKey" | "todayDateKey">) {
  return [
    ...source.history.map((row) => row.logical_date),
    ...source.focusSessions.map((row) => row.session_date),
    ...source.meals.map((row) => row.entry_date),
    ...source.water.map((row) => row.entry_date),
    ...source.weight.map((row) => row.entry_date),
    ...source.metrics.map((row) => row.metric_date),
    ...source.workouts.map((row) => row.workout_date),
    ...source.checkIns.map((row) => row.entry_date),
    ...source.signalOccurrences.map((row) => row.entry_date),
    ...source.symptomEntries.map((row) => row.entry_date),
    ...source.records.map((row) => row.credited_date),
  ].filter(isDateKey).sort();
}

export async function readReportTaskHistory(client: QueryClient, userId: string, request: ReportReadRequest) {
  if (request.startDateKey && request.endDateKey) {
    const rows: ReportHistorySourceRow[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await client.rpc<ReportHistorySourceRow>("adhdice_get_report_task_history", {
        p_end_date: request.endDateKey,
        p_start_date: request.startDateKey,
      }).range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < PAGE_SIZE) return rows;
    }
  }
  return readRows<ReportHistorySourceRow>(client, "adhdice_task_history_facts", "entity_id,logical_date,outcome,updated_at", userId);
}

export async function loadReportReadModel(client: QueryClient, userId: string, request: ReportReadRequest): Promise<UnifiedReportReadModel> {
  const warnings: string[] = [];
  const optional = async <T>(label: string, load: () => Promise<T>, fallback: T) => {
    try {
      return await load();
    } catch (error) {
      warnings.push(`${label} unavailable: ${error instanceof Error && error.message ? error.message : "read failed"}.`);
      return fallback;
    }
  };
  const ranged = (column: string) => inDateRange(column, request.startDateKey, request.endDateKey);
  const [tasks, history, focusCategories, focusSessions, profile, meals, water, weight, metrics, workouts, checkIns, signals, symptoms, signalOccurrences, symptomEntries, records] = await Promise.all([
    readRows<ReportTaskSourceRow>(client, "adhdice_clean_tasks", "id,title,parent_task_id,permanently_deleted_at", userId),
    readReportTaskHistory(client, userId, request),
    readRows<ReportFocusCategorySourceRow>(client, "adhdice_focus_categories", "id,title,focus_type,focus_subtype,focus_subtype_2", userId),
    readRows<ReportFocusSourceRow>(client, "adhdice_focus_sessions", "id,category_id,title_snapshot,session_date,duration_seconds", userId, ranged("session_date")),
    optional("Health profile", async () => {
      const rows = await readRows<ReportHealthProfileSourceRow>(client, "adhdice_health_profiles", "calorie_goal,protein_goal_grams,carbs_goal_grams,fat_goal_grams,sleep_goal_minutes,water_goal_ml,preferred_weight_unit", userId, undefined, null);
      return rows[0] ?? null;
    }, null),
    optional("Food", () => readRows<ReportMealSourceRow>(client, "adhdice_health_meal_entries", "entry_date,meal_slot,food_name,calories,protein_g,carbs_g,fat_g,food_snapshot,nutrition_snapshot", userId, ranged("entry_date")), []),
    optional("Water", () => readRows<ReportWaterSourceRow>(client, "adhdice_health_water_entries", "entry_date,amount_ml,confirmed_at", userId, ranged("entry_date")), []),
    optional("Weight", () => readRows<ReportWeightSourceRow>(client, "adhdice_health_weight_entries", "entry_date,logged_at,weight_kg", userId, ranged("entry_date")), []),
    optional("Movement and sleep", () => readRows<ReportMetricSourceRow>(client, "adhdice_health_metric_entries", "metric_date,metric_type,metric_value", userId, ranged("metric_date")), []),
    optional("Workouts", () => readRows<ReportWorkoutSourceRow>(client, "adhdice_health_workouts", "workout_date,title,workout_type,duration_seconds,active_calories", userId, ranged("workout_date")), []),
    optional("Journal entries", () => readRows<ReportCheckInSourceRow>(client, "adhdice_health_checkins", "id,entry_date,entry_time,entry_type,reflection,mood_score,energy_score,stress_score,clarity_score,symptom_tags,structured_answers", userId, ranged("entry_date")), []),
    optional("Journal definitions", () => readRows<ReportSignalSourceRow>(client, "adhdice_health_journal_signals", "id,kind,name,symptom_id", userId), []),
    optional("Symptom definitions", () => readRows<ReportSymptomSourceRow>(client, "adhdice_health_symptoms", "id,name", userId), []),
    optional("Feeling occurrences", () => readRows<ReportSignalOccurrenceSourceRow>(client, "adhdice_health_journal_signal_occurrences", "journal_entry_id,entry_date,signal_id,score", userId, ranged("entry_date")), []),
    optional("Symptoms", () => readRows<ReportSymptomEntrySourceRow>(client, "adhdice_health_symptom_entries", "journal_entry_id,entry_date,symptom_id,severity", userId, ranged("entry_date")), []),
    optional("Record events", () => readRows<ReportRecordSourceRow>(client, "adhdice_record_events", "credited_date,event_kind,metric_key,scope_id,scope_kind,title_snapshot,unit,value", userId, (query) => inDateRange("credited_date", request.startDateKey, request.endDateKey)(query).eq("validity_state", "valid")), []),
  ]);

  const journalEntryIds = checkIns.map((entry) => entry.id);
  const signalValues: ReportSignalValueSourceRow[] = [];
  for (let offset = 0; offset < journalEntryIds.length; offset += 100) {
    const ids = journalEntryIds.slice(offset, offset + 100);
    const values = await optional("Journal ratings", () => readRows<ReportSignalValueSourceRow>(client, "adhdice_health_journal_signal_values", "journal_entry_id,signal_id,score", userId, (query) => query.in("journal_entry_id", ids)), []);
    signalValues.push(...values);
  }

  const common = { checkIns, focusCategories, focusSessions, history, meals, metrics, profile, records, signalOccurrences, signalValues, signals, symptomEntries, symptoms, tasks, water, weight, workouts };
  let startDateKey = request.startDateKey;
  let endDateKey = request.endDateKey;
  if (!startDateKey || !endDateKey) {
    const dates = sourceDates(common);
    startDateKey = dates[0] ?? request.todayDateKey;
    endDateKey = dates.at(-1) && dates.at(-1)! > request.todayDateKey ? dates.at(-1)! : request.todayDateKey;
  }
  return buildUnifiedReportReadModel({ ...common, endDateKey, startDateKey, todayDateKey: request.todayDateKey, warnings });
}
