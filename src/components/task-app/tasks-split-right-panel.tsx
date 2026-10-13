"use client";

import type { ReactNode } from "react";

type TasksSplitLayoutProps = {
  active: boolean;
  left: ReactNode;
  right: ReactNode;
  splitRatio: number;
};

export function TasksSplitLayout({ active, left, right, splitRatio }: TasksSplitLayoutProps) {
  if (!active) return <>{left}</>;

  return (
    <div
      className="grid min-w-0 items-start gap-3"
      data-master-workspace-split="tasks"
      style={{ gridTemplateColumns: `minmax(0, ${splitRatio}fr) minmax(0, ${1 - splitRatio}fr)` }}
    >
      <section
        aria-label="Left Tasks panel"
        data-master-workspace-panel="left"
        className="adhdice-scrollbar max-h-[calc(100dvh-18rem)] min-h-64 min-w-0 overflow-y-auto overscroll-contain"
      >
        {left}
      </section>
      <section
        aria-label="Right Tasks panel"
        data-master-workspace-panel="right"
        className="adhdice-scrollbar max-h-[calc(100dvh-18rem)] min-h-64 min-w-0 overflow-y-auto overscroll-contain rounded-[1.5rem] border border-[#ece8f8] bg-white/55 p-3 dark:border-white/10 dark:bg-white/[0.025]"
      >
        {right}
      </section>
    </div>
  );
}
