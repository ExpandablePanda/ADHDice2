"use client";

import { Copy, Eye, EyeOff, RotateCcw, Search } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { AdhdChip, AdhdIconButton, AdhdPanel } from "@/components/ui-system";
import { TaskTypeIcon } from "@/components/ui/lucide-icon";
import { StyleLabColorPalette } from "./style-lab-color-palette";
import {
  getStyleLabProperty,
  STYLE_LAB_ICON_OPTIONS,
  type StyleLabPropertyId,
  type StyleLabRole,
} from "./style-lab-registry";
import {
  normalizeStyleLabPanelPosition,
  getStyleLabAvailablePanelHeight,
  type StyleLabInstanceOverride,
  type StyleLabScope,
  type StyleLabOverrides,
  type StyleLabPanelPosition,
} from "./style-lab-runtime";

const SELECT_CLASS = "h-8 min-w-0 flex-1 rounded-lg border border-[#e6e0f4] bg-white px-2 text-xs text-[#3f3856] outline-none focus:border-[#c9bcff] dark:border-white/10 dark:bg-white/[0.06] dark:text-white";
const INPUT_CLASS = "h-8 min-w-0 flex-1 rounded-lg border border-[#e6e0f4] bg-white px-2 text-xs text-[#3f3856] outline-none focus:border-[#c9bcff] disabled:cursor-not-allowed disabled:opacity-55 dark:border-white/10 dark:bg-white/[0.06] dark:text-white";

export function StyleLabPanel({
  inspectionActive,
  instanceOverride,
  matchCount,
  onCopySpec,
  onDisable,
  onResetAll,
  onResetRole,
  onSetOverride,
  onSetIcon,
  onSetPreviewText,
  onPanelPositionChange,
  onScopeChange,
  onToggleInspection,
  role,
  overrides,
  copyStatus,
  panelPosition,
  scope,
}: {
  copyStatus: string | null;
  inspectionActive: boolean;
  instanceOverride: StyleLabInstanceOverride | null;
  matchCount: number;
  onCopySpec: () => void;
  onDisable: () => void;
  onResetAll: () => void;
  onResetRole: () => void;
  onSetOverride: (propertyId: StyleLabPropertyId, value: string) => void;
  onSetIcon: (value: string) => void;
  onSetPreviewText: (value: string) => void;
  onPanelPositionChange: (position: StyleLabPanelPosition) => void;
  onScopeChange: (scope: StyleLabScope) => void;
  onToggleInspection: () => void;
  overrides: StyleLabOverrides;
  panelPosition: StyleLabPanelPosition | null;
  role: StyleLabRole | null;
  scope: StyleLabScope;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelHeaderRef = useRef<HTMLDivElement | null>(null);
  const panelBodyRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ offsetX: number; offsetY: number; pointerId: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [iconQuery, setIconQuery] = useState("");
  const [availablePanelHeight, setAvailablePanelHeight] = useState<number | null>(null);
  const filteredIconOptions = useMemo(() => {
    const normalizedQuery = iconQuery.trim().toLowerCase();
    if (!normalizedQuery) return STYLE_LAB_ICON_OPTIONS;
    return STYLE_LAB_ICON_OPTIONS.filter((option) => `${option.label} ${option.key} ${option.keywords.join(" ")}`.toLowerCase().includes(normalizedQuery));
  }, [iconQuery]);

  useLayoutEffect(() => {
    const getViewportHeight = () => window.visualViewport?.height ?? window.innerHeight;
    const normalizeCurrentPosition = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      const viewportHeight = getViewportHeight();
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const naturalHeight = Math.max(
        rect.height,
        (panelHeaderRef.current?.getBoundingClientRect().height ?? 0)
          + (panelBodyRef.current?.scrollHeight ?? 0)
          + 24,
      );
      const normalizedPosition = normalizeStyleLabPanelPosition(
        panelPosition ?? { left: rect.left, top: rect.top },
        viewportWidth,
        viewportHeight,
        rect.width,
        naturalHeight,
      );
      const nextTop = normalizedPosition.top;
      setAvailablePanelHeight(getStyleLabAvailablePanelHeight(viewportHeight, nextTop));
      if (panelPosition?.left !== normalizedPosition.left || panelPosition?.top !== normalizedPosition.top) {
        onPanelPositionChange(normalizedPosition);
      }
    };

    const frameId = window.requestAnimationFrame(normalizeCurrentPosition);
    window.addEventListener("resize", normalizeCurrentPosition);
    window.visualViewport?.addEventListener("resize", normalizeCurrentPosition);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(normalizeCurrentPosition);
    if (panelRef.current) resizeObserver?.observe(panelRef.current);
    if (panelBodyRef.current) resizeObserver?.observe(panelBodyRef.current);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", normalizeCurrentPosition);
      window.visualViewport?.removeEventListener("resize", normalizeCurrentPosition);
      resizeObserver?.disconnect();
    };
  }, [onPanelPositionChange, panelPosition, role?.id, scope, matchCount, instanceOverride?.iconPreviewEligible, instanceOverride?.previewTextEligible, filteredIconOptions.length]);

  const fallbackPanelTop = Math.max(16, panelPosition?.top ?? 16);
  const panelMaxHeight = availablePanelHeight === null
    ? `calc(100dvh - ${fallbackPanelTop}px - 1rem)`
    : `${availablePanelHeight}px`;

  /* Keep the panel's measured remaining height separate from its persisted position. */
  const panelSurfaceStyle = {
    maxHeight: panelMaxHeight,
  };

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
      window.visualViewport?.width ?? window.innerWidth,
      window.visualViewport?.height ?? window.innerHeight,
      rect.width,
      Math.max(
        rect.height,
        (panelHeaderRef.current?.getBoundingClientRect().height ?? 0)
          + (panelBodyRef.current?.scrollHeight ?? 0)
          + 24,
      ),
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
        className="flex min-h-0 w-full flex-col overflow-hidden border-[#dcd2fa] bg-white/96 p-3 text-[#403a54] shadow-[0_20px_60px_rgba(81,61,168,0.2)] backdrop-blur dark:border-white/15 dark:bg-[#17132a]/96 dark:text-white/85"
        data-style-component={undefined}
        data-style-role={undefined}
        padding="none"
        style={panelSurfaceStyle}
        variant="floating"
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 bg-white/96 pb-1 dark:bg-[#17132a]/96" ref={panelHeaderRef}>
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
          <div className="flex shrink-0 items-center gap-1.5">
            <AdhdIconButton aria-label={inspectionActive ? "Stop Style Lab inspection" : "Start Style Lab inspection"} data-style-role={undefined} onClick={onToggleInspection} selected={inspectionActive} size="sm" tone="purple">
              {inspectionActive ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
            </AdhdIconButton>
            <button className="rounded-lg px-2 py-1 text-[10px] font-semibold text-[#8075a3] transition hover:bg-[#f3efff] hover:text-[#5d4bb6] dark:text-white/55 dark:hover:bg-white/10 dark:hover:text-white" onClick={onDisable} type="button">
              Disable
            </button>
          </div>
        </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5" ref={panelBodyRef}>
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

          <div className="mt-3 rounded-lg border border-[#e4dcfb] bg-[#fbfaff] px-2.5 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
            <label className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-[11px] font-semibold text-[#6f6785] dark:text-white/60">Scope</span>
              <select aria-label="Style Lab scope" className={SELECT_CLASS} onChange={(event) => onScopeChange(event.target.value as StyleLabScope)} value={scope}>
                <option value="role">All matching</option>
                <option value="instance">This one</option>
              </select>
            </label>
            <p className="mt-1.5 text-[10px] text-[#807898] dark:text-white/45">
              Scope: {scope === "instance" ? "this instance" : "semantic role"}
            </p>
            {scope === "instance" ? (
              <p className="mt-1 truncate text-[10px] text-[#807898] dark:text-white/45" title={instanceOverride?.originalText || undefined}>
                Selected: {instanceOverride?.originalText || "Selected rendered instance"}
              </p>
            ) : null}
          </div>

          {scope === "instance" ? (
            <div className="mt-3 rounded-lg border border-[#e4dcfb] bg-[#fbfaff] px-2.5 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-[11px] font-medium text-[#6f6785] dark:text-white/60">Original</span>
                <span className="min-w-0 truncate text-[11px] text-[#4f466c] dark:text-white/70">{instanceOverride?.originalText || "Not available"}</span>
              </div>
              <label className="mt-2 flex items-center gap-2">
                <span className="w-28 shrink-0 text-[11px] font-medium text-[#6f6785] dark:text-white/60">Preview text</span>
                <input
                  aria-label="Preview text"
                  className={INPUT_CLASS}
                  disabled={!instanceOverride?.previewTextEligible}
                  onChange={(event) => onSetPreviewText(event.target.value)}
                  placeholder={instanceOverride?.originalText || "Unavailable"}
                  type="text"
                  value={instanceOverride?.previewText ?? ""}
                />
              </label>
              {!instanceOverride?.previewTextEligible ? <p className="mt-1.5 text-[10px] text-[#9a91b1] dark:text-white/40">Preview text is unavailable for this element.</p> : null}
              {instanceOverride?.iconPreviewEligible ? (
                <div className="mt-3 border-t border-[#eae5f6] pt-2.5 dark:border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-[11px] font-medium text-[#6f6785] dark:text-white/60">Original icon</span>
                    <span className="min-w-0 truncate text-[11px] text-[#4f466c] dark:text-white/70">{instanceOverride.originalIconName || "unknown"}</span>
                  </div>
                  <label className="mt-2 flex items-center gap-2">
                    <span className="w-28 shrink-0 text-[11px] font-medium text-[#6f6785] dark:text-white/60">Preview icon</span>
                    <select aria-label="Preview icon" className={SELECT_CLASS} onChange={(event) => onSetIcon(event.target.value)} value={instanceOverride.previewIconName ?? ""}>
                      <option value="">Original icon</option>
                      {filteredIconOptions.map((option) => (
                        <option key={option.key} value={option.key}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-2 flex items-center gap-2">
                    <span className="w-28 shrink-0 text-[11px] font-medium text-[#6f6785] dark:text-white/60">Search icons</span>
                    <span className="relative min-w-0 flex-1">
                      <Search aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8d82b6]" />
                      <input aria-label="Search icons" className={`${INPUT_CLASS} pl-7`} onChange={(event) => setIconQuery(event.target.value)} placeholder="Search icons" type="search" value={iconQuery} />
                    </span>
                  </label>
                  {instanceOverride.previewIconName ? (
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#e4dcfb] bg-white px-2 py-1 text-[10px] font-semibold text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.06] dark:text-[#cabfff]">
                      <TaskTypeIcon aria-hidden="true" className="h-3.5 w-3.5" iconKey={instanceOverride.previewIconName} />
                      {STYLE_LAB_ICON_OPTIONS.find((option) => option.key === instanceOverride.previewIconName)?.label ?? instanceOverride.previewIconName}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 grid gap-2">
            {role.capabilities.map((propertyId) => {
              const property = getStyleLabProperty(propertyId);
              if (!property) return null;
              const activeOverrides = scope === "instance" ? instanceOverride?.overrides : overrides[role.id];
              if (property.id === "backgroundColor") {
                return (
                  <div className="flex items-start gap-2" key={property.id}>
                    <span className="w-28 shrink-0 pt-1 text-[11px] font-medium text-[#6f6785] dark:text-white/60">{property.label}</span>
                    <StyleLabColorPalette
                      onChange={(value) => onSetOverride(property.id, value)}
                      value={activeOverrides?.[property.id] ?? ""}
                    />
                  </div>
                );
              }
              return (
                <label className="flex items-center gap-2" key={property.id}>
                  <span className="w-28 shrink-0 text-[11px] font-medium text-[#6f6785] dark:text-white/60">{property.label}</span>
                  <select
                    className={SELECT_CLASS}
                    onChange={(event) => onSetOverride(property.id, event.target.value)}
                    value={activeOverrides?.[property.id] ?? ""}
                  >
                    <option value="">Default</option>
                    {property.values.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <AdhdChip data-style-role={undefined} onClick={onResetRole} type="button">{scope === "instance" ? "Reset this instance" : "Reset role"}</AdhdChip>
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
      </div>
      </AdhdPanel>
    </div>
  );
}
