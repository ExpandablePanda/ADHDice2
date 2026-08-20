import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function ModalShell({
  children,
  className,
  onClose,
  label,
  mobileFocused = false,
  autoFocus = true,
}: {
  children: React.ReactNode;
  className?: string;
  onClose?: () => void;
  label?: string;
  mobileFocused?: boolean;
  autoFocus?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const latestOnCloseRef = useRef(onClose);

  useEffect(() => {
    latestOnCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    // Focus the first focusable element only on first mount so rerenders do not steal focus.
    if (!autoFocus) return;
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (focusable[0] ?? el).focus();
  }, [autoFocus]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented && latestOnCloseRef.current) {
        latestOnCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const focusableEls = Array.from(
        el.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusableEls.length === 0) return;
      const first = focusableEls[0];
      const last = focusableEls[focusableEls.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="adhdice-modal-viewport fixed inset-0 z-[140] flex justify-center">
      {onClose && (
        <div
          aria-hidden="true"
          className={`absolute inset-0 bg-black/40 ${mobileFocused ? "backdrop-blur-sm sm:backdrop-blur-none" : ""}`}
          onClick={onClose}
        />
      )}
      <div
        aria-label={label}
        aria-modal="true"
        className={`adhdice-modal-dialog relative ${className ?? ""}`}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
