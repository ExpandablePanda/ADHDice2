"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StyleLabPanel } from "./style-lab-panel";
import {
  getStyleLabDesignSpec,
  getStyleLabMatchCount,
  isStyleLabExplicitlyEnabled,
  applyStyleLabRuntimeStyles,
  canUseStyleLab,
  clearStyleLabInstanceOverride,
  getStyleLabPreviewTextTarget,
  readStyleLabPanelPosition,
  readStyleLabOverrides,
  resetStyleLabInstance,
  resetStyleLabInstances,
  resetStyleLabRole,
  setStyleLabOverride,
  setStyleLabInstanceOverride,
  setStyleLabPreviewText,
  setStyleLabPreviewTextOnElement,
  STYLE_LAB_INSTANCE_ATTRIBUTE,
  STYLE_LAB_RUNTIME_STYLE_ELEMENT_ID,
  restoreStyleLabPreviewText,
  writeStyleLabPanelPosition,
  writeStyleLabEnablement,
  writeStyleLabOverrides,
  type StyleLabInstanceOverrides,
  type StyleLabOverrides,
  type StyleLabPanelPosition,
  type StyleLabScope,
  type StyleLabWindow,
} from "./style-lab-runtime";
import { getStyleLabRole, type StyleLabPropertyId, type StyleLabRoleId } from "./style-lab-registry";

function getInspectableElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element) || target.closest("[data-style-lab-ui]")) return null;
  let element: HTMLElement | null = target instanceof HTMLElement ? target : target.parentElement;
  while (element && !element.closest("[data-style-lab-ui]")) {
    if (getStyleLabRole(element.dataset.styleRole)) return element;
    element = element.parentElement;
  }
  return null;
}

export function StyleLabDevRoot() {
  const [enabled, setEnabled] = useState(false);
  const [inspectionActive, setInspectionActive] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<StyleLabRoleId | null>(null);
  const [scope, setScope] = useState<StyleLabScope>("role");
  const [overrides, setOverrides] = useState<StyleLabOverrides>({});
  const [instanceOverrides, setInstanceOverrides] = useState<StyleLabInstanceOverrides>({});
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [panelPosition, setPanelPosition] = useState<StyleLabPanelPosition | null>(null);
  const [matchCount, setMatchCount] = useState(0);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const hoveredElementRef = useRef<HTMLElement | null>(null);
  const selectedElementRef = useRef<HTMLElement | null>(null);
  const instanceOverridesRef = useRef<StyleLabInstanceOverrides>({});
  const trackedInstanceElementsRef = useRef(new Map<string, HTMLElement>());
  const nextInstanceIdRef = useRef(0);

  useEffect(() => {
    instanceOverridesRef.current = instanceOverrides;
  }, [instanceOverrides]);

  useEffect(() => {
    if (!canUseStyleLab(process.env.NODE_ENV, true)) return;
    const timeoutId = window.setTimeout(() => {
      setOverrides(readStyleLabOverrides(window.localStorage));
      setPanelPosition(readStyleLabPanelPosition(window.localStorage));
      setEnabled(isStyleLabExplicitlyEnabled(window as unknown as StyleLabWindow));
    }, 0);
    return () => window.clearTimeout(timeoutId);
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
    for (const [instanceId, instance] of Object.entries(instanceOverrides)) {
      const element = trackedInstanceElementsRef.current.get(instanceId);
      if (!element || !instance.previewTextEligible) continue;
      if (enabled && instance.previewText) setStyleLabPreviewTextOnElement(element, instance.previewText);
      else restoreStyleLabPreviewText(element, instance.originalText);
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
      let instanceId = element.getAttribute(STYLE_LAB_INSTANCE_ATTRIBUTE);
      if (!instanceId) {
        nextInstanceIdRef.current += 1;
        instanceId = `style-lab-instance-${nextInstanceIdRef.current}`;
        element.setAttribute(STYLE_LAB_INSTANCE_ATTRIBUTE, instanceId);
      }
      trackedInstanceElementsRef.current.set(instanceId, element);
      const existingInstance = instanceOverridesRef.current[instanceId];
      if (!existingInstance) {
        const previewTarget = getStyleLabPreviewTextTarget(element);
        setInstanceOverrides((current) => ({
          ...current,
          [instanceId as string]: {
            originalText: previewTarget?.textContent?.trim() ?? element.textContent?.trim() ?? "",
            overrides: {},
            previewText: "",
            previewTextEligible: Boolean(previewTarget),
            roleId: role.id,
          },
        }));
      }
      selectedElementRef.current?.removeAttribute("data-style-lab-selected");
      selectedElementRef.current = element;
      element.setAttribute("data-style-lab-selected", "true");
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

  const handlePanelPositionChange = useCallback((nextPosition: StyleLabPanelPosition) => {
    setPanelPosition((currentPosition) => {
      if (currentPosition?.left === nextPosition.left && currentPosition.top === nextPosition.top) return currentPosition;
      return writeStyleLabPanelPosition(window.localStorage, nextPosition) ?? currentPosition;
    });
  }, []);

  const handleEnable = useCallback(() => {
    if (!canUseStyleLab(process.env.NODE_ENV, true)) return;
    writeStyleLabEnablement(window.localStorage, true);
    setEnabled(true);
  }, []);

  const handleDisable = useCallback(() => {
    writeStyleLabEnablement(window.localStorage, false);
    hoveredElementRef.current?.removeAttribute("data-style-lab-hovered");
    hoveredElementRef.current = null;
    selectedElementRef.current?.removeAttribute("data-style-lab-selected");
    setInspectionActive(false);
    setEnabled(false);
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
      const previewTarget = getStyleLabPreviewTextTarget(element);
      setInstanceOverrides((current) => ({
        ...current,
        [instanceId as string]: {
          originalText: previewTarget?.textContent?.trim() ?? element.textContent?.trim() ?? "",
          overrides: {},
          previewText: "",
          previewTextEligible: Boolean(previewTarget),
          roleId: selectedRoleId,
        },
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

  const handleResetRole = useCallback(() => {
    if (!selectedRoleId) return;
    if (scope === "instance") {
      if (!selectedInstanceId) return;
      const element = trackedInstanceElementsRef.current.get(selectedInstanceId) ?? selectedElementRef.current;
      const instance = instanceOverrides[selectedInstanceId];
      if (instance) restoreStyleLabPreviewText(element ?? null, instance.originalText);
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
      element?.removeAttribute(STYLE_LAB_INSTANCE_ATTRIBUTE);
    }
    setInstanceOverrides(resetStyleLabInstances());
    setSelectedInstanceId(null);
    setScope("role");
  }, [instanceOverrides, persistOverrides]);

  const handleCopySpec = useCallback(async () => {
    if (!selectedRoleId) return;
    const spec = getStyleLabDesignSpec(selectedRoleId, overrides, {
      instance: selectedInstanceId ? instanceOverrides[selectedInstanceId] : null,
      scope,
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
  }, [instanceOverrides, overrides, scope, selectedInstanceId, selectedRoleId]);

  if (process.env.NODE_ENV !== "development") return null;

  if (!enabled) {
    return (
      <div data-style-lab-ui className="fixed bottom-4 left-4 z-[1000]">
        <button
          className="rounded-full border border-[#dcd2fa] bg-white/95 px-3 py-2 text-xs font-semibold text-[#6653c7] shadow-[0_8px_24px_rgba(81,61,168,0.16)] backdrop-blur transition hover:bg-[#f8f5ff] dark:border-white/15 dark:bg-[#17132a]/95 dark:text-[#d8ceff] dark:hover:bg-[#251d3e]"
          onClick={handleEnable}
          type="button"
        >
          Open Style Lab
        </button>
      </div>
    );
  }

  const selectedInstance = selectedInstanceId ? instanceOverrides[selectedInstanceId] ?? null : null;

  return (
    <div data-style-lab-ui>
      <StyleLabPanel
        copyStatus={copyStatus}
        inspectionActive={inspectionActive}
        instanceOverride={selectedInstance}
        matchCount={matchCount}
        onCopySpec={() => { void handleCopySpec(); }}
        onDisable={handleDisable}
        onResetAll={handleResetAll}
        onResetRole={handleResetRole}
        onSetOverride={handleSetOverride}
        onSetPreviewText={handleSetPreviewText}
        onPanelPositionChange={handlePanelPositionChange}
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
