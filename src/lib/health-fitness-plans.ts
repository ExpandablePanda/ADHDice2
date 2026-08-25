import type {
  HealthFitnessPlan,
  HealthFitnessPlanItem,
  HealthWorkout,
  HealthWorkoutPlanItemLink,
} from "@/lib/database.types";
import { getHealthWeekBounds } from "@/lib/health-fitness";

export const HEALTH_PLAN_WEEKDAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
] as const;

export type HealthFitnessPlanItemDraft = {
  id?: string;
  day_of_week: number;
  workout_type: string;
  title: string;
  expected_duration_minutes: string;
  notes: string;
};

export function reconcileHealthFitnessPlanItemDraft(
  items: readonly HealthFitnessPlanItemDraft[],
  itemIndex: number,
  persistedId: string,
) {
  return items.map((item, index) => index === itemIndex ? { ...item, id: persistedId } : item);
}

export type HealthFitnessPlanItemWeekStatus = HealthFitnessPlanItem & {
  activeForCurrentWeek: boolean;
  completedForCurrentWeek: boolean;
  linkedWorkoutIds: string[];
};

export type HealthFitnessPlanWeekView = {
  plan: HealthFitnessPlan;
  items: HealthFitnessPlanItemWeekStatus[];
};

export function getHealthPlanWeekdayLabel(dayOfWeek: number) {
  return HEALTH_PLAN_WEEKDAYS.find((day) => day.value === dayOfWeek)?.label ?? "Unknown day";
}

export function getHealthPlanWeekdayDate(weekStart: string, dayOfWeek: number) {
  const date = new Date(`${weekStart}T12:00:00`);
  date.setDate(date.getDate() + dayOfWeek - 1);
  return formatHealthPlanDateKey(date);
}

export function isHealthPlanItemActiveForWeek(
  plan: HealthFitnessPlan,
  item: HealthFitnessPlanItem,
  asOfDate: string,
) {
  const { endDate, startDate } = getHealthWeekBounds(asOfDate);
  const scheduledDate = getHealthPlanWeekdayDate(startDate, item.day_of_week);
  return plan.archived_at === null
    && item.archived_at === null
    && scheduledDate >= startDate
    && scheduledDate <= endDate
    && scheduledDate >= plan.starts_on;
}

export function isHealthWorkoutInWeek(workout: HealthWorkout, asOfDate: string) {
  const { endDate, startDate } = getHealthWeekBounds(asOfDate);
  return workout.workout_date >= startDate && workout.workout_date <= endDate;
}

export function getHealthPlanItemWeekStatus(
  plan: HealthFitnessPlan,
  item: HealthFitnessPlanItem,
  links: readonly HealthWorkoutPlanItemLink[],
  workouts: readonly HealthWorkout[],
  asOfDate: string,
): HealthFitnessPlanItemWeekStatus {
  const linkedWorkoutIds = links
    .filter((link) => link.plan_item_id === item.id)
    .map((link) => link.workout_id);
  const workoutById = new Map(workouts.map((workout) => [workout.id, workout]));
  const activeForCurrentWeek = isHealthPlanItemActiveForWeek(plan, item, asOfDate);
  const completedForCurrentWeek = activeForCurrentWeek
    && linkedWorkoutIds.some((workoutId) => {
      const workout = workoutById.get(workoutId);
      return workout ? isHealthWorkoutInWeek(workout, asOfDate) : false;
    });

  return {
    ...item,
    activeForCurrentWeek,
    completedForCurrentWeek,
    linkedWorkoutIds,
  };
}

export function buildActiveHealthFitnessPlanWeekViews(
  plans: readonly HealthFitnessPlan[],
  items: readonly HealthFitnessPlanItem[],
  links: readonly HealthWorkoutPlanItemLink[],
  workouts: readonly HealthWorkout[],
  asOfDate: string,
): HealthFitnessPlanWeekView[] {
  return plans
    .filter((plan) => plan.archived_at === null)
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
    .map((plan) => ({
      plan,
      items: items
        .filter((item) => item.plan_id === plan.id && item.archived_at === null)
        .sort((left, right) => left.sort_order - right.sort_order || left.day_of_week - right.day_of_week)
        .map((item) => getHealthPlanItemWeekStatus(plan, item, links, workouts, asOfDate)),
    }));
}

export function getHealthWorkoutPlanItemIds(
  workoutId: string,
  links: readonly HealthWorkoutPlanItemLink[],
) {
  return links.filter((link) => link.workout_id === workoutId).map((link) => link.plan_item_id);
}

export function getHealthWorkoutPlanItemLabel(
  planItemId: string,
  plans: readonly HealthFitnessPlan[],
  items: readonly HealthFitnessPlanItem[],
) {
  const item = items.find((candidate) => candidate.id === planItemId);
  if (!item) {
    return null;
  }
  const plan = plans.find((candidate) => candidate.id === item.plan_id);
  if (!plan) {
    return item.title?.trim() || item.workout_type;
  }
  const detail = item.title?.trim() || item.workout_type;
  return `${plan.name} · ${getHealthPlanWeekdayLabel(item.day_of_week)} ${detail}`;
}

export function getHealthPlanItemDurationSeconds(draft: Pick<HealthFitnessPlanItemDraft, "expected_duration_minutes">) {
  const trimmed = draft.expected_duration_minutes.trim();
  if (!trimmed) {
    return null;
  }
  const minutes = Number(trimmed);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  return Math.round(minutes * 60);
}

export function validateHealthFitnessPlanItemDraft(draft: HealthFitnessPlanItemDraft) {
  if (!HEALTH_PLAN_WEEKDAYS.some((day) => day.value === draft.day_of_week)) {
    return "Choose a weekday for each planned item.";
  }
  if (!draft.workout_type.trim()) {
    return "Choose a workout type for each planned item.";
  }
  if (draft.expected_duration_minutes.trim() && getHealthPlanItemDurationSeconds(draft) === null) {
    return "Expected duration must be greater than zero.";
  }
  return null;
}

function formatHealthPlanDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
