export type OnTimePlanItem = LinkedPlanItem | TemporaryPlanItem;

export type LinkedPlanItem = {
  id: string;
  kind: "task";
  taskId: string;
  titleSnapshot: string;
  hierarchySnapshot: string[];
  occurrenceKey: string | null;
  occurrenceDueOn: string | null;
  plannedSeconds: number | null;
  durationSource: "manual" | "typical" | "custom";
};

export type TemporaryPlanItem = {
  id: string;
  kind: "temporary";
  title: string;
  plannedSeconds: number | null;
  completed: boolean;
};

export type OnTimePlanV1 = {
  schemaVersion: 1;
  destinationLabel: string;
  arriveAt: string | null;
  timezone: string;
  travelMinutes: number | null;
  arrivalBufferMinutes: number;
  items: OnTimePlanItem[];
  clientUpdatedAt: string;
};

const MAX_MINUTES = 7 * 24 * 60;
const MAX_ITEM_SECONDS = 30 * 24 * 60 * 60;

function validIso(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function nullableNumber(value: unknown, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.min(max, Math.round(value));
}

function nullablePositiveNumber(value: unknown, max: number): number | null {
  const normalized = nullableNumber(value, max);
  return normalized !== null && normalized > 0 ? normalized : null;
}

function normalizeItem(value: unknown): OnTimePlanItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || !item.id.trim()) return null;
  if (item.kind === "task") {
    if (typeof item.taskId !== "string" || !item.taskId.trim()) return null;
    const source = item.durationSource;
    return {
      id: item.id,
      kind: "task",
      taskId: item.taskId,
      titleSnapshot: typeof item.titleSnapshot === "string" ? item.titleSnapshot : "Unavailable task",
      hierarchySnapshot: Array.isArray(item.hierarchySnapshot)
        ? item.hierarchySnapshot.filter((part): part is string => typeof part === "string")
        : [],
      occurrenceKey: typeof item.occurrenceKey === "string" ? item.occurrenceKey : null,
      occurrenceDueOn: typeof item.occurrenceDueOn === "string" ? item.occurrenceDueOn : null,
      plannedSeconds: nullablePositiveNumber(item.plannedSeconds, MAX_ITEM_SECONDS),
      durationSource: source === "typical" || source === "custom" ? source : "manual",
    };
  }
  if (item.kind === "temporary") {
    return {
      id: item.id,
      kind: "temporary",
      title: typeof item.title === "string" ? item.title : "Untitled item",
      plannedSeconds: nullablePositiveNumber(item.plannedSeconds, MAX_ITEM_SECONDS),
      completed: item.completed === true,
    };
  }
  return null;
}

export function createEmptyOnTimePlan(timezone = "UTC", clientUpdatedAt = new Date(0).toISOString()): OnTimePlanV1 {
  return {
    schemaVersion: 1,
    destinationLabel: "",
    arriveAt: null,
    timezone: timezone || "UTC",
    travelMinutes: null,
    arrivalBufferMinutes: 0,
    items: [],
    clientUpdatedAt: validIso(clientUpdatedAt) ?? new Date(0).toISOString(),
  };
}

export function normalizeOnTimePlan(value: unknown, fallbackTimezone = "UTC"): OnTimePlanV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return createEmptyOnTimePlan(fallbackTimezone);
  const plan = value as Record<string, unknown>;
  return {
    schemaVersion: 1,
    destinationLabel: typeof plan.destinationLabel === "string" ? plan.destinationLabel.slice(0, 300) : "",
    arriveAt: validIso(plan.arriveAt),
    timezone: typeof plan.timezone === "string" && plan.timezone.trim() ? plan.timezone : fallbackTimezone,
    travelMinutes: nullableNumber(plan.travelMinutes, MAX_MINUTES),
    arrivalBufferMinutes: nullableNumber(plan.arrivalBufferMinutes, MAX_MINUTES) ?? 0,
    items: Array.isArray(plan.items) ? plan.items.map(normalizeItem).filter((item): item is OnTimePlanItem => item !== null) : [],
    clientUpdatedAt: validIso(plan.clientUpdatedAt) ?? new Date(0).toISOString(),
  };
}

export function onTimePlanSignature(plan: OnTimePlanV1): string {
  return JSON.stringify(normalizeOnTimePlan(plan));
}

export function onTimePlansEqual(left: OnTimePlanV1, right: OnTimePlanV1): boolean {
  return onTimePlanSignature(left) === onTimePlanSignature(right);
}

export function isMeaningfulOnTimePlan(plan: OnTimePlanV1): boolean {
  return Boolean(plan.destinationLabel.trim() || plan.arriveAt || plan.travelMinutes !== null || plan.arrivalBufferMinutes || plan.items.length);
}

export function updateOnTimePlan(plan: OnTimePlanV1, changes: Partial<Omit<OnTimePlanV1, "schemaVersion" | "clientUpdatedAt">>, now = new Date()): OnTimePlanV1 {
  return normalizeOnTimePlan({ ...plan, ...changes, schemaVersion: 1, clientUpdatedAt: now.toISOString() }, plan.timezone);
}
