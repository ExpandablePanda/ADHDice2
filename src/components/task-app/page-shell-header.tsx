"use client";

import type { ReactNode } from "react";

export function PageShellHeader({
  actions,
  subtitle,
  title,
}: {
  actions?: ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 pb-6 pt-[5px]">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8e88a9] dark:text-white/40">
          {subtitle}
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-[#17203a] dark:text-white">
          {title}
        </h1>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
