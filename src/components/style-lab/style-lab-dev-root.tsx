"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StyleLabPanel, type StyleLabMode } from "./style-lab-panel";
import {
  getStyleLabDesignSpec,
  getStyleLabMatchCount,
  isStyleLabExplicitlyEnabled,
  applyStyleLabRuntimeStyles,
  applyStyleLabHiddenTargets,
  clearStyleLabHiddenTargets,
  canUseStyleLab,
  clearStyleLabInstanceOverride,
  clearStyleLabPreviewIcon,
  getStyleLabPreviewTextTarget,
  getStyleLabIconTarget,
  readStyleLabPanelPosition,
  readStyleLabOverrides,
  resetStyleLabInstance,
  resetStyleLabInstances,
  resetStyleLabRole,
  setStyleLabOverride,
  setStyleLabInstanceOverride,
  setStyleLabPreviewIcon,
  setStyleLabPreviewText,
  setStyleLabIconPreviewOnElement,
  setStyleLabPreviewTextOnElement,
  STYLE_LAB_INSTANCE_ATTRIBUTE,
  STYLE_LAB_ENABLEMENT_EVENT,
  STYLE_LAB_RUNTIME_STYLE_ELEMENT_ID,
  restoreStyleLabPreviewText,
  restoreStyleLabIcon,
  writeStyleLabPanelPosition,
  writeStyleLabEnablement,
  writeStyleLabOverrides,
  type StyleLabInstanceOverrides,
  type StyleLabInstanceOverride,
  type StyleLabOverrides,
  type StyleLabPanelPosition,
  type StyleLabScope,
  type StyleLabWindow,
} from "./style-lab-runtime";
import { getStyleLabRole, type StyleLabPropertyId, type StyleLabRoleId } from "./style-lab-registry";
import {
  addStyleLabMockNode,
  collectStyleLabMockHosts,
  createStyleLabMockNode,
  getStyleLabMockNodeById,
  getStyleLabMockSectionHostKey,
  getStyleLabMockSiblingPosition,
  normalizeStyleLabMockDraft,
  readStyleLabMockDraft,
  removeStyleLabMockNode,
  reorderStyleLabMockNode,
  resolveStyleLabMockHostForElement,
  resolveStyleLabStructuralTarget,
  restoreAllStyleLabHiddenTargets,
  restoreStyleLabHiddenTarget,
  setStyleLabHiddenTarget,
  STYLE_LAB_SESSION_TARGET_ATTRIBUTE,
  writeStyleLabMockDraft,
} from "./style-lab-mock-registry";
import { StyleLabMockRuntime } from "./style-lab-mock-elements";
import type { StyleLabMockDraft, StyleLabMockHost, StyleLabMockNodeType, StyleLabStructuralProposal, StyleLabStructuralTarget } from "./style-lab-mock-types";

function getInspectableElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element) || target.closest("[data-style-lab-ui]")) return null;
  let element: HTMLElement | null = target instanceof HTMLElement ? target : target.parentElement;
  while (element && !element.closest("[data-style-lab-ui]")) {
    if (getStyleLabRole(element.dataset.styleRole)) return element;
    element = element.parentElement;
  }
  return null;
}

function createStyleLabInstanceOverride(element: HTMLElement, roleId: StyleLabRoleId): StyleLabInstanceOverride {
  const previewTarget = getStyleLabPreviewTextTarget(element);
  const iconTarget = getStyleLabIconTarget(element);
  return {
    iconPreviewEligible: Boolean(iconTarget),
    originalIconName: iconTarget?.dataset.styleIconName ?? null,
    originalText: previewTarget?.textContent?.trim() ?? element.textContent?.trim() ?? "",
    overrides: {},
    previewText: "",
    previewTextEligible: Boolean(previewTarget),
    roleId,
  };
}

export function StyleLabDevRoot() {
  const [enabled, setEnabled] = useState(false);
  const [inspectionActive, setInspectionActive] = useState(false);
  const [mode, setMode] = useState<StyleLabMode>("inspect");
  const [selectedRoleId, setSelectedRoleId] = useState<StyleLabRoleId | null>(null);
  const [scope, setScope] = useState<StyleLabScope>("role");
  const [overrides, setOverrides] = useState<StyleLabOverrides>({});
  const [instanceOverrides, setInstanceOverrides] = useState<StyleLabInstanceOverrides>({});
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [panelPosition, setPanelPosition] = useState<StyleLabPanelPosition | null>(null);
  const [matchCount, setMatchCount] = useState(0);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [mockDraft, setMockDraft] = useState<StyleLabMockDraft>({ hiddenTargets: [], nodes: [] });
  const [selectedStructuralTarget, setSelectedStructuralTarget] = useState<StyleLabStructuralTarget | null>(null);
  const [selectedMockHost, setSelectedMockHost] = useState<StyleLabMockHost | null>(null);
  const hoveredElementRef = useRef<HTMLElement | null>(null);
  const selectedElementRef = useRef<HTMLElement | null>(null);
  const instanceOverridesRef = useRef<StyleLabInstanceOverrides>({});
  const mockDraftRef = useRef<StyleLabMockDraft>({ hiddenTargets: [], nodes: [] });
  const sessionStructuralElementsRef = useRef(new Set<HTMLElement>());
  const trackedInstanceElementsRef = useRef(new Map<string, HTMLElement>());
  const nextInstanceIdRef = useRef(0);
  const nextMockIdRef = useRef(0);

  useEffect(() => {
    instanceOverridesRef.current = instanceOverrides;
  }, [instanceOverrides]);

  useEffect(() => {
    mockDraftRef.current = mockDraft;
  }, [mockDraft]);

  useEffect(() => {
    if (!canUseStyleLab(process.env.NODE_ENV, true)) return;
    const timeoutId = window.setTimeout(() => {
      setOverrides(readStyleLabOverrides(window.localStorage));
      setMockDraft(readStyleLabMockDraft(window.localStorage));
      setPanelPosition(readStyleLabPanelPosition(window.localStorage));
      setEnabled(isStyleLabExplicitlyEnabled(window as unknown as StyleLabWindow));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const handleEnablementChange = () => {
      setEnabled(isStyleLabExplicitlyEnabled(window as unknown as StyleLabWindow));
    };
    window.addEventListener(STYLE_LAB_ENABLEMENT_EVENT, handleEnablementChange);
    return () => window.removeEventListener(STYLE_LAB_ENABLEMENT_EVENT, handleEnablementChange);
  }, []);

  useEffect(() => {
    if (!enabled) {
      const styleElement = document.getElementById(STYLE_LAB_RUNTIME_STYLE_ELEMENT_ID);
      if (styleElement) styleElement.textContent = "";
      return;
    }
    applyStyleLabRuntimeStyles(document, overrides, instanceOverrides);
  }, [enabled, instanceOverrides, overrides]);

  useEffect(() => {
    if (enabled) applyStyleLabHiddenTargets(document, mockDraft.hiddenTargets);
    else clearStyleLabHiddenTargets(document);
  }, [enabled, mockDraft]);

  useEffect(() => {
    for (const [instanceId, instance] of Object.entries(instanceOverrides)) {
      const element = trackedInstanceElementsRef.current.get(instanceId);
      if (!element || !instance.previewTextEligible) continue;
      if (enabled && instance.previewText) setStyleLabPreviewTextOnElement(element, instance.previewText);
      else restoreStyleLabPreviewText(element, instance.originalText);
    }
  }, [enabled, instanceOverrides]);

  useEffect(() => {
    for (const [instanceId, instance] of Object.entries(instanceOverrides)) {
      const element = trackedInstanceElementsRef.current.get(instanceId);
      if (!element || !instance.iconPreviewEligible) continue;
      if (enabled && instance.previewIconName) setStyleLabIconPreviewOnElement(element, instance.previewIconName);
      else restoreStyleLabIcon(element);
    }
  }, [enabled, instanceOverrides]);

  useEffect(() => {
    if (!enabled || !inspectionActive) return;

    function handlePointerOver(event: PointerEvent) {
      const nextElement = getInspectableElement(event.target);
      if (hoveredElementRef.current === nextElement) return;
      hoveredElementRef.current?.removeAttribute("data-style-lab-hovered");
      hoveredElementRef.current = nextElement;
      nextElement?.setAttribute("data-style-lab-hovered", "true");
    }

    function handlePointerOut(event: PointerEvent) {
      if (event.relatedTarget instanceof Node && (event.currentTarget as Document).contains(event.relatedTarget)) return;
      hoveredElementRef.current?.removeAttribute("data-style-lab-hovered");
      hoveredElementRef.current = null;
    }

    function handleClick(event: MouseEvent) {
      const element = getInspectableElement(event.target);
      if (!element) return;
      const role = getStyleLabRole(element.dataset.styleRole);
      if (!role) return;
      event.preventDefault();
      event.stopPropagation();
      if ((role.id === "ui.card.surface" || role.id === "ui.panel.surface") && !element.hasAttribute(STYLE_LAB_SESSION_TARGET_ATTRIBUTE)) {
        const sessionTargetId = `structural-target-${sessionStructuralElementsRef.current.size + 1}`;
        element.setAttribute(STYLE_LAB_SESSION_TARGET_ATTRIBUTE, sessionTargetId);
        sessionStructuralElementsRef.current.add(element);
      }
      let instanceId = element.getAttribute(STYLE_LAB_INSTANCE_ATTRIBUTE);
      if (!instanceId) {
        nextInstanceIdRef.current += 1;
        instanceId = `style-lab-instance-${nextInstanceIdRef.current}`;
        element.setAttribute(STYLE_LAB_INSTANCE_ATTRIBUTE, instanceId);
      }
      trackedInstanceElementsRef.current.set(instanceId, element);
      const existingInstance = instanceOverridesRef.current[instanceId];
      if (!existingInstance) {
        setInstanceOverrides((current) => ({
          ...current,
          [instanceId as string]: createStyleLabInstanceOverride(element, role.id),
        }));
      }
      selectedElementRef.current?.removeAttribute("data-style-lab-selected");
      selectedElementRef.current = element;
      element.setAttribute("data-style-lab-selected", "true");
      setSelectedStructuralTarget(resolveStyleLabStructuralTarget(element));
      setSelectedMockHost(resolveStyleLabMockHostForElement(element));
      setSelectedRoleId(role.id);
      setSelectedInstanceId(instanceId);
      setScope("role");
      setMatchCount(getStyleLabMatchCount(document, role.id));
      setCopyStatus(null);
    }

    document.addEventListener("pointerover", handlePointerOver, true);
    document.addEventListener("pointerout", handlePointerOut, true);
    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("pointerover", handlePointerOver, true);
      document.removeEventListener("pointerout", handlePointerOut, true);
      document.removeEventListener("click", handleClick, true);
      hoveredElementRef.current?.removeAttribute("data-style-lab-hovered");
      hoveredElementRef.current = null;
    };
  }, [enabled, inspectionActive]);

  useEffect(() => {
    if (!enabled || !selectedRoleId) return;
    const updateMatchCount = () => setMatchCount(getStyleLabMatchCount(document, selectedRoleId));
    updateMatchCount();
    const observer = new MutationObserver(updateMatchCount);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [enabled, selectedRoleId]);

  const persistOverrides = useCallback((nextOverrides: StyleLabOverrides) => {
    const normalized = writeStyleLabOverrides(window.localStorage, nextOverrides);
    setOverrides(normalized);
  }, []);

  const persistMockDraft = useCallback((nextDraft: StyleLabMockDraft) => {
    const normalized = normalizeStyleLabMockDraft(nextDraft);
    writeStyleLabMockDraft(window.localStorage, normalized);
    setMockDraft(normalized);
    if (enabled) applyStyleLabHiddenTargets(document, normalized.hiddenTargets);
  }, [enabled]);

  const handlePanelPositionChange = useCallback((nextPosition: StyleLabPanelPosition) => {
    setPanelPosition((currentPosition) => {
      if (currentPosition?.left === nextPosition.left && currentPosition.top === nextPosition.top) return currentPosition;
      return writeStyleLabPanelPosition(window.localStorage, nextPosition) ?? currentPosition;
    });
  }, []);

  const handleDisable = useCallback(() => {
    writeStyleLabEnablement(window.localStorage, false);
    clearStyleLabHiddenTargets(document);
    const stableDraft = normalizeStyleLabMockDraft({
      ...mockDraftRef.current,
      hiddenTargets: mockDraftRef.current.hiddenTargets.filter((target) => target.stable),
    });
    writeStyleLabMockDraft(window.localStorage, stableDraft);
    setMockDraft(stableDraft);
    hoveredElementRef.current?.removeAttribute("data-style-lab-hovered");
    hoveredElementRef.current = null;
    selectedElementRef.current?.removeAttribute("data-style-lab-selected");
    for (const element of sessionStructuralElementsRef.current) element.removeAttribute(STYLE_LAB_SESSION_TARGET_ATTRIBUTE);
    sessionStructuralElementsRef.current.clear();
    setInspectionActive(false);
    setMode("inspect");
    setEnabled(false);
    setSelectedStructuralTarget(null);
    setSelectedMockHost(null);
  }, []);

  const handleModeChange = useCallback((nextMode: StyleLabMode) => {
    if (nextMode === "build") {
      hoveredElementRef.current?.removeAttribute("data-style-lab-hovered");
      hoveredElementRef.current = null;
      setInspectionActive(false);
    }
    setMode(nextMode);
  }, []);

  const handleScopeChange = useCallback((nextScope: StyleLabScope) => {
    if (nextScope === "role") {
      setScope(nextScope);
      return;
    }
    const element = selectedElementRef.current;
    if (!element || !selectedRoleId) return;
    let instanceId = element.getAttribute(STYLE_LAB_INSTANCE_ATTRIBUTE);
    if (!instanceId) {
      nextInstanceIdRef.current += 1;
      instanceId = `style-lab-instance-${nextInstanceIdRef.current}`;
      element.setAttribute(STYLE_LAB_INSTANCE_ATTRIBUTE, instanceId);
    }
    trackedInstanceElementsRef.current.set(instanceId, element);
    if (!instanceOverridesRef.current[instanceId]) {
      setInstanceOverrides((current) => ({
        ...current,
        [instanceId as string]: createStyleLabInstanceOverride(element, selectedRoleId),
      }));
    }
    setSelectedInstanceId(instanceId);
    setScope(nextScope);
  }, [selectedRoleId]);

  const handleSetOverride = useCallback((propertyId: StyleLabPropertyId, value: string) => {
    if (!selectedRoleId) return;
    if (scope === "instance") {
      if (!selectedInstanceId) return;
      const nextInstances = value
        ? setStyleLabInstanceOverride(instanceOverrides, selectedInstanceId, selectedRoleId, propertyId, value)
        : clearStyleLabInstanceOverride(instanceOverrides, selectedInstanceId, propertyId);
      setInstanceOverrides(nextInstances);
      return;
    }
    let nextOverrides = overrides;
    if (!value) {
      const nextRole = { ...nextOverrides[selectedRoleId] };
      delete nextRole[propertyId];
      nextOverrides = { ...nextOverrides };
      if (Object.keys(nextRole).length > 0) nextOverrides[selectedRoleId] = nextRole;
      else delete nextOverrides[selectedRoleId];
    } else {
      nextOverrides = setStyleLabOverride(nextOverrides, selectedRoleId, propertyId, value);
    }
    persistOverrides(nextOverrides);
  }, [instanceOverrides, overrides, persistOverrides, scope, selectedInstanceId, selectedRoleId]);

  const handleSetPreviewText = useCallback((previewText: string) => {
    if (scope !== "instance" || !selectedInstanceId) return;
    setInstanceOverrides(setStyleLabPreviewText(instanceOverrides, selectedInstanceId, previewText));
  }, [instanceOverrides, scope, selectedInstanceId]);

  const handleSetIcon = useCallback((iconName: string) => {
    if (scope !== "instance" || !selectedInstanceId) return;
    const element = trackedInstanceElementsRef.current.get(selectedInstanceId) ?? selectedElementRef.current;
    const nextInstances = iconName
      ? setStyleLabPreviewIcon(instanceOverrides, selectedInstanceId, iconName)
      : clearStyleLabPreviewIcon(instanceOverrides, selectedInstanceId);
    setInstanceOverrides(nextInstances);
    if (iconName) setStyleLabIconPreviewOnElement(element ?? null, iconName);
    else restoreStyleLabIcon(element ?? null);
  }, [instanceOverrides, scope, selectedInstanceId]);

  const handleResetRole = useCallback(() => {
    if (!selectedRoleId) return;
    if (scope === "instance") {
      if (!selectedInstanceId) return;
      const element = trackedInstanceElementsRef.current.get(selectedInstanceId) ?? selectedElementRef.current;
      const instance = instanceOverrides[selectedInstanceId];
      if (instance) restoreStyleLabPreviewText(element ?? null, instance.originalText);
      if (instance?.iconPreviewEligible) restoreStyleLabIcon(element ?? null);
      element?.removeAttribute(STYLE_LAB_INSTANCE_ATTRIBUTE);
      setInstanceOverrides(resetStyleLabInstance(instanceOverrides, selectedInstanceId));
      setSelectedInstanceId(null);
      setScope("role");
      return;
    }
    persistOverrides(resetStyleLabRole(overrides, selectedRoleId));
  }, [instanceOverrides, overrides, persistOverrides, scope, selectedInstanceId, selectedRoleId]);

  const handleResetAll = useCallback(() => {
    persistOverrides({});
    for (const [instanceId, instance] of Object.entries(instanceOverrides)) {
      const element = trackedInstanceElementsRef.current.get(instanceId);
      if (instance.previewTextEligible) restoreStyleLabPreviewText(element ?? null, instance.originalText);
      if (instance.iconPreviewEligible) restoreStyleLabIcon(element ?? null);
    }
    applyStyleLabRuntimeStyles(document, {}, {});
    const trackedElements = new Set(trackedInstanceElementsRef.current.values());
    if (hoveredElementRef.current) trackedElements.add(hoveredElementRef.current);
    if (selectedElementRef.current) trackedElements.add(selectedElementRef.current);
    for (const element of trackedElements) {
      element.removeAttribute(STYLE_LAB_INSTANCE_ATTRIBUTE);
      element.removeAttribute("data-style-lab-hovered");
      element.removeAttribute("data-style-lab-selected");
    }
    hoveredElementRef.current = null;
    selectedElementRef.current = null;
    setSelectedStructuralTarget(null);
    setSelectedMockHost(null);
    trackedInstanceElementsRef.current.clear();
    setInstanceOverrides(resetStyleLabInstances());
    setSelectedInstanceId(null);
    setScope("role");
  }, [instanceOverrides, persistOverrides]);

  const handleAddMock = useCallback((type: StyleLabMockNodeType) => {
    const host = resolveStyleLabMockHostForElement(selectedElementRef.current);
    if (!host || !host.allowedTypes.includes(type)) return;
    let id = "";
    do {
      nextMockIdRef.current += 1;
      id = `mock-${nextMockIdRef.current}`;
    } while (mockDraftRef.current.nodes.some((node) => node.id === id));
    const siblingCount = mockDraftRef.current.nodes.filter((node) => node.parentHostKey === host.key).length;
    persistMockDraft(addStyleLabMockNode(mockDraftRef.current, createStyleLabMockNode(id, type, host.key, siblingCount)));
  }, [persistMockDraft]);

  const handleHideSelected = useCallback(() => {
    const target = resolveStyleLabStructuralTarget(selectedElementRef.current);
    if (!target) return;
    const nextDraft = setStyleLabHiddenTarget(mockDraftRef.current, {
      context: target.context,
      key: target.key,
      kind: target.kind,
      label: target.label,
      roleId: target.roleId,
      stable: target.stable,
    });
    persistMockDraft(nextDraft);
    applyStyleLabHiddenTargets(document, nextDraft.hiddenTargets);
  }, [persistMockDraft]);

  const handleRestoreSelected = useCallback(() => {
    const target = resolveStyleLabStructuralTarget(selectedElementRef.current);
    if (!target) return;
    const nextDraft = restoreStyleLabHiddenTarget(mockDraftRef.current, target.key);
    persistMockDraft(nextDraft);
    applyStyleLabHiddenTargets(document, nextDraft.hiddenTargets);
  }, [persistMockDraft]);

  const handleRestoreHiddenTarget = useCallback((key: string) => {
    const nextDraft = restoreStyleLabHiddenTarget(mockDraftRef.current, key);
    persistMockDraft(nextDraft);
    applyStyleLabHiddenTargets(document, nextDraft.hiddenTargets);
  }, [persistMockDraft]);

  const handleRestoreAllHidden = useCallback(() => {
    const nextDraft = restoreAllStyleLabHiddenTargets(mockDraftRef.current);
    persistMockDraft(nextDraft);
    applyStyleLabHiddenTargets(document, nextDraft.hiddenTargets);
  }, [persistMockDraft]);

  const handleClearMockStructure = useCallback(() => {
    if (typeof window !== "undefined" && !window.confirm("Clear all Style Lab mock structure and restore hidden preview elements?")) return;
    const nextDraft = { hiddenTargets: [], nodes: [] } satisfies StyleLabMockDraft;
    persistMockDraft(nextDraft);
    clearStyleLabHiddenTargets(document);
    selectedElementRef.current?.removeAttribute("data-style-lab-selected");
    selectedElementRef.current = null;
    setSelectedStructuralTarget(null);
    setSelectedMockHost(null);
    setSelectedRoleId(null);
    setSelectedInstanceId(null);
    setScope("role");
  }, [persistMockDraft]);

  const handleMoveMock = useCallback((direction: "earlier" | "later") => {
    const target = resolveStyleLabStructuralTarget(selectedElementRef.current);
    if (!target?.mockId) return;
    persistMockDraft(reorderStyleLabMockNode(mockDraftRef.current, target.mockId, direction));
  }, [persistMockDraft]);

  const handleRemoveMock = useCallback(() => {
    const target = resolveStyleLabStructuralTarget(selectedElementRef.current);
    if (!target?.mockId) return;
    const node = getStyleLabMockNodeById(mockDraftRef.current, target.mockId);
    if (!node) return;
    const hasChildren = node.type === "section" && mockDraftRef.current.nodes.some((current) => current.parentHostKey === getStyleLabMockSectionHostKey(node.id));
    if (hasChildren && typeof window !== "undefined" && !window.confirm("Remove this Mock Section and its nested mock elements?")) return;
    persistMockDraft(removeStyleLabMockNode(mockDraftRef.current, node.id));
    selectedElementRef.current?.removeAttribute("data-style-lab-selected");
    selectedElementRef.current = null;
    setSelectedStructuralTarget(null);
    setSelectedMockHost(null);
    setSelectedRoleId(null);
    setSelectedInstanceId(null);
    setScope("role");
  }, [persistMockDraft]);

  const handleCopySpec = useCallback(async () => {
    if (!selectedRoleId) return;
    const selectedInstance = selectedInstanceId ? instanceOverrides[selectedInstanceId] ?? null : null;
    const target = resolveStyleLabStructuralTarget(selectedElementRef.current);
    const hiddenTarget = target ? mockDraft.hiddenTargets.find((hidden) => hidden.key === target.key) : null;
    let structural: StyleLabStructuralProposal | null = hiddenTarget ? {
      action: "hide",
      context: hiddenTarget.context,
      label: hiddenTarget.label,
      roleId: hiddenTarget.roleId,
      target: hiddenTarget.kind === "page-shell" ? "Page Shell" : hiddenTarget.kind === "tasks-rail-chip" ? "Tasks rail chip" : hiddenTarget.kind === "mock" ? "Mock element" : hiddenTarget.kind === "card" ? "Card" : "Panel",
    } : null;
    if (!structural && target?.kind === "mock" && target.mockId) {
      const node = getStyleLabMockNodeById(mockDraft, target.mockId);
      const position = node ? getStyleLabMockSiblingPosition(mockDraft, node.id) : null;
      const parentHost = node ? collectStyleLabMockHosts(document).find((host) => host.key === node.parentHostKey) : null;
      if (node && position) {
        structural = {
          action: "add",
          context: "Style Lab mock structure",
          node: {
            ...node,
            icon: selectedInstance?.previewIconName ?? node.icon,
            text: selectedInstance?.previewText || node.text,
          },
          parent: parentHost?.label ?? (node.parentHostKey.startsWith("tasks-rail:") ? "Tasks page · Lists rail" : node.parentHostKey.startsWith("page-shell:") ? "Page Shell body" : "Mock Section body"),
          position: position.position,
          siblingCount: position.siblingCount,
        };
      }
    }
    const spec = getStyleLabDesignSpec(selectedRoleId, overrides, {
      instance: selectedInstance,
      scope,
      structural,
    });
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(spec);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = spec;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCopyStatus("Design Spec copied.");
    } catch {
      setCopyStatus("Clipboard unavailable; copy the generated spec from the browser console.");
      console.info(spec);
    }
  }, [instanceOverrides, mockDraft, overrides, scope, selectedInstanceId, selectedRoleId]);

  if (process.env.NODE_ENV !== "development") return null;

  if (!enabled) return null;

  const selectedInstance = selectedInstanceId ? instanceOverrides[selectedInstanceId] ?? null : null;
  const selectedMockNode = selectedStructuralTarget?.mockId ? getStyleLabMockNodeById(mockDraft, selectedStructuralTarget.mockId) : null;
  const selectedMockPosition = selectedMockNode ? getStyleLabMockSiblingPosition(mockDraft, selectedMockNode.id) : null;
  const selectedTargetIsHidden = Boolean(selectedStructuralTarget && mockDraft.hiddenTargets.some((target) => target.key === selectedStructuralTarget.key));

  return (
    <div data-style-lab-ui>
      <StyleLabMockRuntime draft={mockDraft} />
      <StyleLabPanel
        mode={mode}
        copyStatus={copyStatus}
        inspectionActive={inspectionActive}
        instanceOverride={selectedInstance}
        matchCount={matchCount}
        mockHost={selectedMockHost}
        mockNode={selectedMockNode}
        mockPosition={selectedMockPosition}
        hiddenTargets={mockDraft.hiddenTargets}
        selectedStructuralTarget={selectedStructuralTarget}
        selectedTargetIsHidden={selectedTargetIsHidden}
        onAddMock={handleAddMock}
        onCopySpec={() => { void handleCopySpec(); }}
        onDisable={handleDisable}
        onHideSelected={handleHideSelected}
        onRestoreSelected={handleRestoreSelected}
        onRestoreHiddenTarget={handleRestoreHiddenTarget}
        onRestoreAllHidden={handleRestoreAllHidden}
        onClearMockStructure={handleClearMockStructure}
        onMoveMock={handleMoveMock}
        onRemoveMock={handleRemoveMock}
        onResetAll={handleResetAll}
        onResetRole={handleResetRole}
        onSetOverride={handleSetOverride}
        onSetIcon={handleSetIcon}
        onSetPreviewText={handleSetPreviewText}
        onPanelPositionChange={handlePanelPositionChange}
        onModeChange={handleModeChange}
        onScopeChange={handleScopeChange}
        onToggleInspection={() => setInspectionActive((current) => !current)}
        overrides={overrides}
        panelPosition={panelPosition}
        role={selectedRoleId ? getStyleLabRole(selectedRoleId) : null}
        scope={scope}
      />
    </div>
  );
}
