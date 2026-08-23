export type FocusType = string;
export type FocusSubtype = string;
export type FocusReallocationMode = "manual" | "automatic";
export type FocusTargetDistributionMode = "auto" | "manual";
export type FocusWeeklySurplusCarryoverMode = "off" | "cap25" | "cap50" | "full";
export type FocusWeekdayTargetSeconds = Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", number>>;

export const DEFAULT_FOCUS_TYPES = ["Work", "Personal", "Entertainment", "Sleep"];
export const DEFAULT_PRIMARY_SUBTYPES: string[] = [];
export const DEFAULT_SECONDARY_SUBTYPES: string[] = [];
export const DEFAULT_FOCUS_TITLES = ["Deep Work", "Admin", "Exercise", "Reading"];
export const DEFAULT_FOCUS_CATEGORY_TITLES = ["Coding", "Lamprey Systems", "Sleep"];

export type FocusCategory = {
  id: string;
  title: string;
  focusType: FocusType;
  focusSubtype?: FocusSubtype | null;
  focusSubtype2?: FocusSubtype | null;
  color: string;
  icon: string;
  dailyGoalSeconds?: number | null;
  weeklyGoalSeconds?: number | null;
  priorityLevel?: number | null;
  targetDistributionMode?: FocusTargetDistributionMode | null;
  weekdayTargetSeconds?: FocusWeekdayTargetSeconds | null;
  countTowardProductiveGoal?: boolean | null;
  allowDailySurplusReduction?: boolean | null;
  weeklySurplusCarryoverMode?: FocusWeeklySurplusCarryoverMode | null;
};

export type FocusDailyGoalAdjustment = {
  id: string;
  userId: string;
  adjustmentDate: string;
  sourceCategoryId: string;
  targetCategoryId: string;
  sourceSessionId?: string | null;
  reductionSeconds: number;
  reason: string;
  createdAt: string;
  updatedAt: string;
};

export type PendingFocusDailySurplus = {
  sourceCategoryId: string;
  sourceCategoryTitle: string;
  sourceSessionId: string | null;
  adjustmentDate: string;
  surplusSeconds: number;
  reason?: string;
};

export type ActiveFocusSession = {
  categoryId: string;
  sessionId?: string;
  startTime: number | null;
  accumulatedSeconds: number;
  isRunning: boolean;
  mode?: "countdown" | "countup";
  countdownTargetSeconds?: number | null;
  revision?: number;
  updatedAt?: string;
};

export type HistoricalFocusSession = {
  id: string;
  categoryId: string | null;
  title: string;
  date: string; // YYYY-MM-DD
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds: number;
  focusType: FocusType;
  focusSubtype?: FocusSubtype | null;
  focusSubtype2?: FocusSubtype | null;
  notes?: string;
  createdAt?: string;
};

export type FocusLabelOptions = {
  titles: string[];
  types: string[];
  primarySubtypes: string[];
  secondarySubtypes: string[];
  allSubtypes: string[];
};

export type FocusCounter = {
  id: string;
  title: string;
  color: string;
  icon: string;
  value: number;
  step: number;
  goal: number;
  sortOrder: number;
  revision: number;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FocusCounterHistoryEntry = {
  id: string;
  counterId: string;
  counterTitleSnapshot: string;
  delta: number;
  previousValue?: number;
  nextValue: number;
  stepSnapshot: number;
  eventType?: "create" | "adjust" | "set_value" | "update" | "delete" | "migrate";
  createdAt: string;
};
