import { TASK_TYPE_ICON_OPTIONS } from "@/lib/task-type-presentation";
import { isLucideIconName } from "@/lib/lucide-icon";

export const STYLE_LAB_TEXT_COLORS = [
  "Primary",
  "Secondary",
  "Muted",
  "Accent",
  "Success",
  "Warning",
  "Danger",
] as const;

export type StyleLabTextColor = (typeof STYLE_LAB_TEXT_COLORS)[number];

export const STYLE_LAB_BACKGROUND_COLORS = [
  "Surface",
  "Subtle",
  "Accent",
  "Success",
  "Warning",
  "Danger",
  "Transparent",
] as const;

export type StyleLabBackgroundColor = (typeof STYLE_LAB_BACKGROUND_COLORS)[number];

export const STYLE_LAB_CUSTOM_COLOR_DEFAULT = "#8f6cff";

export const STYLE_LAB_BUILDER_FONT_OPTIONS = [
  {
    id: "adhdice",
    label: "ADHDice Default",
    cssFamily: '"Avenir Next", Manrope, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    googleFamily: null,
  },
  {
    id: "system",
    label: "System / SF Pro",
    cssFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif',
    googleFamily: null,
  },
  { id: "inter", label: "Inter", cssFamily: '"Inter", sans-serif', googleFamily: "Inter" },
  { id: "roboto", label: "Roboto", cssFamily: '"Roboto", sans-serif', googleFamily: "Roboto" },
  { id: "open-sans", label: "Open Sans", cssFamily: '"Open Sans", sans-serif', googleFamily: "Open+Sans" },
  { id: "poppins", label: "Poppins", cssFamily: '"Poppins", sans-serif', googleFamily: "Poppins" },
  { id: "montserrat", label: "Montserrat", cssFamily: '"Montserrat", sans-serif', googleFamily: "Montserrat" },
  { id: "lato", label: "Lato", cssFamily: '"Lato", sans-serif', googleFamily: "Lato" },
] as const;

export type StyleLabBuilderFontFamily = (typeof STYLE_LAB_BUILDER_FONT_OPTIONS)[number]["id"];

export const STYLE_LAB_BUILDER_WEB_FONT_STYLESHEET = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lato:wght@400;700;900&family=Montserrat:wght@400;500;600;700&family=Open+Sans:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&family=Roboto:wght@400;500;700&display=swap";

export function isStyleLabBuilderFontFamily(value: unknown): value is StyleLabBuilderFontFamily {
  return typeof value === "string" && STYLE_LAB_BUILDER_FONT_OPTIONS.some((option) => option.id === value);
}

export function getStyleLabBuilderFontOption(value: unknown) {
  return STYLE_LAB_BUILDER_FONT_OPTIONS.find((option) => option.id === value) ?? STYLE_LAB_BUILDER_FONT_OPTIONS[0]!;
}

export const STYLE_LAB_BACKGROUND_PALETTE = [
  { label: "Surface", token: "--surface", value: "Surface" },
  { label: "Subtle", token: "--surface-muted", value: "Subtle" },
  { label: "Accent", token: "--accent-soft", value: "Accent" },
  { label: "Success", token: "--success-soft", value: "Success" },
  { label: "Warning", token: "--warning-soft", value: "Warning" },
  { label: "Danger", token: "--danger-soft", value: "Danger" },
  { label: "Transparent", token: "transparent", value: "Transparent" },
] as const satisfies ReadonlyArray<{ label: string; token: string; value: StyleLabBackgroundColor }>;

export function normalizeStyleLabCustomColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    return `#${normalized.slice(1).split("").map((digit) => `${digit}${digit}`).join("")}`;
  }
  return null;
}

export const STYLE_LAB_ICON_OPTIONS = TASK_TYPE_ICON_OPTIONS.filter((option) => Boolean(option.icon) || isLucideIconName(option.key));

export type StyleLabIconName = (typeof STYLE_LAB_ICON_OPTIONS)[number]["key"];

export const STYLE_LAB_BUILDER_LAYOUTS = ["column", "row", "grid"] as const;
export type StyleLabBuilderLayout = (typeof STYLE_LAB_BUILDER_LAYOUTS)[number];

export const STYLE_LAB_BUILDER_GRID_COLUMNS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export type StyleLabBuilderGridColumns = (typeof STYLE_LAB_BUILDER_GRID_COLUMNS)[number];

export const STYLE_LAB_BUILDER_CANVAS_WIDTHS = ["320", "390", "430", "fit"] as const;
export type StyleLabBuilderCanvasWidth = (typeof STYLE_LAB_BUILDER_CANVAS_WIDTHS)[number];

export const STYLE_LAB_BUILDER_CHIP_TONES = ["default", "purple", "pending", "progress", "delayed", "done", "best", "missed", "upcoming", "notDue", "complete", "archived", "danger"] as const;
export type StyleLabBuilderChipTone = (typeof STYLE_LAB_BUILDER_CHIP_TONES)[number];

export const STYLE_LAB_BUILDER_ICON_BUTTON_SIZES = ["sm", "md", "lg"] as const;
export type StyleLabBuilderIconButtonSize = (typeof STYLE_LAB_BUILDER_ICON_BUTTON_SIZES)[number];

export const STYLE_LAB_BUILDER_ICON_BUTTON_TONES = ["default", "purple", "success", "warning", "danger", "ghost"] as const;
export type StyleLabBuilderIconButtonTone = (typeof STYLE_LAB_BUILDER_ICON_BUTTON_TONES)[number];

export const STYLE_LAB_BUILDER_DIVIDER_ORIENTATIONS = ["horizontal", "vertical"] as const;
export type StyleLabBuilderDividerOrientation = (typeof STYLE_LAB_BUILDER_DIVIDER_ORIENTATIONS)[number];

export const STYLE_LAB_BUILDER_DIVIDER_WIDTHS = ["25%", "50%", "75%", "100%"] as const;
export type StyleLabBuilderDividerWidth = (typeof STYLE_LAB_BUILDER_DIVIDER_WIDTHS)[number];

export const STYLE_LAB_BUILDER_RADIUS_OPTIONS = [
  { label: "None", value: "none", cssValue: "0" },
  { label: "Small", value: "small", cssValue: "0.5rem" },
  { label: "Medium", value: "medium", cssValue: "0.75rem" },
  { label: "Large", value: "large", cssValue: "1rem" },
  { label: "XL", value: "xl", cssValue: "1.5rem" },
  { label: "2XL", value: "2xl", cssValue: "2rem" },
  { label: "Pill", value: "pill", cssValue: "9999px" },
] as const;
export type StyleLabBuilderRadius = (typeof STYLE_LAB_BUILDER_RADIUS_OPTIONS)[number]["value"];

export const STYLE_LAB_BUILDER_BORDER_OPTIONS = [
  { label: "None", value: "none", cssValue: "none" },
  { label: "Subtle", value: "subtle", cssValue: "1px solid var(--border-soft)" },
] as const;
export type StyleLabBuilderBorder = (typeof STYLE_LAB_BUILDER_BORDER_OPTIONS)[number]["value"];

export const STYLE_LAB_BUILDER_SHADOW_OPTIONS = [
  { label: "None", value: "none", cssValue: "none" },
  { label: "Subtle", value: "subtle", cssValue: "0 4px 12px color-mix(in srgb, var(--accent) 8%, transparent)" },
  { label: "Card", value: "card", cssValue: "0 8px 24px color-mix(in srgb, var(--accent) 10%, transparent)" },
  { label: "Floating", value: "floating", cssValue: "0 20px 60px color-mix(in srgb, var(--accent) 18%, transparent)" },
] as const;
export type StyleLabBuilderShadow = (typeof STYLE_LAB_BUILDER_SHADOW_OPTIONS)[number]["value"];

export const STYLE_LAB_PROPERTY_IDS = [
  "fontSize",
  "fontWeight",
  "textColor",
  "backgroundColor",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "width",
  "minWidth",
  "maxWidth",
  "paddingX",
  "paddingY",
  "gap",
  "alignItems",
  "justifyContent",
] as const;

export type StyleLabPropertyId = (typeof STYLE_LAB_PROPERTY_IDS)[number];

export type StyleLabCapabilityGroup = "typography" | "background" | "sizing" | "container";

export const STYLE_LAB_TARGET_PART_IDS = ["self", "label", "surface"] as const;

export type StyleLabTargetPart = (typeof STYLE_LAB_TARGET_PART_IDS)[number];

export type StyleLabPropertyDefinition = {
  cssProperties: readonly string[];
  group: StyleLabCapabilityGroup;
  id: StyleLabPropertyId;
  label: string;
  values: readonly string[];
};

export type StyleLabRoleId =
  | "ui.card.surface"
  | "ui.panel.surface"
  | "ui.panel.title"
  | "ui.panel.subtitle"
  | "ui.chip"
  | "ui.icon-button"
  | "ui.entity-header-title"
  | "ui.section.label"
  | "ui.section.title"
  | "ui.section.subtitle"
  | "typography.field-label"
  | "tasks.rail.surface"
  | "tasks.rail.chip"
  | "tasks.filter.surface"
  | "tasks.filter.chip"
  | "hud.workspace.surface"
  | "hud.widget.surface"
  | "hud.widget.label"
  | "hud.widget.value"
  | "hud.widget.chip"
  | "hud.collapsed.surface"
  | "hud.brand.logo"
  | "hud.version"
  | "hud.datetime"
  | "hud.collapsed.chip"
  | "hud.collapsed.timer"
  | "page.shell.surface"
  | "page.shell.title"
  | "page.shell.subtitle"
  | "page.shell.body"
  | "mock.chip"
  | "mock.item.surface"
  | "mock.item.title"
  | "mock.item.subtitle"
  | "mock.section.surface"
  | "mock.section.title"
  | "mock.section.subtitle"
  | "mock.section.body";

export type StyleLabRole = {
  capabilities: readonly StyleLabPropertyId[];
  component: string;
  context: string;
  id: StyleLabRoleId;
  name: string;
  targets?: Partial<Record<StyleLabCapabilityGroup, StyleLabTargetPart>>;
};

const pxValues = ["11px", "12px", "13px", "14px", "16px", "18px", "20px", "24px", "28px", "32px"] as const;
const fontWeightValues = ["400", "500", "600", "700", "800"] as const;
const lineHeightValues = ["1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.75"] as const;
const letterSpacingValues = ["0", "0.01em", "0.02em", "0.04em", "0.06em", "0.08em"] as const;
const textAlignValues = ["left", "center", "right"] as const;
const sizeValues = ["auto", "min-content", "max-content", "fit-content", "8rem", "12rem", "16rem", "20rem", "24rem", "32rem", "100%"] as const;
const spacingValues = ["0", "0.25rem", "0.5rem", "0.75rem", "1rem", "1.25rem", "1.5rem", "2rem"] as const;
const gapValues = ["0", "0.25rem", "0.5rem", "0.75rem", "1rem", "1.5rem", "2rem"] as const;
const alignItemsValues = ["stretch", "start", "center", "end"] as const;
const justifyContentValues = ["start", "center", "end", "space-between"] as const;

export const STYLE_LAB_PROPERTY_DEFINITIONS: Readonly<Record<StyleLabPropertyId, StyleLabPropertyDefinition>> = {
  fontSize: { cssProperties: ["font-size"], group: "typography", id: "fontSize", label: "Font size", values: pxValues },
  fontWeight: { cssProperties: ["font-weight"], group: "typography", id: "fontWeight", label: "Font weight", values: fontWeightValues },
  textColor: { cssProperties: ["color"], group: "typography", id: "textColor", label: "Text color", values: STYLE_LAB_TEXT_COLORS },
  backgroundColor: { cssProperties: ["background-color"], group: "background", id: "backgroundColor", label: "Background color", values: STYLE_LAB_BACKGROUND_COLORS },
  lineHeight: { cssProperties: ["line-height"], group: "typography", id: "lineHeight", label: "Line height", values: lineHeightValues },
  letterSpacing: { cssProperties: ["letter-spacing"], group: "typography", id: "letterSpacing", label: "Letter spacing", values: letterSpacingValues },
  textAlign: { cssProperties: ["text-align"], group: "typography", id: "textAlign", label: "Text alignment", values: textAlignValues },
  width: { cssProperties: ["width"], group: "sizing", id: "width", label: "Width", values: sizeValues },
  minWidth: { cssProperties: ["min-width"], group: "sizing", id: "minWidth", label: "Min width", values: sizeValues },
  maxWidth: { cssProperties: ["max-width"], group: "sizing", id: "maxWidth", label: "Max width", values: sizeValues },
  paddingX: { cssProperties: ["padding-left", "padding-right"], group: "container", id: "paddingX", label: "Padding X", values: spacingValues },
  paddingY: { cssProperties: ["padding-top", "padding-bottom"], group: "container", id: "paddingY", label: "Padding Y", values: spacingValues },
  gap: { cssProperties: ["gap"], group: "container", id: "gap", label: "Gap", values: gapValues },
  alignItems: { cssProperties: ["align-items"], group: "container", id: "alignItems", label: "Align items", values: alignItemsValues },
  justifyContent: { cssProperties: ["justify-content"], group: "container", id: "justifyContent", label: "Justify content", values: justifyContentValues },
};

const typographyCapabilities = ["fontSize", "fontWeight", "textColor", "lineHeight", "letterSpacing", "textAlign"] as const satisfies readonly StyleLabPropertyId[];
const surfaceCapabilities = [...typographyCapabilities, "backgroundColor", "width", "minWidth", "maxWidth", "paddingX", "paddingY", "gap", "alignItems", "justifyContent"] as const satisfies readonly StyleLabPropertyId[];
const chipCapabilities = [...typographyCapabilities, "backgroundColor", "minWidth", "maxWidth", "paddingX", "paddingY", "gap", "alignItems", "justifyContent"] as const satisfies readonly StyleLabPropertyId[];
const railSurfaceCapabilities = ["backgroundColor", "paddingX", "paddingY", "gap", "alignItems", "justifyContent"] as const satisfies readonly StyleLabPropertyId[];
const pageBodyCapabilities = ["width", "minWidth", "maxWidth", "paddingX", "paddingY", "gap", "alignItems", "justifyContent"] as const satisfies readonly StyleLabPropertyId[];
const logoCapabilities = ["width", "minWidth", "maxWidth"] as const satisfies readonly StyleLabPropertyId[];

export const STYLE_LAB_ROLES: readonly StyleLabRole[] = [
  { capabilities: surfaceCapabilities, component: "AdhdCard", context: "Card surface", id: "ui.card.surface", name: "Card surface" },
  { capabilities: surfaceCapabilities, component: "AdhdPanel", context: "Panel surface", id: "ui.panel.surface", name: "Panel surface" },
  { capabilities: typographyCapabilities, component: "AdhdPanel", context: "Built-in panel title", id: "ui.panel.title", name: "Panel title" },
  { capabilities: typographyCapabilities, component: "AdhdPanel", context: "Built-in panel subtitle", id: "ui.panel.subtitle", name: "Panel subtitle" },
  { capabilities: chipCapabilities, component: "AdhdChip", context: "Compact labeled action", id: "ui.chip", name: "Chip", targets: { typography: "label" } },
  { capabilities: [...typographyCapabilities, "width", "minWidth", "maxWidth"] as const, component: "AdhdIconButton", context: "Icon-only action", id: "ui.icon-button", name: "Icon button" },
  { capabilities: typographyCapabilities, component: "EditableEntityHeaderTitle", context: "Editable entity title", id: "ui.entity-header-title", name: "Entity header title" },
  { capabilities: typographyCapabilities, component: "Shared section typography", context: "Section eyebrow or label", id: "ui.section.label", name: "Section label" },
  { capabilities: typographyCapabilities, component: "Shared section typography", context: "Section or content title", id: "ui.section.title", name: "Section title" },
  { capabilities: typographyCapabilities, component: "Shared section typography", context: "Section supporting text", id: "ui.section.subtitle", name: "Section subtitle" },
  { capabilities: typographyCapabilities, component: "Shared field-label helpers", context: "Compact form label", id: "typography.field-label", name: "Field label" },
  { capabilities: railSurfaceCapabilities, component: "Tasks list rail", context: "Lists and folders navigation rail", id: "tasks.rail.surface", name: "Tasks rail surface" },
  {
    capabilities: chipCapabilities,
    component: "Tasks list rail",
    context: "List or folder navigation chip",
    id: "tasks.rail.chip",
    name: "Tasks rail chip",
    targets: { background: "surface", container: "surface", sizing: "surface", typography: "label" },
  },
  { capabilities: railSurfaceCapabilities, component: "Tasks filters", context: "Task filter and sort surface", id: "tasks.filter.surface", name: "Tasks filter surface" },
  { capabilities: chipCapabilities, component: "Tasks filters", context: "Task filter or sort chip", id: "tasks.filter.chip", name: "Tasks filter chip" },
  { capabilities: surfaceCapabilities, component: "HudCommandCenter", context: "HUD workspace surface", id: "hud.workspace.surface", name: "HUD workspace surface" },
  { capabilities: surfaceCapabilities, component: "HudCommandCenter", context: "HUD widget surface", id: "hud.widget.surface", name: "HUD widget surface" },
  { capabilities: typographyCapabilities, component: "HUD widgets", context: "HUD widget label", id: "hud.widget.label", name: "HUD widget label" },
  { capabilities: typographyCapabilities, component: "HUD widgets", context: "HUD displayed value", id: "hud.widget.value", name: "HUD widget value" },
  { capabilities: chipCapabilities, component: "HUD widgets", context: "HUD compact action chip", id: "hud.widget.chip", name: "HUD widget chip" },
  { capabilities: surfaceCapabilities, component: "Collapsed HUD", context: "Collapsed HUD surface", id: "hud.collapsed.surface", name: "Collapsed HUD surface" },
  { capabilities: logoCapabilities, component: "Collapsed HUD", context: "ADHDice brand logo", id: "hud.brand.logo", name: "HUD brand logo" },
  { capabilities: typographyCapabilities, component: "Collapsed HUD", context: "HUD version number", id: "hud.version", name: "HUD version" },
  { capabilities: typographyCapabilities, component: "Collapsed HUD", context: "HUD date and time", id: "hud.datetime", name: "HUD date and time" },
  { capabilities: chipCapabilities, component: "Collapsed HUD", context: "Collapsed HUD chip", id: "hud.collapsed.chip", name: "Collapsed HUD chip", targets: { typography: "label" } },
  { capabilities: chipCapabilities, component: "Collapsed HUD", context: "Collapsed HUD timer chip", id: "hud.collapsed.timer", name: "Collapsed HUD timer", targets: { typography: "label" } },
  { capabilities: surfaceCapabilities, component: "PageShellSurface", context: "Page Shell surface", id: "page.shell.surface", name: "Page Shell surface" },
  { capabilities: typographyCapabilities, component: "PageShellHeader", context: "Page title", id: "page.shell.title", name: "Page Shell title" },
  { capabilities: typographyCapabilities, component: "PageShellHeader", context: "Page subtitle", id: "page.shell.subtitle", name: "Page Shell subtitle" },
  { capabilities: pageBodyCapabilities, component: "PageShellBody", context: "Page Shell content body", id: "page.shell.body", name: "Page Shell body" },
  { capabilities: chipCapabilities, component: "Style Lab Mock Chip", context: "Temporary structural chip", id: "mock.chip", name: "Mock Chip", targets: { typography: "label", background: "surface", sizing: "surface", container: "surface" } },
  { capabilities: surfaceCapabilities, component: "Style Lab Mock Item", context: "Temporary structural item", id: "mock.item.surface", name: "Mock Item surface" },
  { capabilities: typographyCapabilities, component: "Style Lab Mock Item", context: "Temporary item title", id: "mock.item.title", name: "Mock Item title" },
  { capabilities: typographyCapabilities, component: "Style Lab Mock Item", context: "Temporary item supporting text", id: "mock.item.subtitle", name: "Mock Item subtitle" },
  { capabilities: surfaceCapabilities, component: "Style Lab Mock Section", context: "Temporary structural section", id: "mock.section.surface", name: "Mock Section surface" },
  { capabilities: typographyCapabilities, component: "Style Lab Mock Section", context: "Temporary section title", id: "mock.section.title", name: "Mock Section title" },
  { capabilities: typographyCapabilities, component: "Style Lab Mock Section", context: "Temporary section supporting text", id: "mock.section.subtitle", name: "Mock Section subtitle" },
  { capabilities: pageBodyCapabilities, component: "Style Lab Mock Section", context: "Temporary nested mock body", id: "mock.section.body", name: "Mock Section body" },
];

const roleById = new Map(STYLE_LAB_ROLES.map((role) => [role.id, role]));

export function getStyleLabRole(roleId: string | null | undefined): StyleLabRole | null {
  return roleId ? roleById.get(roleId as StyleLabRoleId) ?? null : null;
}

export function getStyleLabProperty(propertyId: string | null | undefined): StyleLabPropertyDefinition | null {
  return propertyId && propertyId in STYLE_LAB_PROPERTY_DEFINITIONS
    ? STYLE_LAB_PROPERTY_DEFINITIONS[propertyId as StyleLabPropertyId]
    : null;
}

export function normalizeStyleLabTargetPart(value: unknown): StyleLabTargetPart {
  return typeof value === "string" && (STYLE_LAB_TARGET_PART_IDS as readonly string[]).includes(value)
    ? value as StyleLabTargetPart
    : "self";
}

export function getStyleLabTargetPart(roleId: string, group: StyleLabCapabilityGroup): StyleLabTargetPart {
  return normalizeStyleLabTargetPart(getStyleLabRole(roleId)?.targets?.[group]);
}

export function isStyleLabPropertyAllowed(roleId: string, propertyId: string): propertyId is StyleLabPropertyId {
  return getStyleLabRole(roleId)?.capabilities.includes(propertyId as StyleLabPropertyId) ?? false;
}

export function isStyleLabValueAllowed(propertyId: string, value: string): boolean {
  if (propertyId === "backgroundColor" && normalizeStyleLabCustomColor(value)) return true;
  return getStyleLabProperty(propertyId)?.values.includes(value) ?? false;
}

export function isStyleLabIconName(value: unknown): value is StyleLabIconName {
  return typeof value === "string" && STYLE_LAB_ICON_OPTIONS.some((option) => option.key === value);
}

export function getStyleLabTextColorCssValue(value: string): string {
  const customColor = normalizeStyleLabCustomColor(value);
  if (customColor) return customColor;
  const tokenByColor: Record<StyleLabTextColor, string> = {
    Primary: "var(--text-primary)",
    Secondary: "var(--text-secondary)",
    Muted: "var(--text-muted)",
    Accent: "var(--accent)",
    Success: "var(--success)",
    Warning: "var(--warning)",
    Danger: "var(--danger)",
  };
  return tokenByColor[value as StyleLabTextColor] ?? tokenByColor.Primary;
}

export function getStyleLabBackgroundColorCssValue(value: string): string {
  const customColor = normalizeStyleLabCustomColor(value);
  if (customColor) return customColor;
  const tokenByColor: Record<StyleLabBackgroundColor, string> = {
    Surface: "var(--surface)",
    Subtle: "var(--surface-muted)",
    Accent: "var(--accent-soft)",
    Success: "var(--success-soft)",
    Warning: "var(--warning-soft)",
    Danger: "var(--danger-soft)",
    Transparent: "transparent",
  };
  return tokenByColor[value as StyleLabBackgroundColor] ?? "";
}
