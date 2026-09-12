"use client";

import { createPortal } from "react-dom";
import { useLayoutEffect, useId, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { AdhdDropdownPanel, AdhdIconButton } from "@/components/ui-system";
import { getTaskAttentionNotification, type TaskAttentionReason } from "@/lib/task-attention";

const VIEWPORT_MARGIN = 8;
const PANEL_GAP = 6;
const ESTIMATED_PANEL_WIDTH = 256;
const ESTIMATED_PANEL_HEIGHT = 132;

function getPanelPosition(trigger: HTMLElement, panelWidth = ESTIMATED_PANEL_WIDTH, panelHeight = ESTIMATED_PANEL_HEIGHT) {
  const rect = trigger.getBoundingClientRect();
  const boundedPanelWidth = Math.min(panelWidth, Math.max(0, window.innerWidth - VIEWPORT_MARGIN * 2));
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(rect.left, window.innerWidth - boundedPanelWidth - VIEWPORT_MARGIN),
  );
  const belowTop = rect.bottom + PANEL_GAP;
  const top = belowTop + panelHeight <= window.innerHeight - VIEWPORT_MARGIN
    ? belowTop
    : Math.max(VIEWPORT_MARGIN, rect.top - panelHeight - PANEL_GAP);
  return { left, top };
}

export function TaskAttentionChip({
  dueOn,
  reason,
  taskId,
}: {
  dueOn: string | null;
  reason?: TaskAttentionReason | null;
  taskId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const generatedId = useId().replace(/:/g, "");
  const popoverId = `task-attention-popover-${taskId}-${generatedId}`;
  const headingId = `${popoverId}-heading`;
  const notification = reason ? getTaskAttentionNotification(reason, dueOn) : null;

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        setIsOpen(false);
        return;
      }
      const panel = panelRef.current;
      setPanelPosition(getPanelPosition(trigger, panel?.offsetWidth, panel?.offsetHeight));
    };

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
      }
    }

    const closeOnViewportChange = () => setIsOpen(false);
    updatePosition();
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [isOpen]);

  if (!notification) {
    return null;
  }

  return (
    <span className="inline-flex" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <AdhdIconButton
        aria-controls={isOpen ? popoverId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`Needs attention: ${notification.title}`}
        onClick={(event) => {
          event.stopPropagation();
          if (isOpen) {
            setIsOpen(false);
            return;
          }
          const trigger = triggerRef.current;
          if (!trigger) return;
          setPanelPosition(getPanelPosition(trigger));
          setIsOpen(true);
        }}
        ref={triggerRef}
        size="sm"
        tone="warning"
        variant="rowToolbar"
      >
        <Bell aria-hidden="true" />
      </AdhdIconButton>
      {isOpen && panelPosition && typeof document !== "undefined" ? createPortal(
        <AdhdDropdownPanel
          aria-labelledby={headingId}
          className="z-[160] max-w-[calc(100vw-1rem)] p-3"
          id={popoverId}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          ref={panelRef}
          role="dialog"
          style={{ left: panelPosition.left, position: "fixed", top: panelPosition.top, zIndex: 160 }}
          widthClassName="w-64"
        >
          <div className="grid gap-1">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6f57f6] dark:text-[#cabfff]" id={headingId}>
              Needs Attention
            </p>
            <p className="text-sm font-semibold text-[#2e3650] dark:text-white/90">{notification.title}</p>
            <p className="text-xs leading-5 text-[#69738d] dark:text-white/65">{notification.description}</p>
          </div>
        </AdhdDropdownPanel>,
        document.body,
      ) : null}
    </span>
  );
}
