"use client";

import { useState } from "react";
import { AdhdChip, AdhdDropdownPanel, AdhdIconButton } from "@/components/ui-system";
import type { AppPage } from "@/lib/task-ui-state";
import type { MasterWorkspaceTab } from "@/lib/master-workspace-state";
import { Plus, X } from "lucide-react";

const TOP_LEVEL_PAGES: AppPage[] = [
  "Home",
  "Tasks",
  "Focus",
  "Roll",
  "Achievements",
  "Health",
  "Games",
  "Stats",
  "Notes",
  "Settings",
  "Test",
];

function getMasterTabLabel(tab: MasterWorkspaceTab) {
  const destination = tab.destination;
  if (destination.kind === "page-shell") {
    return destination.shellId.split(/[-_]/).map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : "").join(" ");
  }
  if (destination.kind === "task") return "Task";
  if (destination.kind === "tasks-surface") {
    return ({ paths: "PATHS", report: "Report", on_time: "On Time", brainstorm: "Brainstorm", completed_milestones: "Completed Milestones", tasks: "Tasks" })[destination.surface];
  }
  if (destination.kind === "tasks-view") {
    return ({ table: "Table View", list: "List View", cards: "Cards View", matrix: "Matrix View", calendar: "Calendar View" })[destination.view];
  }
  if (destination.kind === "health-tab") return `Health · ${destination.tab}`;
  if (destination.kind === "settings-section") {
    return ({ appearance: "Appearance", "day-reset": "Day Reset", economy: "Economy", "import-export": "Import / Export" })[destination.section];
  }
  return destination.page;
}

type MasterWorkspaceTabBarProps = {
  activeTabId: string;
  canActivateTab: (tabId: string) => boolean;
  canCloseTab: (tabId: string) => boolean;
  canOpenNewTab: boolean;
  canNavigate: boolean;
  transitionBlockedReason: string | null;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onOpenPage: (page: AppPage) => void;
  tabs: MasterWorkspaceTab[];
};

export function MasterWorkspaceTabBar({
  activeTabId,
  canActivateTab,
  canCloseTab,
  canOpenNewTab,
  canNavigate,
  transitionBlockedReason,
  onActivate,
  onClose,
  onOpenPage,
  tabs,
}: MasterWorkspaceTabBarProps) {
  const [isPageMenuOpen, setIsPageMenuOpen] = useState(false);

  return (
    <nav aria-label="Master workspace tabs" className="border-b border-[#ece8f8] bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-[#171328]/70">
      <div className="mx-auto flex min-w-0 max-w-[1680px] items-center gap-2">
        <div aria-label="Open master tabs" className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5" role="list">
          {tabs.map((tab) => (
            <div className="flex shrink-0 items-center gap-0.5" key={tab.id} role="listitem">
              <AdhdChip
                aria-pressed={tab.id === activeTabId}
                disabled={!canActivateTab(tab.id)}
                onClick={() => onActivate(tab.id)}
                selected={tab.id === activeTabId}
                title={canActivateTab(tab.id) ? `Open ${getMasterTabLabel(tab)}` : transitionBlockedReason ?? "This switch is paused to protect the current page."}
                type="button"
              >
                {getMasterTabLabel(tab)}
              </AdhdChip>
              <AdhdIconButton
                aria-label={`Close ${getMasterTabLabel(tab)} tab`}
                disabled={!canCloseTab(tab.id)}
                onClick={() => onClose(tab.id)}
                size="sm"
                title={canCloseTab(tab.id) ? `Close ${getMasterTabLabel(tab)} tab` : transitionBlockedReason ?? "This tab cannot be closed while it would change the rendered page."}
                variant="rowToolbar"
              >
                <X aria-hidden="true" />
              </AdhdIconButton>
            </div>
          ))}
        </div>
        <div className="relative shrink-0">
          <AdhdChip
            aria-expanded={isPageMenuOpen}
            aria-haspopup="menu"
            disabled={!canNavigate || !canOpenNewTab}
            onClick={() => setIsPageMenuOpen((open) => !open)}
            title={!canNavigate ? "Wait for the workspace to finish loading before opening a tab." : transitionBlockedReason ?? "Open a new page tab"}
            type="button"
          >
            <span className="inline-flex items-center gap-1"><Plus aria-hidden="true" className="h-3.5 w-3.5" /> New tab</span>
          </AdhdChip>
          {isPageMenuOpen && canNavigate ? (
            <AdhdDropdownPanel className="right-0 left-auto grid max-h-[60vh] w-52 gap-1 overflow-y-auto" role="menu">
              {TOP_LEVEL_PAGES.map((page) => (
                <AdhdChip
                  className="w-full justify-start"
                  key={page}
                  onClick={() => {
                    onOpenPage(page);
                    setIsPageMenuOpen(false);
                  }}
                  role="menuitem"
                  type="button"
                >
                  {page}
                </AdhdChip>
              ))}
            </AdhdDropdownPanel>
          ) : null}
        </div>
      </div>
      {transitionBlockedReason ? <p aria-live="polite" className="mx-auto mt-1.5 max-w-[1680px] text-[11px] text-[#7d88a1] dark:text-white/50">{transitionBlockedReason}</p> : null}
    </nav>
  );
}
