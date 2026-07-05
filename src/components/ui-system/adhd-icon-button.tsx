"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type AdhdIconButtonSize = "sm" | "md" | "lg";
export type AdhdIconButtonTone = "default" | "purple" | "danger" | "ghost";
export type AdhdIconButtonVariant = "default" | "rowToolbar";

const ICON_BUTTON_SIZE_CLASS: Record<AdhdIconButtonSize, string> = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-10 w-10",
};

const ICON_BUTTON_ICON_CLASS: Record<AdhdIconButtonSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-4.5 w-4.5",
};

const ROW_TOOLBAR_BUTTON_SIZE_CLASS: Record<AdhdIconButtonSize, string> = {
  sm: "h-7 w-7",
  md: "h-8 w-8",
  lg: "h-9 w-9",
};

const ROW_TOOLBAR_ICON_CLASS: Record<AdhdIconButtonSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-4.5 w-4.5",
};

const ICON_BUTTON_TONE_CLASS: Record<AdhdIconButtonTone, string> = {
  default:
    "border-[#ece8f8] bg-white text-[#66718c] hover:border-[#d9cffb] hover:bg-[#f7f3ff] hover:text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60 dark:hover:border-white/20 dark:hover:bg-white/[0.08] dark:hover:text-[#cabfff]",
  purple:
    "border-[#d9cffb] bg-[#f7f3ff] text-[#6f57f6] hover:border-[#cdbfff] hover:bg-[#f2ebff] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff] dark:hover:border-[#5a458f] dark:hover:bg-[#2b1d46]",
  danger:
    "border-[#f3d7de] bg-[#fff5f7] text-[#d65775] hover:border-[#efc3cf] hover:bg-[#ffedf1] dark:border-[#5f2a36] dark:bg-[#32161d] dark:text-[#ffb0c1] dark:hover:border-[#7a3343] dark:hover:bg-[#3b1922]",
  ghost:
    "border-transparent bg-transparent text-[#7b7591] hover:border-[#e8e1f5] hover:bg-[#f8f5ff] hover:text-[#6f57f6] dark:text-white/58 dark:hover:border-white/10 dark:hover:bg-white/[0.06] dark:hover:text-[#cabfff]",
};

const ICON_BUTTON_SELECTED_CLASS: Record<Exclude<AdhdIconButtonTone, "ghost">, string> = {
  default: "border-[#d9cffb] bg-[#f7f3ff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]",
  purple: "border-[#cdbfff] bg-[#efe6ff] text-[#5f45f0] dark:border-[#5a458f] dark:bg-[#2b1d46] dark:text-[#d6ccff]",
  danger: "border-[#efc3cf] bg-[#ffecef] text-[#c63f60] dark:border-[#7a3343] dark:bg-[#3b1922] dark:text-[#ffc3cf]",
};

const ROW_TOOLBAR_TONE_CLASS: Record<Exclude<AdhdIconButtonTone, "ghost">, string> = {
  default:
    "border-transparent bg-transparent text-[#6f57f6] opacity-78 hover:border-[#ddd2ff] hover:bg-[#f3efff] hover:opacity-100 dark:text-[#cabfff] dark:hover:border-[#42306f] dark:hover:bg-[#22193f]",
  purple:
    "border-transparent bg-transparent text-[#6f57f6] opacity-78 hover:border-[#ddd2ff] hover:bg-[#f3efff] hover:opacity-100 dark:text-[#cabfff] dark:hover:border-[#42306f] dark:hover:bg-[#22193f]",
  danger:
    "border-transparent bg-transparent text-[#d94e67] opacity-72 hover:border-[#ffd6de] hover:bg-[#fff1f3] hover:opacity-100 dark:text-[#ff9eaf] dark:hover:border-[#5b2e3b] dark:hover:bg-[#44232f]",
};

const ROW_TOOLBAR_SELECTED_CLASS: Record<Exclude<AdhdIconButtonTone, "ghost">, string> = {
  default: "border-[#ddd2ff] bg-[#f3efff] text-[#6f57f6] opacity-100 dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]",
  purple: "border-[#ddd2ff] bg-[#f3efff] text-[#6f57f6] opacity-100 dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]",
  danger: "border-[#ffd6de] bg-[#fff1f3] text-[#d94e67] opacity-100 dark:border-[#5b2e3b] dark:bg-[#44232f] dark:text-[#ff9eaf]",
};

export type AdhdIconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> & {
  "aria-label": string;
  children: ReactNode;
  className?: string;
  iconClassName?: string;
  selected?: boolean;
  size?: AdhdIconButtonSize;
  tone?: AdhdIconButtonTone;
  variant?: AdhdIconButtonVariant;
};

export function AdhdIconButton({
  "aria-label": ariaLabel,
  children,
  className,
  iconClassName,
  selected = false,
  size = "md",
  tone = "default",
  variant = "default",
  type,
  ...props
}: AdhdIconButtonProps) {
  const selectedClass = tone === "ghost"
    ? ICON_BUTTON_TONE_CLASS.purple
    : variant === "rowToolbar"
      ? ROW_TOOLBAR_SELECTED_CLASS[tone]
      : ICON_BUTTON_SELECTED_CLASS[tone];
  const baseClass = variant === "rowToolbar"
    ? "inline-flex flex-none items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 disabled:cursor-not-allowed disabled:opacity-55 dark:focus-visible:ring-[#3b2f68]/90"
    : "inline-flex items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f57f6]/30 disabled:cursor-not-allowed disabled:opacity-55";
  const sizeClass = variant === "rowToolbar" ? ROW_TOOLBAR_BUTTON_SIZE_CLASS[size] : ICON_BUTTON_SIZE_CLASS[size];
  const toneClass = selected
    ? selectedClass
    : tone === "ghost"
      ? ICON_BUTTON_TONE_CLASS.ghost
      : variant === "rowToolbar"
        ? ROW_TOOLBAR_TONE_CLASS[tone]
        : ICON_BUTTON_TONE_CLASS[tone];
  const resolvedIconClass = variant === "rowToolbar" ? ROW_TOOLBAR_ICON_CLASS[size] : ICON_BUTTON_ICON_CLASS[size];

  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={props["aria-pressed"] ?? selected}
      className={joinClasses(
        baseClass,
        sizeClass,
        toneClass,
        className,
      )}
      type={type ?? "button"}
      {...props}
    >
      <span className={joinClasses("inline-flex shrink-0 items-center justify-center", resolvedIconClass, iconClassName)}>
        {children}
      </span>
    </button>
  );
}
