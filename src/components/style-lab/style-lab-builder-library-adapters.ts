import {
  createDefaultStyleLabBuilderDraft,
  normalizeStyleLabBuilderDraft,
  type StyleLabBuilderDraft,
} from "./style-lab-builder-model";
import { STYLE_LAB_ICON_OPTIONS, type StyleLabIconName } from "./style-lab-registry";

type NodeSeed = Record<string, unknown>;

const PREVIEW_ICON: StyleLabIconName = STYLE_LAB_ICON_OPTIONS[0]?.key ?? ("plus" as StyleLabIconName);

function container(id: string, parentId: string | null, order: number, styles: Record<string, unknown> = {}, placement?: Record<string, unknown>): NodeSeed {
  return { id, type: "container", parentId, order, styles, ...(placement ? { placement } : {}) };
}

function text(id: string, parentId: string, order: number, value: string, styles: Record<string, unknown> = {}, placement?: Record<string, unknown>): NodeSeed {
  return { id, type: "text", parentId, order, text: value, styles, ...(placement ? { placement } : {}) };
}

function chip(id: string, parentId: string, order: number, value: string, styles: Record<string, unknown> = {}, placement?: Record<string, unknown>): NodeSeed {
  return { id, type: "chip", parentId, order, text: value, styles, ...(placement ? { placement } : {}) };
}

function iconButton(id: string, parentId: string, order: number, ariaLabel: string, styles: Record<string, unknown> = {}): NodeSeed {
  return { id, type: "icon-button", parentId, order, ariaLabel, styles: { iconName: PREVIEW_ICON, ...styles } };
}

function draft(moduleName: string, nodes: NodeSeed[], canvasWidth = "390"): StyleLabBuilderDraft {
  return normalizeStyleLabBuilderDraft({ canvasWidth, moduleName, nodes });
}

export function createBlankLibraryDraft(): StyleLabBuilderDraft {
  return createDefaultStyleLabBuilderDraft();
}

export function createPageShellLibraryDraft(): StyleLabBuilderDraft {
  return draft("Page Shell Starter", [
    container("root", null, 0, { backgroundColor: "Transparent", gap: "1.5rem", paddingX: "0.5rem", paddingY: "0.5rem", width: "100%" }),
    container("header", "root", 0, { gap: "0.25rem", paddingX: "0.75rem", paddingY: "0.5rem", width: "100%" }),
    text("page-title", "header", 0, "Test Page", { fontSize: "24px", fontWeight: "700", textColor: "Primary" }),
    text("page-subtitle", "header", 1, "A quiet supporting subtitle", { fontSize: "14px", fontWeight: "400", textColor: "Muted" }),
    container("body", "root", 1, { backgroundColor: "Surface", border: "subtle", gap: "1rem", paddingX: "1rem", paddingY: "1rem", radius: "large", shadow: "subtle", width: "100%" }),
    text("body-title", "body", 0, "Page content", { fontSize: "18px", fontWeight: "600", textColor: "Primary" }),
    text("body-copy", "body", 1, "Build from this Page Shell starter.", { fontSize: "14px", fontWeight: "400", textColor: "Secondary" }),
  ]);
}

export function createCardLibraryDraft(): StyleLabBuilderDraft {
  return draft("ADHDice Card Starter", [
    container("root", null, 0, { backgroundColor: "Surface", border: "subtle", gap: "0.75rem", paddingX: "1rem", paddingY: "1rem", radius: "large", shadow: "card", width: "100%" }),
    text("card-title", "root", 0, "Card title", { fontSize: "18px", fontWeight: "700", textColor: "Primary" }),
    text("card-body", "root", 1, "A concise supporting description for this card.", { fontSize: "14px", fontWeight: "400", textColor: "Secondary" }),
    chip("card-chip", "root", 2, "View details", { tone: "purple", textColor: "Accent" }),
  ]);
}

export function createPanelLibraryDraft(variant: "default" | "floating" | "subpanel" = "default", label = "ADHDice Panel Starter"): StyleLabBuilderDraft {
  const surface = variant === "subpanel" ? "Subtle" : "Surface";
  const shadow = variant === "floating" ? "floating" : variant === "subpanel" ? "none" : "subtle";
  const radius = variant === "subpanel" ? "medium" : "large";
  return draft("ADHDice Panel Starter", [
    container("root", null, 0, { backgroundColor: surface, border: "subtle", gap: "0.75rem", paddingX: "1rem", paddingY: "1rem", radius, shadow, width: "100%" }),
    text("panel-title", "root", 0, label, { fontSize: "16px", fontWeight: "600", textColor: "Primary" }),
    text("panel-subtitle", "root", 1, "Panel subtitle", { fontSize: "13px", fontWeight: "400", textColor: "Muted" }),
    text("panel-body", "root", 2, "Panel content stays calm, readable, and easy to extend.", { fontSize: "14px", fontWeight: "400", textColor: "Secondary" }),
  ]);
}

export function createMetricTileLibraryDraft(): StyleLabBuilderDraft {
  return draft("Metric Tile Starter", [
    container("root", null, 0, { backgroundColor: "Surface", border: "subtle", gap: "0.5rem", paddingX: "1rem", paddingY: "1rem", radius: "large", shadow: "card", width: "100%" }),
    text("metric-label", "root", 0, "Priority", { fontSize: "12px", fontWeight: "600", textColor: "Muted" }),
    text("metric-value", "root", 1, "Urgent", { fontSize: "24px", fontWeight: "700", textColor: "Primary" }),
    chip("metric-chip", "root", 2, "High", { tone: "purple", textColor: "Accent" }),
  ]);
}

function metricTileNodes(prefix: string, parentId: string, order: number, label: string, value: string): NodeSeed[] {
  const id = `${prefix}-container`;
  return [
    container(id, parentId, order, { backgroundColor: "Surface", border: "subtle", gap: "0.25rem", paddingX: "0.75rem", paddingY: "0.75rem", radius: "medium", shadow: "subtle", width: "100%" }, { gridColumnSpan: 4 }),
    text(`${prefix}-label`, id, 0, label, { fontSize: "12px", fontWeight: "600", textColor: "Muted" }),
    text(`${prefix}-value`, id, 1, value, { fontSize: "20px", fontWeight: "700", textColor: "Primary" }),
  ];
}

export function createMetricGridLibraryDraft(): StyleLabBuilderDraft {
  return draft("3-Column Metric Grid Starter", [
    container("root", null, 0, { backgroundColor: "Transparent", gap: "0.75rem", layout: "grid", gridColumns: 12, width: "100%" }),
    ...metricTileNodes("metric-one", "root", 0, "Priority", "Urgent"),
    ...metricTileNodes("metric-two", "root", 1, "Focus", "42 min"),
    ...metricTileNodes("metric-three", "root", 2, "Progress", "72%"),
  ]);
}

export function createTaskDetailHeroLibraryDraft(): StyleLabBuilderDraft {
  return draft("Task Detail Hero Starter", [
    container("root", null, 0, { backgroundColor: "Subtle", border: "subtle", gap: "0.5rem", paddingX: "1rem", paddingY: "1rem", radius: "xl", shadow: "card", width: "100%" }),
    text("hero-eyebrow", "root", 0, "Today", { fontSize: "12px", fontWeight: "600", textColor: "Muted" }),
    text("hero-title", "root", 1, "Call UGI", { fontSize: "24px", fontWeight: "700", textColor: "Primary" }),
    text("hero-time", "root", 2, "Today · 2:00 PM", { fontSize: "14px", fontWeight: "400", textColor: "Secondary" }),
    chip("hero-chip", "root", 3, "In Progress", { tone: "progress", textColor: "Secondary" }),
  ]);
}

export function createChipLibraryDraft(tone: string, label: string): StyleLabBuilderDraft {
  return draft(label, [
    container("root", null, 0, { alignItems: "start", backgroundColor: "Transparent", paddingX: "0.5rem", paddingY: "0.5rem", width: "100%" }),
    chip("chip", "root", 0, label, { tone }),
  ]);
}

export function createIconButtonLibraryDraft(tone: string, size = "md", label = "Default Icon Button"): StyleLabBuilderDraft {
  return draft(label, [
    container("root", null, 0, { alignItems: "start", backgroundColor: "Transparent", paddingX: "0.5rem", paddingY: "0.5rem", width: "100%" }),
    iconButton("icon-button", "root", 0, label, { size, tone }),
  ]);
}

export function createDropdownPanelLibraryDraft(): StyleLabBuilderDraft {
  return draft("Dropdown Panel", [
    container("root", null, 0, { alignItems: "start", backgroundColor: "Transparent", paddingX: "0.5rem", paddingY: "0.5rem", width: "100%" }),
    container("dropdown", "root", 0, { backgroundColor: "Surface", border: "subtle", gap: "0.25rem", paddingX: "0.5rem", paddingY: "0.5rem", radius: "large", shadow: "floating", width: "100%" }),
    text("menu-title", "dropdown", 0, "Menu", { fontSize: "12px", fontWeight: "600", textColor: "Muted" }),
    text("menu-item-one", "dropdown", 1, "Menu Item", { fontSize: "14px", textColor: "Primary" }),
    text("menu-item-two", "dropdown", 2, "Menu Item", { fontSize: "14px", textColor: "Primary" }),
    text("menu-item-three", "dropdown", 3, "Menu Item", { fontSize: "14px", textColor: "Primary" }),
  ]);
}

export function createDropdownSelectLibraryDraft(): StyleLabBuilderDraft {
  return draft("Dropdown Select", [
    container("root", null, 0, { backgroundColor: "Transparent", gap: "0.5rem", paddingX: "0.5rem", paddingY: "0.5rem", width: "100%" }),
    text("select-label", "root", 0, "Choose a view", { fontSize: "12px", fontWeight: "600", textColor: "Muted" }),
    container("select", "root", 1, { backgroundColor: "Surface", border: "subtle", gap: "0.25rem", paddingX: "0.75rem", paddingY: "0.5rem", radius: "large", shadow: "subtle", width: "100%" }),
    text("selected", "select", 0, "Today", { fontSize: "14px", fontWeight: "600", textColor: "Primary" }),
    text("option", "select", 1, "Option menu open", { fontSize: "12px", textColor: "Muted" }),
  ]);
}

export function createEntityHeaderLibraryDraft(): StyleLabBuilderDraft {
  return draft("Editable Entity Header", [
    container("root", null, 0, { backgroundColor: "Transparent", gap: "0.25rem", paddingX: "0.5rem", paddingY: "0.5rem", width: "100%" }),
    text("entity-context", "root", 0, "Task", { fontSize: "11px", fontWeight: "600", textColor: "Muted" }),
    text("entity-title", "root", 1, "Call UGI", { fontSize: "24px", fontWeight: "600", textColor: "Primary" }),
  ]);
}

export function createPageShellHeaderLibraryDraft(): StyleLabBuilderDraft {
  return draft("Page Shell Header", [
    container("root", null, 0, { backgroundColor: "Transparent", gap: "0.25rem", paddingX: "0.5rem", paddingY: "0.5rem", width: "100%" }),
    text("subtitle", "root", 0, "Workspace", { fontSize: "11px", fontWeight: "600", textColor: "Muted" }),
    text("title", "root", 1, "Today", { fontSize: "24px", fontWeight: "700", textColor: "Primary" }),
    iconButton("action", "root", 2, "Open actions", { tone: "ghost", size: "sm" }),
  ]);
}

export function createSectionTypographyLibraryDraft(): StyleLabBuilderDraft {
  return draft("Section Typography", [
    container("root", null, 0, { backgroundColor: "Transparent", gap: "0.25rem", paddingX: "0.5rem", paddingY: "0.5rem", width: "100%" }),
    text("label", "root", 0, "Section label", { fontSize: "11px", fontWeight: "600", textColor: "Muted" }),
    text("title", "root", 1, "Section title", { fontSize: "18px", fontWeight: "700", textColor: "Primary" }),
    text("subtitle", "root", 2, "Supporting context", { fontSize: "14px", textColor: "Secondary" }),
  ]);
}

export function createTaskRowLibraryDraft(): StyleLabBuilderDraft {
  return draft("Task Row", [
    container("root", null, 0, { backgroundColor: "Surface", border: "subtle", gap: "0.5rem", layout: "row", paddingX: "0.75rem", paddingY: "0.75rem", radius: "medium", shadow: "subtle", width: "100%" }),
    text("task-title", "root", 0, "Call UGI", { fontSize: "14px", fontWeight: "600", textColor: "Primary" }),
    chip("task-status", "root", 1, "In Progress", { tone: "progress" }),
    iconButton("task-action", "root", 2, "Task actions", { tone: "ghost", size: "sm" }),
  ]);
}

export function createContextMenuLibraryDraft(): StyleLabBuilderDraft {
  return createDropdownPanelLibraryDraft();
}

export function createHudWorkspaceLibraryDraft(): StyleLabBuilderDraft {
  return draft("HUD Workspace", [
    container("root", null, 0, { backgroundColor: "Subtle", gap: "0.75rem", layout: "grid", gridColumns: 12, paddingX: "1rem", paddingY: "1rem", radius: "xl", width: "100%" }),
    container("widget-one", "root", 0, { backgroundColor: "Surface", border: "subtle", gap: "0.25rem", paddingX: "0.75rem", paddingY: "0.75rem", radius: "large", shadow: "card", width: "100%" }, { gridColumnSpan: 6 }),
    text("widget-one-label", "widget-one", 0, "Focus", { fontSize: "12px", fontWeight: "600", textColor: "Muted" }),
    text("widget-one-value", "widget-one", 1, "42 min", { fontSize: "20px", fontWeight: "700", textColor: "Primary" }),
    container("widget-two", "root", 1, { backgroundColor: "Surface", border: "subtle", gap: "0.25rem", paddingX: "0.75rem", paddingY: "0.75rem", radius: "large", shadow: "card", width: "100%" }, { gridColumnSpan: 6 }),
    text("widget-two-label", "widget-two", 0, "Next", { fontSize: "12px", fontWeight: "600", textColor: "Muted" }),
    chip("widget-two-chip", "widget-two", 1, "Call UGI", { tone: "upcoming" }),
  ]);
}

export function createHudWidgetLibraryDraft(): StyleLabBuilderDraft {
  return createMetricTileLibraryDraft();
}

export function createHudCollapsedLibraryDraft(): StyleLabBuilderDraft {
  return draft("Collapsed HUD", [
    container("root", null, 0, { alignItems: "center", backgroundColor: "Surface", border: "subtle", gap: "0.5rem", layout: "row", paddingX: "0.75rem", paddingY: "0.5rem", radius: "pill", shadow: "floating", width: "100%" }),
    text("brand", "root", 0, "ADHDice", { fontSize: "13px", fontWeight: "700", textColor: "Primary" }),
    chip("timer", "root", 1, "00:42", { tone: "progress" }),
    iconButton("open", "root", 2, "Open HUD", { tone: "ghost", size: "sm" }),
  ]);
}

export function createJournalSummaryLibraryDraft(): StyleLabBuilderDraft {
  return draft("Journal Entry Summary", [
    container("root", null, 0, { backgroundColor: "Surface", border: "subtle", gap: "0.5rem", paddingX: "1rem", paddingY: "1rem", radius: "large", shadow: "card", width: "100%" }),
    text("title", "root", 0, "Morning Check-In", { fontSize: "18px", fontWeight: "700", textColor: "Primary" }),
    text("summary", "root", 1, "A short reflection and one next step.", { fontSize: "14px", textColor: "Secondary" }),
    chip("mood", "root", 2, "Steady", { tone: "complete" }),
  ]);
}

export function createHealthPanelLibraryDraft(): StyleLabBuilderDraft {
  return draft("Health Panel", [
    container("root", null, 0, { backgroundColor: "Surface", border: "subtle", gap: "0.75rem", paddingX: "1rem", paddingY: "1rem", radius: "large", shadow: "subtle", width: "100%" }),
    text("title", "root", 0, "Water", { fontSize: "18px", fontWeight: "700", textColor: "Primary" }),
    text("value", "root", 1, "6 glasses", { fontSize: "24px", fontWeight: "700", textColor: "Primary" }),
    chip("goal", "root", 2, "On track", { tone: "done" }),
  ]);
}

export function createPlanningPanelLibraryDraft(): StyleLabBuilderDraft {
  return draft("Planning Panel", [
    container("root", null, 0, { backgroundColor: "Surface", border: "subtle", gap: "0.5rem", paddingX: "1rem", paddingY: "1rem", radius: "large", shadow: "subtle", width: "100%" }),
    text("title", "root", 0, "Daily Planning", { fontSize: "18px", fontWeight: "700", textColor: "Primary" }),
    text("subtitle", "root", 1, "Choose the next small step.", { fontSize: "14px", textColor: "Secondary" }),
    chip("focus", "root", 2, "Focus Planner", { tone: "purple" }),
  ]);
}

export function createBottomDockLibraryDraft(): StyleLabBuilderDraft {
  return draft("Bottom Dock", [
    container("root", null, 0, { alignItems: "center", backgroundColor: "Surface", border: "subtle", gap: "0.5rem", layout: "row", paddingX: "0.75rem", paddingY: "0.5rem", radius: "xl", shadow: "floating", width: "100%" }),
    chip("tasks", "root", 0, "Tasks", { tone: "purple", selected: true }),
    chip("journal", "root", 1, "Journal", { tone: "default" }),
    chip("health", "root", 2, "Health", { tone: "default" }),
  ]);
}

export function createContainerNodeLibraryDraft(): StyleLabBuilderDraft {
  return draft("Container Node", [
    container("root", null, 0, { backgroundColor: "Subtle", border: "subtle", gap: "0.5rem", paddingX: "1rem", paddingY: "1rem", radius: "large", width: "100%" }),
    text("content", "root", 0, "Container content", { fontSize: "14px", textColor: "Secondary" }),
  ]);
}

export function createDividerNodeLibraryDraft(): StyleLabBuilderDraft {
  return draft("Divider Node", [
    container("root", null, 0, { backgroundColor: "Transparent", gap: "0.5rem", paddingX: "0.5rem", paddingY: "0.5rem", width: "100%" }),
    { id: "divider", type: "divider", parentId: "root", order: 0, styles: { color: "Muted", orientation: "horizontal", width: "100%" } },
  ]);
}

export const STYLE_LAB_BUILDER_ADAPTERS = {
  blank: createBlankLibraryDraft,
  pageShell: createPageShellLibraryDraft,
  card: createCardLibraryDraft,
  panel: createPanelLibraryDraft,
  metricTile: createMetricTileLibraryDraft,
  metricGrid: createMetricGridLibraryDraft,
  taskDetailHero: createTaskDetailHeroLibraryDraft,
  chip: createChipLibraryDraft,
  iconButton: createIconButtonLibraryDraft,
  dropdownPanel: createDropdownPanelLibraryDraft,
  dropdownSelect: createDropdownSelectLibraryDraft,
  entityHeader: createEntityHeaderLibraryDraft,
  pageShellHeader: createPageShellHeaderLibraryDraft,
  sectionTypography: createSectionTypographyLibraryDraft,
  taskRow: createTaskRowLibraryDraft,
  contextMenu: createContextMenuLibraryDraft,
  hudWorkspace: createHudWorkspaceLibraryDraft,
  hudWidget: createHudWidgetLibraryDraft,
  hudCollapsed: createHudCollapsedLibraryDraft,
  journalSummary: createJournalSummaryLibraryDraft,
  healthPanel: createHealthPanelLibraryDraft,
  planningPanel: createPlanningPanelLibraryDraft,
  bottomDock: createBottomDockLibraryDraft,
  containerNode: createContainerNodeLibraryDraft,
  dividerNode: createDividerNodeLibraryDraft,
} as const;
