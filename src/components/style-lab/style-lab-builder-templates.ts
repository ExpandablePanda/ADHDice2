import {
  getStyleLabBuilderLibraryEntryForLegacyTemplate,
  STYLE_LAB_BUILDER_LEGACY_TEMPLATE_IDS,
  type StyleLabBuilderLegacyTemplateId,
} from "./style-lab-builder-library";
import { createDefaultStyleLabBuilderDraft, type StyleLabBuilderDraft } from "./style-lab-builder-model";

/**
 * Compatibility surface for Phase 1-3 callers. The catalog is now the only
 * owner of starter definitions; these IDs remain stable for existing tests and
 * any local code that still refers to the former template chooser.
 */
export const STYLE_LAB_BUILDER_TEMPLATES = [
  { id: "blank", label: "Blank" },
  { id: "page-shell", label: "Page Shell" },
  { id: "card", label: "ADHDice Card" },
  { id: "panel", label: "ADHDice Panel" },
  { id: "metric-tile", label: "Metric Tile" },
  { id: "metric-grid", label: "3-Column Metric Grid" },
  { id: "task-detail-hero", label: "Task Detail Hero" },
] as const satisfies ReadonlyArray<{ id: StyleLabBuilderLegacyTemplateId; label: string }>;

export type StyleLabBuilderTemplateId = (typeof STYLE_LAB_BUILDER_TEMPLATES)[number]["id"];

export function isStyleLabBuilderTemplateId(value: unknown): value is StyleLabBuilderTemplateId {
  return typeof value === "string" && (STYLE_LAB_BUILDER_LEGACY_TEMPLATE_IDS as readonly string[]).includes(value);
}

export function createStyleLabBuilderTemplate(templateId: StyleLabBuilderTemplateId): StyleLabBuilderDraft {
  return getStyleLabBuilderLibraryEntryForLegacyTemplate(templateId)?.createDraft() ?? createDefaultStyleLabBuilderDraft();
}
