import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bed,
  BookOpen,
  Bookmark,
  BriefcaseBusiness,
  Building2,
  Bug,
  Camera,
  CalendarDays,
  Car,
  CheckSquare2,
  Clipboard,
  ClipboardCheck,
  Code2,
  Coffee,
  Database,
  Droplets,
  Dumbbell,
  FileText,
  Flag,
  Folder,
  Footprints,
  Gamepad2,
  GraduationCap,
  Guitar,
  Headphones,
  Heart,
  Hospital,
  House,
  KeyRound,
  Laptop,
  Lightbulb,
  ListTodo,
  Mail,
  Map as MapIcon,
  Mic,
  Monitor,
  Music,
  Package,
  Palette,
  Pencil,
  Phone,
  Pill,
  Plane,
  Presentation,
  Repeat2,
  Settings,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Star,
  Stethoscope,
  Target,
  Terminal,
  Ticket,
  Trash2,
  Utensils,
  Users,
  Video,
  WashingMachine,
  Wifi,
  Wrench,
} from "lucide-react";

export type TaskTypeIconKey =
  | "activity" | "bed" | "book-open" | "bookmark" | "briefcase" | "building" | "bug" | "camera" | "calendar" | "car" | "check" | "clipboard" | "clipboard-check" | "code" | "coffee" | "database" | "dumbbell" | "file" | "flag" | "folder" | "food" | "gamepad" | "graduation" | "guitar" | "headphones" | "heart" | "hospital" | "house" | "key" | "laptop" | "lightbulb" | "list-todo" | "mail" | "map" | "microphone" | "monitor" | "music" | "package" | "palette" | "pencil" | "phone" | "pill" | "plane" | "presentation" | "repeat" | "settings" | "shopping-cart" | "smartphone" | "sparkles" | "star" | "stethoscope" | "target" | "terminal" | "ticket" | "trash" | "users" | "video" | "walking" | "washing-machine" | "water" | "wifi" | "wrench";

export type TaskTypeAccentKey = "neutral" | "purple" | "blue" | "cyan" | "teal" | "green" | "yellow" | "orange" | "red" | "pink";

export type TaskTypePresentation = {
  iconKey: TaskTypeIconKey;
  accentKey: TaskTypeAccentKey;
  description: string;
};

export type TaskTypeAccentPresentation = {
  key: TaskTypeAccentKey;
  label: string;
  className: string;
  iconClassName: string;
  surfaceClassName: string;
  surfaceBorderClassName: string;
  surfaceHoverClassName: string;
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

export const TASK_TYPE_ICON_OPTIONS: ReadonlyArray<{ key: TaskTypeIconKey; label: string; keywords: ReadonlyArray<string>; icon: LucideIcon }> = [
  { key: "list-todo", label: "Generic task", keywords: ["todo", "work", "item"], icon: ListTodo },
  { key: "check", label: "Check", keywords: ["done", "complete", "task"], icon: CheckSquare2 },
  { key: "star", label: "Star", keywords: ["favorite", "important"], icon: Star },
  { key: "flag", label: "Flag", keywords: ["priority", "important"], icon: Flag },
  { key: "target", label: "Target", keywords: ["goal", "focus", "objective"], icon: Target },
  { key: "bookmark", label: "Bookmark", keywords: ["save", "reading"], icon: Bookmark },
  { key: "sparkles", label: "Sparkles", keywords: ["ideas", "magic", "general"], icon: Sparkles },
  { key: "lightbulb", label: "Lightbulb", keywords: ["idea", "insight", "think"], icon: Lightbulb },
  { key: "repeat", label: "Routine or repeat", keywords: ["habit", "recurring", "cycle"], icon: Repeat2 },
  { key: "briefcase", label: "Work", keywords: ["job", "admin", "office"], icon: BriefcaseBusiness },
  { key: "building", label: "Building", keywords: ["office", "company", "work"], icon: Building2 },
  { key: "clipboard", label: "Clipboard", keywords: ["admin", "list", "notes"], icon: Clipboard },
  { key: "clipboard-check", label: "Checklist", keywords: ["checklist", "tasks", "done"], icon: ClipboardCheck },
  { key: "file", label: "File", keywords: ["document", "paper", "work"], icon: FileText },
  { key: "folder", label: "Folder", keywords: ["files", "documents", "organize"], icon: Folder },
  { key: "mail", label: "Mail", keywords: ["email", "inbox", "message"], icon: Mail },
  { key: "phone", label: "Phone", keywords: ["call", "mobile", "iphone", "device"], icon: Phone },
  { key: "users", label: "People", keywords: ["team", "meeting", "group"], icon: Users },
  { key: "presentation", label: "Presentation", keywords: ["slides", "talk", "meeting"], icon: Presentation },
  { key: "calendar", label: "Calendar", keywords: ["event", "schedule", "date", "meeting"], icon: CalendarDays },
  { key: "laptop", label: "Laptop", keywords: ["computer", "work", "device"], icon: Laptop },
  { key: "monitor", label: "Monitor", keywords: ["computer", "screen", "desktop"], icon: Monitor },
  { key: "smartphone", label: "Smartphone", keywords: ["phone", "mobile", "iphone", "device"], icon: Smartphone },
  { key: "code", label: "Code", keywords: ["programming", "developer", "software"], icon: Code2 },
  { key: "terminal", label: "Terminal", keywords: ["command", "developer", "shell"], icon: Terminal },
  { key: "bug", label: "Bug", keywords: ["debug", "issue", "fix"], icon: Bug },
  { key: "database", label: "Database", keywords: ["data", "sql", "storage"], icon: Database },
  { key: "wifi", label: "Wi-Fi", keywords: ["internet", "network", "connection"], icon: Wifi },
  { key: "settings", label: "Settings", keywords: ["configure", "admin", "gear"], icon: Settings },
  { key: "house", label: "Home", keywords: ["house", "chores", "life"], icon: House },
  { key: "washing-machine", label: "Laundry", keywords: ["clothes", "wash", "cleaning"], icon: WashingMachine },
  { key: "shopping-cart", label: "Shopping", keywords: ["buy", "groceries", "errands"], icon: ShoppingCart },
  { key: "package", label: "Package", keywords: ["delivery", "shipping", "order"], icon: Package },
  { key: "car", label: "Car", keywords: ["drive", "vehicle", "transport"], icon: Car },
  { key: "key", label: "Key", keywords: ["access", "lock", "home"], icon: KeyRound },
  { key: "wrench", label: "Wrench", keywords: ["repair", "fix", "maintenance"], icon: Wrench },
  { key: "trash", label: "Trash", keywords: ["delete", "cleaning", "remove"], icon: Trash2 },
  { key: "heart", label: "Health", keywords: ["wellness", "care", "love"], icon: Heart },
  { key: "pill", label: "Medication", keywords: ["medicine", "health", "prescription"], icon: Pill },
  { key: "stethoscope", label: "Medical", keywords: ["doctor", "health", "appointment"], icon: Stethoscope },
  { key: "hospital", label: "Hospital", keywords: ["medical", "doctor", "health"], icon: Hospital },
  { key: "dumbbell", label: "Exercise", keywords: ["fitness", "gym", "workout"], icon: Dumbbell },
  { key: "activity", label: "Activity", keywords: ["health", "fitness", "movement"], icon: Activity },
  { key: "walking", label: "Walking", keywords: ["walk", "steps", "fitness"], icon: Footprints },
  { key: "bed", label: "Sleep", keywords: ["rest", "bedtime", "night"], icon: Bed },
  { key: "food", label: "Food", keywords: ["eat", "meal", "cooking", "dinner"], icon: Utensils },
  { key: "water", label: "Water", keywords: ["drink", "hydration", "bottle"], icon: Droplets },
  { key: "book-open", label: "Learning or reading", keywords: ["study", "learn", "book"], icon: BookOpen },
  { key: "graduation", label: "Graduation", keywords: ["school", "course", "education"], icon: GraduationCap },
  { key: "pencil", label: "Writing", keywords: ["write", "edit", "notes"], icon: Pencil },
  { key: "palette", label: "Creative", keywords: ["art", "design", "draw"], icon: Palette },
  { key: "camera", label: "Camera", keywords: ["photo", "picture", "image"], icon: Camera },
  { key: "video", label: "Video", keywords: ["film", "movie", "recording"], icon: Video },
  { key: "microphone", label: "Microphone", keywords: ["audio", "voice", "podcast"], icon: Mic },
  { key: "music", label: "Music or practice", keywords: ["song", "practice", "instrument", "audio"], icon: Music },
  { key: "guitar", label: "Guitar", keywords: ["music", "practice", "instrument"], icon: Guitar },
  { key: "headphones", label: "Headphones", keywords: ["music", "audio", "listen"], icon: Headphones },
  { key: "gamepad", label: "Gaming", keywords: ["game", "play", "leisure"], icon: Gamepad2 },
  { key: "plane", label: "Travel", keywords: ["flight", "vacation", "trip"], icon: Plane },
  { key: "map", label: "Map", keywords: ["location", "directions", "travel"], icon: MapIcon },
  { key: "ticket", label: "Ticket", keywords: ["event", "travel", "movie"], icon: Ticket },
  { key: "coffee", label: "Coffee", keywords: ["break", "cafe", "drink"], icon: Coffee },
];

export const TASK_TYPE_ACCENT_OPTIONS: ReadonlyArray<TaskTypeAccentPresentation> = [
  { key: "neutral", label: "Neutral", className: "border-[#d9d6e3] bg-[#f3f1f7] text-[#655d7d] dark:border-white/15 dark:bg-white/10 dark:text-white/70", iconClassName: "bg-[#e4e1ec] text-[#655d7d] dark:bg-white/15 dark:text-white/75", surfaceClassName: "bg-white dark:bg-white/[0.04]", surfaceBorderClassName: "border-[#ece8f8] dark:border-white/10", surfaceHoverClassName: "hover:bg-white dark:hover:bg-white/[0.05]" },
  { key: "purple", label: "Purple", className: "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]", iconClassName: "bg-[#e4dcff] text-[#6f57f6] dark:bg-[#42306f] dark:text-[#cabfff]", surfaceClassName: "bg-[#fcfaff] dark:bg-[#1b1530]", surfaceBorderClassName: "border-[#e7defc] dark:border-[#42306f]", surfaceHoverClassName: "hover:bg-[#f7f3ff] dark:hover:bg-[#22193f]" },
  { key: "blue", label: "Blue", className: "border-[#c9e0ff] bg-[#edf5ff] text-[#3478c9] dark:border-[#24466e] dark:bg-[#172a43] dark:text-[#9bc7ff]", iconClassName: "bg-[#dcecff] text-[#3478c9] dark:bg-[#24466e] dark:text-[#9bc7ff]", surfaceClassName: "bg-[#fbfdff] dark:bg-[#17243a]", surfaceBorderClassName: "border-[#dcecff] dark:border-[#24466e]", surfaceHoverClassName: "hover:bg-[#f2f8ff] dark:hover:bg-[#1b2f4b]" },
  { key: "cyan", label: "Cyan", className: "border-[#bdeaf0] bg-[#e9fbfd] text-[#16879a] dark:border-[#1d5b65] dark:bg-[#12353b] dark:text-[#83e1eb]", iconClassName: "bg-[#d4f4f7] text-[#16879a] dark:bg-[#1d5b65] dark:text-[#83e1eb]", surfaceClassName: "bg-[#f8feff] dark:bg-[#12353b]", surfaceBorderClassName: "border-[#d4f4f7] dark:border-[#1d5b65]", surfaceHoverClassName: "hover:bg-[#f0fdff] dark:hover:bg-[#17444b]" },
  { key: "teal", label: "Teal", className: "border-[#bce9dc] bg-[#eafaf4] text-[#168568] dark:border-[#1d604e] dark:bg-[#123b31] dark:text-[#8ce0c3]", iconClassName: "bg-[#d5f3e8] text-[#168568] dark:bg-[#1d604e] dark:text-[#8ce0c3]", surfaceClassName: "bg-[#f8fefb] dark:bg-[#123b31]", surfaceBorderClassName: "border-[#d5f3e8] dark:border-[#1d604e]", surfaceHoverClassName: "hover:bg-[#effcf6] dark:hover:bg-[#174b3d]" },
  { key: "green", label: "Green", className: "border-[#c9e8c8] bg-[#effaee] text-[#3d8b48] dark:border-[#315d35] dark:bg-[#1b351f] dark:text-white/80", iconClassName: "bg-[#dff3dd] text-[#3d8b48] dark:bg-[#315d35] dark:text-[#a4dba9]", surfaceClassName: "bg-[#fbfef9] dark:bg-[#1b351f]", surfaceBorderClassName: "border-[#dff3dd] dark:border-[#315d35]", surfaceHoverClassName: "hover:bg-[#f2fcf0] dark:hover:bg-[#224526]" },
  { key: "yellow", label: "Yellow", className: "border-[#f1dfaa] bg-[#fff9e8] text-[#9a7419] dark:border-[#725b22] dark:bg-[#3d3215] dark:text-[#f2d981]", iconClassName: "bg-[#fff0bd] text-[#9a7419] dark:bg-[#725b22] dark:text-[#f2d981]", surfaceClassName: "bg-[#fffdf5] dark:bg-[#3d3215]", surfaceBorderClassName: "border-[#f1dfaa] dark:border-[#725b22]", surfaceHoverClassName: "hover:bg-[#fff9e8] dark:hover:bg-[#4a3d18]" },
  { key: "orange", label: "Orange", className: "border-[#f1d0ad] bg-[#fff4e9] text-[#b96725] dark:border-[#75431f] dark:bg-[#412411] dark:text-[#f3b57c]", iconClassName: "bg-[#ffe4c9] text-[#b96725] dark:bg-[#75431f] dark:text-[#f3b57c]", surfaceClassName: "bg-[#fffaf5] dark:bg-[#412411]", surfaceBorderClassName: "border-[#f1d0ad] dark:border-[#75431f]", surfaceHoverClassName: "hover:bg-[#fff5ec] dark:hover:bg-[#4c2c16]" },
  { key: "red", label: "Red", className: "border-[#f2c5c8] bg-[#fff0f1] text-[#b54d57] dark:border-[#74343a] dark:bg-[#421d21] dark:text-[#f3a3aa]", iconClassName: "bg-[#ffdfe2] text-[#b54d57] dark:bg-[#74343a] dark:text-[#f3a3aa]", surfaceClassName: "bg-[#fffafa] dark:bg-[#421d21]", surfaceBorderClassName: "border-[#f2c5c8] dark:border-[#74343a]", surfaceHoverClassName: "hover:bg-[#fff3f4] dark:hover:bg-[#4d2328]" },
  { key: "pink", label: "Pink", className: "border-[#efc9df] bg-[#fff0f8] text-[#aa4e7d] dark:border-[#733653] dark:bg-[#421d30] dark:text-[#f0a9cb]", iconClassName: "bg-[#ffdeee] text-[#aa4e7d] dark:bg-[#733653] dark:text-[#f0a9cb]", surfaceClassName: "bg-[#fffafd] dark:bg-[#421d30]", surfaceBorderClassName: "border-[#efc9df] dark:border-[#733653]", surfaceHoverClassName: "hover:bg-[#fff4fa] dark:hover:bg-[#4d2639]" },
];

const iconByKey = new Map(TASK_TYPE_ICON_OPTIONS.map((option) => [option.key, option.icon]));
const accentByKey = new Map(TASK_TYPE_ACCENT_OPTIONS.map((option) => [option.key, option]));

export function searchTaskTypeIcons(query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return TASK_TYPE_ICON_OPTIONS;
  return TASK_TYPE_ICON_OPTIONS.filter((option) => [option.label, option.key, ...option.keywords].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)));
}

export function normalizeTaskTypePresentation(value: Partial<Record<"iconKey" | "accentKey" | "description", unknown>> | null | undefined): TaskTypePresentation {
  const iconKey = iconByKey.has(value?.iconKey as TaskTypeIconKey) ? value?.iconKey as TaskTypeIconKey : DEFAULT_CUSTOM_TASK_TYPE_PRESENTATION.iconKey;
  const accentKey = accentByKey.has(value?.accentKey as TaskTypeAccentKey) ? value?.accentKey as TaskTypeAccentKey : DEFAULT_CUSTOM_TASK_TYPE_PRESENTATION.accentKey;
  const description = typeof value?.description === "string" ? value.description.trim().slice(0, 240) : "";
  return { iconKey, accentKey, description };
}

export function resolveTaskTypeIcon(iconKey: unknown): LucideIcon {
  return iconByKey.get(iconKey as TaskTypeIconKey) ?? ListTodo;
}

export function resolveTaskTypeAccent(accentKey: unknown): TaskTypeAccentPresentation {
  return accentByKey.get(accentKey as TaskTypeAccentKey) ?? accentByKey.get("purple")!;
}

export function getTaskTypeSurfaceClassName(accentKey: unknown) {
  const accent = resolveTaskTypeAccent(accentKey);
  return `${accent.surfaceBorderClassName} ${accent.surfaceClassName} ${accent.surfaceHoverClassName}`;
}

export function validateTaskTypeDescription(value: unknown) {
  const description = typeof value === "string" ? value.trim() : "";
  return description.length <= 240 ? { description, error: null } : { description: description.slice(0, 240), error: "Description must be 240 characters or fewer." };
}
