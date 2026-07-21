"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef } from "react";

const TASK_HIERARCHY_HOLD_MS = 600;
const TASK_HIERARCHY_HOLD_CANCEL_DISTANCE_PX = 8;
const TASK_HIERARCHY_TOGGLE_DESCRIPTION = "Click to toggle this Task. Hold to toggle all Steps in this view.";

export function TaskHierarchyChevronButton({
  buttonClassName,
  expanded,
  iconClassName = "h-3.5 w-3.5",
  onToggle,
  onToggleAll,
}: {
  buttonClassName: string;
  expanded: boolean;
  iconClassName?: string;
  onToggle: () => void;
  onToggleAll: () => void;
}) {
  const sessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    target: HTMLButtonElement;
    timer: number | null;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const cancelPendingHold = (pointerId?: number) => {
    const session = sessionRef.current;
    if (!session || (pointerId !== undefined && session.pointerId !== pointerId)) return;
    sessionRef.current = null;
    if (session.timer !== null) window.clearTimeout(session.timer);
    if (session.target.hasPointerCapture(session.pointerId)) session.target.releasePointerCapture(session.pointerId);
  };

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelPendingHold();
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      cancelPendingHold();
    };
  }, []);

  return (
    <button
      aria-expanded={expanded}
      aria-label={TASK_HIERARCHY_TOGGLE_DESCRIPTION}
      className={`${buttonClassName} adhdice-native-interaction-suppressed`}
      draggable={false}
      onClick={(event) => {
        event.stopPropagation();
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        onToggle();
      }}
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      onLostPointerCapture={(event) => cancelPendingHold(event.pointerId)}
      onPointerCancel={(event) => cancelPendingHold(event.pointerId)}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (event.pointerType === "mouse" && event.button !== 0) return;
        cancelPendingHold();
        suppressClickRef.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
        const session = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          target: event.currentTarget,
          timer: null as number | null,
        };
        sessionRef.current = session;
        session.timer = window.setTimeout(() => {
          if (sessionRef.current !== session) return;
          session.timer = null;
          suppressClickRef.current = true;
          onToggleAll();
        }, TASK_HIERARCHY_HOLD_MS);
      }}
      onPointerMove={(event) => {
        const session = sessionRef.current;
        if (session?.pointerId === event.pointerId
          && Math.hypot(event.clientX - session.startX, event.clientY - session.startY) > TASK_HIERARCHY_HOLD_CANCEL_DISTANCE_PX) {
          cancelPendingHold(event.pointerId);
        }
      }}
      onPointerUp={(event) => cancelPendingHold(event.pointerId)}
      title={TASK_HIERARCHY_TOGGLE_DESCRIPTION}
      type="button"
    >
      <ChevronDown className={`${iconClassName} transition-transform ${expanded ? "rotate-180" : ""}`} />
    </button>
  );
}
