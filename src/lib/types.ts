export type FocusType = string;
export type FocusSubtype = string;

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
};

export type ActiveFocusSession = {
  categoryId: string;
  startTime: number | null;
  accumulatedSeconds: number;
  isRunning: boolean;
  mode?: "countdown" | "countup";
  countdownTargetSeconds?: number | null;
};

export type HistoricalFocusSession = {
  id: string;
  categoryId: string | null;
  title: string;
  date: string; // YYYY-MM-DD
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
  createdAt: string;
  updatedAt: string;
};

export type FocusCounterHistoryEntry = {
  id: string;
  counterId: string;
  counterTitleSnapshot: string;
  delta: number;
  nextValue: number;
  stepSnapshot: number;
  createdAt: string;
};
