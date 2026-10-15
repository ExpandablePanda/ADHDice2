"use client";

import { AdhdPanel } from "@/components/ui-system";
import { getMasterTabLabel } from "@/components/task-app/master-workspace-tab-bar";
import type { MasterWorkspacePanel } from "@/lib/master-workspace-state";

export function MasterWorkspaceShortcutGuide({ panel }: { panel: MasterWorkspacePanel }) {
  const activeTab = panel.tabs.find((tab) => tab.id === panel.activeTabId);
  const windowLabel = panel.side === "left" ? "Window 1" : "Window 2";

  return (
    <AdhdPanel
      aria-label={`Shortcut Mode for ${windowLabel}`}
      className="max-h-[60vh] w-[min(22rem,100%)] overflow-y-auto"
      data-master-workspace-shortcut-guide
      padding="sm"
      role="region"
      variant="floating"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[#30294b] dark:text-white">Shortcut Mode · {windowLabel}</h2>
          <p className="mt-1 text-[11px] leading-snug text-[#7d7597] dark:text-white/55">
            Press a number to open its master tab.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[#e4deef] bg-[#f8f5ff] px-2 py-1 text-[10px] font-medium text-[#756a9c] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/55">
          Esc to cancel
        </span>
      </div>
      <ol className="mt-2 grid gap-1">
        {panel.tabs.slice(0, 9).map((tab, index) => {
          const isActive = tab.id === activeTab?.id;
          return (
            <li className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1" key={tab.id}>
              <kbd className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-[#e4deef] bg-white px-1 text-[11px] font-semibold tabular-nums text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.05] dark:text-[#cabfff]">
                {index + 1}
              </kbd>
              <span className={`min-w-0 flex-1 truncate text-xs ${isActive ? "font-semibold text-[#51418d] dark:text-[#d6ccff]" : "font-medium text-[#6f6880] dark:text-white/68"}`}>
                {getMasterTabLabel(tab)}
              </span>
              {isActive ? (
                <span aria-current="page" className="shrink-0 rounded-full bg-[#f1ecff] px-2 py-0.5 text-[10px] font-medium text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]">
                  Active
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[10px] leading-snug text-[#8a829f] dark:text-white/45">
        Shift + S again closes this guide.
      </p>
    </AdhdPanel>
  );
}
