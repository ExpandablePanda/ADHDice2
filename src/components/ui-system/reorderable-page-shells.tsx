"use client";

import { Check, GripVertical, PanelsTopLeft, RotateCcw } from "lucide-react";
import { Children, isValidElement, useMemo, useRef, useState, type PointerEvent, type ReactElement, type ReactNode } from "react";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdIconButton } from "@/components/ui-system/adhd-icon-button";
import type { PageShellLayoutState } from "@/hooks/usePageShellLayout";
import { reorderPageShellOrder } from "@/lib/page-shell-layout";

export type PageShellProps = {
  className?: string;
  id: string;
  label: string;
  children: ReactNode;
};

type ReorderablePageShell = {
  className?: string;
  id: string;
  label: string;
  node: ReactNode;
};

type ReorderablePageShellsProps = {
  children: ReactNode;
  layout: PageShellLayoutState;
  shellsClassName?: string;
};

export function PageShell({ children }: PageShellProps) {
  return <>{children}</>;
}

export function PageShellLayoutControls({ layout }: { layout: PageShellLayoutState }) {
  if (!layout.canEdit) return null;
  if (layout.isEditing) {
    return (
      <>
        <AdhdChip aria-label="Reset Layout" icon={<RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />} onClick={layout.reset} title="Reset Layout" type="button">
          Reset Layout
        </AdhdChip>
        <AdhdChip aria-label="Done" icon={<Check aria-hidden="true" className="h-3.5 w-3.5" />} onClick={layout.finishEditing} tone="purple" title="Done" type="button">
          Done
        </AdhdChip>
      </>
    );
  }
  return (
    <AdhdIconButton aria-label="Edit page layout" onClick={layout.startEditing} size="sm" title="Edit layout" tone="ghost" variant="rowToolbar">
      <PanelsTopLeft aria-hidden="true" />
    </AdhdIconButton>
  );
}

export function ReorderablePageShells({ children, layout, shellsClassName = "grid gap-3" }: ReorderablePageShellsProps) {
  const shellElements = useMemo(
    () => Children.toArray(children).filter((child): child is ReactElement<PageShellProps> => isValidElement(child)),
    [children],
  );
  const shells = useMemo(
    () => shellElements.map((element) => ({ className: element.props.className, id: element.props.id, label: element.props.label, node: element.props.children })),
    [shellElements],
  );
  const shellsById = useMemo(() => new Map(shells.map((shell) => [shell.id, shell])), [shells]);
  const orderedShells = layout.order.map((id) => shellsById.get(id)).filter((shell): shell is ReorderablePageShell => Boolean(shell));
  const shellRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragRef = useRef<{ id: string; pointerId: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function updatePreview(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const candidates = orderedShells
      .filter((shell) => shell.id !== drag.id)
      .map((shell) => {
        const element = shellRefs.current[shell.id];
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const horizontalDistance = event.clientX < rect.left ? rect.left - event.clientX : event.clientX > rect.right ? event.clientX - rect.right : 0;
        const verticalDistance = event.clientY < rect.top ? rect.top - event.clientY : event.clientY > rect.bottom ? event.clientY - rect.bottom : 0;
        return { distance: horizontalDistance + verticalDistance, id: shell.id };
      })
      .filter((candidate): candidate is { distance: number; id: string } => Boolean(candidate))
      .sort((left, right) => left.distance - right.distance);
    const target = candidates[0];
    const nextOrder = target
      ? reorderPageShellOrder(layout.order, drag.id, target.id)
      : [...layout.order.filter((id) => id !== drag.id), drag.id];
    if (nextOrder.some((id, index) => id !== layout.order[index])) {
      layout.setOrder(nextOrder);
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>, id: string) {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { id, pointerId: event.pointerId };
    setDraggingId(id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
    setDraggingId(null);
  }

  return (
    <div className={shellsClassName} data-page-shell-layout={layout.pageKey} data-page-shell-edit-mode={layout.isEditing ? "true" : "false"}>
      {orderedShells.map((shell) => (
        <div
          className={`min-w-0 transition-transform ${layout.isEditing ? "relative" : ""} ${draggingId === shell.id ? "z-10 opacity-75" : ""} ${shell.className ?? ""}`}
          data-page-shell-id={shell.id}
          data-page-shell-dragging={draggingId === shell.id ? "true" : "false"}
          key={shell.id}
          ref={(element) => { shellRefs.current[shell.id] = element; }}
        >
          {layout.isEditing ? (
            <button
              aria-label={`Drag ${shell.label}`}
              className="absolute right-3 top-3 z-20 flex h-8 w-8 cursor-grab touch-none items-center justify-center rounded-full border border-[#d8d0f5] bg-[#faf8ff]/95 text-[#6f57f6] shadow-sm hover:bg-[#eee9ff] active:cursor-grabbing dark:border-white/15 dark:bg-[#211a38]/95 dark:text-[#cabfff] dark:hover:bg-white/10"
              onPointerCancel={handlePointerUp}
              onPointerDown={(event) => handlePointerDown(event, shell.id)}
              onPointerMove={updatePreview}
              onPointerUp={handlePointerUp}
              title={`Drag ${shell.label}`}
              type="button"
            >
              <GripVertical aria-hidden="true" className="h-4 w-4" />
            </button>
          ) : null}
          {shell.node}
        </div>
      ))}
    </div>
  );
}
