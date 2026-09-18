import { getStyleLabRole, isStyleLabIconName, type StyleLabRoleId } from "@/components/style-lab/style-lab-registry";
import {
  STYLE_LAB_HIDDEN_TARGET_KINDS,
  STYLE_LAB_MOCK_NODE_TYPES,
  type StyleLabHiddenTarget,
  type StyleLabMockDraft,
  type StyleLabMockHost,
  type StyleLabMockHostKind,
  type StyleLabMockNode,
  type StyleLabMockNodeType,
  type StyleLabStructuralTarget,
} from "@/components/style-lab/style-lab-mock-types";

export const STYLE_LAB_MOCK_STRUCTURE_STORAGE_KEY = "adhdice-style-lab:mock-structure";
export const STYLE_LAB_HIDDEN_ATTRIBUTE = "data-style-lab-hidden";
export const STYLE_LAB_SESSION_TARGET_ATTRIBUTE = "data-style-lab-session-target";
export const STYLE_LAB_MOCK_ID_ATTRIBUTE = "data-style-lab-mock-id";
export const STYLE_LAB_MOCK_HOST_ATTRIBUTE = "data-style-lab-mock-host-key";

export type StyleLabMockStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PAGE_SHELL_MOCK_TYPES = ["chip", "item", "section"] as const satisfies readonly StyleLabMockNodeType[];
const MOCK_SECTION_MOCK_TYPES = ["chip", "item", "section"] as const satisfies readonly StyleLabMockNodeType[];
const TASKS_RAIL_MOCK_TYPES = ["chip"] as const satisfies readonly StyleLabMockNodeType[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeOrder(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function isMockNodeType(value: unknown): value is StyleLabMockNodeType {
  return typeof value === "string" && (STYLE_LAB_MOCK_NODE_TYPES as readonly string[]).includes(value);
}

function isHiddenTargetKind(value: unknown): value is StyleLabHiddenTarget["kind"] {
  return typeof value === "string" && (STYLE_LAB_HIDDEN_TARGET_KINDS as readonly string[]).includes(value);
}

function isKnownMockHostKey(value: string) {
  return value.startsWith("page-shell:")
    || value.startsWith("tasks-rail:")
    || value.startsWith("mock-section:");
}

export function getStyleLabPageShellMockHostKey(shellId: string) {
  return `page-shell:${shellId}:body`;
}

export function getStyleLabTasksRailMockHostKey(containerKey: string | null | undefined) {
  return `tasks-rail:${nonEmptyString(containerKey, "root")}`;
}

export function getStyleLabMockSectionHostKey(mockId: string) {
  return `mock-section:${mockId}:body`;
}

export function getStyleLabMockHostKind(hostKey: string): StyleLabMockHostKind | null {
  if (hostKey.startsWith("page-shell:")) return "page-shell-body";
  if (hostKey.startsWith("tasks-rail:")) return "tasks-rail";
  if (hostKey.startsWith("mock-section:")) return "mock-section-body";
  return null;
}

export function getStyleLabMockAllowedTypes(kind: StyleLabMockHostKind): readonly StyleLabMockNodeType[] {
  if (kind === "tasks-rail") return TASKS_RAIL_MOCK_TYPES;
  if (kind === "page-shell-body") return PAGE_SHELL_MOCK_TYPES;
  return MOCK_SECTION_MOCK_TYPES;
}

function normalizeMockNode(value: unknown, fallbackOrder: number): StyleLabMockNode | null {
  if (!isRecord(value) || !isMockNodeType(value.type)) return null;
  const id = nonEmptyString(value.id).slice(0, 120);
  const parentHostKey = nonEmptyString(value.parentHostKey).slice(0, 240);
  if (!id || !parentHostKey || !isKnownMockHostKey(parentHostKey)) return null;
  const textFallback = value.type === "chip" ? "New Chip" : value.type === "item" ? "New item" : "New section";
  const node: StyleLabMockNode = {
    id,
    order: normalizeOrder(value.order, fallbackOrder),
    parentHostKey,
    text: nonEmptyString(value.text, textFallback).slice(0, 240),
    type: value.type,
  };
  const subtitle = nonEmptyString(value.subtitle).slice(0, 240);
  if (subtitle) node.subtitle = subtitle;
  if (isStyleLabIconName(value.icon)) node.icon = value.icon;
  else if (value.type === "chip") node.icon = "plus";
  return node;
}

function normalizeHiddenTarget(value: unknown): StyleLabHiddenTarget | null {
  if (!isRecord(value) || !isHiddenTargetKind(value.kind)) return null;
  const key = nonEmptyString(value.key).slice(0, 240);
  const roleId = nonEmptyString(value.roleId);
  if (!key || !getStyleLabRole(roleId)) return null;
  return {
    context: nonEmptyString(value.context, "Style Lab preview").slice(0, 240),
    key,
    kind: value.kind,
    label: nonEmptyString(value.label, "Existing element").slice(0, 240),
    roleId: roleId as StyleLabRoleId,
    stable: value.stable === true,
  };
}

function normalizeSiblingOrder(nodes: StyleLabMockNode[]) {
  const grouped = new Map<string, StyleLabMockNode[]>();
  nodes.forEach((node) => grouped.set(node.parentHostKey, [...(grouped.get(node.parentHostKey) ?? []), node]));
  return Array.from(grouped.values()).flatMap((siblings) => (
    [...siblings]
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      .map((node, order) => ({ ...node, order }))
  ));
}

export function normalizeStyleLabMockDraft(input: unknown, options: { persistableOnly?: boolean } = {}): StyleLabMockDraft {
  if (!isRecord(input)) return { hiddenTargets: [], nodes: [] };
  const seenIds = new Set<string>();
  const nodes = Array.isArray(input.nodes)
    ? input.nodes.flatMap((value, index) => {
      const node = normalizeMockNode(value, index);
      if (!node || seenIds.has(node.id)) return [];
      seenIds.add(node.id);
      return [node];
    })
    : [];
  const seenHiddenKeys = new Set<string>();
  const hiddenTargets = Array.isArray(input.hiddenTargets)
    ? input.hiddenTargets.flatMap((value) => {
      const target = normalizeHiddenTarget(value);
      if (!target || seenHiddenKeys.has(target.key) || (options.persistableOnly && !target.stable)) return [];
      seenHiddenKeys.add(target.key);
      return [target];
    })
    : [];
  return { hiddenTargets, nodes: normalizeSiblingOrder(nodes) };
}

export function readStyleLabMockDraft(storage: StyleLabMockStorage | null | undefined): StyleLabMockDraft {
  if (!storage) return { hiddenTargets: [], nodes: [] };
  try {
    const raw = storage.getItem(STYLE_LAB_MOCK_STRUCTURE_STORAGE_KEY);
    return raw ? normalizeStyleLabMockDraft(JSON.parse(raw), { persistableOnly: true }) : { hiddenTargets: [], nodes: [] };
  } catch {
    return { hiddenTargets: [], nodes: [] };
  }
}

export function writeStyleLabMockDraft(storage: StyleLabMockStorage | null | undefined, draft: unknown): StyleLabMockDraft {
  const normalized = normalizeStyleLabMockDraft(draft, { persistableOnly: true });
  if (!storage) return normalized;
  try {
    if (normalized.nodes.length === 0 && normalized.hiddenTargets.length === 0) storage.removeItem(STYLE_LAB_MOCK_STRUCTURE_STORAGE_KEY);
    else storage.setItem(STYLE_LAB_MOCK_STRUCTURE_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Mock drafts are best effort and must never affect application state.
  }
  return normalized;
}

export function createStyleLabMockNode(id: string, type: StyleLabMockNodeType, parentHostKey: string, order: number): StyleLabMockNode {
  const node: StyleLabMockNode = {
    id,
    order: Math.max(0, Math.floor(order)),
    parentHostKey,
    text: type === "chip" ? "New Chip" : type === "item" ? "New item" : "New section",
    type,
  };
  if (type === "chip") node.icon = "plus";
  else {
    node.subtitle = "Supporting text";
  }
  return node;
}

export function addStyleLabMockNode(draft: StyleLabMockDraft, node: StyleLabMockNode): StyleLabMockDraft {
  const hostKind = getStyleLabMockHostKind(node.parentHostKey);
  if (!hostKind || !getStyleLabMockAllowedTypes(hostKind).includes(node.type) || draft.nodes.some((current) => current.id === node.id)) return draft;
  return normalizeStyleLabMockDraft({ ...draft, nodes: [...draft.nodes, node] });
}

export function reorderStyleLabMockNode(draft: StyleLabMockDraft, mockId: string, direction: "earlier" | "later"): StyleLabMockDraft {
  const node = draft.nodes.find((current) => current.id === mockId);
  if (!node) return draft;
  const siblings = draft.nodes.filter((current) => current.parentHostKey === node.parentHostKey).sort((left, right) => left.order - right.order);
  const index = siblings.findIndex((current) => current.id === mockId);
  const nextIndex = direction === "earlier" ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= siblings.length) return draft;
  [siblings[index], siblings[nextIndex]] = [siblings[nextIndex], siblings[index]];
  const orderById = new Map(siblings.map((current, siblingIndex) => [current.id, siblingIndex]));
  return normalizeStyleLabMockDraft({
    ...draft,
    nodes: draft.nodes.map((current) => orderById.has(current.id) ? { ...current, order: orderById.get(current.id) } : current),
  });
}

export function removeStyleLabMockNode(draft: StyleLabMockDraft, mockId: string): StyleLabMockDraft {
  const removedIds = new Set([mockId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of draft.nodes) {
      if ([...removedIds].some((id) => node.parentHostKey === getStyleLabMockSectionHostKey(id))) {
        if (!removedIds.has(node.id)) {
          removedIds.add(node.id);
          changed = true;
        }
      }
    }
  }
  const nodes = draft.nodes.filter((node) => !removedIds.has(node.id));
  const hiddenTargets = draft.hiddenTargets.filter((target) => !(target.kind === "mock" && removedIds.has(target.key.slice("mock:".length))));
  return normalizeStyleLabMockDraft({ nodes, hiddenTargets });
}

export function setStyleLabHiddenTarget(draft: StyleLabMockDraft, target: StyleLabHiddenTarget): StyleLabMockDraft {
  return normalizeStyleLabMockDraft({
    ...draft,
    hiddenTargets: [...draft.hiddenTargets.filter((current) => current.key !== target.key), target],
  });
}

export function restoreStyleLabHiddenTarget(draft: StyleLabMockDraft, key: string): StyleLabMockDraft {
  return normalizeStyleLabMockDraft({ ...draft, hiddenTargets: draft.hiddenTargets.filter((target) => target.key !== key) });
}

export function restoreAllStyleLabHiddenTargets(draft: StyleLabMockDraft): StyleLabMockDraft {
  return normalizeStyleLabMockDraft({ ...draft, hiddenTargets: [] });
}

function readTextLabel(element: HTMLElement, fallback: string) {
  const text = element.textContent?.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 240) : fallback;
}

function getRoleId(element: HTMLElement): StyleLabRoleId | null {
  const roleId = element.dataset.styleRole;
  return getStyleLabRole(roleId)?.id ?? null;
}

export function resolveStyleLabStructuralTarget(element: HTMLElement | null): StyleLabStructuralTarget | null {
  if (!element) return null;
  const roleId = getRoleId(element);
  if (!roleId) return null;

  const mockRoot = element.closest<HTMLElement>(`[${STYLE_LAB_MOCK_ID_ATTRIBUTE}]`);
  const mockId = mockRoot?.dataset.styleLabMockId;
  if (mockId && roleId.startsWith("mock.")) {
    return {
      context: "Style Lab mock structure",
      element: mockRoot,
      key: `mock:${mockId}`,
      kind: "mock",
      label: readTextLabel(mockRoot, "Mock element"),
      mockId,
      roleId,
      stable: true,
    };
  }

  if ((roleId === "page.shell.surface" || roleId === "page.shell.body") && element.closest("[data-page-shell-id]")) {
    const shell = element.closest<HTMLElement>("[data-page-shell-id]")!;
    const shellId = shell.dataset.pageShellId;
    if (!shellId) return null;
    return {
      context: "Page Shell",
      element: shell,
      key: `page-shell:${shellId}`,
      kind: "page-shell",
      label: shell.dataset.pageShellLabel ?? shellId,
      roleId,
      stable: true,
    };
  }

  if (roleId === "tasks.rail.chip") {
    const structureKey = element.dataset.styleLabStructureKey;
    if (!structureKey) return null;
    return {
      context: "Tasks page list rail",
      element,
      key: `tasks-rail-chip:${structureKey}`,
      kind: "tasks-rail-chip",
      label: readTextLabel(element, "Tasks rail chip"),
      roleId,
      stable: true,
    };
  }

  if (roleId === "ui.card.surface" || roleId === "ui.panel.surface") {
    const sessionKey = element.dataset.styleLabSessionTarget;
    if (!sessionKey) return null;
    return {
      context: roleId === "ui.card.surface" ? "Shared Card surface" : "Shared Panel surface",
      element,
      key: `session:${sessionKey}`,
      kind: roleId === "ui.card.surface" ? "card" : "panel",
      label: readTextLabel(element, roleId === "ui.card.surface" ? "Card" : "Panel"),
      roleId,
      stable: false,
    };
  }
  return null;
}

function findHostElementForPageShell(element: HTMLElement) {
  const shell = element.closest<HTMLElement>("[data-page-shell-id]");
  return shell?.querySelector<HTMLElement>('[data-style-role="page.shell.body"]') ?? null;
}

export function resolveStyleLabMockHostForElement(element: HTMLElement | null): StyleLabMockHost | null {
  if (!element) return null;
  const roleId = getRoleId(element);
  if (!roleId) return null;

  if (roleId === "page.shell.surface" || roleId === "page.shell.body") {
    const shell = element.closest<HTMLElement>("[data-page-shell-id]");
    const body = findHostElementForPageShell(element);
    const shellId = shell?.dataset.pageShellId;
    if (!body || !shellId) return null;
    const label = shell?.dataset.pageShellLabel ?? shellId;
    return { allowedTypes: PAGE_SHELL_MOCK_TYPES, context: "Page Shell body", element: body, key: getStyleLabPageShellMockHostKey(shellId), kind: "page-shell-body", label: `Page Shell · ${label}` };
  }

  const rail = roleId === "tasks.rail.surface"
    ? element
    : element.closest<HTMLElement>('[data-style-role="tasks.rail.surface"][data-list-reorder-rail="true"]');
  if (rail) {
    const containerKey = rail.dataset.railContainerKey ?? rail.dataset.railContainerId ?? "root";
    return { allowedTypes: TASKS_RAIL_MOCK_TYPES, context: "Tasks list rail", element: rail, key: getStyleLabTasksRailMockHostKey(containerKey), kind: "tasks-rail", label: "Tasks page · Lists rail" };
  }

  const section = element.closest<HTMLElement>(`[${STYLE_LAB_MOCK_ID_ATTRIBUTE}]`);
  const sectionId = section?.dataset.styleLabMockId;
  const sectionBody = section?.querySelector<HTMLElement>(`[${STYLE_LAB_MOCK_HOST_ATTRIBUTE}]`);
  if (sectionId && sectionBody?.dataset.styleLabMockHostKey === getStyleLabMockSectionHostKey(sectionId)) {
    return { allowedTypes: MOCK_SECTION_MOCK_TYPES, context: "Mock Section body", element: sectionBody, key: getStyleLabMockSectionHostKey(sectionId), kind: "mock-section-body", label: "Mock Section · " + readTextLabel(section, "New section") };
  }
  return null;
}

export function collectStyleLabMockHosts(documentLike: Pick<Document, "querySelectorAll">): StyleLabMockHost[] {
  const hosts = new Map<string, StyleLabMockHost>();
  for (const element of Array.from(documentLike.querySelectorAll<HTMLElement>('[data-style-role="page.shell.body"]'))) {
    const host = resolveStyleLabMockHostForElement(element);
    if (host) hosts.set(host.key, host);
  }
  for (const element of Array.from(documentLike.querySelectorAll<HTMLElement>('[data-style-role="tasks.rail.surface"][data-list-reorder-rail="true"]'))) {
    const host = resolveStyleLabMockHostForElement(element);
    if (host) hosts.set(host.key, host);
  }
  for (const element of Array.from(documentLike.querySelectorAll<HTMLElement>(`[${STYLE_LAB_MOCK_HOST_ATTRIBUTE}]`))) {
    const key = element.dataset.styleLabMockHostKey;
    const kind = key ? getStyleLabMockHostKind(key) : null;
    if (key && kind === "mock-section-body") {
      hosts.set(key, { allowedTypes: MOCK_SECTION_MOCK_TYPES, context: "Mock Section body", element, key, kind, label: element.dataset.styleLabMockHostLabel ?? "Mock Section body" });
    }
  }
  return [...hosts.values()];
}

export function resolveStyleLabHiddenTargetElement(documentLike: Pick<Document, "querySelectorAll">, target: StyleLabHiddenTarget): HTMLElement | null {
  for (const element of Array.from(documentLike.querySelectorAll<HTMLElement>(`[${STYLE_LAB_HIDDEN_ATTRIBUTE}], [data-page-shell-id], [data-style-lab-structure-key], [${STYLE_LAB_MOCK_ID_ATTRIBUTE}], [${STYLE_LAB_SESSION_TARGET_ATTRIBUTE}]`))) {
    if (target.kind === "page-shell" && element.dataset.pageShellId === target.key.slice("page-shell:".length)) return element;
    if (target.kind === "tasks-rail-chip" && element.dataset.styleLabStructureKey === target.key.slice("tasks-rail-chip:".length)) return element;
    if (target.kind === "mock" && element.dataset.styleLabMockId === target.key.slice("mock:".length)) return element;
    if (!target.stable && element.dataset.styleLabSessionTarget === target.key.slice("session:".length)) return element;
  }
  return null;
}

export function getStyleLabMockNodeById(draft: StyleLabMockDraft, mockId: string | null | undefined) {
  return mockId ? draft.nodes.find((node) => node.id === mockId) ?? null : null;
}

export function getStyleLabMockSiblingPosition(draft: StyleLabMockDraft, mockId: string) {
  const node = draft.nodes.find((current) => current.id === mockId);
  if (!node) return null;
  const siblings = draft.nodes.filter((current) => current.parentHostKey === node.parentHostKey).sort((left, right) => left.order - right.order);
  const index = siblings.findIndex((current) => current.id === mockId);
  return index < 0 ? null : { position: index + 1, siblingCount: siblings.length };
}
