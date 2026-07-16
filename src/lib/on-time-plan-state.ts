export type OnTimePlanItem = LinkedPlanItem | TemporaryPlanItem;

export type OnTimeExecutionSnapshot = {
  startedAt: string;
  plannedSeconds: number;
};

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
  execution: OnTimeExecutionSnapshot | null;
};

export type TemporaryPlanItem = {
  id: string;
  kind: "temporary";
  title: string;
  plannedSeconds: number | null;
  completed: boolean;
  execution: OnTimeExecutionSnapshot | null;
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

export type OnTimePlanV3 = {
  schemaVersion: 3;
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

export type OnTimePlanUpdate = Partial<Omit<OnTimePlanV3, "schemaVersion" | "clientUpdatedAt">>;
export type OnTimePlanSchemaVersion = 0 | 1 | 2 | 3;

export type OnTimeLinkedItemOrigin = {
  itemId: string;
  occurrenceDueOn: string | null;
  occurrenceKey: string | null;
  taskId: string;
};

export function clearMatchingOnTimeExecution(
  plan: OnTimePlanV3,
  origin: OnTimeLinkedItemOrigin,
): OnTimePlanV3 | null {
  let changed = false;
  const items = plan.items.map((item) => {
    if (
      item.kind !== "task"
      || item.id !== origin.itemId
      || item.taskId !== origin.taskId
      || item.occurrenceKey !== origin.occurrenceKey
      || item.occurrenceDueOn !== origin.occurrenceDueOn
      || item.execution === null
    ) {
      return item;
    }
    changed = true;
    return { ...item, execution: null };
  });
  return changed ? { ...plan, items } : null;
}

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

function normalizeExecution(value: unknown): OnTimeExecutionSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const execution = value as Record<string, unknown>;
  const startedAt = validIso(execution.startedAt);
  const plannedSeconds = nullablePositiveNumber(execution.plannedSeconds, MAX_ITEM_SECONDS);
  return startedAt && plannedSeconds ? { startedAt, plannedSeconds } : null;
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
      execution: normalizeExecution(item.execution),
    };
  }
  if (item.kind === "temporary") {
    return {
      id: item.id,
      kind: "temporary",
      title: typeof item.title === "string" ? item.title : "Untitled item",
      plannedSeconds: nullablePositiveNumber(item.plannedSeconds, MAX_ITEM_SECONDS),
      completed: item.completed === true,
      execution: normalizeExecution(item.execution),
    };
  }
  return null;
}

export function getOnTimePlanSchemaVersion(value: unknown): OnTimePlanSchemaVersion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const version = (value as Record<string, unknown>).schemaVersion;
  return version === 3 ? 3 : version === 2 ? 2 : version === 1 || version === undefined ? 1 : 0;
}

export function createEmptyOnTimePlan(timezone = "UTC", clientUpdatedAt = EPOCH): OnTimePlanV3 {
  return {
    schemaVersion: 3,
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

export function reconcileOnTimeManualDurationAfterTaskSave(
  plan: OnTimePlanV3,
  savedTask: Pick<import("@/lib/database.types").Task, "id">,
  authoritativeManualEstimateMinutes: number | null | undefined,
) {
  const plannedSeconds = typeof authoritativeManualEstimateMinutes === "number"
    && Number.isFinite(authoritativeManualEstimateMinutes)
    && authoritativeManualEstimateMinutes > 0
    ? Math.round(authoritativeManualEstimateMinutes * 60)
    : null;
  const items = plan.items.map((item) => (
    item.kind === "task"
      && item.taskId === savedTask.id
      && item.durationSource === "manual"
      && item.plannedSeconds !== plannedSeconds
      ? { ...item, plannedSeconds }
      : item
  ));
  return items.some((item, index) => item !== plan.items[index]) ? { ...plan, items } : plan;
}

export function reconcileOnTimeManualDurationsFromTasks(
  plan: OnTimePlanV3,
  tasks: ReadonlyArray<Pick<import("@/lib/database.types").Task, "estimated_minutes" | "id">>,
) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const items = plan.items.map((item) => {
    if (item.kind !== "task" || item.durationSource !== "manual") return item;
    if (!taskById.has(item.taskId)) return item;
    const estimate = taskById.get(item.taskId)?.estimated_minutes;
    const plannedSeconds = typeof estimate === "number" && Number.isFinite(estimate) && estimate > 0
      ? Math.round(estimate * 60)
      : null;
    return item.plannedSeconds === plannedSeconds ? item : { ...item, plannedSeconds };
  });
  return items.some((item, index) => item !== plan.items[index]) ? { ...plan, items } : plan;
}

function normalizeDestination(plan: Record<string, unknown>) {
  if (getOnTimePlanSchemaVersion(plan) < 2) {
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
  if (getOnTimePlanSchemaVersion(plan) < 2) {
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

export function normalizeOnTimePlan(value: unknown, fallbackTimezone = "UTC"): OnTimePlanV3 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return createEmptyOnTimePlan(fallbackTimezone);
  const plan = value as Record<string, unknown>;
  const destination = normalizeDestination(plan);
  const travel = normalizeTravel(plan);
  return {
    schemaVersion: 3,
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

export function getOnTimeDestinationLabel(plan: OnTimePlanV3) { return plan.destination.label; }
export function getOnTimeManualTravelMinutes(plan: OnTimePlanV3) {
  return plan.travel.manualDurationSeconds === null ? null : plan.travel.manualDurationSeconds / 60;
}
export function withOnTimeDestinationLabel(label: string): OnTimePlanUpdate {
  return { destination: { source: "manual", label, placeId: null } };
}
export function withOnTimeManualTravelMinutes(plan: OnTimePlanV3, minutes: number | null): OnTimePlanUpdate {
  return { travel: { ...plan.travel, selectedSource: "manual", manualDurationSeconds: minutes === null ? null : minutes * 60 } };
}

export function onTimePlanSignature(plan: OnTimePlanV3): string {
  return JSON.stringify(normalizeOnTimePlan(plan));
}

export function onTimePlansEqual(left: OnTimePlanV3, right: OnTimePlanV3): boolean {
  return onTimePlanSignature(left) === onTimePlanSignature(right);
}

export function compareOnTimePlanPriority(
  left: { plan: OnTimePlanV3; sourceSchemaVersion: OnTimePlanSchemaVersion },
  right: { plan: OnTimePlanV3; sourceSchemaVersion: OnTimePlanSchemaVersion },
) {
  if (left.sourceSchemaVersion !== right.sourceSchemaVersion) return left.sourceSchemaVersion > right.sourceSchemaVersion ? 1 : -1;
  const leftTimestamp = Date.parse(left.plan.clientUpdatedAt) || 0;
  const rightTimestamp = Date.parse(right.plan.clientUpdatedAt) || 0;
  if (leftTimestamp !== rightTimestamp) return leftTimestamp > rightTimestamp ? 1 : -1;
  const leftSignature = onTimePlanSignature(left.plan);
  const rightSignature = onTimePlanSignature(right.plan);
  return leftSignature === rightSignature ? 0 : leftSignature > rightSignature ? 1 : -1;
}

export function isMeaningfulOnTimePlan(plan: OnTimePlanV3): boolean {
  return Boolean(plan.destination.label.trim() || plan.arriveAt || plan.travel.manualDurationSeconds !== null || plan.arrivalBufferMinutes || plan.items.length);
}

export function updateOnTimePlan(plan: OnTimePlanV3, changes: OnTimePlanUpdate, now = new Date()): OnTimePlanV3 {
  return normalizeOnTimePlan({ ...plan, ...changes, schemaVersion: 3, clientUpdatedAt: now.toISOString() }, plan.timezone);
}
