"use client";

import { GripVertical } from "lucide-react";
import { Children, isValidElement, useMemo, useRef, useState, type PointerEvent, type ReactElement, type ReactNode } from "react";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { usePageSectionOrder } from "@/hooks/usePageSectionOrder";
import { reorderPageSectionOrder } from "@/lib/page-section-order";

export type PageSectionProps = {
  className?: string;
  id: string;
  label: string;
  children: ReactNode;
};

type ReorderablePageSection = {
  className?: string;
  id: string;
  label: string;
  node: ReactNode;
};

type ReorderablePageSectionsProps = {
  children: ReactNode;
  pageKey: string;
  sectionsClassName?: string;
  userId: string | null;
};

export function PageSection({ children }: PageSectionProps) {
  return <>{children}</>;
}

export function ReorderablePageSections({ children, pageKey, sectionsClassName = "grid gap-3", userId }: ReorderablePageSectionsProps) {
  const sectionElements = useMemo(
    () => Children.toArray(children).filter((child): child is ReactElement<PageSectionProps> => isValidElement(child)),
    [children],
  );
  const sections = useMemo(
    () => sectionElements.map((element) => ({ className: element.props.className, id: element.props.id, label: element.props.label, node: element.props.children })),
    [sectionElements],
  );
  const defaultIds = useMemo(() => sections.map((section) => section.id), [sections]);
  const { order, reset, setOrder } = usePageSectionOrder(userId, pageKey, defaultIds);
  const [isArrangeMode, setIsArrangeMode] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragRef = useRef<{ id: string; pointerId: number } | null>(null);
  const sectionsById = useMemo(() => new Map(sections.map((section) => [section.id, section])), [sections]);
  const orderedSections = order.map((id) => sectionsById.get(id)).filter((section): section is ReorderablePageSection => Boolean(section));

  function updatePreview(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const target = orderedSections.find((section) => {
      if (section.id === drag.id) return false;
      const element = sectionRefs.current[section.id];
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });
    const nextOrder = target
      ? reorderPageSectionOrder(order, drag.id, target.id)
      : [...order.filter((id) => id !== drag.id), drag.id];
    if (nextOrder.some((id, index) => id !== order[index])) {
      setOrder(nextOrder);
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
    <div className="grid gap-3" data-page-section-layout={pageKey} data-page-section-arrange-mode={isArrangeMode ? "true" : "false"}>
      <div className="flex flex-wrap justify-end gap-2">
        {isArrangeMode ? (
          <>
            <AdhdChip onClick={reset} type="button">Reset to default</AdhdChip>
            <AdhdChip onClick={() => { setDraggingId(null); setIsArrangeMode(false); }} tone="purple" type="button">Done</AdhdChip>
          </>
        ) : (
          <AdhdChip aria-label={"Arrange " + pageKey + " sections"} onClick={() => setIsArrangeMode(true)} type="button">Arrange</AdhdChip>
        )}
      </div>
      <div className={sectionsClassName}>
      {orderedSections.map((section) => (
        <div
          className={"min-w-0 transition-transform " + (section.className ?? "") + (draggingId === section.id ? " relative z-10 opacity-75" : "")}
          data-page-section-id={section.id}
          key={section.id}
          ref={(element) => { sectionRefs.current[section.id] = element; }}
        >
          {isArrangeMode ? (
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-dashed border-[#d8d0f5] bg-[#faf8ff] px-2 py-1.5 dark:border-white/15 dark:bg-white/[0.03]">
              <button
                aria-label={"Drag " + section.label}
                className="flex h-8 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-[#6f57f6] hover:bg-[#eee9ff] active:cursor-grabbing dark:text-[#cabfff] dark:hover:bg-white/10"
                onPointerCancel={handlePointerUp}
                onPointerDown={(event) => handlePointerDown(event, section.id)}
                onPointerMove={updatePreview}
                onPointerUp={handlePointerUp}
                type="button"
              >
                <GripVertical aria-hidden="true" className="h-4 w-4" />
              </button>
              <span className="text-xs font-semibold text-[#6f57f6] dark:text-[#cabfff]">{section.label}</span>
            </div>
          ) : null}
          {section.node}
        </div>
      ))}
      </div>
    </div>
  );
}
