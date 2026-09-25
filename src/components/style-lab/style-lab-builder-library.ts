import type { StyleLabRoleId } from "./style-lab-registry";
import {
  STYLE_LAB_BUILDER_ADAPTERS,
  createChipLibraryDraft,
  createIconButtonLibraryDraft,
} from "./style-lab-builder-library-adapters";
import type { StyleLabBuilderDraft } from "./style-lab-builder-model";

export const STYLE_LAB_BUILDER_LIBRARY_CATEGORIES = [
  "All",
  "Primitives",
  "Chips",
  "Buttons",
  "Cards",
  "Panels",
  "Menus",
  "Inputs",
  "Headers",
  "Navigation",
  "Rows",
  "Task UI",
  "HUD",
  "Health",
  "Journal",
  "Planning",
  "Shells",
  "Nodes",
  "Modules",
] as const;

export type StyleLabBuilderLibraryCategory = (typeof STYLE_LAB_BUILDER_LIBRARY_CATEGORIES)[number];
export type StyleLabBuilderLibraryKind = "primitive" | "variant" | "pattern" | "module" | "shell" | "menu" | "navigation" | "node" | "composite";
export type StyleLabBuilderLibraryCoverageStatus = "ready" | "adapter-needed" | "intentionally-nonvisual" | "unsupported-for-builder";
export type StyleLabBuilderLibraryCapability = "container" | "text" | "chip" | "icon-button" | "divider" | "grid" | "editable-preview";

export type StyleLabBuilderLibraryEntry = {
  aliases?: readonly string[];
  capabilities: readonly StyleLabBuilderLibraryCapability[];
  category: Exclude<StyleLabBuilderLibraryCategory, "All">;
  coverageStatus: StyleLabBuilderLibraryCoverageStatus;
  createDraft: () => StyleLabBuilderDraft;
  description: string;
  id: string;
  kind: StyleLabBuilderLibraryKind;
  label: string;
  legacyTemplateId?: string;
  sourceComponent: string;
  sourcePath: string;
  tags: readonly string[];
};

function entry(
  value: Omit<StyleLabBuilderLibraryEntry, "coverageStatus"> & Partial<Pick<StyleLabBuilderLibraryEntry, "coverageStatus">>,
): StyleLabBuilderLibraryEntry {
  return { coverageStatus: "ready", ...value };
}

const primitiveCapabilities = ["container", "text"] as const satisfies readonly StyleLabBuilderLibraryCapability[];

const templateEntries: readonly StyleLabBuilderLibraryEntry[] = [
  entry({
    id: "template.blank",
    label: "Blank",
    category: "Shells",
    kind: "shell",
    sourceComponent: "StyleLabBuilder",
    sourcePath: "src/components/style-lab/style-lab-builder-model.ts",
    description: "A normalized empty Builder canvas with its permanent root Container.",
    tags: ["blank", "starter", "canvas"],
    capabilities: ["container"],
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.blank,
    legacyTemplateId: "blank",
  }),
  entry({
    id: "shell.page",
    label: "Page Shell",
    category: "Shells",
    kind: "shell",
    sourceComponent: "PageShellHeader / PageShellBody",
    sourcePath: "src/components/task-app/page-shell-header.tsx",
    description: "A representative Page Shell header and body/card region using Builder nodes.",
    tags: ["shell", "page", "header", "body", "starter"],
    capabilities: ["container", "text"],
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.pageShell,
    legacyTemplateId: "page-shell",
  }),
  entry({
    id: "primitive.card",
    label: "ADHDice Card",
    category: "Cards",
    kind: "primitive",
    sourceComponent: "AdhdCard",
    sourcePath: "src/components/ui-system/adhd-card.tsx",
    description: "A task-agnostic card surface with representative title, copy, and action content.",
    tags: ["card", "surface", "task", "records", "notes"],
    capabilities: primitiveCapabilities,
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.card,
    legacyTemplateId: "card",
  }),
  entry({
    id: "primitive.panel",
    label: "ADHDice Panel",
    category: "Panels",
    kind: "primitive",
    sourceComponent: "AdhdPanel",
    sourcePath: "src/components/ui-system/adhd-panel.tsx",
    description: "A calm panel surface with title, subtitle, and content regions.",
    tags: ["panel", "surface", "overlay", "inlay", "metadata"],
    capabilities: primitiveCapabilities,
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.panel,
    legacyTemplateId: "panel",
  }),
  entry({
    id: "pattern.metric-tile",
    label: "Metric Tile",
    category: "Modules",
    kind: "pattern",
    sourceComponent: "Style Builder starter pattern",
    sourcePath: "src/components/style-lab/style-lab-builder-library-adapters.ts",
    description: "A compact labeled metric card suitable for representative HUD or planning modules.",
    tags: ["metric", "tile", "card", "hud", "planning"],
    capabilities: ["container", "text", "chip"],
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.metricTile,
    legacyTemplateId: "metric-tile",
  }),
  entry({
    id: "pattern.metric-grid",
    label: "3-Column Metric Grid",
    category: "Modules",
    kind: "pattern",
    sourceComponent: "Style Builder starter pattern",
    sourcePath: "src/components/style-lab/style-lab-builder-library-adapters.ts",
    description: "A 12-column Builder Grid with three equal-span metric tiles.",
    tags: ["metric", "grid", "columns", "hud", "planning"],
    capabilities: ["container", "text", "grid"],
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.metricGrid,
    legacyTemplateId: "metric-grid",
  }),
  entry({
    id: "module.task-detail-hero",
    label: "Task Detail Hero",
    category: "Task UI",
    kind: "module",
    sourceComponent: "TestIosTaskDetail / task detail visual language",
    sourcePath: "src/components/task-app/test-ios-task-detail.tsx",
    description: "A representative task title hero with date, time, and status chip.",
    tags: ["task", "detail", "hero", "status", "starter"],
    capabilities: ["container", "text", "chip"],
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.taskDetailHero,
    legacyTemplateId: "task-detail-hero",
  }),
];

const chipDefinitions = [
  ["default", "Default Chip", ["chip", "default", "compact"]],
  ["purple", "Accent Chip", ["chip", "purple", "accent"]],
  ["pending", "Task Status — Pending", ["status", "pending", "task"]],
  ["progress", "Task Status — In Progress", ["status", "progress", "in progress", "task"]],
  ["delayed", "Task Status — Delayed", ["status", "delayed", "task"]],
  ["done", "Task Status — Done", ["status", "done", "task"]],
  ["best", "Task Status — Did My Best", ["status", "best", "did my best", "task"]],
  ["missed", "Task Status — Missed", ["status", "missed", "task"]],
  ["upcoming", "Task Status — Upcoming", ["status", "upcoming", "task"]],
  ["notDue", "Task Status — Not Due", ["status", "not due", "task"]],
  ["complete", "Task Status — Complete", ["status", "complete", "task"]],
  ["archived", "Archived", ["status", "archived", "task"]],
  ["danger", "Danger", ["danger", "destructive", "warning"]],
] as const;

const chipEntries: readonly StyleLabBuilderLibraryEntry[] = chipDefinitions.map(([tone, label, tags]) => entry({
  id: `primitive.chip.${tone}`,
  label,
  category: "Chips",
  kind: tone === "default" ? "primitive" : "variant",
  sourceComponent: "AdhdChip",
  sourcePath: "src/components/ui-system/adhd-chip.tsx",
  description: `Builder-safe AdhdChip preview using the supported ${tone} tone.`,
  tags,
  aliases: ["chip", "status"],
  capabilities: ["container", "chip"],
  createDraft: () => createChipLibraryDraft(tone, label),
}));

const iconButtonDefinitions = [
  ["default", "Default Icon Button"],
  ["purple", "Purple Icon Button"],
  ["success", "Success Icon Button"],
  ["warning", "Warning Icon Button"],
  ["danger", "Danger Icon Button"],
  ["ghost", "Ghost Icon Button"],
] as const;

const iconButtonEntries: readonly StyleLabBuilderLibraryEntry[] = iconButtonDefinitions.map(([tone, label]) => entry({
  id: `primitive.icon-button.${tone}`,
  label,
  category: "Buttons",
  kind: tone === "default" ? "primitive" : "variant",
  sourceComponent: "AdhdIconButton",
  sourcePath: "src/components/ui-system/adhd-icon-button.tsx",
  description: `Builder-safe ${tone} AdhdIconButton with a representative action icon.`,
  tags: ["icon button", "button", tone, "action"],
  capabilities: ["container", "icon-button"],
  createDraft: () => createIconButtonLibraryDraft(tone, "md", label),
}));

const iconButtonSizeEntries: readonly StyleLabBuilderLibraryEntry[] = [
  entry({
    id: "primitive.icon-button.compact",
    label: "Compact Icon Button",
    category: "Buttons",
    kind: "variant",
    sourceComponent: "AdhdIconButton",
    sourcePath: "src/components/ui-system/adhd-icon-button.tsx",
    description: "The small supported AdhdIconButton size for row and compact actions.",
    tags: ["icon button", "button", "sm", "compact", "row toolbar"],
    capabilities: ["container", "icon-button"],
    createDraft: () => createIconButtonLibraryDraft("default", "sm", "Compact Icon Button"),
  }),
  entry({
    id: "primitive.icon-button.large",
    label: "Large Icon Button",
    category: "Buttons",
    kind: "variant",
    sourceComponent: "AdhdIconButton",
    sourcePath: "src/components/ui-system/adhd-icon-button.tsx",
    description: "The large supported AdhdIconButton size for a prominent action.",
    tags: ["icon button", "button", "lg", "large", "action"],
    capabilities: ["container", "icon-button"],
    createDraft: () => createIconButtonLibraryDraft("default", "lg", "Large Icon Button"),
  }),
];

const sharedPrimitiveEntries: readonly StyleLabBuilderLibraryEntry[] = [
  entry({
    id: "primitive.dropdown-panel",
    label: "Dropdown Panel",
    category: "Menus",
    kind: "menu",
    sourceComponent: "AdhdDropdownPanel",
    sourcePath: "src/components/ui-system/adhd-dropdown-panel.tsx",
    description: "An editable open-state dropdown shell with representative menu rows.",
    tags: ["menu", "dropdown", "overlay", "open state"],
    capabilities: ["container", "text"],
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.dropdownPanel,
  }),
  entry({
    id: "primitive.dropdown-select",
    label: "Dropdown Select",
    category: "Inputs",
    kind: "primitive",
    sourceComponent: "AdhdDropdownSelect",
    sourcePath: "src/components/ui-system/adhd-dropdown-select.tsx",
    description: "A Builder representation of the selected and open visual state of a dropdown select.",
    tags: ["input", "select", "dropdown", "menu"],
    capabilities: ["container", "text"],
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.dropdownSelect,
  }),
  entry({
    id: "header.entity",
    label: "Editable Entity Header",
    category: "Headers",
    kind: "pattern",
    sourceComponent: "EditableEntityHeaderTitle",
    sourcePath: "src/components/ui-system/editable-entity-header-title.tsx",
    description: "A representative editable entity context and title hierarchy without persistence behavior.",
    tags: ["header", "entity", "title", "editable", "task"],
    capabilities: ["container", "text", "editable-preview"],
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.entityHeader,
  }),
  entry({
    id: "header.page-shell",
    label: "Page Shell Header",
    category: "Headers",
    kind: "pattern",
    sourceComponent: "PageShellHeader",
    sourcePath: "src/components/task-app/page-shell-header.tsx",
    description: "A representative Page Shell subtitle, title, and action region.",
    tags: ["header", "page", "shell", "navigation"],
    capabilities: ["container", "text", "icon-button"],
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.pageShellHeader,
  }),
  entry({
    id: "shell.body-card",
    label: "Shell Body / Card Region",
    category: "Shells",
    kind: "composite",
    sourceComponent: "ReorderablePageShells",
    sourcePath: "src/components/ui-system/reorderable-page-shells.tsx",
    description: "A static Builder region for a Page Shell body and card-like content area.",
    tags: ["shell", "body", "card", "page"],
    capabilities: ["container", "text"],
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.panel,
  }),
  entry({
    id: "pattern.section-typography",
    label: "Section Typography",
    category: "Primitives",
    kind: "pattern",
    sourceComponent: "Shared section typography",
    sourcePath: "src/components/style-lab/style-lab-registry.ts",
    description: "A reusable label, title, and supporting-text hierarchy.",
    tags: ["section", "typography", "label", "title", "subtitle"],
    capabilities: ["container", "text"],
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.sectionTypography,
  }),
  entry({
    id: "node.container",
    label: "Container Node",
    category: "Nodes",
    kind: "node",
    sourceComponent: "StyleLabBuilder Container",
    sourcePath: "src/components/style-lab/style-lab-builder-model.ts",
    description: "A reusable Builder Container with safe visual content.",
    tags: ["node", "container", "layout"],
    capabilities: ["container", "text"],
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.containerNode,
  }),
  entry({
    id: "node.divider",
    label: "Divider Node",
    category: "Nodes",
    kind: "node",
    sourceComponent: "StyleLabBuilder Divider",
    sourcePath: "src/components/style-lab/style-lab-builder-model.ts",
    description: "A reusable Builder Divider with the current supported orientation and width defaults.",
    tags: ["node", "divider", "separator"],
    capabilities: ["container", "divider"],
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.dividerNode,
  }),
];

const panelVariantEntries: readonly StyleLabBuilderLibraryEntry[] = [
  entry({
    id: "primitive.panel.floating",
    label: "Floating Panel",
    category: "Panels",
    kind: "variant",
    sourceComponent: "AdhdPanel",
    sourcePath: "src/components/ui-system/adhd-panel.tsx",
    description: "The floating AdhdPanel surface represented as editable Builder nodes.",
    tags: ["panel", "floating", "overlay", "surface"],
    capabilities: primitiveCapabilities,
    createDraft: () => STYLE_LAB_BUILDER_ADAPTERS.panel("floating", "Floating Panel"),
  }),
  entry({
    id: "primitive.panel.subpanel",
    label: "Subpanel",
    category: "Panels",
    kind: "variant",
    sourceComponent: "AdhdPanel",
    sourcePath: "src/components/ui-system/adhd-panel.tsx",
    description: "The lighter nested AdhdPanel surface represented as editable Builder nodes.",
    tags: ["panel", "subpanel", "nested", "surface"],
    capabilities: primitiveCapabilities,
    createDraft: () => STYLE_LAB_BUILDER_ADAPTERS.panel("subpanel", "Subpanel"),
  }),
];

const moduleEntries: readonly StyleLabBuilderLibraryEntry[] = [
  entry({
    id: "pattern.task-row",
    label: "Task Row",
    category: "Rows",
    kind: "pattern",
    sourceComponent: "TasksDenseList / tasks-list-adapter",
    sourcePath: "src/components/ui/tasks-dense-list.tsx",
    description: "A static representative task row with title, status, and row action regions.",
    tags: ["task", "row", "status", "action"],
    capabilities: ["container", "text", "chip", "icon-button"],
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.taskRow,
  }),
  entry({
    id: "pattern.context-menu",
    label: "Context Menu",
    category: "Menus",
    kind: "menu",
    sourceComponent: "TaskContentFolderContextMenu",
    sourcePath: "src/components/task-app/task-content-folder-context-menu.tsx",
    description: "A static open-state context menu pattern with editable rows.",
    tags: ["menu", "context", "task", "folder"],
    capabilities: ["container", "text"],
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.contextMenu,
  }),
  entry({
    id: "module.hud-workspace",
    label: "HUD Workspace",
    category: "HUD",
    kind: "module",
    sourceComponent: "HudCommandCenter",
    sourcePath: "src/components/task-app/hud-command-center.tsx",
    description: "A static representative HUD workspace with compact widget surfaces.",
    tags: ["hud", "workspace", "widget", "focus", "timer"],
    capabilities: ["container", "text", "chip", "grid"],
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.hudWorkspace,
  }),
  entry({
    id: "module.hud-widget",
    label: "HUD Widget",
    category: "HUD",
    kind: "module",
    sourceComponent: "HUD widgets",
    sourcePath: "src/components/task-app/hud-command-center.tsx",
    description: "A small static widget surface for a label, value, and optional status chip.",
    tags: ["hud", "widget", "metric", "chip"],
    capabilities: ["container", "text", "chip"],
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.hudWidget,
  }),
  entry({
    id: "module.hud-collapsed",
    label: "Collapsed HUD",
    category: "HUD",
    kind: "module",
    sourceComponent: "Collapsed HUD",
    sourcePath: "src/components/task-app/hud-command-center.tsx",
    description: "A compact static HUD bar with brand, timer, and open action regions.",
    tags: ["hud", "collapsed", "timer", "brand"],
    capabilities: ["container", "text", "chip", "icon-button"],
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.hudCollapsed,
  }),
  entry({
    id: "module.journal-entry-summary",
    label: "Journal Entry Summary",
    category: "Journal",
    kind: "module",
    sourceComponent: "JournalEntrySummary",
    sourcePath: "src/components/task-app/journal-entry-summary.tsx",
    description: "A safe mock Journal summary using Morning Check-In content.",
    tags: ["journal", "entry", "summary", "check-in"],
    capabilities: ["container", "text", "chip"],
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.journalSummary,
  }),
  entry({
    id: "module.health-panel",
    label: "Health Panel",
    category: "Health",
    kind: "module",
    sourceComponent: "Health Water / Fitness panels",
    sourcePath: "src/components/task-app/health-water-panel.tsx",
    description: "A static Health panel using safe Water content without integration behavior.",
    tags: ["health", "water", "panel", "goal"],
    capabilities: ["container", "text", "chip"],
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.healthPanel,
  }),
  entry({
    id: "module.planning-panel",
    label: "Planning Panel",
    category: "Planning",
    kind: "module",
    sourceComponent: "DailyPlanningPanel / FocusPlannerModal",
    sourcePath: "src/components/task-app/daily-planning-panel.tsx",
    description: "A static planning panel with safe representative copy and a focus action.",
    tags: ["planning", "daily", "focus", "panel"],
    capabilities: ["container", "text", "chip"],
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.planningPanel,
  }),
  entry({
    id: "navigation.bottom-dock",
    label: "Bottom Dock",
    category: "Navigation",
    kind: "navigation",
    sourceComponent: "BottomDock",
    sourcePath: "src/components/task-app/bottom-dock.tsx",
    description: "A static navigation dock with representative Tasks, Journal, and Health items.",
    tags: ["navigation", "dock", "tasks", "journal", "health"],
    capabilities: ["container", "chip"],
    createDraft: STYLE_LAB_BUILDER_ADAPTERS.bottomDock,
  }),
];

export const STYLE_LAB_BUILDER_LIBRARY: readonly StyleLabBuilderLibraryEntry[] = [
  ...templateEntries,
  ...chipEntries,
  ...iconButtonEntries,
  ...iconButtonSizeEntries,
  ...sharedPrimitiveEntries,
  ...panelVariantEntries,
  ...moduleEntries,
];

const libraryEntryById = new Map(STYLE_LAB_BUILDER_LIBRARY.map((item) => [item.id, item]));

export function getStyleLabBuilderLibraryEntry(id: string | null | undefined): StyleLabBuilderLibraryEntry | null {
  return id ? libraryEntryById.get(id) ?? null : null;
}

export function normalizeStyleLabBuilderLibraryCategory(value: unknown): StyleLabBuilderLibraryCategory {
  if (typeof value !== "string") return "All";
  const match = STYLE_LAB_BUILDER_LIBRARY_CATEGORIES.find((category) => category.toLowerCase() === value.trim().toLowerCase());
  return match ?? "All";
}

export function searchStyleLabBuilderLibrary(query: string, category: StyleLabBuilderLibraryCategory = "All"): readonly StyleLabBuilderLibraryEntry[] {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedCategory = normalizeStyleLabBuilderLibraryCategory(category);
  return STYLE_LAB_BUILDER_LIBRARY.filter((item) => {
    if (normalizedCategory !== "All" && item.category !== normalizedCategory) return false;
    if (!normalizedQuery) return true;
    const haystack = [item.label, item.category, item.sourceComponent, item.sourcePath, item.description, ...item.tags, ...(item.aliases ?? [])].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export const STYLE_LAB_BUILDER_LEGACY_TEMPLATE_IDS = ["blank", "page-shell", "card", "panel", "metric-tile", "metric-grid", "task-detail-hero"] as const;
export type StyleLabBuilderLegacyTemplateId = (typeof STYLE_LAB_BUILDER_LEGACY_TEMPLATE_IDS)[number];

export function getStyleLabBuilderLibraryEntryForLegacyTemplate(templateId: string): StyleLabBuilderLibraryEntry | null {
  return STYLE_LAB_BUILDER_LIBRARY.find((item) => item.legacyTemplateId === templateId) ?? null;
}

const productionRoleMappings: Readonly<Record<Exclude<StyleLabRoleId, `mock.${string}`>, string>> = {
  "ui.card.surface": "primitive.card",
  "ui.panel.surface": "primitive.panel",
  "ui.panel.title": "primitive.panel",
  "ui.panel.subtitle": "primitive.panel",
  "ui.chip": "primitive.chip.default",
  "ui.icon-button": "primitive.icon-button.default",
  "ui.entity-header-title": "header.entity",
  "ui.section.label": "pattern.section-typography",
  "ui.section.title": "pattern.section-typography",
  "ui.section.subtitle": "pattern.section-typography",
  "typography.field-label": "pattern.section-typography",
  "tasks.rail.surface": "shell.page",
  "tasks.rail.chip": "primitive.chip.default",
  "tasks.filter.surface": "primitive.panel",
  "tasks.filter.chip": "primitive.chip.default",
  "hud.workspace.surface": "module.hud-workspace",
  "hud.widget.surface": "module.hud-widget",
  "hud.widget.label": "module.hud-widget",
  "hud.widget.value": "module.hud-widget",
  "hud.widget.chip": "primitive.chip.default",
  "hud.collapsed.surface": "module.hud-collapsed",
  "hud.brand.logo": "module.hud-collapsed",
  "hud.version": "module.hud-collapsed",
  "hud.datetime": "module.hud-collapsed",
  "hud.collapsed.chip": "primitive.chip.default",
  "hud.collapsed.timer": "primitive.chip.progress",
  "page.shell.surface": "shell.page",
  "page.shell.title": "header.page-shell",
  "page.shell.subtitle": "header.page-shell",
  "page.shell.body": "shell.body-card",
};

export type StyleLabBuilderRoleCoverage = {
  coverageStatus: StyleLabBuilderLibraryCoverageStatus;
  libraryEntryIds: readonly string[];
  reason?: string;
  roleId: StyleLabRoleId;
};

const mockRoleIds: readonly StyleLabRoleId[] = [
  "mock.chip",
  "mock.item.surface",
  "mock.item.title",
  "mock.item.subtitle",
  "mock.section.surface",
  "mock.section.title",
  "mock.section.subtitle",
  "mock.section.body",
];

export const STYLE_LAB_BUILDER_ROLE_COVERAGE: readonly StyleLabBuilderRoleCoverage[] = [
  ...Object.entries(productionRoleMappings).map(([roleId, libraryEntryId]) => ({ roleId: roleId as StyleLabRoleId, libraryEntryIds: [libraryEntryId], coverageStatus: "ready" as const })),
  ...mockRoleIds.map((roleId) => ({ roleId, libraryEntryIds: [], coverageStatus: "intentionally-nonvisual" as const, reason: "Temporary Style Lab mock structure; excluded from production UI Library coverage." })),
];

export function getStyleLabBuilderRoleCoverage(roleId: StyleLabRoleId): StyleLabBuilderRoleCoverage | null {
  return STYLE_LAB_BUILDER_ROLE_COVERAGE.find((coverage) => coverage.roleId === roleId) ?? null;
}
