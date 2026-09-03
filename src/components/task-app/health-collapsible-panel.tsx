"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  AdhdPanel,
  type AdhdPanelPadding,
  type AdhdPanelVariant,
} from "@/components/ui-system/adhd-panel";
import { PageShellBody } from "@/components/ui-system/reorderable-page-shells";

export function HealthCollapsiblePanel({
  children,
  className,
  defaultOpen = true,
  header,
  open,
  onOpenChange,
  padding,
  shellSurface = false,
  subtitle,
  title,
  variant,
}: {
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  header?: ReactNode;
  open?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  padding?: AdhdPanelPadding;
  shellSurface?: boolean;
  subtitle?: ReactNode;
  title: ReactNode;
  variant?: AdhdPanelVariant;
}) {
  const [uncontrolledIsOpen, setUncontrolledIsOpen] = useState(defaultOpen);
  const isOpen = open ?? uncontrolledIsOpen;

  return (
    <AdhdPanel
      className={`${shellSurface ? "page-shell-surface flex h-full min-h-0 flex-col overflow-hidden" : ""} ${className ?? ""}`.trim()}
      header={(
        <button
          aria-expanded={isOpen}
          className={`flex w-full items-start justify-between gap-3 text-left ${shellSurface ? "shrink-0" : ""}`}
          onClick={() => {
            const next = !isOpen;
            if (open === undefined) {
              setUncontrolledIsOpen(next);
            }
            onOpenChange?.(next);
          }}
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
      {isOpen ? shellSurface ? <PageShellBody className="mt-4">{children}</PageShellBody> : <div className="mt-4">{children}</div> : null}
    </AdhdPanel>
  );
}
