"use client";

import { Bell, ChevronRight, Footprints, FolderPlus, ListTodo, Pin, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CustomBehaviorRuleset, TaskContentFolder } from "@/lib/database.types";
import { getTaskContentFolderRoutineToggleTaskIds, type TaskContentFolderMemberSummary } from "@/lib/task-content-folders";
import { buildTaskTypeSelectionOptions, type TaskTypeSelectionOption } from "@/lib/task-type";
import { isTaskTypeIconKey, searchTaskTypeIcons } from "@/lib/task-type-presentation";
import { TaskTypeIcon } from "@/components/ui/lucide-icon";
import { AdhdIconButton } from "@/components/ui-system";
import {
  TASK_LIST_QUICK_PANEL_PRIMARY_CHIP_CLASS,
  TASK_TABLE_INACTIVE_CHIP_CLASS,
  TASK_TABLE_INPUT_CLASS,
  TASK_TABLE_INLINE_RENAME_EDITOR_CLASS,
  TASK_TABLE_TITLE_RENAME_INPUT_TYPOGRAPHY_STYLE,
  TaskInlineChildDraftInput,
  TaskTableChipButton,
} from "@/components/ui/task-table-primitives";
import { TaskTypeSelect } from "./task-type-identity";

export type TaskContentFolderEditSurface = {
  folderId: string;
  kind: "add" | "folder" | "icon" | "rename";
} | null;

type Props = {
  activeSurface: TaskContentFolderEditSurface;
  collapsed: boolean;
  depth?: number;
  folder: Pick<TaskContentFolder, "icon_key" | "id" | "name">;
  memberSummary?: TaskContentFolderMemberSummary;
  memberCount: number;
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  onAddTaskToFolder?: (folderId: string, title: string, taskTypeSelectionValue: string) => Promise<boolean> | boolean;
  onAddFolderToFolder?: (parentFolderId: string, name: string) => Promise<boolean> | boolean;
  customBehaviorRulesets?: readonly CustomBehaviorRuleset[];
  onRename?: (folderId: string, name: string) => Promise<boolean>;
  onSurfaceChange: (surface: TaskContentFolderEditSurface) => void;
  onToggleMemberPinned?: (taskId: string) => void;
  onToggleMemberRoutine?: (taskId: string, listId: string) => void;
  onToggle: () => void;
  onUpdateIcon?: (folderId: string, iconKey: string) => Promise<boolean>;
};

export function TaskContentFolderEditableHeader({
  activeSurface,
  collapsed,
  depth = 0,
  folder,
  memberSummary,
  memberCount,
  onContextMenu,
  onAddTaskToFolder,
  onAddFolderToFolder,
  customBehaviorRulesets = [],
  onRename,
  onSurfaceChange,
  onToggleMemberPinned,
  onToggleMemberRoutine,
  onToggle,
  onUpdateIcon,
}: Props) {
  const [draftName, setDraftName] = useState(folder.name);
  const [taskTitleDraft, setTaskTitleDraft] = useState("");
  const [taskTypeSelectionValue, setTaskTypeSelectionValue] = useState("task");
  const [taskCreationPending, setTaskCreationPending] = useState(false);
  const [taskCreationError, setTaskCreationError] = useState<string | null>(null);
  const [folderNameDraft, setFolderNameDraft] = useState("");
  const [folderCreationPending, setFolderCreationPending] = useState(false);
  const [folderCreationError, setFolderCreationError] = useState<string | null>(null);
  const [iconQuery, setIconQuery] = useState("");
  const submittingRenameRef = useRef(false);
  const submittingTaskRef = useRef(false);
  const switchingSurfaceRef = useRef(false);
  const chooserRef = useRef<HTMLDivElement | null>(null);
  const taskDraftInputRef = useRef<HTMLInputElement | null>(null);
  const folderDraftInputRef = useRef<HTMLInputElement | null>(null);
  const currentIconKey = isTaskTypeIconKey(folder.icon_key) ? folder.icon_key : "folder";
  const filteredIcons = searchTaskTypeIcons(iconQuery);
  const taskTypeOptions: ReadonlyArray<TaskTypeSelectionOption> = useMemo(
    () => buildTaskTypeSelectionOptions(customBehaviorRulesets),
    [customBehaviorRulesets],
  );
  const isActiveFolder = activeSurface?.folderId === folder.id;
  const isRenaming = isActiveFolder && activeSurface?.kind === "rename";
  const isChoosingIcon = isActiveFolder && activeSurface?.kind === "icon";
  const isAddingTask = isActiveFolder && activeSurface?.kind === "add";
  const isAddingFolder = isActiveFolder && activeSurface?.kind === "folder";
  const summary = memberSummary ?? {
    allPinned: false,
    allRoutine: false,
    anyPinned: false,
    anyRoutine: false,
    attentionCount: 0,
    memberTaskIds: [],
    pinnedTaskIds: [],
    routineTaskIds: [],
  };

  useEffect(() => {
    if (!isRenaming) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset the local draft after the persisted Folder surface closes.
      setDraftName(folder.name);
      submittingRenameRef.current = false;
    }
  }, [folder.name, isRenaming]);

  useEffect(() => {
    if (!isAddingTask) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset the local add draft after the Folder action surface closes.
      setTaskTitleDraft("");
      setTaskTypeSelectionValue("task");
      setTaskCreationError(null);
      setTaskCreationPending(false);
      submittingTaskRef.current = false;
    }
  }, [isAddingTask]);

  useEffect(() => {
    if (!isAddingFolder) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset the local Folder draft after the action surface closes.
      setFolderNameDraft("");
      setFolderCreationError(null);
      setFolderCreationPending(false);
    }
  }, [isAddingFolder]);

  useEffect(() => {
    if (isAddingTask) taskDraftInputRef.current?.focus();
  }, [isAddingTask]);

  useEffect(() => {
    if (isAddingFolder) folderDraftInputRef.current?.focus();
  }, [isAddingFolder]);

  useEffect(() => {
    if (!isChoosingIcon) return;

    const handleOutsidePointerDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !chooserRef.current?.contains(event.target)) {
        onSurfaceChange(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onSurfaceChange(null);
      }
    };

    document.addEventListener("mousedown", handleOutsidePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsidePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isChoosingIcon, onSurfaceChange]);

  async function submitRename() {
    if (submittingRenameRef.current) return;
    const nextName = draftName.trim();
    if (!nextName || nextName === folder.name) {
      setDraftName(folder.name);
      onSurfaceChange(null);
      return;
    }
    if (!onRename) {
      setDraftName(folder.name);
      onSurfaceChange(null);
      return;
    }

    submittingRenameRef.current = true;
    const didPersist = await onRename(folder.id, draftName);
    submittingRenameRef.current = false;
    setDraftName(didPersist ? nextName : folder.name);
    onSurfaceChange(null);
  }

  async function selectIcon(iconKey: string) {
    if (!isTaskTypeIconKey(iconKey) || !onUpdateIcon) return;
    const didPersist = await onUpdateIcon(folder.id, iconKey);
    if (didPersist) {
      setIconQuery("");
      onSurfaceChange(null);
    }
  }

  async function submitTaskCreation() {
    if (submittingTaskRef.current || !onAddTaskToFolder) return;
    const title = taskTitleDraft.trim();
    if (!title) {
      setTaskCreationError("Enter a Task title.");
      return;
    }
    submittingTaskRef.current = true;
    setTaskCreationPending(true);
    setTaskCreationError(null);
    const didPersist = await onAddTaskToFolder(folder.id, title, taskTypeSelectionValue);
    submittingTaskRef.current = false;
    setTaskCreationPending(false);
    if (didPersist) {
      setTaskTitleDraft("");
      setTaskTypeSelectionValue("task");
      onSurfaceChange(null);
    } else {
      setTaskCreationError("Task could not be added to this Folder.");
    }
  }

  async function submitFolderCreation() {
    if (folderCreationPending || !onAddFolderToFolder) return;
    const name = folderNameDraft.trim();
    if (!name) {
      setFolderCreationError("Enter a Folder name.");
      return;
    }
    setFolderCreationPending(true);
    setFolderCreationError(null);
    const didPersist = await onAddFolderToFolder(folder.id, name);
    setFolderCreationPending(false);
    if (didPersist) {
      setFolderNameDraft("");
      onSurfaceChange(null);
    } else {
      setFolderCreationError("Folder could not be created.");
    }
  }

  function cancelTaskCreation() {
    setTaskTitleDraft("");
    setTaskTypeSelectionValue("task");
    setTaskCreationError(null);
    setTaskCreationPending(false);
    submittingTaskRef.current = false;
    onSurfaceChange(null);
  }

  function cancelFolderCreation() {
    setFolderNameDraft("");
    setFolderCreationError(null);
    setFolderCreationPending(false);
    onSurfaceChange(null);
  }

  function stopActionPointer(event: React.PointerEvent<HTMLElement>) {
    event.stopPropagation();
    if (isRenaming || isAddingFolder) {
      event.preventDefault();
      switchingSurfaceRef.current = true;
    }
  }

  function togglePinnedMembers() {
    const taskIds = summary.allPinned
      ? summary.pinnedTaskIds
      : summary.memberTaskIds.filter((taskId) => !summary.pinnedTaskIds.includes(taskId));
    taskIds.forEach((taskId) => onToggleMemberPinned?.(taskId));
  }

  function toggleRoutineMembers() {
    const taskIds = getTaskContentFolderRoutineToggleTaskIds(summary);
    taskIds.forEach((taskId) => onToggleMemberRoutine?.(taskId, "routine"));
  }

  return (
    <div
      className="relative flex w-full flex-col gap-1 rounded-[1rem] border border-[#e7defb] bg-[#faf8ff] px-3 py-2 text-left text-sm text-[#4b4469] transition hover:border-[#c9bbff] dark:border-white/10 dark:bg-white/[0.035] dark:text-white/80"
      data-style-role="tasks.content-folder.header"
      style={{ marginLeft: depth ? `${depth * 1}rem` : undefined }}
      onClick={(event) => {
        if (event.target instanceof HTMLElement && event.target.closest("button, input")) return;
        onToggle();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSurfaceChange(null);
        onContextMenu(event);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
        }
      }}
      role="group"
      tabIndex={0}
    >
      <div className="flex min-w-0 w-full flex-wrap items-center gap-2">
        <button
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${folder.name}`}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-transparent text-[#8a79d6] transition hover:border-[#ddd2ff] hover:bg-[#f3efff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 dark:text-[#b6a9ec] dark:hover:border-[#42306f] dark:hover:bg-[#22193f] dark:focus-visible:ring-[#3b2f68]/90"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          <ChevronRight className={`h-4 w-4 transition-transform ${collapsed ? "" : "rotate-90"}`} />
        </button>

        <div className="relative shrink-0" ref={chooserRef}>
          <button
            aria-label={`Change icon for ${folder.name}`}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-[#6f57f6] transition hover:border-[#ddd2ff] hover:bg-[#f3efff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 dark:text-[#c9bbff] dark:hover:border-[#42306f] dark:hover:bg-[#22193f] dark:focus-visible:ring-[#3b2f68]/90 ${isChoosingIcon ? "border-[#6f57f6] bg-[#f1ecff] dark:border-[#c9bbff] dark:bg-[#42306f]" : ""}`}
            data-style-part="icon"
            onClick={(event) => {
              event.stopPropagation();
              if (isChoosingIcon) {
                onSurfaceChange(null);
                return;
              }
              onSurfaceChange({ folderId: folder.id, kind: "icon" });
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (isRenaming) {
                event.preventDefault();
                switchingSurfaceRef.current = true;
              }
            }}
            title="Change folder icon"
            type="button"
          >
            <TaskTypeIcon aria-hidden="true" className="h-4 w-4" iconKey={currentIconKey} />
          </button>

          {isChoosingIcon ? (
            <div
              aria-label="Folder icon chooser"
              className="absolute left-0 top-full z-50 mt-2 w-[18rem] rounded-[1rem] border border-[#e7defb] bg-white p-2.5 shadow-[0_18px_50px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#1b1530]"
              data-style-role="tasks.content-folder.icon-chooser"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <label className="relative block">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9b92be] dark:text-white/35" />
                <input
                  aria-label="Search icons"
                  className={`${TASK_TABLE_INPUT_CLASS} h-9 rounded-full pl-8 pr-3 text-[13px]`}
                  onChange={(event) => setIconQuery(event.target.value)}
                  onKeyDown={(event) => event.stopPropagation()}
                  placeholder="Search icons..."
                  type="search"
                  value={iconQuery}
                />
              </label>
              {filteredIcons.length > 0 ? (
                <div aria-label="Folder icons" className="adhdice-scrollbar mt-2 grid max-h-44 grid-cols-8 gap-1.5 overflow-y-auto pr-1" role="group">
                  {filteredIcons.map(({ key, label }) => (
                    <button
                      aria-label={label}
                      aria-pressed={currentIconKey === key}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${currentIconKey === key ? "border-[#6f57f6] bg-[#f1ecff] text-[#6f57f6] dark:border-[#c9bbff] dark:bg-[#42306f] dark:text-[#cabfff]" : "border-[#e5e0f5] bg-white text-[#7d7598] hover:bg-[#f6f2ff] dark:border-white/15 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10"}`}
                      disabled={!onUpdateIcon}
                      key={key}
                      onClick={() => { void selectIcon(key); }}
                      title={label}
                      type="button"
                    >
                      <TaskTypeIcon aria-hidden="true" className="h-4 w-4" iconKey={key} />
                    </button>
                  ))}
                </div>
              ) : <p className="mt-2 rounded-[0.8rem] border border-dashed border-[#e5e0f5] px-3 py-2 text-xs text-[#7d7598] dark:border-white/10 dark:text-white/45">No icons found.</p>}
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 max-w-[22rem] flex-none items-center gap-2">
          {isRenaming ? (
            <input
              aria-label={`Rename ${folder.name}`}
              autoFocus
              className={`${TASK_TABLE_INLINE_RENAME_EDITOR_CLASS} w-[20rem] max-w-[min(20rem,calc(100vw-10rem))] min-w-0 rounded-[0.45rem] border border-[#ddd2ff] bg-white outline-none transition focus:border-[#b7a7ff] dark:border-[#42306f] dark:bg-[#22193f] dark:focus:border-[#6d56d6]`}
              onBlur={() => {
                if (switchingSurfaceRef.current || submittingRenameRef.current) {
                  switchingSurfaceRef.current = false;
                  return;
                }
                void submitRename();
              }}
              onChange={(event) => setDraftName(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Escape") {
                  event.preventDefault();
                  setDraftName(folder.name);
                  onSurfaceChange(null);
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  void submitRename();
                }
              }}
              onPointerDown={(event) => event.stopPropagation()}
              style={TASK_TABLE_TITLE_RENAME_INPUT_TYPOGRAPHY_STYLE}
              type="text"
              value={draftName}
            />
          ) : (
            <button
              className="min-w-0 max-w-[22rem] truncate appearance-none border-0 bg-transparent p-0 text-left text-sm font-medium outline-none transition hover:opacity-85 focus-visible:rounded-[0.5rem] focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 dark:focus-visible:ring-[#3b2f68]/90"
              data-style-part="title"
              onClick={(event) => {
                event.stopPropagation();
                switchingSurfaceRef.current = false;
                setDraftName(folder.name);
                onSurfaceChange({ folderId: folder.id, kind: "rename" });
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              type="button"
            >
              <span data-style-role="tasks.content-folder.title">{folder.name}</span>
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5" data-folder-action-control="true">
          {onToggleMemberPinned ? (
            <AdhdIconButton
              aria-label={summary.allPinned ? `Unpin all Tasks in ${folder.name}` : `Pin all Tasks in ${folder.name}`}
              aria-pressed={summary.allPinned}
              className={summary.allPinned || summary.anyPinned ? "text-[#5b3fd6] dark:text-[#cabfff]" : undefined}
              data-folder-partial={summary.anyPinned && !summary.allPinned ? "true" : undefined}
              disabled={summary.memberTaskIds.length === 0}
              onClick={(event) => {
                event.stopPropagation();
                onSurfaceChange(null);
                togglePinnedMembers();
              }}
              onPointerDown={stopActionPointer}
              selected={summary.allPinned}
              size="sm"
              tone="purple"
              variant="rowToolbar"
            >
              <Pin className={`h-3.5 w-3.5 ${summary.allPinned ? "fill-current" : ""}`} />
            </AdhdIconButton>
          ) : null}
          {onToggleMemberRoutine ? (
            <AdhdIconButton
              aria-label={summary.allRoutine ? `Remove all Tasks in ${folder.name} from Routine` : `Add all Tasks in ${folder.name} to Routine`}
              aria-pressed={summary.allRoutine}
              className={summary.allRoutine || summary.anyRoutine ? "text-[#5b3fd6] dark:text-[#cabfff]" : undefined}
              data-folder-partial={summary.anyRoutine && !summary.allRoutine ? "true" : undefined}
              disabled={summary.memberTaskIds.length === 0}
              onClick={(event) => {
                event.stopPropagation();
                onSurfaceChange(null);
                toggleRoutineMembers();
              }}
              onPointerDown={stopActionPointer}
              selected={summary.allRoutine}
              size="sm"
              tone="purple"
              variant="rowToolbar"
            >
              <ListTodo className={`h-3.5 w-3.5 ${summary.allRoutine ? "fill-current" : ""}`} />
            </AdhdIconButton>
          ) : null}
          {onAddTaskToFolder ? (
            <AdhdIconButton
              aria-label={`Add Task to ${folder.name}`}
              onClick={(event) => {
                event.stopPropagation();
                setTaskCreationError(null);
                setTaskTitleDraft("");
                setTaskTypeSelectionValue("task");
                onSurfaceChange({ folderId: folder.id, kind: "add" });
              }}
              onPointerDown={stopActionPointer}
              selected={isAddingTask}
              size="sm"
              tone="purple"
              variant="rowToolbar"
            >
              <Footprints className="h-3.5 w-3.5" />
            </AdhdIconButton>
          ) : null}
          {onAddFolderToFolder ? (
            <AdhdIconButton
              aria-label={`Add Folder to ${folder.name}`}
              onClick={(event) => {
                event.stopPropagation();
                setFolderNameDraft("");
                setFolderCreationError(null);
                onSurfaceChange({ folderId: folder.id, kind: "folder" });
              }}
              onPointerDown={stopActionPointer}
              selected={isAddingFolder}
              size="sm"
              tone="purple"
              variant="rowToolbar"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </AdhdIconButton>
          ) : null}
          {summary.attentionCount > 0 ? (
            <AdhdIconButton
              aria-label={`${summary.attentionCount} Tasks in ${folder.name} need attention`}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              size="sm"
              tone="warning"
              variant="rowToolbar"
            >
              <Bell aria-hidden="true" fill="currentColor" />
            </AdhdIconButton>
          ) : null}
        </div>

        <span className="shrink-0 text-xs text-[#8d87a7] dark:text-white/50" data-style-role="tasks.content-folder.count">
          {memberCount} visible {memberCount === 1 ? "Task" : "Tasks"}
        </span>
      </div>
      {isAddingTask ? (
        <div className="ml-8 w-[24rem] max-w-[min(24rem,calc(100vw-5rem))]">
          <form
            aria-label={`Add Task to ${folder.name}`}
            className="mt-2 flex w-full flex-col gap-2 rounded-[0.85rem] border border-[#e5dcfb] bg-white p-2.5 dark:border-white/10 dark:bg-[#1b1530]/80"
            data-inline-child-draft={folder.id}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelTaskCreation();
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void submitTaskCreation();
            }}
          >
            <div className="flex min-w-0 w-full">
              <TaskInlineChildDraftInput
                ariaLabel={`Add Task to ${folder.name}`}
                childLabel="Task"
                disabled={taskCreationPending}
                inputRef={taskDraftInputRef}
                onCancel={cancelTaskCreation}
                onChange={setTaskTitleDraft}
                onCommit={() => { void submitTaskCreation(); }}
                placeholder="Task title..."
                value={taskTitleDraft}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-[#6f678f] dark:text-white/60">Task Type:</span>
              <TaskTypeSelect
                ariaLabel="Task Type"
                disabled={taskCreationPending}
                label="Task Type"
                onChange={setTaskTypeSelectionValue}
                options={taskTypeOptions}
                size="compact"
                value={taskTypeSelectionValue}
              />
              <div className="ml-auto flex items-center gap-1.5">
                <TaskTableChipButton disabled={taskCreationPending} onClick={cancelTaskCreation} toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS} type="button">Cancel</TaskTableChipButton>
                <TaskTableChipButton disabled={taskCreationPending} toneClassName={TASK_LIST_QUICK_PANEL_PRIMARY_CHIP_CLASS} type="submit">{taskCreationPending ? "Adding..." : "Add"}</TaskTableChipButton>
              </div>
            </div>
            {taskCreationError ? <p className="text-xs font-medium text-[#d94e67] dark:text-[#ff9eaf]">{taskCreationError}</p> : null}
          </form>
        </div>
      ) : null}
      {isAddingFolder ? (
        <div className="ml-8 w-[24rem] max-w-[min(24rem,calc(100vw-5rem))]">
          <form
            aria-label={`Add Folder to ${folder.name}`}
            className="mt-2 flex w-full flex-col gap-2 rounded-[0.85rem] border border-[#e5dcfb] bg-white p-2.5 dark:border-white/10 dark:bg-[#1b1530]/80"
            data-inline-folder-draft={folder.id}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelFolderCreation();
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void submitFolderCreation();
            }}
          >
            <TaskInlineChildDraftInput
              ariaLabel={`Add Folder to ${folder.name}`}
              childLabel="Folder"
              disabled={folderCreationPending}
              inputRef={folderDraftInputRef}
              onCancel={cancelFolderCreation}
              onChange={setFolderNameDraft}
              onCommit={() => { void submitFolderCreation(); }}
              placeholder="Folder name..."
              value={folderNameDraft}
            />
            <div className="flex justify-end gap-1.5">
              <TaskTableChipButton disabled={folderCreationPending} onClick={cancelFolderCreation} toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS} type="button">Cancel</TaskTableChipButton>
              <TaskTableChipButton disabled={folderCreationPending} toneClassName={TASK_LIST_QUICK_PANEL_PRIMARY_CHIP_CLASS} type="submit">{folderCreationPending ? "Creating..." : "Create"}</TaskTableChipButton>
            </div>
            {folderCreationError ? <p className="text-xs font-medium text-[#d94e67] dark:text-[#ff9eaf]">{folderCreationError}</p> : null}
          </form>
        </div>
      ) : null}
    </div>
  );
}
