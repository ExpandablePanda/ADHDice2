"use client";

import { normalizeTaskGridLayout, type TaskGridLayoutItem } from "@/lib/task-grid-layout";
import type { TaskGridLayout as DbTaskGridLayout } from "@/lib/database.types";

export function parseTaskGridLayoutJson<TWidgetType extends string>(
  layoutJson: string | null | undefined,
  fallbackLayout: TaskGridLayoutItem<TWidgetType>[],
  isWidgetType: (value: string) => value is TWidgetType,
) {
  if (!layoutJson) {
    return fallbackLayout;
  }

  try {
    const parsed = JSON.parse(layoutJson) as unknown;
    if (!Array.isArray(parsed)) {
      return fallbackLayout;
    }

    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const candidate = item as Partial<TaskGridLayoutItem<TWidgetType>>;
        if (
          typeof candidate.id !== "string" ||
          typeof candidate.type !== "string" ||
          !isWidgetType(candidate.type)
        ) {
          return null;
        }

        return {
          h: typeof candidate.h === "number" ? candidate.h : 6,
          id: candidate.id,
          type: candidate.type,
          w: typeof candidate.w === "number" ? candidate.w : 1,
          x: typeof candidate.x === "number" ? candidate.x : 0,
          y: typeof candidate.y === "number" ? candidate.y : 0,
        } satisfies TaskGridLayoutItem<TWidgetType>;
      })
      .filter((item): item is TaskGridLayoutItem<TWidgetType> => item !== null);
  } catch {
    return fallbackLayout;
  }
}

export function buildWidgetTypeGuard<TWidgetType extends string>(labels: Record<TWidgetType, string>) {
  return (value: string): value is TWidgetType => value in labels;
}

export function resolveTaskGridLayout<TWidgetType extends string>(
  row: DbTaskGridLayout | null,
  fallbackLayout: TaskGridLayoutItem<TWidgetType>[],
  isWidgetType: (value: string) => value is TWidgetType,
  maxColumns: number,
  maxDisplayRows: number,
) {
  if (!row) {
    return fallbackLayout;
  }

  return normalizeTaskGridLayout(
    parseTaskGridLayoutJson(row.layout_json, fallbackLayout, isWidgetType),
    isWidgetType,
    maxColumns,
    maxDisplayRows,
  );
}
