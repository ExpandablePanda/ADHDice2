import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  Dumbbell,
  Heart,
  House,
  ListTodo,
  Music,
  Palette,
  Pill,
  Repeat2,
  ShoppingCart,
  Sparkles,
} from "lucide-react";

export type TaskTypeIconKey =
  | "book-open"
  | "briefcase"
  | "calendar"
  | "clipboard-check"
  | "dumbbell"
  | "heart"
  | "house"
  | "list-todo"
  | "music"
  | "palette"
  | "pill"
  | "repeat"
  | "shopping-cart"
  | "sparkles";

export type TaskTypeAccentKey = "neutral" | "purple" | "blue" | "cyan" | "teal" | "green" | "yellow" | "orange" | "red" | "pink";

export type TaskTypePresentation = {
  iconKey: TaskTypeIconKey;
  accentKey: TaskTypeAccentKey;
  description: string;
};

export const DEFAULT_CUSTOM_TASK_TYPE_PRESENTATION: TaskTypePresentation = {
  iconKey: "list-todo",
  accentKey: "purple",
  description: "",
};

export const STANDARD_TASK_TYPE_PRESENTATION: TaskTypePresentation = {
  iconKey: "list-todo",
  accentKey: "neutral",
  description: "",
};

export const TASK_TYPE_ICON_OPTIONS: ReadonlyArray<{ key: TaskTypeIconKey; label: string; icon: LucideIcon }> = [
  { key: "list-todo", label: "Generic task", icon: ListTodo },
  { key: "repeat", label: "Routine or repeat", icon: Repeat2 },
  { key: "heart", label: "Health", icon: Heart },
  { key: "pill", label: "Medication", icon: Pill },
  { key: "dumbbell", label: "Exercise", icon: Dumbbell },
  { key: "book-open", label: "Learning or reading", icon: BookOpen },
  { key: "briefcase", label: "Work", icon: BriefcaseBusiness },
  { key: "music", label: "Music or practice", icon: Music },
  { key: "house", label: "Home", icon: House },
  { key: "shopping-cart", label: "Shopping", icon: ShoppingCart },
  { key: "calendar", label: "Calendar or event", icon: CalendarDays },
  { key: "clipboard-check", label: "Checklist", icon: ClipboardCheck },
  { key: "palette", label: "Creative", icon: Palette },
  { key: "sparkles", label: "General or ideas", icon: Sparkles },
];

export const TASK_TYPE_ACCENT_OPTIONS: ReadonlyArray<{ key: TaskTypeAccentKey; label: string; className: string; iconClassName: string }> = [
  { key: "neutral", label: "Neutral", className: "border-[#d9d6e3] bg-[#f3f1f7] text-[#655d7d] dark:border-white/15 dark:bg-white/10 dark:text-white/70", iconClassName: "bg-[#e4e1ec] text-[#655d7d] dark:bg-white/15 dark:text-white/75" },
  { key: "purple", label: "Purple", className: "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]", iconClassName: "bg-[#e4dcff] text-[#6f57f6] dark:bg-[#42306f] dark:text-[#cabfff]" },
  { key: "blue", label: "Blue", className: "border-[#c9e0ff] bg-[#edf5ff] text-[#3478c9] dark:border-[#24466e] dark:bg-[#172a43] dark:text-[#9bc7ff]", iconClassName: "bg-[#dcecff] text-[#3478c9] dark:bg-[#24466e] dark:text-[#9bc7ff]" },
  { key: "cyan", label: "Cyan", className: "border-[#bdeaf0] bg-[#e9fbfd] text-[#16879a] dark:border-[#1d5b65] dark:bg-[#12353b] dark:text-[#83e1eb]", iconClassName: "bg-[#d4f4f7] text-[#16879a] dark:bg-[#1d5b65] dark:text-[#83e1eb]" },
  { key: "teal", label: "Teal", className: "border-[#bce9dc] bg-[#eafaf4] text-[#168568] dark:border-[#1d604e] dark:bg-[#123b31] dark:text-[#8ce0c3]", iconClassName: "bg-[#d5f3e8] text-[#168568] dark:bg-[#1d604e] dark:text-[#8ce0c3]" },
  { key: "green", label: "Green", className: "border-[#c9e8c8] bg-[#effaee] text-[#3d8b48] dark:border-[#315d35] dark:bg-[#1b351f] dark:text-[#a4dba9]", iconClassName: "bg-[#dff3dd] text-[#3d8b48] dark:bg-[#315d35] dark:text-[#a4dba9]" },
  { key: "yellow", label: "Yellow", className: "border-[#f1dfaa] bg-[#fff9e8] text-[#9a7419] dark:border-[#725b22] dark:bg-[#3d3215] dark:text-[#f2d981]", iconClassName: "bg-[#fff0bd] text-[#9a7419] dark:bg-[#725b22] dark:text-[#f2d981]" },
  { key: "orange", label: "Orange", className: "border-[#f1d0ad] bg-[#fff4e9] text-[#b96725] dark:border-[#75431f] dark:bg-[#412411] dark:text-[#f3b57c]", iconClassName: "bg-[#ffe4c9] text-[#b96725] dark:bg-[#75431f] dark:text-[#f3b57c]" },
  { key: "red", label: "Red", className: "border-[#f2c5c8] bg-[#fff0f1] text-[#b54d57] dark:border-[#74343a] dark:bg-[#421d21] dark:text-[#f3a3aa]", iconClassName: "bg-[#ffdfe2] text-[#b54d57] dark:bg-[#74343a] dark:text-[#f3a3aa]" },
  { key: "pink", label: "Pink", className: "border-[#efc9df] bg-[#fff0f8] text-[#aa4e7d] dark:border-[#733653] dark:bg-[#421d30] dark:text-[#f0a9cb]", iconClassName: "bg-[#ffdeee] text-[#aa4e7d] dark:bg-[#733653] dark:text-[#f0a9cb]" },
];

const iconByKey = new Map(TASK_TYPE_ICON_OPTIONS.map((option) => [option.key, option.icon]));
const accentByKey = new Map(TASK_TYPE_ACCENT_OPTIONS.map((option) => [option.key, option]));

export function normalizeTaskTypePresentation(value: Partial<Record<"iconKey" | "accentKey" | "description", unknown>> | null | undefined): TaskTypePresentation {
  const iconKey = iconByKey.has(value?.iconKey as TaskTypeIconKey) ? value?.iconKey as TaskTypeIconKey : DEFAULT_CUSTOM_TASK_TYPE_PRESENTATION.iconKey;
  const accentKey = accentByKey.has(value?.accentKey as TaskTypeAccentKey) ? value?.accentKey as TaskTypeAccentKey : DEFAULT_CUSTOM_TASK_TYPE_PRESENTATION.accentKey;
  const description = typeof value?.description === "string" ? value.description.trim().slice(0, 240) : "";
  return { iconKey, accentKey, description };
}

export function resolveTaskTypeIcon(iconKey: unknown): LucideIcon {
  return iconByKey.get(iconKey as TaskTypeIconKey) ?? ListTodo;
}

export function resolveTaskTypeAccent(accentKey: unknown) {
  return accentByKey.get(accentKey as TaskTypeAccentKey) ?? accentByKey.get("purple")!;
}

export function validateTaskTypeDescription(value: unknown) {
  const description = typeof value === "string" ? value.trim() : "";
  return description.length <= 240 ? { description, error: null } : { description: description.slice(0, 240), error: "Description must be 240 characters or fewer." };
}
