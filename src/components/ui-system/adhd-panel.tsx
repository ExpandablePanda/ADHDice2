"use client";

import type { HTMLAttributes, ReactNode } from "react";

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type AdhdPanelVariant = "default" | "floating" | "subpanel";
export type AdhdPanelPadding = "none" | "sm" | "md" | "lg";
export type AdhdPanelElement = "div" | "section" | "article";

const PANEL_VARIANT_CLASS: Record<AdhdPanelVariant, string> = {
  default: "rounded-[1.25rem] border border-[#ede7f7] bg-white text-[#5f5876] shadow-[0_18px_45px_rgba(81,61,168,0.16)] dark:border-white/10 dark:bg-[#1b1530] dark:text-white/78",
  floating: "rounded-[1.25rem] border border-[#ede7f7] bg-white text-[#5f5876] shadow-[0_20px_60px_rgba(81,61,168,0.18)] backdrop-blur dark:border-white/10 dark:bg-[#1b1530]/95 dark:text-white/78",
  subpanel: "rounded-[1rem] border border-[#efe9ff] bg-[#fbfaff] text-[#6b6580] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/72",
};

const PANEL_PADDING_CLASS: Record<AdhdPanelPadding, string> = {
  none: "",
  sm: "p-3",
  md: "px-4 py-4",
  lg: "px-5 py-4",
};

export type AdhdPanelProps = HTMLAttributes<HTMLElement> & {
  as?: AdhdPanelElement;
  children: ReactNode;
  className?: string;
  header?: ReactNode;
  padding?: AdhdPanelPadding;
  subtitle?: ReactNode;
  title?: ReactNode;
  variant?: AdhdPanelVariant;
};

export function AdhdPanel({
  as = "section",
  children,
  className,
  header,
  padding = "lg",
  subtitle,
  title,
  variant = "default",
  ...props
}: AdhdPanelProps) {
  const Component = as;
  const hasBuiltInHeader = title !== undefined || subtitle !== undefined;

  return (
    <Component
      className={joinClasses(PANEL_VARIANT_CLASS[variant], PANEL_PADDING_CLASS[padding], className)}
      {...props}
    >
      {header}
      {hasBuiltInHeader ? (
        <div className={joinClasses(header ? "mt-4" : "", children ? "mb-4" : "")}>
          {title !== undefined ? (
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#9b92be] dark:text-white/35">
              {title}
            </p>
          ) : null}
          {subtitle !== undefined ? (
            <p className={joinClasses(title !== undefined ? "mt-1" : "", "text-sm leading-6 text-[#7d7598] dark:text-white/55")}>
              {subtitle}
            </p>
          ) : null}
        </div>
      ) : null}
      {children}
    </Component>
  );
}
