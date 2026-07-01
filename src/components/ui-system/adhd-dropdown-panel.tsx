"use client";

import type { HTMLAttributes, ReactNode } from "react";

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type AdhdDropdownPanelProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  widthClassName?: string;
};

export function AdhdDropdownPanel({
  children,
  className,
  widthClassName,
  ...props
}: AdhdDropdownPanelProps) {
  return (
    <div
      className={joinClasses(
        "absolute left-0 top-[calc(100%+0.55rem)] z-30 rounded-[1.25rem] border border-[#ede6ff] bg-white/95 p-2 text-left shadow-[0_20px_60px_rgba(111,87,246,0.16)] backdrop-blur dark:border-white/10 dark:bg-[#1b1530]/95",
        widthClassName,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
