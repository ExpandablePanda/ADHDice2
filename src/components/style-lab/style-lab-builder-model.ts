import {
  getStyleLabProperty,
  isStyleLabIconName,
  STYLE_LAB_BACKGROUND_COLORS,
  STYLE_LAB_BUILDER_BORDER_OPTIONS,
  STYLE_LAB_BUILDER_CANVAS_WIDTHS,
  STYLE_LAB_BUILDER_CHIP_TONES,
  STYLE_LAB_BUILDER_DIVIDER_ORIENTATIONS,
  STYLE_LAB_BUILDER_DIVIDER_WIDTHS,
  STYLE_LAB_BUILDER_GRID_COLUMNS,
  STYLE_LAB_BUILDER_ICON_BUTTON_SIZES,
  STYLE_LAB_BUILDER_ICON_BUTTON_TONES,
  STYLE_LAB_BUILDER_LAYOUTS,
  STYLE_LAB_BUILDER_RADIUS_OPTIONS,
  STYLE_LAB_BUILDER_SHADOW_OPTIONS,
  isStyleLabBuilderFontFamily,
  normalizeStyleLabCustomColor,
  STYLE_LAB_TEXT_COLORS,
  STYLE_LAB_ICON_OPTIONS,
  type StyleLabBackgroundColor,
  type StyleLabBuilderBorder,
  type StyleLabBuilderCanvasWidth,
  type StyleLabBuilderChipTone,
  type StyleLabBuilderDividerOrientation,
  type StyleLabBuilderDividerWidth,
  type StyleLabBuilderGridColumns,
  type StyleLabBuilderIconButtonSize,
  type StyleLabBuilderIconButtonTone,
  type StyleLabBuilderLayout,
  type StyleLabBuilderRadius,
  type StyleLabBuilderShadow,
  type StyleLabBuilderFontFamily,
  type StyleLabIconName,
  type StyleLabTextColor,
} from "./style-lab-registry";

export const STYLE_LAB_BUILDER_STORAGE_KEY = "adhdice-style-lab:builder-draft";
export const STYLE_LAB_BUILDER_MAX_NODES = 60;
export const STYLE_LAB_BUILDER_MAX_DEPTH = 6;
export const STYLE_LAB_BUILDER_ROOT_ID = "root";
export const STYLE_LAB_BUILDER_DEFAULT_MODULE_NAME = "Untitled Module";
export const STYLE_LAB_BUILDER_MIN_WIDTH_PX = 40;
export const STYLE_LAB_BUILDER_MAX_WIDTH_PX = 1600;
export const STYLE_LAB_BUILDER_MIN_HEIGHT_PX = 24;
export const STYLE_LAB_BUILDER_MAX_HEIGHT_PX = 1600;

export const STYLE_LAB_BUILDER_NODE_TYPES = ["container", "text", "chip", "icon-button", "divider"] as const;
export type StyleLabBuilderNodeType = (typeof STYLE_LAB_BUILDER_NODE_TYPES)[number];

export const STYLE_LAB_BUILDER_TEXT_ALIGNMENTS = ["left", "center", "right"] as const;
export type StyleLabBuilderTextAlign = (typeof STYLE_LAB_BUILDER_TEXT_ALIGNMENTS)[number];

export type StyleLabBuilderTextStyles = {
  fontFamily: StyleLabBuilderFontFamily;
  fontSize: string;
  fontWeight: string;
  textColor: StyleLabTextColor | `#${string}`;
  lineHeight: string;
  letterSpacing: string;
  textAlign: StyleLabBuilderTextAlign;
};

export type StyleLabBuilderContainerStyles = {
  layout: StyleLabBuilderLayout;
  gridColumns: StyleLabBuilderGridColumns;
  gap: string;
  paddingX: string;
  paddingY: string;
  alignItems: string;
  justifyContent: string;
  width: string;
  height: string;
  minWidth: string;
  maxWidth: string;
  backgroundColor: StyleLabBackgroundColor | `#${string}`;
  radius: StyleLabBuilderRadius;
  border: StyleLabBuilderBorder;
  shadow: StyleLabBuilderShadow;
};

export type StyleLabBuilderBaseNode = {
  id: string;
  parentId: string | null;
  order: number;
};

export type StyleLabBuilderContainerNode = StyleLabBuilderBaseNode & {
  type: "container";
  styles: StyleLabBuilderContainerStyles;
};

export type StyleLabBuilderTextNode = StyleLabBuilderBaseNode & {
  type: "text";
  text: string;
  styles: StyleLabBuilderTextStyles;
};

export type StyleLabBuilderChipNode = StyleLabBuilderBaseNode & {
  type: "chip";
  text: string;
  styles: StyleLabBuilderTextStyles & {
    tone: StyleLabBuilderChipTone;
    selected: boolean;
    iconName: StyleLabIconName | null;
  };
};

export type StyleLabBuilderIconButtonNode = StyleLabBuilderBaseNode & {
  type: "icon-button";
  ariaLabel: string;
  styles: {
    iconName: StyleLabIconName;
    size: StyleLabBuilderIconButtonSize;
    tone: StyleLabBuilderIconButtonTone;
  };
};

export type StyleLabBuilderDividerNode = StyleLabBuilderBaseNode & {
  type: "divider";
  styles: {
    orientation: StyleLabBuilderDividerOrientation;
    color: StyleLabTextColor | `#${string}`;
    width: StyleLabBuilderDividerWidth;
  };
};

export type StyleLabBuilderNode =
  | StyleLabBuilderContainerNode
  | StyleLabBuilderTextNode
  | StyleLabBuilderChipNode
  | StyleLabBuilderIconButtonNode
  | StyleLabBuilderDividerNode;

export type StyleLabBuilderDraft = {
  moduleName: string;
  canvasWidth: StyleLabBuilderCanvasWidth;
  nodes: StyleLabBuilderNode[];
};

export type StyleLabBuilderNodePatch = {
  ariaLabel?: string;
  styles?: Record<string, unknown>;
  text?: string;
};

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;
type UnknownRecord = Record<string, unknown>;

const textAlignValues = getStyleLabProperty("textAlign")?.values ?? STYLE_LAB_BUILDER_TEXT_ALIGNMENTS;
const fontSizeValues = getStyleLabProperty("fontSize")?.values ?? ["14px"];
const fontWeightValues = getStyleLabProperty("fontWeight")?.values ?? ["400"];
const lineHeightValues = getStyleLabProperty("lineHeight")?.values ?? ["1.4"];
const letterSpacingValues = getStyleLabProperty("letterSpacing")?.values ?? ["0"];
const spacingValues = getStyleLabProperty("paddingX")?.values ?? ["0"];
const gapValues = getStyleLabProperty("gap")?.values ?? ["0"];
const sizeValues = getStyleLabProperty("width")?.values ?? ["auto"];
const alignItemsValues = getStyleLabProperty("alignItems")?.values ?? ["stretch"];
const justifyContentValues = getStyleLabProperty("justifyContent")?.values ?? ["start"];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function allowedValue<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === "string" && values.includes(value as T) ? value as T : fallback;
}

function allowedNumber<T extends number>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === "number" && values.includes(value as T) ? value as T : fallback;
}

function boundedText(value: unknown, fallback: string, maxLength = 180): string {
  return typeof value === "string" ? value.slice(0, maxLength) : fallback;
}

function normalizedModuleName(value: unknown): string {
  const name = boundedText(value, STYLE_LAB_BUILDER_DEFAULT_MODULE_NAME, 80).trim();
  return name || STYLE_LAB_BUILDER_DEFAULT_MODULE_NAME;
}

function normalizedOrder(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export type StyleLabBuilderDimensionOptions = {
  allowAuto?: boolean;
  fallback: string;
  max: number;
  min: number;
};

export function normalizeStyleLabBuilderDimension(value: unknown, options: StyleLabBuilderDimensionOptions): string {
  if (options.allowAuto && value === "auto") return "auto";
  const raw = typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && /^\d+(?:\.\d+)?(?:px)?$/.test(value.trim())
      ? Number.parseFloat(value)
      : Number.NaN;
  if (!Number.isFinite(raw)) return options.fallback;
  const normalized = Math.min(options.max, Math.max(options.min, Math.round(raw)));
  return `${normalized}px`;
}

function normalizeBuilderWidth(value: unknown): string {
  if (typeof value === "string" && sizeValues.includes(value as (typeof sizeValues)[number])) return value;
  return normalizeStyleLabBuilderDimension(value, {
    fallback: "100%",
    max: STYLE_LAB_BUILDER_MAX_WIDTH_PX,
    min: STYLE_LAB_BUILDER_MIN_WIDTH_PX,
  });
}

function normalizeBuilderColor<T extends string>(value: unknown, semanticValues: readonly T[], fallback: T): T | `#${string}` {
  const customColor = normalizeStyleLabCustomColor(value);
  return customColor ? customColor as `#${string}` : allowedValue(value, semanticValues, fallback);
}

export type StyleLabBuilderResizeAxis = "width" | "height" | "both";

export function resizeStyleLabBuilderDimensions(
  startWidth: number,
  startHeight: number,
  deltaX: number,
  deltaY: number,
  axis: StyleLabBuilderResizeAxis,
) {
  return {
    height: axis === "width"
      ? normalizeStyleLabBuilderDimension(startHeight, { fallback: "auto", max: STYLE_LAB_BUILDER_MAX_HEIGHT_PX, min: STYLE_LAB_BUILDER_MIN_HEIGHT_PX })
      : normalizeStyleLabBuilderDimension(startHeight + deltaY, { fallback: "24px", max: STYLE_LAB_BUILDER_MAX_HEIGHT_PX, min: STYLE_LAB_BUILDER_MIN_HEIGHT_PX }),
    width: axis === "height"
      ? normalizeStyleLabBuilderDimension(startWidth, { fallback: "100%", max: STYLE_LAB_BUILDER_MAX_WIDTH_PX, min: STYLE_LAB_BUILDER_MIN_WIDTH_PX })
      : normalizeStyleLabBuilderDimension(startWidth + deltaX, { fallback: "40px", max: STYLE_LAB_BUILDER_MAX_WIDTH_PX, min: STYLE_LAB_BUILDER_MIN_WIDTH_PX }),
  };
}

function normalizeTextStyles(value: unknown): StyleLabBuilderTextStyles {
  const source = isRecord(value) ? value : {};
  return {
    fontSize: allowedValue(source.fontSize, fontSizeValues, "14px"),
    fontWeight: allowedValue(source.fontWeight, fontWeightValues, "400"),
    fontFamily: isStyleLabBuilderFontFamily(source.fontFamily) ? source.fontFamily : "adhdice",
    textColor: normalizeBuilderColor(source.textColor, STYLE_LAB_TEXT_COLORS, "Primary"),
    lineHeight: allowedValue(source.lineHeight, lineHeightValues, "1.4"),
    letterSpacing: allowedValue(source.letterSpacing, letterSpacingValues, "0"),
    textAlign: allowedValue(source.textAlign, textAlignValues as readonly StyleLabBuilderTextAlign[], "left"),
  };
}

function normalizeContainerStyles(value: unknown): StyleLabBuilderContainerStyles {
  const source = isRecord(value) ? value : {};
  return {
    layout: allowedValue(source.layout, STYLE_LAB_BUILDER_LAYOUTS, "column"),
    gridColumns: allowedNumber(source.gridColumns, STYLE_LAB_BUILDER_GRID_COLUMNS, 1),
    gap: allowedValue(source.gap, gapValues, "0.5rem"),
    paddingX: allowedValue(source.paddingX, spacingValues, "0.75rem"),
    paddingY: allowedValue(source.paddingY, spacingValues, "0.75rem"),
    alignItems: allowedValue(source.alignItems, alignItemsValues, "stretch"),
    justifyContent: allowedValue(source.justifyContent, justifyContentValues, "start"),
    width: normalizeBuilderWidth(source.width),
    height: normalizeStyleLabBuilderDimension(source.height, {
      allowAuto: true,
      fallback: "auto",
      max: STYLE_LAB_BUILDER_MAX_HEIGHT_PX,
      min: STYLE_LAB_BUILDER_MIN_HEIGHT_PX,
    }),
    minWidth: allowedValue(source.minWidth, sizeValues, "auto"),
    maxWidth: allowedValue(source.maxWidth, [...sizeValues, "none"], "100%"),
    backgroundColor: normalizeBuilderColor(source.backgroundColor, STYLE_LAB_BACKGROUND_COLORS, "Surface"),
    radius: allowedValue(source.radius, STYLE_LAB_BUILDER_RADIUS_OPTIONS.map((option) => option.value), "large"),
    border: allowedValue(source.border, STYLE_LAB_BUILDER_BORDER_OPTIONS.map((option) => option.value), "none"),
    shadow: allowedValue(source.shadow, STYLE_LAB_BUILDER_SHADOW_OPTIONS.map((option) => option.value), "none"),
  };
}

function normalizeNode(raw: UnknownRecord, id: string, parentId: string | null, order: number): StyleLabBuilderNode | null {
  const type = raw.type;
  const base = { id, parentId, order };
  if (type === "container") return { ...base, type, styles: normalizeContainerStyles(raw.styles) };
  if (type === "text") return { ...base, type, text: boundedText(raw.text, "New text"), styles: normalizeTextStyles(raw.styles) };
  if (type === "chip") {
    const styles = isRecord(raw.styles) ? raw.styles : {};
    const iconName = isStyleLabIconName(styles.iconName) ? styles.iconName : null;
    return {
      ...base,
      type,
      text: boundedText(raw.text, "New Chip"),
      styles: {
        ...normalizeTextStyles(styles),
        tone: allowedValue(styles.tone, STYLE_LAB_BUILDER_CHIP_TONES, "default"),
        selected: styles.selected === true,
        iconName,
      },
    };
  }
  if (type === "icon-button") {
    const styles = isRecord(raw.styles) ? raw.styles : {};
    return {
      ...base,
      type,
      ariaLabel: boundedText(raw.ariaLabel, "Builder icon button", 120),
      styles: {
        iconName: isStyleLabIconName(styles.iconName) ? styles.iconName : STYLE_LAB_ICON_OPTIONS[0]?.key ?? "plus",
        size: allowedValue(styles.size, STYLE_LAB_BUILDER_ICON_BUTTON_SIZES, "md"),
        tone: allowedValue(styles.tone, STYLE_LAB_BUILDER_ICON_BUTTON_TONES, "default"),
      },
    };
  }
  if (type === "divider") {
    const styles = isRecord(raw.styles) ? raw.styles : {};
    return {
      ...base,
      type,
      styles: {
        orientation: allowedValue(styles.orientation, STYLE_LAB_BUILDER_DIVIDER_ORIENTATIONS, "horizontal"),
        color: normalizeBuilderColor(styles.color, STYLE_LAB_TEXT_COLORS, "Muted"),
        width: allowedValue(styles.width, STYLE_LAB_BUILDER_DIVIDER_WIDTHS, "100%"),
      },
    };
  }
  return null;
}

function nextUniqueId(usedIds: Set<string>, preferred: string): string {
  const base = preferred.trim() || "node";
  if (!usedIds.has(base)) {
    usedIds.add(base);
    return base;
  }
  let suffix = 2;
  while (usedIds.has(`${base}-${suffix}`)) suffix += 1;
  const id = `${base}-${suffix}`;
  usedIds.add(id);
  return id;
}

function rawParentId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeParentLinks(nodes: StyleLabBuilderNode[], rawParentById: Map<string, string | null>): StyleLabBuilderNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const initialParents = new Map<string, string | null>();
  for (const node of nodes) {
    if (node.id === STYLE_LAB_BUILDER_ROOT_ID) {
      initialParents.set(node.id, null);
      continue;
    }
    const proposed = rawParentById.get(node.id);
    const parent = proposed && nodeById.get(proposed)?.type === "container" && proposed !== node.id ? proposed : STYLE_LAB_BUILDER_ROOT_ID;
    initialParents.set(node.id, parent);
  }

  const safeParents = new Map<string, string | null>();
  for (const node of nodes) {
    if (node.id === STYLE_LAB_BUILDER_ROOT_ID) continue;
    const directParent = initialParents.get(node.id) ?? STYLE_LAB_BUILDER_ROOT_ID;
    let parent = directParent;
    const visited = new Set<string>([node.id]);
    let hasCycle = false;
    while (parent && parent !== STYLE_LAB_BUILDER_ROOT_ID) {
      if (visited.has(parent)) {
        hasCycle = true;
        break;
      }
      visited.add(parent);
      parent = initialParents.get(parent) ?? STYLE_LAB_BUILDER_ROOT_ID;
    }
    safeParents.set(node.id, hasCycle ? STYLE_LAB_BUILDER_ROOT_ID : directParent);
  }

  const depthFor = (id: string, visiting = new Set<string>()): number => {
    if (id === STYLE_LAB_BUILDER_ROOT_ID) return 0;
    if (visiting.has(id)) return STYLE_LAB_BUILDER_MAX_DEPTH + 1;
    const nextVisiting = new Set(visiting).add(id);
    const parent = safeParents.get(id) ?? STYLE_LAB_BUILDER_ROOT_ID;
    return 1 + depthFor(parent, nextVisiting);
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.id === STYLE_LAB_BUILDER_ROOT_ID) continue;
      if (depthFor(node.id) > STYLE_LAB_BUILDER_MAX_DEPTH && safeParents.get(node.id) !== STYLE_LAB_BUILDER_ROOT_ID) {
        safeParents.set(node.id, STYLE_LAB_BUILDER_ROOT_ID);
        changed = true;
      }
    }
  }

  return nodes.map((node) => ({ ...node, parentId: node.id === STYLE_LAB_BUILDER_ROOT_ID ? null : safeParents.get(node.id) ?? STYLE_LAB_BUILDER_ROOT_ID }));
}

function normalizeSiblingOrder(nodes: StyleLabBuilderNode[]): StyleLabBuilderNode[] {
  const childrenByParent = new Map<string, StyleLabBuilderNode[]>();
  for (const node of nodes) {
    if (node.id === STYLE_LAB_BUILDER_ROOT_ID) continue;
    const siblings = childrenByParent.get(node.parentId ?? STYLE_LAB_BUILDER_ROOT_ID) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parentId ?? STYLE_LAB_BUILDER_ROOT_ID, siblings);
  }
  const normalizedOrders = new Map<string, number>();
  for (const siblings of childrenByParent.values()) {
    siblings.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    siblings.forEach((node, index) => normalizedOrders.set(node.id, index));
  }
  return nodes.map((node) => ({ ...node, order: node.id === STYLE_LAB_BUILDER_ROOT_ID ? 0 : normalizedOrders.get(node.id) ?? 0 }));
}

export function createDefaultStyleLabBuilderDraft(moduleName = STYLE_LAB_BUILDER_DEFAULT_MODULE_NAME): StyleLabBuilderDraft {
  const root = normalizeNode({ type: "container", styles: {} }, STYLE_LAB_BUILDER_ROOT_ID, null, 0);
  return { moduleName: normalizedModuleName(moduleName), canvasWidth: "390", nodes: root ? [root] : [] };
}

export function normalizeStyleLabBuilderDraft(value: unknown): StyleLabBuilderDraft {
  const source = isRecord(value) ? value : {};
  const rawNodes = Array.isArray(source.nodes) ? source.nodes.filter(isRecord) : [];
  const rootRaw = rawNodes.find((node) => node.id === STYLE_LAB_BUILDER_ROOT_ID && node.type === "container");
  const root = normalizeNode(rootRaw ?? { type: "container", styles: {} }, STYLE_LAB_BUILDER_ROOT_ID, null, 0)!;
  const nodes: StyleLabBuilderNode[] = [root];
  const rawParentById = new Map<string, string | null>();
  const usedIds = new Set<string>([STYLE_LAB_BUILDER_ROOT_ID]);
  const originalIdMap = new Map<string, string>([[STYLE_LAB_BUILDER_ROOT_ID, STYLE_LAB_BUILDER_ROOT_ID]]);

  for (const rawNode of rawNodes) {
    if (rawNode === rootRaw) continue;
    if (!STYLE_LAB_BUILDER_NODE_TYPES.includes(rawNode.type as StyleLabBuilderNodeType)) continue;
    if (nodes.length >= STYLE_LAB_BUILDER_MAX_NODES) break;
    const originalId = typeof rawNode.id === "string" ? rawNode.id : "";
    const id = nextUniqueId(usedIds, originalId || `node-${nodes.length}`);
    if (originalId && !originalIdMap.has(originalId)) originalIdMap.set(originalId, id);
    const node = normalizeNode(rawNode, id, STYLE_LAB_BUILDER_ROOT_ID, normalizedOrder(rawNode.order));
    if (!node) continue;
    nodes.push(node);
    rawParentById.set(id, rawParentId(rawNode.parentId));
  }

  const withParents = normalizeParentLinks(nodes, new Map([...rawParentById].map(([id, parent]) => [id, parent ? originalIdMap.get(parent) ?? (parent === STYLE_LAB_BUILDER_ROOT_ID ? STYLE_LAB_BUILDER_ROOT_ID : null) : STYLE_LAB_BUILDER_ROOT_ID])));
  return {
    moduleName: normalizedModuleName(source.moduleName),
    canvasWidth: allowedValue(source.canvasWidth, STYLE_LAB_BUILDER_CANVAS_WIDTHS, "390"),
    nodes: normalizeSiblingOrder(withParents),
  };
}

export function readStyleLabBuilderDraft(storage: StorageLike | null | undefined): StyleLabBuilderDraft {
  if (!storage) return createDefaultStyleLabBuilderDraft();
  try {
    const raw = storage.getItem(STYLE_LAB_BUILDER_STORAGE_KEY);
    return normalizeStyleLabBuilderDraft(raw ? JSON.parse(raw) : null);
  } catch {
    return createDefaultStyleLabBuilderDraft();
  }
}

export function writeStyleLabBuilderDraft(storage: StorageLike | null | undefined, draft: unknown): StyleLabBuilderDraft {
  const normalized = normalizeStyleLabBuilderDraft(draft);
  if (!storage) return normalized;
  try {
    storage.setItem(STYLE_LAB_BUILDER_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Builder persistence is best effort and must never affect application state.
  }
  return normalized;
}

export function getStyleLabBuilderNode(draft: StyleLabBuilderDraft, id: string | null | undefined): StyleLabBuilderNode | null {
  return id ? draft.nodes.find((node) => node.id === id) ?? null : null;
}

export function getStyleLabBuilderChildren(draft: StyleLabBuilderDraft, parentId: string): StyleLabBuilderNode[] {
  return draft.nodes.filter((node) => node.parentId === parentId).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}

function makeNode(type: StyleLabBuilderNodeType, id: string, parentId: string, order: number): StyleLabBuilderNode {
  return normalizeNode({ type, styles: {}, text: type === "text" ? "New text" : type === "chip" ? "New Chip" : undefined }, id, parentId, order)!;
}

function withReorderedSiblings(draft: StyleLabBuilderDraft, parentId: string, siblingIds: string[]): StyleLabBuilderDraft {
  const orderById = new Map(siblingIds.map((id, index) => [id, index]));
  return normalizeStyleLabBuilderDraft({
    ...draft,
    nodes: draft.nodes.map((node) => orderById.has(node.id) ? { ...node, order: orderById.get(node.id) } : node),
  });
}

export function addStyleLabBuilderNode(draft: StyleLabBuilderDraft, type: StyleLabBuilderNodeType, selectedId: string | null): StyleLabBuilderDraft {
  const normalized = normalizeStyleLabBuilderDraft(draft);
  if (normalized.nodes.length >= STYLE_LAB_BUILDER_MAX_NODES) return normalized;
  const selected = getStyleLabBuilderNode(normalized, selectedId);
  const parentId = selected?.type === "container" ? selected.id : selected?.parentId ?? STYLE_LAB_BUILDER_ROOT_ID;
  const siblings = getStyleLabBuilderChildren(normalized, parentId);
  const insertAt = selected && selected.type !== "container" ? siblings.findIndex((node) => node.id === selected.id) + 1 : siblings.length;
  const usedIds = new Set(normalized.nodes.map((node) => node.id));
  const id = nextUniqueId(usedIds, type === "container" ? "container" : type === "icon-button" ? "icon-button" : type);
  const nextSiblings = [...siblings.map((node) => node.id)];
  nextSiblings.splice(Math.max(0, insertAt), 0, id);
  const next = withReorderedSiblings({ ...normalized, nodes: [...normalized.nodes, makeNode(type, id, parentId, nextSiblings.length)] }, parentId, nextSiblings);
  return next;
}

export function moveStyleLabBuilderNode(draft: StyleLabBuilderDraft, id: string, direction: "earlier" | "later"): StyleLabBuilderDraft {
  const normalized = normalizeStyleLabBuilderDraft(draft);
  const node = getStyleLabBuilderNode(normalized, id);
  if (!node || node.id === STYLE_LAB_BUILDER_ROOT_ID) return normalized;
  const siblings = getStyleLabBuilderChildren(normalized, node.parentId ?? STYLE_LAB_BUILDER_ROOT_ID);
  const index = siblings.findIndex((candidate) => candidate.id === id);
  const nextIndex = direction === "earlier" ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= siblings.length) return normalized;
  const nextSiblingIds = siblings.map((candidate) => candidate.id);
  [nextSiblingIds[index], nextSiblingIds[nextIndex]] = [nextSiblingIds[nextIndex]!, nextSiblingIds[index]!];
  return withReorderedSiblings(normalized, node.parentId ?? STYLE_LAB_BUILDER_ROOT_ID, nextSiblingIds);
}

function descendantIds(draft: StyleLabBuilderDraft, rootId: string): string[] {
  const ids: string[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    for (const child of getStyleLabBuilderChildren(draft, parentId)) {
      ids.push(child.id);
      if (child.type === "container") queue.push(child.id);
    }
  }
  return ids;
}

export function deleteStyleLabBuilderNode(draft: StyleLabBuilderDraft, id: string): StyleLabBuilderDraft {
  const normalized = normalizeStyleLabBuilderDraft(draft);
  if (id === STYLE_LAB_BUILDER_ROOT_ID || !getStyleLabBuilderNode(normalized, id)) return normalized;
  const removedIds = new Set([id, ...descendantIds(normalized, id)]);
  return normalizeStyleLabBuilderDraft({ ...normalized, nodes: normalized.nodes.filter((node) => !removedIds.has(node.id)) });
}

export function duplicateStyleLabBuilderNode(draft: StyleLabBuilderDraft, id: string): StyleLabBuilderDraft {
  const normalized = normalizeStyleLabBuilderDraft(draft);
  const source = getStyleLabBuilderNode(normalized, id);
  if (!source || source.id === STYLE_LAB_BUILDER_ROOT_ID) return normalized;
  const subtreeIds = [source.id, ...descendantIds(normalized, source.id)];
  if (normalized.nodes.length + subtreeIds.length > STYLE_LAB_BUILDER_MAX_NODES) return normalized;
  const usedIds = new Set(normalized.nodes.map((node) => node.id));
  const idMap = new Map<string, string>();
  for (const sourceId of subtreeIds) idMap.set(sourceId, nextUniqueId(usedIds, `${sourceId}-copy`));
  const siblings = getStyleLabBuilderChildren(normalized, source.parentId ?? STYLE_LAB_BUILDER_ROOT_ID);
  const sourceIndex = siblings.findIndex((node) => node.id === source.id);
  const nextSiblingIds = siblings.map((node) => node.id);
  nextSiblingIds.splice(sourceIndex + 1, 0, idMap.get(source.id)!);
  const cloned = subtreeIds.map((sourceId) => {
    const original = getStyleLabBuilderNode(normalized, sourceId)!;
    return { ...original, id: idMap.get(sourceId)!, parentId: original.id === source.id ? original.parentId : idMap.get(original.parentId ?? "") ?? STYLE_LAB_BUILDER_ROOT_ID };
  });
  return withReorderedSiblings({ ...normalized, nodes: [...normalized.nodes, ...cloned] }, source.parentId ?? STYLE_LAB_BUILDER_ROOT_ID, nextSiblingIds);
}

export function updateStyleLabBuilderNode(draft: StyleLabBuilderDraft, id: string, patch: StyleLabBuilderNodePatch): StyleLabBuilderDraft {
  const normalized = normalizeStyleLabBuilderDraft(draft);
  const nextNodes = normalized.nodes.map((node) => {
    if (node.id !== id) return node;
    const rawNode = {
      ...node,
      ...(patch.text === undefined ? {} : { text: patch.text }),
      ...(patch.ariaLabel === undefined ? {} : { ariaLabel: patch.ariaLabel }),
      ...(patch.styles === undefined ? {} : { styles: { ...(node.styles as unknown as UnknownRecord), ...patch.styles } }),
    };
    return normalizeNode(rawNode as UnknownRecord, node.id, node.parentId, node.order) ?? node;
  });
  return normalizeStyleLabBuilderDraft({ ...normalized, nodes: nextNodes });
}

export function isStyleLabBuilderBlank(draft: StyleLabBuilderDraft): boolean {
  const normalized = normalizeStyleLabBuilderDraft(draft);
  return JSON.stringify(normalized) === JSON.stringify(createDefaultStyleLabBuilderDraft());
}
