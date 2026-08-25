import type { HealthWorkout, HealthWorkoutInsert, HealthWorkoutUpdate } from "@/lib/database.types";
import type { HealthWorkoutSessionSaveResult } from "@/hooks/useFitnessSessionDetails";
import type { HealthWorkoutStructuredDraft } from "@/lib/health-fitness-session";

export type HealthWorkoutBundleSaveStage = "workout" | "structured" | "plans" | null;

export type HealthWorkoutBundleSaveResult = {
  canonicalWorkoutId: string | null;
  draft: HealthWorkoutStructuredDraft;
  failedStage: HealthWorkoutBundleSaveStage;
  ok: boolean;
};

export type HealthWorkoutBundleSaveInput = {
  addWorkout: (input: Omit<HealthWorkoutInsert, "user_id">) => Promise<HealthWorkout | null>;
  canonicalWorkoutId?: string | null;
  draft: HealthWorkoutStructuredDraft;
  hasExistingPlanLinks?: boolean;
  planItemIds: readonly string[];
  saveWorkoutPlanItemLinks: (workoutId: string, planItemIds: readonly string[]) => Promise<boolean>;
  saveWorkoutSessionDetails: (workoutId: string, draft: HealthWorkoutStructuredDraft) => Promise<HealthWorkoutSessionSaveResult>;
  shouldSavePlanLinks?: boolean;
  shouldSaveStructuredDetails?: boolean;
  updateWorkout: (workoutId: string, input: HealthWorkoutUpdate) => Promise<boolean>;
  workout: Omit<HealthWorkoutInsert, "user_id">;
};

/**
 * Canonical Fitness bundle order: Workout -> structured children -> explicit Plan links.
 * A caller can retain canonicalWorkoutId and retry this same bundle without inserting
 * another parent Workout.
 */
export async function saveHealthWorkoutBundle(input: HealthWorkoutBundleSaveInput): Promise<HealthWorkoutBundleSaveResult> {
  let canonicalWorkoutId = input.canonicalWorkoutId ?? null;
  let draft = input.draft;

  if (canonicalWorkoutId) {
    const updated = await input.updateWorkout(canonicalWorkoutId, toWorkoutUpdate(input.workout));
    if (!updated) {
      return { canonicalWorkoutId, draft, failedStage: "workout", ok: false };
    }
  } else {
    const savedWorkout = await input.addWorkout(input.workout);
    if (!savedWorkout) {
      return { canonicalWorkoutId: null, draft, failedStage: "workout", ok: false };
    }
    canonicalWorkoutId = savedWorkout.id;
  }

  if (input.shouldSaveStructuredDetails !== false) {
    const structuredSave = await input.saveWorkoutSessionDetails(canonicalWorkoutId, draft);
    draft = structuredSave.draft;
    if (!structuredSave.ok) {
      return { canonicalWorkoutId, draft, failedStage: "structured", ok: false };
    }
  }

  const shouldSavePlanLinks = input.shouldSavePlanLinks
    ?? (input.planItemIds.length > 0 || input.hasExistingPlanLinks === true);
  if (shouldSavePlanLinks && !(await input.saveWorkoutPlanItemLinks(canonicalWorkoutId, input.planItemIds))) {
    return { canonicalWorkoutId, draft, failedStage: "plans", ok: false };
  }

  return { canonicalWorkoutId, draft, failedStage: null, ok: true };
}

function toWorkoutUpdate(input: Omit<HealthWorkoutInsert, "user_id">): HealthWorkoutUpdate {
  return {
    active_calories: input.active_calories ?? null,
    duration_seconds: input.duration_seconds,
    ended_at: input.ended_at ?? null,
    notes: input.notes ?? "",
    started_at: input.started_at ?? null,
    title: input.title,
    workout_date: input.workout_date,
    workout_type: input.workout_type,
  };
}
