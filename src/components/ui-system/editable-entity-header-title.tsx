"use client";

import type { KeyboardEvent } from "react";

export type EditableEntityHeaderTitleProps = {
  "aria-label": string;
  onCancel?: () => void;
  onChange: (value: string) => void;
  onCommit?: () => Promise<boolean | void> | boolean | void;
  placeholder: string;
  value: string;
};

const HEADER_TITLE_CLASS = "mt-1 w-full min-w-0 border-0 bg-transparent p-0 text-xl font-semibold text-[#403a54] outline-none placeholder:text-[#b5aec8] focus:ring-0 dark:text-white/88";

export function EditableEntityHeaderTitle({
  "aria-label": ariaLabel,
  onCancel,
  onChange,
  onCommit,
  placeholder,
  value,
}: EditableEntityHeaderTitleProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && onCommit) {
      event.preventDefault();
      void onCommit();
    } else if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <input
      aria-label={ariaLabel}
      className={HEADER_TITLE_CLASS}
      onBlur={onCommit ? () => { void onCommit(); } : undefined}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onCommit || onCancel ? handleKeyDown : undefined}
      placeholder={placeholder}
      value={value}
    />
  );
}
