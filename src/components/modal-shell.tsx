import React from "react";
import { createPortal } from "react-dom";

export function ModalShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <div className={className}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
