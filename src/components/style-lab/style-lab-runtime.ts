import {
  getStyleLabProperty,
  getStyleLabRole,
  getStyleLabTextColorCssValue,
  isStyleLabPropertyAllowed,
  isStyleLabValueAllowed,
  STYLE_LAB_PROPERTY_IDS,
  type StyleLabPropertyId,
  type StyleLabRoleId,
  type StyleLabTextColor,
} from "@/components/style-lab/style-lab-registry";

export const STYLE_LAB_STORAGE_KEY = "adhdice-style-lab:overrides";
export const STYLE_LAB_ENABLEMENT_STORAGE_KEY = "adhdice-style-lab:enabled";
export const STYLE_LAB_RUNTIME_STYLE_ELEMENT_ID = "adhdice-style-lab-runtime-overrides";
export const STYLE_LAB_WINDOW_ENABLEMENT_KEY = "__ADHDICE_STYLE_LAB_ENABLED__";

export type StyleLabOverrides = Partial<Record<StyleLabRoleId, Partial<Record<StyleLabPropertyId, string>>>>;

export type StyleLabStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type StyleLabWindow = {
  [STYLE_LAB_WINDOW_ENABLEMENT_KEY]?: boolean;
  localStorage?: StyleLabStorage;
};

export function canUseStyleLab(nodeEnv: string | undefined, explicitBrowserEnablement: boolean): boolean {
  return nodeEnv === "development" && explicitBrowserEnablement;
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
      if (typeof value === "string" && isStyleLabPropertyAllowed(roleId, propertyId) && isStyleLabValueAllowed(propertyId, value)) {
        roleOverrides[propertyId] = value;
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

export function setStyleLabOverride(
  overrides: StyleLabOverrides,
  roleId: string,
  propertyId: string,
  value: string,
): StyleLabOverrides {
  if (!getStyleLabRole(roleId) || !isStyleLabPropertyAllowed(roleId, propertyId) || !isStyleLabValueAllowed(propertyId, value)) {
    return overrides;
  }
  return {
    ...overrides,
    [roleId]: {
      ...overrides[roleId as StyleLabRoleId],
      [propertyId]: value,
    },
  };
}

export function resetStyleLabRole(overrides: StyleLabOverrides, roleId: string): StyleLabOverrides {
  if (!getStyleLabRole(roleId)) return overrides;
  const next = { ...overrides };
  delete next[roleId as StyleLabRoleId];
  return next;
}

export function getStyleLabCssValue(propertyId: StyleLabPropertyId, value: string): string {
  return propertyId === "textColor" ? getStyleLabTextColorCssValue(value as StyleLabTextColor) : value;
}

function selectorForRole(roleId: StyleLabRoleId): string {
  return `[data-style-role="${roleId}"]:not([data-style-lab-ui] [data-style-role])`;
}

export function buildStyleLabCss(overrides: StyleLabOverrides): string {
  const overrideCss = Object.entries(normalizeStyleLabOverrides(overrides)).flatMap(([roleId, roleOverrides]) => {
    const declarations = Object.entries(roleOverrides ?? {}).flatMap(([propertyId, value]) => {
      const property = getStyleLabProperty(propertyId);
      if (!property || typeof value !== "string") return [];
      const cssValue = getStyleLabCssValue(property.id, value);
      return property.cssProperties.map((cssProperty) => `  ${cssProperty}: ${cssValue} !important;`);
    });
    return declarations.length > 0 ? [`${selectorForRole(roleId as StyleLabRoleId)} {\n${declarations.join("\n")}\n}`] : [];
  }).join("\n");
  return [
    `[data-style-lab-hovered="true"] { outline: 2px solid color-mix(in srgb, var(--accent) 56%, transparent) !important; outline-offset: 2px !important; }`,
    `[data-style-lab-selected="true"] { outline: 2px solid color-mix(in srgb, var(--accent-strong) 78%, transparent) !important; outline-offset: 3px !important; }`,
    overrideCss,
  ].filter(Boolean).join("\n");
}

export function getStyleLabMatchCount(documentLike: Pick<Document, "querySelectorAll">, roleId: string): number {
  return Array.from(documentLike.querySelectorAll(`[data-style-role="${roleId}"]`)).filter((element) => !element.closest("[data-style-lab-ui]"))
    .length;
}

export function getStyleLabDesignSpec(roleId: string, overrides: StyleLabOverrides): string {
  const role = getStyleLabRole(roleId);
  if (!role) return "";
  const roleOverrides = overrides[role.id] ?? {};
  const desired = role.capabilities.flatMap((propertyId) => {
    const value = roleOverrides[propertyId];
    const property = getStyleLabProperty(propertyId);
    return value && property ? [`- ${property.label}: ${value}`] : [];
  });

  return [
    "ADHDice Style Lab Design Spec",
    "",
    `Role: ${role.id}`,
    `Component: ${role.component}`,
    "Scope: semantic role",
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
): HTMLStyleElement {
  let styleElement = documentLike.getElementById(STYLE_LAB_RUNTIME_STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!styleElement) {
    styleElement = documentLike.createElement("style");
    styleElement.id = STYLE_LAB_RUNTIME_STYLE_ELEMENT_ID;
    styleElement.dataset.styleLabRuntime = "true";
    documentLike.head.appendChild(styleElement);
  }
  styleElement.textContent = buildStyleLabCss(overrides);
  return styleElement;
}
