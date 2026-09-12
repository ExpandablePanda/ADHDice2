"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { AdhdChip, AdhdDropdownPanel } from "@/components/ui-system";
import { getTaskAttentionNotification, type TaskAttentionReason } from "@/lib/task-attention";

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
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const generatedId = useId().replace(/:/g, "");
  const popoverId = `task-attention-popover-${taskId}-${generatedId}`;
  const headingId = `${popoverId}-heading`;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (!reason) {
    return null;
  }

  const notification = getTaskAttentionNotification(reason, dueOn);
  return (
    <span className="relative inline-flex" ref={rootRef}>
      <AdhdChip
        aria-controls={isOpen ? popoverId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="text-[11px]"
        icon={<Bell aria-hidden="true" className="h-3 w-3" />}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((current) => !current);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        tone="danger"
      >
        Attention
      </AdhdChip>
      {isOpen ? (
        <AdhdDropdownPanel
          aria-labelledby={headingId}
          className="w-64 p-3"
          id={popoverId}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          role="dialog"
        >
          <div className="grid gap-1">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6f57f6] dark:text-[#cabfff]" id={headingId}>
              Needs Attention
            </p>
            <p className="text-sm font-semibold text-[#2e3650] dark:text-white/90">{notification.title}</p>
            <p className="text-xs leading-5 text-[#69738d] dark:text-white/65">{notification.description}</p>
          </div>
        </AdhdDropdownPanel>
      ) : null}
    </span>
  );
}
