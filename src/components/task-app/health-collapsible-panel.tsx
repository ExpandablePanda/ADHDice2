"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  AdhdPanel,
  type AdhdPanelPadding,
  type AdhdPanelVariant,
} from "@/components/ui-system/adhd-panel";

export function HealthCollapsiblePanel({
  children,
  className,
  defaultOpen = true,
  header,
  onOpenChange,
  padding,
  subtitle,
  title,
  variant,
}: {
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  header?: ReactNode;
  onOpenChange?: (isOpen: boolean) => void;
  padding?: AdhdPanelPadding;
  subtitle?: ReactNode;
  title: ReactNode;
  variant?: AdhdPanelVariant;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <AdhdPanel
      className={className}
      header={(
        <button
          aria-expanded={isOpen}
          className="flex w-full items-start justify-between gap-3 text-left"
          onClick={() => setIsOpen((current) => {
            const next = !current;
            onOpenChange?.(next);
            return next;
          })}
          type="button"
        >
          <span className="flex min-w-0 items-start gap-3">
            {header}
            <span className="min-w-0">
              <span className="block text-[11px] font-medium uppercase tracking-[0.22em] text-[#9b92be] dark:text-white/35">
                {title}
              </span>
              {subtitle !== undefined ? (
                <span className="mt-1 block text-sm leading-6 text-[#7d7598] dark:text-white/55">
                  {subtitle}
                </span>
              ) : null}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`mt-0.5 h-4 w-4 shrink-0 text-[#8d87a7] transition-transform dark:text-white/45 ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
      )}
      padding={padding}
      variant={variant}
    >
      {isOpen ? <div className="mt-4">{children}</div> : null}
    </AdhdPanel>
  );
}
