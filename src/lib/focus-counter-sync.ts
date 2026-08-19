import type { FocusCounter, FocusCounterHistoryEntry } from "@/lib/types";

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

export type FocusCounterMutationResult = {
  ok: boolean;
  conflict?: boolean;
  was_replayed?: boolean;
  counter?: FocusCounterRow | null;
  event?: FocusCounterEventRow | null;
};

export function mapFocusCounterRow(row: FocusCounterRow): FocusCounter {
  return {
    id: row.id,
    title: row.title,
    color: row.color,
    icon: row.icon,
    value: Number(row.value),
    step: Number(row.step),
    goal: Number(row.goal),
    sortOrder: Number(row.sort_order),
    revision: Number(row.revision),
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapFocusCounterEventRow(row: FocusCounterEventRow): FocusCounterHistoryEntry | null {
  if (row.previous_value === null || row.next_value === null) return null;
  if (!row.title_snapshot || row.step_snapshot === null) return null;
  return {
    id: row.id,
    counterId: row.counter_id,
    counterTitleSnapshot: row.title_snapshot,
    delta: row.delta === null ? Number(row.next_value) - Number(row.previous_value) : Number(row.delta),
    previousValue: Number(row.previous_value),
    nextValue: Number(row.next_value),
    stepSnapshot: Number(row.step_snapshot),
    eventType: row.event_type,
    createdAt: row.client_created_at ?? row.created_at,
  };
}

export function reconcileFocusCounterSnapshot(rows: FocusCounterRow[]) {
  return rows
    .filter((row) => row.deleted_at === null)
    .sort((left, right) => Number(left.sort_order) - Number(right.sort_order) || left.id.localeCompare(right.id))
    .map(mapFocusCounterRow);
}

export function reconcileFocusCounterHistorySnapshot(rows: FocusCounterEventRow[]) {
  return rows
    .map(mapFocusCounterEventRow)
    .filter((entry): entry is FocusCounterHistoryEntry => entry !== null)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id.localeCompare(left.id));
}

export function applyAuthoritativeFocusCounterRow(counters: FocusCounter[], row: FocusCounterRow) {
  const current = counters.find((counter) => counter.id === row.id);
  if (current && current.revision > Number(row.revision)) return counters;
  return [...counters.filter((counter) => counter.id !== row.id), ...(row.deleted_at ? [] : [mapFocusCounterRow(row)])]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
}

export function applyAuthoritativeFocusCounterEvent(history: FocusCounterHistoryEntry[], row: FocusCounterEventRow) {
  const entry = mapFocusCounterEventRow(row);
  if (!entry) return history;
  return [entry, ...history.filter((candidate) => candidate.id !== entry.id)]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id.localeCompare(left.id));
}

export function isCurrentFocusCounterSnapshotRequest(requestGeneration: number, currentGeneration: number) {
  return requestGeneration === currentGeneration;
}
