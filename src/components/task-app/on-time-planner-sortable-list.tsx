"use client";

import type { ReactNode } from "react";
import { SortableList } from "@/components/ui/sortable-list";
import type { OnTimePlanItem } from "@/lib/on-time-plan-state";

export function OnTimePlannerSortableList({ children, items, onReorder }: {
  children: (item: OnTimePlanItem, index: number, handle: ReactNode) => ReactNode;
  items: OnTimePlanItem[];
  onReorder: (items: OnTimePlanItem[]) => void;
}) {
  return (
    <SortableList
      getId={(item) => item.id}
      getLabel={(item) => item.kind === "task" ? item.titleSnapshot : item.title}
      items={items}
      onReorder={onReorder}
    >
      {children}
    </SortableList>
  );
}
