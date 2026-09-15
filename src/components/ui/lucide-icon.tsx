"use client";

import { Code2, ListTodo } from "lucide-react";
import { createElement, useEffect, useState, type ComponentType, type SVGProps } from "react";
import { isLucideIconName, loadLucideIcon, type RawLucideIconName } from "@/lib/lucide-icon";
import { resolveTaskTypeIcon, TASK_TYPE_ICON_OPTIONS } from "@/lib/task-type-presentation";

export function RawLucideIcon({
  fallback: Fallback = Code2,
  name,
  ...props
}: {
  fallback?: ComponentType<SVGProps<SVGSVGElement>>;
  name: RawLucideIconName;
} & SVGProps<SVGSVGElement>) {
  const [IconComponent, setIconComponent] = useState<ComponentType<SVGProps<SVGSVGElement>> | null>(null);

  useEffect(() => {
    let cancelled = false;

    void loadLucideIcon(name).then((nextIcon) => {
      if (!cancelled) {
        setIconComponent(() => nextIcon);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [name]);

  return IconComponent
    ? createElement(IconComponent, props)
    : <Fallback {...props} />;
}

export function TaskTypeIcon({ iconKey, ...props }: { iconKey: unknown } & SVGProps<SVGSVGElement>) {
  const featuredIcon = resolveTaskTypeIcon(iconKey);
  const featuredOption = TASK_TYPE_ICON_OPTIONS.find((option) => option.key === iconKey);
  if (!featuredOption?.icon && isLucideIconName(iconKey)) {
    return <RawLucideIcon fallback={ListTodo} name={iconKey} {...props} />;
  }
  return createElement(featuredIcon, props);
}
