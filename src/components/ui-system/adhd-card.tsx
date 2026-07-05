"use client";

import type { HTMLAttributes, ReactNode } from "react";

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type AdhdCardPadding = "sm" | "md" | "lg";

const CARD_PADDING_CLASS: Record<AdhdCardPadding, string> = {
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
};

export type AdhdCardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  className?: string;
  highlighted?: boolean;
  interactive?: boolean;
  padding?: AdhdCardPadding;
  selected?: boolean;
};

export function AdhdCard({
  children,
  className,
  highlighted = false,
  interactive = false,
  padding = "md",
  selected = false,
  ...props
}: AdhdCardProps) {
  return (
    <article
      className={joinClasses(
        "rounded-[1.35rem] border text-[#5f5876] shadow-[0_16px_38px_rgba(81,61,168,0.06)] transition dark:text-white/78",
        highlighted
          ? "border-[#ddd2ff] bg-[#efe6ff] dark:border-[#5a458f] dark:bg-[#2b1d46]"
          : selected
            ? "border-[#d8d1ef] bg-white/92 ring-2 ring-[#e7e0fb] ring-offset-0 dark:border-[#4f466d] dark:bg-white/[0.05] dark:ring-[#342b50]"
            : "border-[#ece8f8] bg-white/92 dark:border-white/10 dark:bg-white/[0.05]",
        interactive && !highlighted
          ? "cursor-pointer hover:border-[#ddd2fb] hover:bg-white dark:hover:border-white/15"
          : "",
        CARD_PADDING_CLASS[padding],
        className,
      )}
      {...props}
    >
      {children}
    </article>
  );
}
