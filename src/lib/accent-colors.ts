export const ADHDICE_ACCENT_COLORS = [
  "#6f57f6",
  "#3b82f6",
  "#06b6d4",
  "#14b8a6",
  "#12a876",
  "#84cc16",
  "#f59e0b",
  "#ea580c",
  "#f97316",
  "#ef4444",
  "#f05566",
  "#ec4899",
  "#d946ef",
  "#8b5cf6",
  "#6366f1",
  "#64748b",
] as const;

export type AdhdiceAccentColor = (typeof ADHDICE_ACCENT_COLORS)[number];
