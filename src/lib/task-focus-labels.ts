"use client";

import type { FocusCategory, FocusLabelOptions, HistoricalFocusSession } from "@/lib/types";

const DEFAULT_FOCUS_TITLES = ["Coding", "Design", "Sleep"] as const;
const DEFAULT_FOCUS_CATEGORY_TITLES = ["Coding", "Lamprey Systems", "Sleep"] as const;
const DEFAULT_PRIMARY_SUBTYPES = ["Paid", "Productive", "Rest"] as const;
const DEFAULT_SECONDARY_SUBTYPES = ["Phone", "Screens", "Stress"] as const;

export type DefaultFocusCategorySeed = {
  color: string;
  daily_goal_seconds: number | null;
  focus_subtype: string | null;
  focus_subtype_2: string | null;
  focus_type: string;
  icon: string;
  sort_order: number;
  title: string;
  user_id: string;
  weekly_goal_seconds: number | null;
};

export function getDefaultFocusCategories(userId: string): DefaultFocusCategorySeed[] {
  return [
    {
      user_id: userId,
      title: "Coding",
      focus_type: "Work",
      focus_subtype: "Productive",
      focus_subtype_2: null,
      color: "#6f57f6",
      icon: "Code",
      daily_goal_seconds: null,
      weekly_goal_seconds: null,
      sort_order: 0,
    },
    {
      user_id: userId,
      title: "Lamprey Systems",
      focus_type: "Work",
      focus_subtype: "Paid",
      focus_subtype_2: null,
      color: "#12a876",
      icon: "Briefcase",
      daily_goal_seconds: null,
      weekly_goal_seconds: null,
      sort_order: 1,
    },
    {
      user_id: userId,
      title: "Sleep",
      focus_type: "Sleep",
      focus_subtype: "Rest",
      focus_subtype_2: null,
      color: "#ea580c",
      icon: "Moon",
      daily_goal_seconds: null,
      weekly_goal_seconds: null,
      sort_order: 2,
    },
  ];
}

export function buildFocusLabelOptions(
  categories: FocusCategory[],
  history: HistoricalFocusSession[],
): FocusLabelOptions {
  const titles = new Set<string>(DEFAULT_FOCUS_TITLES);
  const types = new Set<string>();
  const primarySubtypes = new Set<string>(DEFAULT_PRIMARY_SUBTYPES);
  const secondarySubtypes = new Set<string>(DEFAULT_SECONDARY_SUBTYPES);

  for (const category of categories) {
    if (DEFAULT_FOCUS_CATEGORY_TITLES.includes(category.title as (typeof DEFAULT_FOCUS_CATEGORY_TITLES)[number])) {
      continue;
    }

    titles.add(category.title);
    types.add(category.focusType);
    if (category.focusSubtype) {
      primarySubtypes.add(category.focusSubtype);
    }
    if (category.focusSubtype2) {
      secondarySubtypes.add(category.focusSubtype2);
    }
  }

  for (const entry of history) {
    titles.add(entry.title);
    types.add(entry.focusType);
    if (entry.focusSubtype) {
      primarySubtypes.add(entry.focusSubtype);
    }
    if (entry.focusSubtype2) {
      secondarySubtypes.add(entry.focusSubtype2);
    }
  }

  return {
    titles: Array.from(titles).filter(Boolean).sort(),
    types: Array.from(types).filter(Boolean).sort(),
    primarySubtypes: Array.from(primarySubtypes).filter(Boolean).sort(),
    secondarySubtypes: Array.from(secondarySubtypes).filter(Boolean).sort(),
    allSubtypes: Array.from(new Set([...primarySubtypes, ...secondarySubtypes])).filter(Boolean).sort(),
  };
}
