import type { AchievementCollectionId, AchievementQualifyingOutcome, AchievementTierId, AchievementTrackId } from "@/lib/achievements-mvp/types";

export type AchievementOccurrenceSourceKind = "focus_session" | "step_set" | "task_history";
export type AchievementTaskEntityKind = "parent_task" | "step";

export function isAchievementQualifyingOutcome(value: string): value is AchievementQualifyingOutcome {
  return value === "done" || value === "complete" || value === "did_my_best";
}

export function classifyAchievementTask(parentTaskId: string | null) {
  return parentTaskId === null ? "parent_task" as const : "step" as const;
}

export function buildTaskSourceOccurrenceKey(input: {
  entryDate: string;
  occurrenceKey?: string | null;
  taskId: string;
}) {
  return input.occurrenceKey?.trim()
    ? `task:${identityPart(input.taskId)}:${identityPart(input.occurrenceKey)}`
    : `task:${identityPart(input.taskId)}:logical-date:${identityPart(input.entryDate)}`;
}

export function buildTaskLogicalOccurrencePart(input: {
  entryDate: string;
  occurrenceKey?: string | null;
  repeatFrequency?: string | null;
  taskId: string;
}) {
  if (input.occurrenceKey?.trim()) return input.occurrenceKey;
  if (input.repeatFrequency === "none") return `lifetime:${input.taskId}`;
  return `logical-date:${input.entryDate}`;
}

/**
 * Canonical Achievement occurrence identities are deliberately split:
 * - source identity: source_kind + source_id, where Task History source_id is the exact history row UUID.
 * - logical identity: dedupe_key below, which counts one parent Task or Step occurrence once.
 *
 * Fallback order for Task/Step logical occurrence identity:
 * 1. persisted occurrence_key, including recurring occurrence keys and one-off lifetime keys;
 * 2. lifetime:<task-id> for non-recurring rows missing occurrence_key;
 * 3. logical-date:<entry-date> only when no stronger identity exists.
 */
export function buildTaskAchievementLogicalDedupeKey(input: {
  entityKind: AchievementTaskEntityKind;
  entryDate: string;
  occurrenceKey?: string | null;
  repeatFrequency?: string | null;
  taskId: string;
}) {
  return `occurrence:v1:task_history:${input.entityKind}:${identityPart(input.taskId)}:${identityPart(buildTaskLogicalOccurrencePart(input))}`;
}

export function buildFocusSourceOccurrenceKey(sessionId: string) {
  return `focus-session:${identityPart(sessionId)}`;
}

export function buildAggregateOccurrenceKey(
  period: "day" | "month" | "week",
  scope: "focus" | "parent_task" | "step",
  periodKey: string,
) {
  return `aggregate:v1:${period}:${scope}:${identityPart(periodKey)}`;
}

export function buildStreakOccurrenceKey(trackId: AchievementTrackId, startDate: string, endDate: string) {
  return `streak:v1:${trackId}:${identityPart(startDate)}:${identityPart(endDate)}`;
}

export function buildParentStepSetOccurrenceKey(parentTaskId: string, stepOccurrenceKeys: readonly string[]) {
  const normalized = [...new Set(stepOccurrenceKeys.map(identityPart))].sort();
  if (normalized.length === 0) throw new Error("A complete Step set requires at least one Step occurrence.");
  return `parent-step-set:v1:${identityPart(parentTaskId)}:${normalized.join("|")}`;
}

function identityPart(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Achievement identity parts cannot be empty.");
  return encodeURIComponent(trimmed);
}

export function buildAchievementTierAwardKey(trackId: AchievementTrackId, tier: AchievementTierId) {
  return `tier-award:v1:${trackId}:${tier}`;
}

export function buildAchievementCollectionAwardKey(collectionId: AchievementCollectionId, masteryVersion: string) {
  return `collection-award:v1:${collectionId}:${identityPart(masteryVersion)}`;
}

export function buildAchievementNotificationDedupeKey(awardKey: string) {
  if (!awardKey.trim()) throw new Error("Achievement notification award keys cannot be empty.");
  return `notification:v1:${awardKey.trim()}`;
}

export function planPermanentAwardReconciliation(existingAwardKeys: readonly string[], eligibleAwardKeys: readonly string[]) {
  const existing = new Set(existingAwardKeys);
  return Object.freeze({
    awardsToDelete: Object.freeze([] as string[]),
    awardsToInsert: Object.freeze([...new Set(eligibleAwardKeys)].filter((key) => !existing.has(key))),
  });
}
