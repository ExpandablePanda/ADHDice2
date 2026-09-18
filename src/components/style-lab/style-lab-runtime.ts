import {
  getStyleLabProperty,
  getStyleLabRole,
  getStyleLabTargetPart,
  getStyleLabBackgroundColorCssValue,
  getStyleLabTextColorCssValue,
  isStyleLabIconName,
  isStyleLabPropertyAllowed,
  isStyleLabValueAllowed,
  normalizeStyleLabCustomColor,
  STYLE_LAB_PROPERTY_IDS,
  type StyleLabPropertyId,
  type StyleLabRoleId,
  type StyleLabIconName,
  type StyleLabTextColor,
} from "@/components/style-lab/style-lab-registry";

export const STYLE_LAB_STORAGE_KEY = "adhdice-style-lab:overrides";
export const STYLE_LAB_PANEL_POSITION_STORAGE_KEY = "adhdice-style-lab:panel-position";
export const STYLE_LAB_ENABLEMENT_STORAGE_KEY = "adhdice-style-lab:enabled";
export const STYLE_LAB_RUNTIME_STYLE_ELEMENT_ID = "adhdice-style-lab-runtime-overrides";
export const STYLE_LAB_WINDOW_ENABLEMENT_KEY = "__ADHDICE_STYLE_LAB_ENABLED__";
export const STYLE_LAB_INSTANCE_ATTRIBUTE = "data-style-lab-instance";
export const STYLE_LAB_ENABLEMENT_EVENT = "adhdice-style-lab:enablement-change";
export const STYLE_LAB_ICON_PREVIEW_EVENT = "adhdice-style-lab:icon-preview";

export type StyleLabOverrides = Partial<Record<StyleLabRoleId, Partial<Record<StyleLabPropertyId, string>>>>;

export type StyleLabScope = "role" | "instance";

export type StyleLabInstanceOverride = {
  iconPreviewEligible?: boolean;
  originalIconName?: string | null;
  originalText: string;
  overrides: Partial<Record<StyleLabPropertyId, string>>;
  previewIconName?: StyleLabIconName;
  previewText: string;
  previewTextEligible: boolean;
  roleId: StyleLabRoleId;
};

export type StyleLabInstanceOverrides = Record<string, StyleLabInstanceOverride>;

export type StyleLabStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type StyleLabPanelPosition = {
  left: number;
  top: number;
};

export type StyleLabWindow = {
  [STYLE_LAB_WINDOW_ENABLEMENT_KEY]?: boolean;
  localStorage?: StyleLabStorage;
};

export function canUseStyleLab(nodeEnv: string | undefined, explicitBrowserEnablement: boolean): boolean {
  return nodeEnv === "development" && explicitBrowserEnablement;
}

export function writeStyleLabEnablement(storage: StyleLabStorage | null | undefined, enabled: boolean): boolean {
  try {
    if (enabled) storage?.setItem(STYLE_LAB_ENABLEMENT_STORAGE_KEY, "true");
    else storage?.removeItem(STYLE_LAB_ENABLEMENT_STORAGE_KEY);
  } catch {
    // Style Lab enablement is best effort and must never affect application state.
  }
  return enabled;
}

export function requestStyleLabEnablement(): boolean {
  if (typeof window === "undefined") return false;
  const enabled = writeStyleLabEnablement(window.localStorage, true);
  window.dispatchEvent(new CustomEvent(STYLE_LAB_ENABLEMENT_EVENT, { detail: { enabled } }));
  return enabled;
}

export function isStyleLabExplicitlyEnabled(windowLike: StyleLabWindow): boolean {
  if (windowLike[STYLE_LAB_WINDOW_ENABLEMENT_KEY] === true) return true;
  try {
    return windowLike.localStorage?.getItem(STYLE_LAB_ENABLEMENT_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeStyleLabOverrides(input: unknown): StyleLabOverrides {
  if (!isRecord(input)) return {};
  const normalized: StyleLabOverrides = {};

  for (const [roleId, roleInput] of Object.entries(input)) {
    const role = getStyleLabRole(roleId);
    if (!role || !isRecord(roleInput)) continue;
    const roleOverrides: Partial<Record<StyleLabPropertyId, string>> = {};

    for (const propertyId of STYLE_LAB_PROPERTY_IDS) {
      const value = roleInput[propertyId];
      const normalizedValue = propertyId === "backgroundColor" ? normalizeStyleLabCustomColor(value) ?? value : value;
      if (typeof normalizedValue === "string" && isStyleLabPropertyAllowed(roleId, propertyId) && isStyleLabValueAllowed(propertyId, normalizedValue)) {
        roleOverrides[propertyId] = normalizedValue;
      }
    }

    if (Object.keys(roleOverrides).length > 0) normalized[role.id] = roleOverrides;
  }

  return normalized;
}

export function readStyleLabOverrides(storage: StyleLabStorage | null | undefined): StyleLabOverrides {
  if (!storage) return {};
  try {
    const raw = storage.getItem(STYLE_LAB_STORAGE_KEY);
    return raw ? normalizeStyleLabOverrides(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function writeStyleLabOverrides(storage: StyleLabStorage | null | undefined, overrides: unknown): StyleLabOverrides {
  const normalized = normalizeStyleLabOverrides(overrides);
  if (!storage) return normalized;
  try {
    if (Object.keys(normalized).length === 0) storage.removeItem(STYLE_LAB_STORAGE_KEY);
    else storage.setItem(STYLE_LAB_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Style Lab drafts are best effort and must never affect application state.
  }
  return normalized;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStyleLabPanelPosition(value: unknown): value is StyleLabPanelPosition {
  return isRecord(value) && isFiniteNumber(value.left) && isFiniteNumber(value.top);
}

export function normalizeStyleLabPanelPosition(
  input: unknown,
  viewportWidth: number,
  viewportHeight: number,
  panelWidth: number,
  panelHeight: number,
  margin = 16,
): StyleLabPanelPosition {
  const safeViewportWidth = Math.max(0, Number.isFinite(viewportWidth) ? viewportWidth : 0);
  const safeViewportHeight = Math.max(0, Number.isFinite(viewportHeight) ? viewportHeight : 0);
  const safePanelWidth = Math.max(0, Number.isFinite(panelWidth) ? panelWidth : 0);
  const safePanelHeight = Math.max(0, Number.isFinite(panelHeight) ? panelHeight : 0);
  const safeMargin = Math.max(0, Number.isFinite(margin) ? margin : 0);
  const maxLeft = Math.max(safeMargin, safeViewportWidth - safePanelWidth - safeMargin);
  const maxTop = Math.max(safeMargin, safeViewportHeight - safePanelHeight - safeMargin);
  const fallback: StyleLabPanelPosition = { left: maxLeft, top: safeMargin };
  const candidate = isStyleLabPanelPosition(input) ? input : fallback;

  return {
    left: Math.min(maxLeft, Math.max(safeMargin, candidate.left)),
    top: Math.min(maxTop, Math.max(safeMargin, candidate.top)),
  };
}

export function getStyleLabAvailablePanelHeight(viewportHeight: number, panelTop: number, margin = 16): number {
  const safeViewportHeight = Math.max(0, Number.isFinite(viewportHeight) ? viewportHeight : 0);
  const safePanelTop = Math.max(0, Number.isFinite(panelTop) ? panelTop : margin);
  const safeMargin = Math.max(0, Number.isFinite(margin) ? margin : 0);
  return Math.max(0, safeViewportHeight - safePanelTop - safeMargin);
}

export function readStyleLabPanelPosition(storage: StyleLabStorage | null | undefined): StyleLabPanelPosition | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STYLE_LAB_PANEL_POSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStyleLabPanelPosition(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStyleLabPanelPosition(
  storage: StyleLabStorage | null | undefined,
  position: unknown,
): StyleLabPanelPosition | null {
  if (!isStyleLabPanelPosition(position)) return null;
  const normalized = { left: position.left, top: position.top };
  try {
    storage?.setItem(STYLE_LAB_PANEL_POSITION_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Style Lab panel placement is best effort and must never affect application state.
  }
  return normalized;
}

export function setStyleLabOverride(
  overrides: StyleLabOverrides,
  roleId: string,
  propertyId: string,
  value: string,
): StyleLabOverrides {
  const normalizedValue = propertyId === "backgroundColor" ? normalizeStyleLabCustomColor(value) ?? value : value;
  if (!getStyleLabRole(roleId) || !isStyleLabPropertyAllowed(roleId, propertyId) || !isStyleLabValueAllowed(propertyId, normalizedValue)) {
    return overrides;
  }
  return {
    ...overrides,
    [roleId]: {
      ...overrides[roleId as StyleLabRoleId],
      [propertyId]: normalizedValue,
    },
  };
}

export function resetStyleLabRole(overrides: StyleLabOverrides, roleId: string): StyleLabOverrides {
  if (!getStyleLabRole(roleId)) return overrides;
  const next = { ...overrides };
  delete next[roleId as StyleLabRoleId];
  return next;
}

export function setStyleLabInstanceOverride(
  instances: StyleLabInstanceOverrides,
  instanceId: string,
  roleId: string,
  propertyId: string,
  value: string,
): StyleLabInstanceOverrides {
  const instance = instances[instanceId];
  const normalizedValue = propertyId === "backgroundColor" ? normalizeStyleLabCustomColor(value) ?? value : value;
  if (!instance || instance.roleId !== roleId || !isStyleLabPropertyAllowed(roleId, propertyId) || !isStyleLabValueAllowed(propertyId, normalizedValue)) {
    return instances;
  }
  return {
    ...instances,
    [instanceId]: {
      ...instance,
      overrides: {
        ...instance.overrides,
        [propertyId]: normalizedValue,
      },
    },
  };
}

export function clearStyleLabInstanceOverride(
  instances: StyleLabInstanceOverrides,
  instanceId: string,
  propertyId: string,
): StyleLabInstanceOverrides {
  const instance = instances[instanceId];
  if (!instance || !(propertyId in instance.overrides)) return instances;
  const nextOverrides = { ...instance.overrides };
  delete nextOverrides[propertyId as StyleLabPropertyId];
  return {
    ...instances,
    [instanceId]: {
      ...instance,
      overrides: nextOverrides,
    },
  };
}

export function setStyleLabPreviewText(
  instances: StyleLabInstanceOverrides,
  instanceId: string,
  previewText: string,
): StyleLabInstanceOverrides {
  const instance = instances[instanceId];
  if (!instance) return instances;
  return {
    ...instances,
    [instanceId]: {
      ...instance,
      previewText,
    },
  };
}

export function setStyleLabPreviewIcon(
  instances: StyleLabInstanceOverrides,
  instanceId: string,
  iconName: string,
): StyleLabInstanceOverrides {
  const instance = instances[instanceId];
  if (!instance || !instance.iconPreviewEligible || !isStyleLabIconName(iconName)) return instances;
  return {
    ...instances,
    [instanceId]: {
      ...instance,
      previewIconName: iconName,
    },
  };
}

export function clearStyleLabPreviewIcon(
  instances: StyleLabInstanceOverrides,
  instanceId: string,
): StyleLabInstanceOverrides {
  const instance = instances[instanceId];
  if (!instance || instance.previewIconName === undefined) return instances;
  const next = { ...instance };
  delete next.previewIconName;
  return {
    ...instances,
    [instanceId]: next,
  };
}

export function resetStyleLabInstance(instances: StyleLabInstanceOverrides, instanceId: string): StyleLabInstanceOverrides {
  if (!(instanceId in instances)) return instances;
  const next = { ...instances };
  delete next[instanceId];
  return next;
}

export function resetStyleLabInstances(): StyleLabInstanceOverrides {
  return {};
}

export function getStyleLabCssValue(propertyId: StyleLabPropertyId, value: string): string {
  if (propertyId === "textColor") return getStyleLabTextColorCssValue(value as StyleLabTextColor);
  if (propertyId === "backgroundColor") return getStyleLabBackgroundColorCssValue(value);
  return value;
}

function selectorForRole(roleId: StyleLabRoleId, propertyId: StyleLabPropertyId, instanceId?: string): string {
  const property = getStyleLabProperty(propertyId);
  const targetPart = property ? getStyleLabTargetPart(roleId, property.group) : "self";
  const instanceSelector = instanceId ? `[${STYLE_LAB_INSTANCE_ATTRIBUTE}="${instanceId}"]` : "";
  const hostSelector = `[data-style-role="${roleId}"]${instanceSelector}:not([data-style-lab-ui] [data-style-role])`;
  return targetPart === "self" ? hostSelector : `${hostSelector} [data-style-part="${targetPart}"]`;
}

export function getStyleLabPropertyTargetSelector(roleId: string, propertyId: string, instanceId?: string): string | null {
  const role = getStyleLabRole(roleId);
  const property = getStyleLabProperty(propertyId);
  if (!role || !property || !isStyleLabPropertyAllowed(role.id, property.id)) return null;
  return selectorForRole(role.id, property.id, instanceId);
}

function buildStyleLabOverrideCss(roleId: string, roleOverrides: Partial<Record<StyleLabPropertyId, string>>, instanceId?: string): string {
  const declarationsBySelector = new Map<string, string[]>();
  Object.entries(roleOverrides).forEach(([propertyId, value]) => {
    const property = getStyleLabProperty(propertyId);
    if (!property || typeof value !== "string" || !isStyleLabPropertyAllowed(roleId, property.id) || !isStyleLabValueAllowed(property.id, value)) return;
    const cssValue = getStyleLabCssValue(property.id, value);
    const selector = selectorForRole(roleId as StyleLabRoleId, property.id, instanceId);
    const declarations = declarationsBySelector.get(selector) ?? [];
    declarations.push(...property.cssProperties.map((cssProperty) => `  ${cssProperty}: ${cssValue} !important;`));
    declarationsBySelector.set(selector, declarations);
  });
  return Array.from(declarationsBySelector, ([selector, declarations]) => `${selector} {\n${declarations.join("\n")}\n}`).join("\n");
}

export function buildStyleLabCss(overrides: StyleLabOverrides, instanceOverrides: StyleLabInstanceOverrides = {}): string {
  const roleCss = Object.entries(normalizeStyleLabOverrides(overrides))
    .map(([roleId, roleOverrides]) => buildStyleLabOverrideCss(roleId, roleOverrides ?? {}))
    .filter(Boolean)
    .join("\n");
  const instanceCss = Object.entries(instanceOverrides)
    .map(([instanceId, instance]) => buildStyleLabOverrideCss(instance.roleId, instance.overrides, instanceId))
    .filter(Boolean)
    .join("\n");
  return [
    `[data-style-lab-hovered="true"] { outline: 2px solid color-mix(in srgb, var(--accent) 56%, transparent) !important; outline-offset: 2px !important; }`,
    `[data-style-lab-selected="true"] { outline: 2px solid color-mix(in srgb, var(--accent-strong) 78%, transparent) !important; outline-offset: 3px !important; }`,
    roleCss,
    instanceCss,
  ].filter(Boolean).join("\n");
}

export function getStyleLabMatchCount(documentLike: Pick<Document, "querySelectorAll">, roleId: string): number {
  return Array.from(documentLike.querySelectorAll(`[data-style-role="${roleId}"]`)).filter((element) => !element.closest("[data-style-lab-ui]"))
    .length;
}

export function getStyleLabIconTarget(element: HTMLElement | null): HTMLElement | null {
  if (!element) return null;
  if (typeof element.querySelectorAll !== "function") {
    return element.querySelector<HTMLElement>('[data-style-part="icon"]') ?? null;
  }
  const iconTargets = element.querySelectorAll<HTMLElement>('[data-style-part="icon"]');
  return iconTargets.length === 1 ? iconTargets[0] ?? null : null;
}

export function setStyleLabIconPreviewOnElement(element: HTMLElement | null, iconName: string): boolean {
  const target = getStyleLabIconTarget(element);
  if (!target || !isStyleLabIconName(iconName)) return false;
  target.dispatchEvent(new CustomEvent(STYLE_LAB_ICON_PREVIEW_EVENT, { detail: { iconName } }));
  return true;
}

export function restoreStyleLabIcon(element: HTMLElement | null): boolean {
  const target = getStyleLabIconTarget(element);
  if (!target) return false;
  target.dispatchEvent(new CustomEvent(STYLE_LAB_ICON_PREVIEW_EVENT, { detail: { iconName: null } }));
  return true;
}

export type StyleLabDesignSpecOptions = {
  instance?: StyleLabInstanceOverride | null;
  scope?: StyleLabScope;
};

export function getStyleLabDesignSpec(
  roleId: string,
  overrides: StyleLabOverrides,
  options: StyleLabDesignSpecOptions = {},
): string {
  const role = getStyleLabRole(roleId);
  if (!role) return "";
  const scope = options.scope ?? "role";
  const roleOverrides = scope === "instance" ? options.instance?.overrides ?? {} : overrides[role.id] ?? {};
  const desired = role.capabilities.flatMap((propertyId) => {
    const value = roleOverrides[propertyId];
    const property = getStyleLabProperty(propertyId);
    if (!value || !property) return [];
    const customColor = property.id === "backgroundColor" ? normalizeStyleLabCustomColor(value) : null;
    return customColor
      ? [`- ${property.label}: Custom`, `- Custom background color: ${customColor}`]
      : [`- ${property.label}: ${value}`];
  });

  return [
    "ADHDice Style Lab Design Spec",
    "",
    `Role: ${role.id}`,
    `Component: ${role.component}`,
    scope === "instance" ? "Scope: this instance" : "Scope: semantic role",
    ...(scope === "instance" ? [
      `Original text: ${options.instance?.originalText || "(not safely replaceable)"}`,
      ...(options.instance?.previewText && options.instance.previewText !== options.instance.originalText
        ? [`Preview text: ${options.instance.previewText}`]
        : []),
      ...(options.instance?.previewIconName ? [
        `Original icon: ${options.instance.originalIconName || "unknown"}`,
        `Preview icon: ${options.instance.previewIconName}`,
      ] : []),
    ] : []),
    "",
    "Desired:",
    ...(desired.length > 0 ? desired : ["- No properties overridden"]),
    "",
    "No source files were modified.",
  ].join("\n");
}

export function applyStyleLabRuntimeStyles(
  documentLike: Document,
  overrides: StyleLabOverrides,
  instanceOverrides: StyleLabInstanceOverrides = {},
): HTMLStyleElement {
  let styleElement = documentLike.getElementById(STYLE_LAB_RUNTIME_STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!styleElement) {
    styleElement = documentLike.createElement("style");
    styleElement.id = STYLE_LAB_RUNTIME_STYLE_ELEMENT_ID;
    styleElement.dataset.styleLabRuntime = "true";
    documentLike.head.appendChild(styleElement);
  }
  styleElement.textContent = buildStyleLabCss(overrides, instanceOverrides);
  return styleElement;
}

const PREVIEW_TEXT_BLOCKED_TAGS = new Set(["input", "textarea", "select", "option"]);
const STYLE_LAB_TEXT_PART_SELECTOR = '[data-style-text-part="label"]';

function isStyleLabPreviewTextBlocked(element: HTMLElement): boolean {
  return PREVIEW_TEXT_BLOCKED_TAGS.has(element.tagName.toLowerCase())
    || element.isContentEditable
    || Boolean(element.closest("[contenteditable]"));
}

export function getStyleLabPreviewTextTarget(element: HTMLElement | null): HTMLElement | null {
  if (!element || isStyleLabPreviewTextBlocked(element)) return null;
  const explicitTextParts = typeof element.querySelectorAll === "function"
    ? Array.from(element.querySelectorAll<HTMLElement>(STYLE_LAB_TEXT_PART_SELECTOR))
    : [];
  if (explicitTextParts.length > 1) return null;
  const labelPart = element.querySelector<HTMLElement>(":scope > [data-style-part=\"label\"]");
  const candidate = explicitTextParts[0] ?? labelPart ?? element;
  if (isStyleLabPreviewTextBlocked(candidate) || candidate.children.length > 0) return null;
  return candidate;
}

export function isStyleLabPreviewTextEligible(element: HTMLElement | null): boolean {
  return getStyleLabPreviewTextTarget(element) !== null;
}

export function setStyleLabPreviewTextOnElement(element: HTMLElement | null, text: string): boolean {
  const target = getStyleLabPreviewTextTarget(element);
  if (!target) return false;
  target.textContent = text;
  return true;
}

export function restoreStyleLabPreviewText(element: HTMLElement | null, originalText: string): boolean {
  return setStyleLabPreviewTextOnElement(element, originalText);
}
