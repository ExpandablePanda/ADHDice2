import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function ModalShell({
  children,
  className,
  onClose,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  onClose?: () => void;
  label?: string;
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
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (focusable[0] ?? el).focus();
  }, []);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && latestOnCloseRef.current) {
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
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      {onClose && (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-black/40"
          onClick={onClose}
        />
      )}
      <div
        aria-label={label}
        aria-modal="true"
        className={`relative ${className ?? ""}`}
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
