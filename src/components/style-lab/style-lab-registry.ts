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

export const STYLE_LAB_PROPERTY_IDS = [
  "fontSize",
  "fontWeight",
  "textColor",
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

export type StyleLabCapabilityGroup = "typography" | "sizing" | "container";

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
  | "typography.field-label"
  | "page.shell.surface"
  | "page.shell.title"
  | "page.shell.subtitle"
  | "page.shell.body";

export type StyleLabRole = {
  capabilities: readonly StyleLabPropertyId[];
  component: string;
  context: string;
  id: StyleLabRoleId;
  name: string;
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
const surfaceCapabilities = [...typographyCapabilities, "width", "minWidth", "maxWidth", "paddingX", "paddingY", "gap", "alignItems", "justifyContent"] as const satisfies readonly StyleLabPropertyId[];
const pageBodyCapabilities = ["width", "minWidth", "maxWidth", "paddingX", "paddingY", "gap", "alignItems", "justifyContent"] as const satisfies readonly StyleLabPropertyId[];

export const STYLE_LAB_ROLES: readonly StyleLabRole[] = [
  { capabilities: surfaceCapabilities, component: "AdhdCard", context: "Card surface", id: "ui.card.surface", name: "Card surface" },
  { capabilities: surfaceCapabilities, component: "AdhdPanel", context: "Panel surface", id: "ui.panel.surface", name: "Panel surface" },
  { capabilities: typographyCapabilities, component: "AdhdPanel", context: "Built-in panel title", id: "ui.panel.title", name: "Panel title" },
  { capabilities: typographyCapabilities, component: "AdhdPanel", context: "Built-in panel subtitle", id: "ui.panel.subtitle", name: "Panel subtitle" },
  { capabilities: typographyCapabilities, component: "AdhdChip", context: "Compact labeled action", id: "ui.chip", name: "Chip" },
  { capabilities: [...typographyCapabilities, "width", "minWidth", "maxWidth"] as const, component: "AdhdIconButton", context: "Icon-only action", id: "ui.icon-button", name: "Icon button" },
  { capabilities: typographyCapabilities, component: "EditableEntityHeaderTitle", context: "Editable entity title", id: "ui.entity-header-title", name: "Entity header title" },
  { capabilities: typographyCapabilities, component: "Shared field-label helpers", context: "Compact form label", id: "typography.field-label", name: "Field label" },
  { capabilities: surfaceCapabilities, component: "PageShellSurface", context: "Page Shell surface", id: "page.shell.surface", name: "Page Shell surface" },
  { capabilities: typographyCapabilities, component: "PageShellHeader", context: "Page title", id: "page.shell.title", name: "Page Shell title" },
  { capabilities: typographyCapabilities, component: "PageShellHeader", context: "Page subtitle", id: "page.shell.subtitle", name: "Page Shell subtitle" },
  { capabilities: pageBodyCapabilities, component: "PageShellBody", context: "Page Shell content body", id: "page.shell.body", name: "Page Shell body" },
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

export function isStyleLabPropertyAllowed(roleId: string, propertyId: string): propertyId is StyleLabPropertyId {
  return getStyleLabRole(roleId)?.capabilities.includes(propertyId as StyleLabPropertyId) ?? false;
}

export function isStyleLabValueAllowed(propertyId: string, value: string): boolean {
  return getStyleLabProperty(propertyId)?.values.includes(value) ?? false;
}

export function getStyleLabTextColorCssValue(value: StyleLabTextColor): string {
  const tokenByColor: Record<StyleLabTextColor, string> = {
    Primary: "var(--text-primary)",
    Secondary: "var(--text-secondary)",
    Muted: "var(--text-muted)",
    Accent: "var(--accent)",
    Success: "var(--success)",
    Warning: "var(--warning)",
    Danger: "var(--danger)",
  };
  return tokenByColor[value];
}
