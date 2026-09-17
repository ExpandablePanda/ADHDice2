"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StyleLabPanel } from "./style-lab-panel";
import {
  getStyleLabDesignSpec,
  getStyleLabMatchCount,
  isStyleLabExplicitlyEnabled,
  applyStyleLabRuntimeStyles,
  canUseStyleLab,
  readStyleLabPanelPosition,
  readStyleLabOverrides,
  resetStyleLabRole,
  setStyleLabOverride,
  writeStyleLabPanelPosition,
  writeStyleLabOverrides,
  type StyleLabOverrides,
  type StyleLabPanelPosition,
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
  const [overrides, setOverrides] = useState<StyleLabOverrides>({});
  const [panelPosition, setPanelPosition] = useState<StyleLabPanelPosition | null>(null);
  const [matchCount, setMatchCount] = useState(0);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const hoveredElementRef = useRef<HTMLElement | null>(null);
  const selectedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const timeoutId = window.setTimeout(() => {
      if (!canUseStyleLab(process.env.NODE_ENV, isStyleLabExplicitlyEnabled(window as unknown as StyleLabWindow))) return;
      setOverrides(readStyleLabOverrides(window.localStorage));
      setPanelPosition(readStyleLabPanelPosition(window.localStorage));
      setEnabled(true);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    applyStyleLabRuntimeStyles(document, overrides);
  }, [enabled, overrides]);

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
      selectedElementRef.current?.removeAttribute("data-style-lab-selected");
      selectedElementRef.current = element;
      element.setAttribute("data-style-lab-selected", "true");
      setSelectedRoleId(role.id);
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

  const handleSetOverride = useCallback((propertyId: StyleLabPropertyId, value: string) => {
    if (!selectedRoleId) return;
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
  }, [overrides, persistOverrides, selectedRoleId]);

  const handleResetRole = useCallback(() => {
    if (!selectedRoleId) return;
    persistOverrides(resetStyleLabRole(overrides, selectedRoleId));
  }, [overrides, persistOverrides, selectedRoleId]);

  const handleResetAll = useCallback(() => {
    persistOverrides({});
  }, [persistOverrides]);

  const handleCopySpec = useCallback(async () => {
    if (!selectedRoleId) return;
    const spec = getStyleLabDesignSpec(selectedRoleId, overrides);
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
  }, [overrides, selectedRoleId]);

  if (!enabled) return null;

  return (
    <div data-style-lab-ui>
      <StyleLabPanel
        copyStatus={copyStatus}
        inspectionActive={inspectionActive}
        matchCount={matchCount}
        onCopySpec={() => { void handleCopySpec(); }}
        onResetAll={handleResetAll}
        onResetRole={handleResetRole}
        onSetOverride={handleSetOverride}
        onPanelPositionChange={handlePanelPositionChange}
        onToggleInspection={() => setInspectionActive((current) => !current)}
        overrides={overrides}
        panelPosition={panelPosition}
        role={selectedRoleId ? getStyleLabRole(selectedRoleId) : null}
      />
    </div>
  );
}
