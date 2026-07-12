export function getTaskHistoryInitialFocusDateKey({
  initialDateKey,
  todayDateKey,
}: {
  initialDateKey?: string | null;
  todayDateKey: string;
}) {
  return initialDateKey ?? todayDateKey;
}

export function getComfortableTaskHistoryScrollOffset({
  containerSize,
  targetOffset,
  targetSize,
}: {
  containerSize: number;
  targetOffset: number;
  targetSize: number;
}) {
  return Math.max(0, targetOffset - Math.max(24, (containerSize - targetSize) / 2));
}
