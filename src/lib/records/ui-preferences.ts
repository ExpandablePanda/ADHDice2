export const RECORDS_SECTION_STORAGE_KEY = "adhdice-records-sections";

export const RECORDS_SECTION_IDS = [
  "global_tasks",
  "streaks",
  "focus",
  "per_task",
  "history",
] as const;

export type RecordsSectionId = (typeof RECORDS_SECTION_IDS)[number];
export type RecordsSectionExpandedState = Record<RecordsSectionId, boolean>;

export const DEFAULT_RECORDS_SECTION_EXPANDED_STATE: RecordsSectionExpandedState = {
  global_tasks: true,
  streaks: true,
  focus: true,
  per_task: true,
  history: true,
};

export function getRecordsSectionStorageKey(userId: string) {
  return `${RECORDS_SECTION_STORAGE_KEY}:${userId}`;
}

export function normalizeRecordsSectionExpandedState(value: unknown): RecordsSectionExpandedState {
  if (!value || typeof value !== "object") return { ...DEFAULT_RECORDS_SECTION_EXPANDED_STATE };
  const candidate = value as Partial<Record<RecordsSectionId, unknown>>;
  return RECORDS_SECTION_IDS.reduce<RecordsSectionExpandedState>((state, sectionId) => {
    state[sectionId] = typeof candidate[sectionId] === "boolean"
      ? candidate[sectionId]
      : DEFAULT_RECORDS_SECTION_EXPANDED_STATE[sectionId];
    return state;
  }, { ...DEFAULT_RECORDS_SECTION_EXPANDED_STATE });
}

export function readRecordsSectionExpandedState(storage: Pick<Storage, "getItem">, userId: string) {
  const saved = storage.getItem(getRecordsSectionStorageKey(userId));
  if (!saved) return { ...DEFAULT_RECORDS_SECTION_EXPANDED_STATE };
  try {
    return normalizeRecordsSectionExpandedState(JSON.parse(saved));
  } catch {
    return { ...DEFAULT_RECORDS_SECTION_EXPANDED_STATE };
  }
}

export function writeRecordsSectionExpandedState(
  storage: Pick<Storage, "setItem">,
  userId: string,
  state: RecordsSectionExpandedState,
) {
  storage.setItem(getRecordsSectionStorageKey(userId), JSON.stringify(state));
}
