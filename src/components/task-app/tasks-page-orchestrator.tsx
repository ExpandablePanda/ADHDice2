"use client";

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Ellipsis, Pencil, Plus, X } from "lucide-react";
import { TaskPage } from "./task-page";
import { TaskOperationsHeader } from "./tasks-page";
import {
  TASKS_SURFACE_ACTIVE_CHIP_CLASS,
  TASKS_SURFACE_GROUP_CLASS,
  TASKS_SURFACE_INACTIVE_CHIP_CLASS,
  TasksSurfaceSwitch,
} from "./tasks-surface-switch";
import { TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS, TaskTableChipButton } from "@/components/ui/task-table-primitives";
import { AdhdDropdownPanel } from "@/components/ui-system";
import type { TaskWorkspaceTab, TasksSurface, TaskViewMode } from "@/lib/task-ui-state";

type TasksPageOrchestratorProps = {
  activeTabId: string;
  alternateViewPanel: ReactNode;
  flows: ReactNode;
  listViewPanel: ReactNode;
  onAddTab: () => void;
  onTimeWorkspacePanel: ReactNode;
  showTableOverlayOnTime?: boolean;
  onCloseTab: (tabId: string) => void;
  onReorderTab: (tabId: string, targetIndex: number) => void;
  onRenameTab: (tabId: string, nextLabel: string) => void;
  onSurfaceChange: (surface: TasksSurface) => void;
  onTabChange: (tabId: string) => void;
  operationsHeaderProps: ComponentProps<typeof TaskOperationsHeader>;
  pathsWorkspacePanel: ReactNode;
  reportWorkspacePanel: ReactNode;
  surface: TasksSurface;
  tableViewPanel: ReactNode;
  tabs: TaskWorkspaceTab[];
  view: TaskViewMode;
};

export function TasksWorkspace({
  activeTabId,
  alternateViewPanel,
  flows,
  listViewPanel,
  onAddTab,
  onTimeWorkspacePanel,
  showTableOverlayOnTime,
  onCloseTab,
  onReorderTab,
  onRenameTab,
  onSurfaceChange,
  onTabChange,
  operationsHeaderProps,
  pathsWorkspacePanel,
  reportWorkspacePanel,
  surface,
  tableViewPanel,
  tabs,
  view,
}: TasksPageOrchestratorProps) {
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [menuTabId, setMenuTabId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const ignoreBlurCommitRef = useRef(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const suppressClickTabIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editingTabId) {
      return;
    }
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [editingTabId]);

  useEffect(() => {
    if (!menuTabId) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      setMenuTabId(null);
      setMenuPosition(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuTabId(null);
        setMenuPosition(null);
      }
    }

    function handleLayoutChange() {
      setMenuTabId(null);
      setMenuPosition(null);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleLayoutChange, true);
    window.addEventListener("resize", handleLayoutChange);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleLayoutChange, true);
      window.removeEventListener("resize", handleLayoutChange);
    };
  }, [menuTabId]);

  const commitRename = (tabId: string) => {
    const nextLabel = renameDraft.trim();
    if (nextLabel.length > 0) {
      onRenameTab(tabId, nextLabel);
    }
    setEditingTabId(null);
    setMenuTabId(null);
    setMenuPosition(null);
    setRenameDraft("");
  };

  const startRename = (tabId: string, label: string) => {
    setMenuTabId(null);
    setMenuPosition(null);
    setEditingTabId(tabId);
    setRenameDraft(label);
  };

  const toggleTabMenu = (tabId: string, button: HTMLButtonElement) => {
    if (menuTabId === tabId) {
      setMenuTabId(null);
      setMenuPosition(null);
      return;
    }

    const buttonRect = button.getBoundingClientRect();
    setMenuPosition({
      left: Math.max(8, buttonRect.right - 144),
      top: buttonRect.bottom + 8,
    });
    setMenuTabId(tabId);
  };

  return (
    <>
      <TaskPage
        alternateViewPanel={alternateViewPanel}
        flows={flows}
        listViewPanel={listViewPanel}
        onTimeWorkspacePanel={onTimeWorkspacePanel}
        showTableOverlayOnTime={showTableOverlayOnTime}
        operationsHeader={<TaskOperationsHeader {...operationsHeaderProps} />}
        pathsWorkspacePanel={pathsWorkspacePanel}
        reportWorkspacePanel={reportWorkspacePanel}
        surface={surface}
        surfaceSwitch={<TasksSurfaceSwitch onChange={onSurfaceChange} value={surface} />}
        tabs={(
          <div className={`adhdice-scrollbar flex max-w-full items-center overflow-x-auto ${TASKS_SURFACE_GROUP_CLASS}`}>
              {tabs.map((tab, index) => {
                const isActive = tab.id === activeTabId;
                const isEditing = tab.id === editingTabId;
                const isMenuOpen = tab.id === menuTabId;
                return (
                  <div
                    className={`relative inline-flex items-center gap-1 ${draggingTabId === tab.id ? "opacity-60" : ""}`}
                    key={tab.id}
                    onDragOver={(event) => {
                      if (!draggingTabId || draggingTabId === tab.id) {
                        return;
                      }
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const sourceTabId = event.dataTransfer.getData("text/plain") || draggingTabId;
                      if (sourceTabId && sourceTabId !== tab.id) {
                        onReorderTab(sourceTabId, index);
                      }
                      setDraggingTabId(null);
                    }}
                  >
                    {isEditing ? (
                      <input
                        ref={renameInputRef}
                        className={`${TASK_TABLE_VISIBLE_TITLE_TEXT_CLASS} h-[26px] min-w-[6rem] rounded-full border px-2 py-0 outline-none transition focus:border-[#b7a7ff] ${isActive ? "border-[#6f57f6] bg-[#6f57f6] text-white placeholder:text-white/70 dark:border-[#c9bbff] dark:bg-[#c9bbff] dark:text-[#1a1431] dark:placeholder:text-[#1a1431]/65" : "border-[#e4deef] bg-[#fbfaff] text-[#5f6983] placeholder:text-[#8d96ae] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/72 dark:placeholder:text-white/45"} dark:focus:border-[#6d56d6]`}
                        data-tab-rename-input="true"
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                        onBlur={() => {
                          if (ignoreBlurCommitRef.current) {
                            ignoreBlurCommitRef.current = false;
                            return;
                          }
                          commitRename(tab.id);
                        }}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                        }}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                        }}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitRename(tab.id);
                          } else if (event.key === "Escape") {
                            event.preventDefault();
                            ignoreBlurCommitRef.current = true;
                            setEditingTabId(null);
                            setMenuTabId(null);
                            setMenuPosition(null);
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
                        draggable
                        onClick={() => {
                          if (suppressClickTabIdRef.current === tab.id) {
                            suppressClickTabIdRef.current = null;
                            return;
                          }
                          if (!isActive) {
                            onTabChange(tab.id);
                          }
                        }}
                        onDragEnd={() => {
                          setDraggingTabId(null);
                          window.setTimeout(() => {
                            if (suppressClickTabIdRef.current === tab.id) {
                              suppressClickTabIdRef.current = null;
                            }
                          }, 120);
                        }}
                        onDragStart={(event) => {
                          suppressClickTabIdRef.current = tab.id;
                          setDraggingTabId(tab.id);
                          setMenuTabId(null);
                          setMenuPosition(null);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", tab.id);
                        }}
                        onDoubleClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (!isActive) {
                            onTabChange(tab.id);
                          }
                          startRename(tab.id, tab.label);
                        }}
                        toneClassName={isActive ? TASKS_SURFACE_ACTIVE_CHIP_CLASS : TASKS_SURFACE_INACTIVE_CHIP_CLASS}
                      >
                        {tab.label}
                      </TaskTableChipButton>
                    )}
                    {isActive && !isEditing ? (
                      <div className="relative">
                        <button
                          aria-expanded={isMenuOpen}
                          aria-haspopup="menu"
                          aria-label={`${tab.label} tab actions`}
                          className="flex h-6 min-w-6 items-center justify-center rounded-full border border-transparent bg-transparent text-[#8b84aa] transition hover:border-[#e4deef] hover:bg-white/80 hover:text-[#6f57f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b6a7ff] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-white/45 dark:hover:border-white/10 dark:hover:bg-white/10 dark:hover:text-[#cabfff] dark:focus-visible:ring-[#7f67ff] dark:focus-visible:ring-offset-[#140f26]"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleTabMenu(tab.id, event.currentTarget);
                          }}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                          }}
                          type="button"
                        >
                          <Ellipsis className="h-3.5 w-3.5" />
                        </button>
                      </div>
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
        tableViewPanel={tableViewPanel}
        view={view}
      />
      {menuTabId && menuPosition ? (
        <div ref={menuRef}>
          <AdhdDropdownPanel
            className="min-w-[9rem] p-1.5"
            style={{
              left: `${menuPosition.left}px`,
              position: "fixed",
              top: `${menuPosition.top}px`,
            }}
          >
            <button
              className="flex w-full items-center gap-2 rounded-[0.9rem] px-3 py-2 text-left text-[13px] font-medium text-[#5f5878] transition hover:bg-[#f7f3ff] hover:text-[#6f57f6] dark:text-white/72 dark:hover:bg-white/8 dark:hover:text-[#cabfff]"
              onClick={() => {
                const menuTab = tabs.find((tab) => tab.id === menuTabId);
                if (menuTab) {
                  startRename(menuTab.id, menuTab.label);
                }
              }}
              onPointerDown={(event) => event.stopPropagation()}
              type="button"
            >
              <Pencil className="h-3.5 w-3.5" />
              Rename
            </button>
            {tabs.length > 1 ? (
              <button
                className="flex w-full items-center gap-2 rounded-[0.9rem] px-3 py-2 text-left text-[13px] font-medium text-[#8d4a63] transition hover:bg-[#fff1f2] hover:text-[#d64b5f] dark:text-[#ffb1c8] dark:hover:bg-[#2e1820] dark:hover:text-[#ff9fbc]"
                onClick={() => {
                  const closingTabId = menuTabId;
                  setMenuTabId(null);
                  setMenuPosition(null);
                  onCloseTab(closingTabId);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                type="button"
              >
                <X className="h-3.5 w-3.5" />
                Close
              </button>
            ) : null}
          </AdhdDropdownPanel>
        </div>
      ) : null}
    </>
  );
}

export const TasksPageOrchestrator = TasksWorkspace;
