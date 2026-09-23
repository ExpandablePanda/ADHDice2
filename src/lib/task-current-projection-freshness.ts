import type { TaskCurrentProjection } from "./database.types.ts";
import {
  CURRENT_TASK_PROJECTION_ALGORITHM_VERSION,
  CURRENT_TASK_PROJECTION_SCHEMA_VERSION,
} from "./task-current-projection.ts";

export type CurrentTaskProjectionFreshnessContext = {
  userId: string;
  entityId: string;
  entityKind: TaskCurrentProjection["entity_kind"];
  canonicalTaskRevision: number;
  historySyncEpoch: string;
  logicalDaySettingsRevision: number;
  projectedLogicalDate: string;
};

/**
 * Pure future-consumer gate for a materialized current Task projection.
 * Runtime consumers intentionally do not call this until the cutover ticket.
 */
export function isCurrentTaskProjectionFresh(
  projection: Pick<
    TaskCurrentProjection,
    | "user_id"
    | "entity_id"
    | "entity_kind"
    | "validity"
    | "canonical_task_revision"
    | "history_sync_epoch"
    | "logical_day_settings_revision"
    | "projected_logical_date"
    | "projection_schema_version"
    | "projection_algorithm_version"
  >,
  current: CurrentTaskProjectionFreshnessContext,
): projection is typeof projection & { validity: "valid" } {
  return projection.validity === "valid"
    && projection.projection_schema_version === CURRENT_TASK_PROJECTION_SCHEMA_VERSION
    && projection.projection_algorithm_version === CURRENT_TASK_PROJECTION_ALGORITHM_VERSION
    && projection.user_id === current.userId
    && projection.entity_id === current.entityId
    && projection.entity_kind === current.entityKind
    && projection.canonical_task_revision === current.canonicalTaskRevision
    && projection.history_sync_epoch === current.historySyncEpoch
    && projection.logical_day_settings_revision === current.logicalDaySettingsRevision
    && projection.projected_logical_date === current.projectedLogicalDate;
}
