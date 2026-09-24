import { createDefaultStyleLabBuilderDraft, normalizeStyleLabBuilderDraft, type StyleLabBuilderDraft } from "./style-lab-builder-model";

export const STYLE_LAB_BUILDER_TEMPLATES = [
  { id: "blank", label: "Blank" },
  { id: "page-shell", label: "Page Shell" },
  { id: "card", label: "ADHDice Card" },
  { id: "panel", label: "ADHDice Panel" },
  { id: "metric-tile", label: "Metric Tile" },
  { id: "metric-grid", label: "3-Column Metric Grid" },
  { id: "task-detail-hero", label: "Task Detail Hero" },
] as const;

export type StyleLabBuilderTemplateId = (typeof STYLE_LAB_BUILDER_TEMPLATES)[number]["id"];

function container(id: string, parentId: string | null, order: number, styles: Record<string, unknown> = {}) {
  return { id, type: "container", parentId, order, styles };
}

function text(id: string, parentId: string, order: number, value: string, styles: Record<string, unknown> = {}) {
  return { id, type: "text", parentId, order, text: value, styles };
}

function chip(id: string, parentId: string, order: number, value: string, styles: Record<string, unknown> = {}) {
  return { id, type: "chip", parentId, order, text: value, styles };
}

function root(styles: Record<string, unknown> = {}) {
  return container("root", null, 0, styles);
}

function draft(moduleName: string, nodes: unknown[]) {
  return normalizeStyleLabBuilderDraft({ canvasWidth: "390", moduleName, nodes });
}

function metricTileNodes(prefix: string, parentId: string, order: number, label: string, value: string) {
  const containerId = `${prefix}-container`;
  return [
    container(containerId, parentId, order, {
      backgroundColor: "Surface",
      border: "subtle",
      gap: "0.25rem",
      paddingX: "0.75rem",
      paddingY: "0.75rem",
      radius: "medium",
      shadow: "subtle",
      width: "100%",
    }),
    text(`${prefix}-label`, containerId, 0, label, { fontSize: "12px", fontWeight: "600", textColor: "Muted" }),
    text(`${prefix}-value`, containerId, 1, value, { fontSize: "20px", fontWeight: "700", textColor: "Primary" }),
  ];
}

export function isStyleLabBuilderTemplateId(value: unknown): value is StyleLabBuilderTemplateId {
  return typeof value === "string" && STYLE_LAB_BUILDER_TEMPLATES.some((template) => template.id === value);
}

export function createStyleLabBuilderTemplate(templateId: StyleLabBuilderTemplateId): StyleLabBuilderDraft {
  switch (templateId) {
    case "blank":
      return createDefaultStyleLabBuilderDraft();
    case "page-shell":
      return draft("Page Shell Starter", [
        root({ backgroundColor: "Transparent", gap: "1.5rem", paddingX: "0.5rem", paddingY: "0.5rem", width: "100%" }),
        container("header", "root", 0, { gap: "0.25rem", paddingX: "0.75rem", paddingY: "0.5rem", width: "100%" }),
        text("page-title", "header", 0, "Test Page", { fontSize: "24px", fontWeight: "700", textColor: "Primary" }),
        text("page-subtitle", "header", 1, "A quiet supporting subtitle", { fontSize: "14px", fontWeight: "400", textColor: "Muted" }),
        container("body", "root", 1, { backgroundColor: "Surface", border: "subtle", gap: "1rem", paddingX: "1rem", paddingY: "1rem", radius: "large", shadow: "subtle", width: "100%" }),
        text("body-title", "body", 0, "Page content", { fontSize: "18px", fontWeight: "600", textColor: "Primary" }),
        text("body-copy", "body", 1, "Build from this Page Shell starter.", { fontSize: "14px", fontWeight: "400", textColor: "Secondary" }),
      ]);
    case "card":
      return draft("ADHDice Card Starter", [
        root({ backgroundColor: "Surface", border: "subtle", gap: "0.75rem", paddingX: "1rem", paddingY: "1rem", radius: "large", shadow: "card", width: "100%" }),
        text("card-title", "root", 0, "Card title", { fontSize: "18px", fontWeight: "700", textColor: "Primary" }),
        text("card-body", "root", 1, "A concise supporting description for this card.", { fontSize: "14px", fontWeight: "400", textColor: "Secondary" }),
        chip("card-chip", "root", 2, "View details", { tone: "purple", textColor: "Accent" }),
      ]);
    case "panel":
      return draft("ADHDice Panel Starter", [
        root({ backgroundColor: "Surface", border: "subtle", gap: "0.75rem", paddingX: "1rem", paddingY: "1rem", radius: "large", shadow: "subtle", width: "100%" }),
        text("panel-title", "root", 0, "Panel title", { fontSize: "16px", fontWeight: "600", textColor: "Primary" }),
        text("panel-subtitle", "root", 1, "Panel subtitle", { fontSize: "13px", fontWeight: "400", textColor: "Muted" }),
        text("panel-body", "root", 2, "Panel content stays calm, readable, and easy to extend.", { fontSize: "14px", fontWeight: "400", textColor: "Secondary" }),
      ]);
    case "metric-tile":
      return draft("Metric Tile Starter", [
        root({ backgroundColor: "Surface", border: "subtle", gap: "0.5rem", paddingX: "1rem", paddingY: "1rem", radius: "large", shadow: "card", width: "100%" }),
        text("metric-label", "root", 0, "Priority", { fontSize: "12px", fontWeight: "600", textColor: "Muted" }),
        text("metric-value", "root", 1, "Urgent", { fontSize: "24px", fontWeight: "700", textColor: "Primary" }),
        chip("metric-chip", "root", 2, "High", { tone: "purple", textColor: "Accent" }),
      ]);
    case "metric-grid":
      return draft("3-Column Metric Grid Starter", [
        root({ backgroundColor: "Transparent", gap: "0.75rem", layout: "grid", gridColumns: 3, width: "100%" }),
        ...metricTileNodes("metric-one", "root", 0, "Priority", "Urgent"),
        ...metricTileNodes("metric-two", "root", 1, "Focus", "42 min"),
        ...metricTileNodes("metric-three", "root", 2, "Progress", "72%"),
      ]);
    case "task-detail-hero":
      return draft("Task Detail Hero Starter", [
        root({ backgroundColor: "Subtle", border: "subtle", gap: "0.5rem", paddingX: "1rem", paddingY: "1rem", radius: "xl", shadow: "card", width: "100%" }),
        text("hero-eyebrow", "root", 0, "Today", { fontSize: "12px", fontWeight: "600", textColor: "Muted" }),
        text("hero-title", "root", 1, "Call UGI", { fontSize: "24px", fontWeight: "700", textColor: "Primary" }),
        text("hero-time", "root", 2, "Today · 2:00 PM", { fontSize: "14px", fontWeight: "400", textColor: "Secondary" }),
        chip("hero-chip", "root", 3, "In Progress", { tone: "progress", textColor: "Secondary" }),
      ]);
  }
}
