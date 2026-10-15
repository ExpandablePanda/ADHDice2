import type { HealthMealPlanEntry, HealthMealSlot } from "@/lib/database.types";
import type { EditingSessionStore } from "@/lib/editing-session-store";
import { prepareMealDraftForSelectedSlot, type MealDraft } from "@/lib/health-meal-draft";
import { mealDraftFromHealthMealPlan } from "@/lib/health-meal-planning";

export type HealthMealPlanEditingSessionDraft = {
  kind: "new-plan" | "saved-plan";
  planId: string;
  quickFoodId: string;
  mealDraft: MealDraft;
  saveToLibrary: boolean;
};

export type HealthMealPlanEditingSessionSaveResult =
  | { savedDraft: HealthMealPlanEditingSessionDraft }
  | { error: string };

export function healthMealPlanEntrySessionId(planId: string) {
  return `health-meal-plan-entry:${planId}`;
}

export function healthMealPlanNewEntrySessionId(draftId: string) {
  return `health-meal-plan-new:${draftId}`;
}

export function healthMealPlanNewEntryCanonicalId(draftId: string) {
  return `unsaved-health-meal-plan:${draftId}`;
}

export function createHealthMealPlanEditingSessionDraft(
  kind: HealthMealPlanEditingSessionDraft["kind"],
  planId: string,
  mealDraft: MealDraft,
  quickFoodId = planId,
): HealthMealPlanEditingSessionDraft {
  return { kind, planId, quickFoodId, mealDraft, saveToLibrary: false };
}

export function createHealthMealPlanEditingSessionDraftFromEntry(plan: HealthMealPlanEntry) {
  return createHealthMealPlanEditingSessionDraft("saved-plan", plan.id, mealDraftFromHealthMealPlan(plan));
}

export function areHealthMealPlanEditingSessionDraftsEqual(
  left: HealthMealPlanEditingSessionDraft,
  right: HealthMealPlanEditingSessionDraft,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function ensureHealthMealPlanNewSession({
  store,
  draftId,
  canonicalRecordId,
  initialDraft,
  viewId,
}: {
  store: EditingSessionStore<HealthMealPlanEditingSessionDraft>;
  draftId: string;
  canonicalRecordId: string;
  initialDraft: HealthMealPlanEditingSessionDraft;
  viewId: string;
}) {
  const current = store.getSnapshot(draftId);
  store.ensureSession(draftId, canonicalRecordId, current?.baseline ?? initialDraft);
  store.attachView(draftId, viewId);
  return store.getSnapshot(draftId);
}

export function openHealthMealPlanComposerForSlot({
  store,
  draftId,
  canonicalRecordId,
  initialDraft,
  historyDate,
  mealSlot,
  viewId,
}: {
  store: EditingSessionStore<HealthMealPlanEditingSessionDraft>;
  draftId: string;
  canonicalRecordId: string;
  initialDraft: HealthMealPlanEditingSessionDraft;
  historyDate: string;
  mealSlot: HealthMealSlot;
  viewId: string;
}) {
  const current = store.getSnapshot(draftId);
  if (current && (current.dirty || current.saveError || current.isSaving || current.draft.kind !== "new-plan")) {
    store.attachView(draftId, viewId);
    return { preserved: true, session: current };
  }
  const currentDraft = current?.draft ?? initialDraft;
  const nextDraft: HealthMealPlanEditingSessionDraft = {
    ...currentDraft,
    mealDraft: prepareMealDraftForSelectedSlot(currentDraft.mealDraft, historyDate, mealSlot),
    saveToLibrary: false,
  };
  if (current) store.rebaseIfClean(draftId, nextDraft);
  else store.ensureSession(draftId, canonicalRecordId, nextDraft);
  store.attachView(draftId, viewId);
  return { preserved: false, session: store.getSnapshot(draftId)! };
}

export function ensureHealthMealPlanSavedSession({
  store,
  plan,
  viewId,
}: {
  store: EditingSessionStore<HealthMealPlanEditingSessionDraft>;
  plan: HealthMealPlanEntry;
  viewId: string;
}) {
  const draftId = healthMealPlanEntrySessionId(plan.id);
  if (plan.confirmed_at === null) {
    store.ensureSession(draftId, plan.id, createHealthMealPlanEditingSessionDraftFromEntry(plan));
  }
  if (store.getSnapshot(draftId)) store.attachView(draftId, viewId);
  return store.getSnapshot(draftId);
}

export async function saveHealthMealPlanEditingSession({
  store,
  draftId,
  save,
  removeAfterSuccess = false,
}: {
  store: EditingSessionStore<HealthMealPlanEditingSessionDraft>;
  draftId: string;
  save: (draft: HealthMealPlanEditingSessionDraft) => Promise<HealthMealPlanEditingSessionSaveResult>;
  removeAfterSuccess?: boolean;
}) {
  const session = store.getSnapshot(draftId);
  if (!session || session.isSaving) return false;
  const saveRevision = store.beginSave(draftId);
  if (saveRevision === null) return false;
  try {
    const result = await save(session.draft);
    if ("error" in result) {
      store.saveFailed(draftId, saveRevision, result.error);
      return false;
    }
    return removeAfterSuccess
      ? store.removeAfterSave(draftId, saveRevision)
      : store.saveSucceeded(draftId, saveRevision, result.savedDraft);
  } catch (error) {
    store.saveFailed(draftId, saveRevision, error instanceof Error ? error.message : "The planned meal could not be saved. Your draft is still here.");
    return false;
  }
}

export async function runHealthMealPlanLifecycleAction({
  store,
  draftId,
  action,
  errorMessage,
}: {
  store: EditingSessionStore<HealthMealPlanEditingSessionDraft>;
  draftId: string;
  action: () => Promise<boolean>;
  errorMessage: string;
}) {
  const session = store.getSnapshot(draftId);
  if (session?.dirty || session?.isSaving) return { success: false, blockedByDraft: true };
  if (!session) return { success: await action(), blockedByDraft: false };
  const saveRevision = store.beginSave(draftId);
  if (saveRevision === null) return { success: false, blockedByDraft: true };
  try {
    const success = await action();
    if (success) store.removeAfterSave(draftId, saveRevision);
    else store.saveFailed(draftId, saveRevision, errorMessage);
    return { success, blockedByDraft: false };
  } catch (error) {
    store.saveFailed(draftId, saveRevision, error instanceof Error ? error.message : errorMessage);
    return { success: false, blockedByDraft: false };
  }
}
