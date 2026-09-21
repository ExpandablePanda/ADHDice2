"use client";

import { isValidElement, useEffect, useRef, useState, type ReactNode, type SVGProps } from "react";
import { TaskTypeIcon } from "@/components/ui/lucide-icon";
import { isStyleLabIconName } from "./style-lab-registry";
import { STYLE_LAB_ICON_PREVIEW_EVENT } from "./style-lab-runtime";

export function StyleLabIconPreviewSlot({
  children,
  iconName,
}: {
  children: ReactNode;
  iconName?: string;
}) {
  const iconPartRef = useRef<HTMLSpanElement | null>(null);
  const [previewIconName, setPreviewIconName] = useState<string | null>(null);
  const originalIconProps = isValidElement<SVGProps<SVGSVGElement>>(children) ? children.props : {};

  useEffect(() => {
    const iconPart = iconPartRef.current;
    if (!iconPart) return;
    const handlePreviewEvent = (event: Event) => {
      const nextIconName = (event as CustomEvent<{ iconName?: unknown }>).detail?.iconName;
      setPreviewIconName(isStyleLabIconName(nextIconName) ? nextIconName : null);
    };
    iconPart.addEventListener(STYLE_LAB_ICON_PREVIEW_EVENT, handlePreviewEvent);
    return () => iconPart.removeEventListener(STYLE_LAB_ICON_PREVIEW_EVENT, handlePreviewEvent);
  }, []);

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      data-style-icon-name={isStyleLabIconName(iconName) ? iconName : undefined}
      data-style-part="icon"
      ref={iconPartRef}
    >
      {previewIconName ? <TaskTypeIcon iconKey={previewIconName} {...originalIconProps} /> : children}
    </span>
  );
}
