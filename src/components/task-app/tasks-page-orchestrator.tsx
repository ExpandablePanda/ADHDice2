"use client";

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { TaskPage } from "./task-page";
import { TaskOperationsHeader } from "./tasks-page";
import {
  TASKS_SURFACE_ACTIVE_CHIP_CLASS,
  TASKS_SURFACE_GROUP_CLASS,
  TASKS_SURFACE_INACTIVE_CHIP_CLASS,
  TasksSurfaceSwitch,
} from "./tasks-surface-switch";
import { TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS, TaskTableChipButton } from "@/components/ui/task-table-primitives";
import type { TaskWorkspaceTab, TasksSurface, TaskViewMode } from "@/lib/task-ui-state";

type TasksPageOrchestratorProps = {
  activeTabId: string;
  activeTabKind?: TaskWorkspaceTab["kind"];
  alternateViewPanel: ReactNode;
  flows: ReactNode;
  listViewPanel: ReactNode;
  onAddTab: () => void;
  onCloseTab: (tabId: string) => void;
  onRenameTab: (tabId: string, nextLabel: string) => void;
  onSurfaceChange: (surface: TasksSurface) => void;
  onTabChange: (tabId: string) => void;
  operationsHeaderProps: ComponentProps<typeof TaskOperationsHeader>;
  pathsWorkspacePanel: ReactNode;
  surface: TasksSurface;
  tableViewPanel: ReactNode;
  tabs: TaskWorkspaceTab[];
  view: TaskViewMode;
};

export function TasksWorkspace({
  activeTabId,
  activeTabKind,
  alternateViewPanel,
  flows,
  listViewPanel,
  onAddTab,
  onCloseTab,
  onRenameTab,
  onSurfaceChange,
  onTabChange,
  operationsHeaderProps,
  pathsWorkspacePanel,
  surface,
  tableViewPanel,
  tabs,
  view,
}: TasksPageOrchestratorProps) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const ignoreBlurCommitRef = useRef(false);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editingTabId) {
      return;
    }
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [editingTabId]);

  const commitRename = (tabId: string) => {
    const nextLabel = renameDraft.trim();
    if (nextLabel.length > 0) {
      onRenameTab(tabId, nextLabel);
    }
    setEditingTabId(null);
    setRenameDraft("");
  };

  return (
    <TaskPage
      alternateViewPanel={alternateViewPanel}
      flows={flows}
      listViewPanel={listViewPanel}
      operationsHeader={<TaskOperationsHeader {...operationsHeaderProps} />}
      pathsWorkspacePanel={pathsWorkspacePanel}
      surface={surface}
      surfaceSwitch={<TasksSurfaceSwitch onChange={onSurfaceChange} value={surface} />}
      tabs={(
        <div className={`adhdice-scrollbar flex max-w-full items-center overflow-x-auto ${TASKS_SURFACE_GROUP_CLASS}`}>
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              const isEditing = tab.id === editingTabId;
              const isReportTab = tab.kind === "report";
              return (
                <div
                  className="inline-flex items-center gap-0.5"
                  key={tab.id}
                >
                  {isEditing && !isReportTab ? (
                    <input
                      ref={renameInputRef}
                      className={`${TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS} h-[26px] min-w-[6rem] rounded-full border px-2 py-0 outline-none transition focus:border-[#b7a7ff] ${isActive ? "border-[#6f57f6] bg-[#6f57f6] text-white placeholder:text-white/70 dark:border-[#c9bbff] dark:bg-[#c9bbff] dark:text-[#1a1431] dark:placeholder:text-[#1a1431]/65" : "border-[#e4deef] bg-[#fbfaff] text-[#5f6983] placeholder:text-[#8d96ae] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/72 dark:placeholder:text-white/45"} dark:focus:border-[#6d56d6]`}
                      onBlur={() => {
                        if (ignoreBlurCommitRef.current) {
                          ignoreBlurCommitRef.current = false;
                          return;
                        }
                        commitRename(tab.id);
                      }}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitRename(tab.id);
                        } else if (event.key === "Escape") {
                          event.preventDefault();
                          ignoreBlurCommitRef.current = true;
                          setEditingTabId(null);
                          setRenameDraft("");
                        }
                      }}
                      style={{
                        fontFamily: "inherit",
                        fontSize: "13px",
                        fontWeight: 500,
                        letterSpacing: "normal",
                        lineHeight: "13px",
                      }}
                      placeholder="Rename tab"
                      type="text"
                      value={renameDraft}
                    />
                  ) : (
                    <TaskTableChipButton
                      onClick={() => onTabChange(tab.id)}
                      toneClassName={isActive ? TASKS_SURFACE_ACTIVE_CHIP_CLASS : TASKS_SURFACE_INACTIVE_CHIP_CLASS}
                    >
                      {tab.label}
                    </TaskTableChipButton>
                  )}
                  {!isReportTab ? (
                    <button
                      aria-label={`Rename ${tab.label}`}
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[#8b84aa] transition hover:bg-white/70 hover:text-[#6f57f6] dark:text-white/45 dark:hover:bg-white/10 dark:hover:text-[#cabfff]"
                      onClick={() => {
                        setEditingTabId(tab.id);
                        setRenameDraft(tab.label);
                      }}
                      type="button"
                    >
                      <Pencil className="h-2.5 w-2.5" />
                    </button>
                  ) : null}
                  {tabs.length > 1 && !isReportTab ? (
                    <button
                      aria-label={`Close ${tab.label}`}
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[#8b84aa] transition hover:bg-[#fff1f2] hover:text-[#d64b5f] dark:text-white/45 dark:hover:bg-[#2e1820] dark:hover:text-[#ff9fbc]"
                      onClick={() => onCloseTab(tab.id)}
                      type="button"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  ) : null}
                </div>
              );
            })}
            <TaskTableChipButton
              aria-label="Add task workspace tab"
              className="px-1.5"
              onClick={onAddTab}
              toneClassName={TASKS_SURFACE_INACTIVE_CHIP_CLASS}
            >
              <Plus className="h-2.5 w-2.5" />
            </TaskTableChipButton>
        </div>
      )}
      reportWorkspaceActive={activeTabKind === "report"}
      tableViewPanel={tableViewPanel}
      view={view}
    />
  );
}

export const TasksPageOrchestrator = TasksWorkspace;
