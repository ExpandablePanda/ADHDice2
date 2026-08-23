export const HEALTH_WORKOUT_TYPES = [
  "Walking",
  "Running",
  "Strength Training",
  "Cycling",
  "Cardio",
  "Stretching",
  "Sports",
  "Standing",
  "Other",
] as const;

export const HEALTH_WORKOUT_OPTION_MAX_LENGTH = 120;

export function moveFitnessOption<T>(options: readonly T[], fromIndex: number, toIndex: number) {
  if (
    !Number.isInteger(fromIndex)
    || !Number.isInteger(toIndex)
    || fromIndex < 0
    || fromIndex >= options.length
    || toIndex < 0
    || toIndex >= options.length
    || fromIndex === toIndex
  ) {
    return [...options];
  }

  const nextOptions = [...options];
  const [movedOption] = nextOptions.splice(fromIndex, 1);
  nextOptions.splice(toIndex, 0, movedOption);
  return nextOptions;
}

export function normalizeHealthWorkoutOptionValues(options: readonly string[] | null | undefined) {
  const normalized: string[] = [];
  for (const option of options ?? []) {
    const trimmed = option.trim();
    if (!trimmed || trimmed.length > HEALTH_WORKOUT_OPTION_MAX_LENGTH) {
      continue;
    }
    if (normalized.some((existing) => existing.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
      continue;
    }
    normalized.push(trimmed);
  }
  return normalized;
}
