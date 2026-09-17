"use client";

import { Copy, Eye, EyeOff, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { AdhdChip, AdhdIconButton, AdhdPanel } from "@/components/ui-system";
import {
  getStyleLabProperty,
  type StyleLabPropertyId,
  type StyleLabRole,
} from "./style-lab-registry";
import {
  normalizeStyleLabPanelPosition,
  type StyleLabOverrides,
  type StyleLabPanelPosition,
} from "./style-lab-runtime";

const SELECT_CLASS = "h-8 min-w-0 flex-1 rounded-lg border border-[#e6e0f4] bg-white px-2 text-xs text-[#3f3856] outline-none focus:border-[#c9bcff] dark:border-white/10 dark:bg-white/[0.06] dark:text-white";

function getPropertyValue(overrides: StyleLabOverrides, role: StyleLabRole, propertyId: StyleLabPropertyId): string {
  return overrides[role.id]?.[propertyId] ?? "";
}

export function StyleLabPanel({
  inspectionActive,
  matchCount,
  onCopySpec,
  onResetAll,
  onResetRole,
  onSetOverride,
  onPanelPositionChange,
  onToggleInspection,
  role,
  overrides,
  copyStatus,
  panelPosition,
}: {
  copyStatus: string | null;
  inspectionActive: boolean;
  matchCount: number;
  onCopySpec: () => void;
  onResetAll: () => void;
  onResetRole: () => void;
  onSetOverride: (propertyId: StyleLabPropertyId, value: string) => void;
  onPanelPositionChange: (position: StyleLabPanelPosition) => void;
  onToggleInspection: () => void;
  overrides: StyleLabOverrides;
  panelPosition: StyleLabPanelPosition | null;
  role: StyleLabRole | null;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ offsetX: number; offsetY: number; pointerId: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const normalizeCurrentPosition = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      onPanelPositionChange(normalizeStyleLabPanelPosition(
        panelPosition ?? { left: rect.left, top: rect.top },
        window.innerWidth,
        window.innerHeight,
        rect.width,
        rect.height,
      ));
    };
    const frameId = window.requestAnimationFrame(normalizeCurrentPosition);
    window.addEventListener("resize", normalizeCurrentPosition);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", normalizeCurrentPosition);
    };
  }, [onPanelPositionChange, panelPosition]);

  function handleDragStart(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      pointerId: event.pointerId,
    };
    setIsDragging(true);
  }

  function handleDragMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !panel) return;
    const rect = panel.getBoundingClientRect();
    onPanelPositionChange(normalizeStyleLabPanelPosition(
      { left: event.clientX - drag.offsetX, top: event.clientY - drag.offsetY },
      window.innerWidth,
      window.innerHeight,
      rect.width,
      rect.height,
    ));
  }

  function handleDragEnd(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setIsDragging(false);
  }

  return (
    <div
      className={`fixed z-[1000] w-[min(25rem,calc(100vw-2rem))] ${panelPosition ? "" : "right-4 top-4"}`}
      data-style-lab-ui
      ref={panelRef}
      style={panelPosition ? { left: panelPosition.left, top: panelPosition.top } : undefined}
    >
      <AdhdPanel
        className="max-h-[calc(100vh-2rem)] w-full overflow-y-auto border-[#dcd2fa] bg-white/96 p-3 text-[#403a54] shadow-[0_20px_60px_rgba(81,61,168,0.2)] backdrop-blur dark:border-white/15 dark:bg-[#17132a]/96 dark:text-white/85"
        data-style-component={undefined}
        data-style-role={undefined}
        padding="none"
        variant="floating"
      >
        <div className="flex items-start justify-between gap-3">
          <div
            aria-label="Drag Style Lab panel"
            className={`min-w-0 touch-none select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
            data-style-lab-drag-handle
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
            title="Drag Style Lab panel"
          >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8d82b6] dark:text-white/45">Developer infrastructure</p>
          <h2 className="mt-1 text-sm font-bold text-[#2f2944] dark:text-white">ADHDice Style Lab</h2>
          </div>
          <AdhdIconButton aria-label={inspectionActive ? "Stop Style Lab inspection" : "Start Style Lab inspection"} data-style-role={undefined} onClick={onToggleInspection} selected={inspectionActive} size="sm" tone="purple">
            {inspectionActive ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
          </AdhdIconButton>
        </div>

      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-[#ece8f8] bg-[#faf9ff] px-2.5 py-2 text-xs dark:border-white/10 dark:bg-white/[0.04]">
        <span className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${inspectionActive ? "bg-[#12a876]" : "bg-[#a8a0bd]"}`} />
          <span>{inspectionActive ? "Inspection active" : "Inspection inactive"}</span>
        </span>
        <span className="shrink-0 text-[11px] text-[#8d82a7] dark:text-white/45">Click a registered role</span>
      </div>

      {role ? (
        <>
          <div className="mt-3 rounded-lg border border-[#e4dcfb] bg-[#f8f5ff] px-2.5 py-2.5 dark:border-[#44376c] dark:bg-[#251d3e]">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-[#4f4471] dark:text-[#d8ceff]">{role.name}</p>
                <p className="mt-0.5 break-all font-mono text-[10px] text-[#7f74a2] dark:text-white/48">{role.id}</p>
              </div>
              <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-[#7f74a2] dark:bg-white/10 dark:text-white/55">{matchCount} match{matchCount === 1 ? "" : "es"}</span>
            </div>
            <p className="mt-2 text-[11px] text-[#756c91] dark:text-white/55">{role.component} · {role.context}</p>
          </div>

          <div className="mt-3 grid gap-2">
            {role.capabilities.map((propertyId) => {
              const property = getStyleLabProperty(propertyId);
              if (!property) return null;
              return (
                <label className="flex items-center gap-2" key={property.id}>
                  <span className="w-28 shrink-0 text-[11px] font-medium text-[#6f6785] dark:text-white/60">{property.label}</span>
                  <select
                    className={SELECT_CLASS}
                    onChange={(event) => onSetOverride(property.id, event.target.value)}
                    value={getPropertyValue(overrides, role, property.id)}
                  >
                    <option value="">Default</option>
                    {property.values.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <AdhdChip data-style-role={undefined} onClick={onResetRole} type="button">Reset role</AdhdChip>
            <AdhdChip data-style-role={undefined} onClick={onCopySpec} icon={<Copy aria-hidden="true" className="h-3.5 w-3.5" />} tone="purple" type="button">Copy Design Spec</AdhdChip>
          </div>
          {copyStatus ? <p className="mt-2 text-[11px] text-[#4d8c68] dark:text-[#a5ddb6]" role="status">{copyStatus}</p> : null}
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-[#e3dcf3] px-3 py-4 text-center text-xs text-[#807898] dark:border-white/12 dark:text-white/50">
          {inspectionActive ? "Hover a supported role, then click to inspect it." : "Enable inspection to select supported semantic roles."}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#eeeaf6] pt-2.5 dark:border-white/10">
        <span className="text-[10px] text-[#948bab] dark:text-white/40">Drafts stay in this browser only.</span>
        <AdhdChip data-style-role={undefined} onClick={onResetAll} icon={<RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />} tone="danger" type="button">Reset all</AdhdChip>
      </div>
      </AdhdPanel>
    </div>
  );
}
