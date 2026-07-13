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

export type OnTimePlanV2 = {
  schemaVersion: 2;
  destination: {
    source: "manual" | "google_place";
    label: string;
    placeId: string | null;
  };
  originMode: "current_location";
  travel: {
    selectedSource: "manual" | "traffic";
    manualDurationSeconds: number | null;
  };
  arriveAt: string | null;
  timezone: string;
  arrivalBufferMinutes: number;
  items: OnTimePlanItem[];
  clientUpdatedAt: string;
};

export type OnTimePlanUpdate = Partial<Omit<OnTimePlanV2, "schemaVersion" | "clientUpdatedAt">>;
export type OnTimePlanSchemaVersion = 0 | 1 | 2;

const MAX_MINUTES = 7 * 24 * 60;
const MAX_TRAVEL_SECONDS = MAX_MINUTES * 60;
const MAX_ITEM_SECONDS = 30 * 24 * 60 * 60;
const EPOCH = new Date(0).toISOString();

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

export function getOnTimePlanSchemaVersion(value: unknown): OnTimePlanSchemaVersion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const version = (value as Record<string, unknown>).schemaVersion;
  return version === 2 ? 2 : version === 1 || version === undefined ? 1 : 0;
}

export function createEmptyOnTimePlan(timezone = "UTC", clientUpdatedAt = EPOCH): OnTimePlanV2 {
  return {
    schemaVersion: 2,
    destination: { source: "manual", label: "", placeId: null },
    originMode: "current_location",
    travel: { selectedSource: "manual", manualDurationSeconds: null },
    arriveAt: null,
    timezone: timezone || "UTC",
    arrivalBufferMinutes: 0,
    items: [],
    clientUpdatedAt: validIso(clientUpdatedAt) ?? EPOCH,
  };
}

function normalizeDestination(plan: Record<string, unknown>) {
  if (getOnTimePlanSchemaVersion(plan) !== 2) {
    return {
      source: "manual" as const,
      label: typeof plan.destinationLabel === "string" ? plan.destinationLabel.slice(0, 300) : "",
      placeId: null,
    };
  }
  const value = plan.destination;
  if (!value || typeof value !== "object" || Array.isArray(value)) return { source: "manual" as const, label: "", placeId: null };
  const destination = value as Record<string, unknown>;
  const label = typeof destination.label === "string" ? destination.label.slice(0, 300) : "";
  const placeId = typeof destination.placeId === "string" && /^[A-Za-z0-9_-]{3,512}$/.test(destination.placeId) ? destination.placeId : null;
  if (destination.source !== "google_place" || !label.trim() || !placeId) return { source: "manual" as const, label, placeId: null };
  return { source: "google_place" as const, label, placeId };
}

function normalizeTravel(plan: Record<string, unknown>) {
  if (getOnTimePlanSchemaVersion(plan) !== 2) {
    const minutes = nullableNumber(plan.travelMinutes, MAX_MINUTES);
    return { selectedSource: "manual" as const, manualDurationSeconds: minutes === null ? null : minutes * 60 };
  }
  const value = plan.travel;
  if (!value || typeof value !== "object" || Array.isArray(value)) return { selectedSource: "manual" as const, manualDurationSeconds: null };
  const travel = value as Record<string, unknown>;
  const manualDurationSeconds = nullableNumber(travel.manualDurationSeconds, MAX_TRAVEL_SECONDS);
  return {
    selectedSource: travel.selectedSource === "traffic" ? "traffic" as const : "manual" as const,
    manualDurationSeconds,
  };
}

export function normalizeOnTimePlan(value: unknown, fallbackTimezone = "UTC"): OnTimePlanV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return createEmptyOnTimePlan(fallbackTimezone);
  const plan = value as Record<string, unknown>;
  const destination = normalizeDestination(plan);
  const travel = normalizeTravel(plan);
  return {
    schemaVersion: 2,
    destination,
    originMode: "current_location",
    travel: destination.source === "manual" ? { ...travel, selectedSource: "manual" } : travel,
    arriveAt: validIso(plan.arriveAt),
    timezone: typeof plan.timezone === "string" && plan.timezone.trim() ? plan.timezone : fallbackTimezone,
    arrivalBufferMinutes: nullableNumber(plan.arrivalBufferMinutes, MAX_MINUTES) ?? 0,
    items: Array.isArray(plan.items) ? plan.items.map(normalizeItem).filter((item): item is OnTimePlanItem => item !== null) : [],
    clientUpdatedAt: validIso(plan.clientUpdatedAt) ?? EPOCH,
  };
}

export function getOnTimeDestinationLabel(plan: OnTimePlanV2) { return plan.destination.label; }
export function getOnTimeManualTravelMinutes(plan: OnTimePlanV2) {
  return plan.travel.manualDurationSeconds === null ? null : plan.travel.manualDurationSeconds / 60;
}
export function withOnTimeDestinationLabel(label: string): OnTimePlanUpdate {
  return { destination: { source: "manual", label, placeId: null } };
}
export function withOnTimeManualTravelMinutes(plan: OnTimePlanV2, minutes: number | null): OnTimePlanUpdate {
  return { travel: { ...plan.travel, selectedSource: "manual", manualDurationSeconds: minutes === null ? null : minutes * 60 } };
}

export function onTimePlanSignature(plan: OnTimePlanV2): string {
  return JSON.stringify(normalizeOnTimePlan(plan));
}

export function onTimePlansEqual(left: OnTimePlanV2, right: OnTimePlanV2): boolean {
  return onTimePlanSignature(left) === onTimePlanSignature(right);
}

export function compareOnTimePlanPriority(
  left: { plan: OnTimePlanV2; sourceSchemaVersion: OnTimePlanSchemaVersion },
  right: { plan: OnTimePlanV2; sourceSchemaVersion: OnTimePlanSchemaVersion },
) {
  if (left.sourceSchemaVersion !== right.sourceSchemaVersion) return left.sourceSchemaVersion > right.sourceSchemaVersion ? 1 : -1;
  const leftTimestamp = Date.parse(left.plan.clientUpdatedAt) || 0;
  const rightTimestamp = Date.parse(right.plan.clientUpdatedAt) || 0;
  if (leftTimestamp !== rightTimestamp) return leftTimestamp > rightTimestamp ? 1 : -1;
  const leftSignature = onTimePlanSignature(left.plan);
  const rightSignature = onTimePlanSignature(right.plan);
  return leftSignature === rightSignature ? 0 : leftSignature > rightSignature ? 1 : -1;
}

export function isMeaningfulOnTimePlan(plan: OnTimePlanV2): boolean {
  return Boolean(plan.destination.label.trim() || plan.arriveAt || plan.travel.manualDurationSeconds !== null || plan.arrivalBufferMinutes || plan.items.length);
}

export function updateOnTimePlan(plan: OnTimePlanV2, changes: OnTimePlanUpdate, now = new Date()): OnTimePlanV2 {
  return normalizeOnTimePlan({ ...plan, ...changes, schemaVersion: 2, clientUpdatedAt: now.toISOString() }, plan.timezone);
}
