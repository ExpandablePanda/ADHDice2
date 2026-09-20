"use client";

import { Check, FolderPlus, MoveRight, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { TaskContentFolder } from "@/lib/database.types";
import {
  TASK_LIST_QUICK_PANEL_PRIMARY_CHIP_CLASS,
  TASK_TABLE_INACTIVE_CHIP_CLASS,
  TASK_TABLE_INPUT_CLASS,
  TaskTableChipButton,
} from "@/components/ui/task-table-primitives";
import { TaskTypeIcon } from "@/components/ui/lucide-icon";
import { isTaskTypeIconKey } from "@/lib/task-type-presentation";

export type TaskContentFolderContextMenuState = {
  folderId: string;
  left: number;
  top: number;
};

export function buildTaskContentFolderContextMenuState(
  containerElement: HTMLElement | null,
  folderId: string,
  clientX: number,
  clientY: number,
): TaskContentFolderContextMenuState | null {
  if (!containerElement) return null;

  const shellRect = containerElement.getBoundingClientRect();
  const estimatedMenuWidth = 240;
  const estimatedMenuHeight = 180;
  const gutter = 18;
  return {
    folderId,
    left: Math.min(
      Math.max(gutter, clientX - shellRect.left),
      Math.max(gutter, shellRect.width - estimatedMenuWidth - gutter),
    ),
    top: Math.min(
      Math.max(gutter, clientY - shellRect.top),
      Math.max(gutter, shellRect.height - estimatedMenuHeight - gutter),
    ),
  };
}

type Props = {
  folder: Pick<TaskContentFolder, "icon_key" | "id" | "name">;
  menu: TaskContentFolderContextMenuState;
  onDelete: (folderId: string) => Promise<boolean>;
  onDismiss: () => void;
  onAddChildFolder?: () => void;
  onMoveFolder?: (folderId: string, destinationFolderId: string | null) => Promise<boolean>;
  onRename: (folderId: string, name: string) => Promise<boolean>;
  moveOptions?: Array<{ id: string | null; label: string }>;
};

export function TaskContentFolderContextMenu({ folder, menu, onAddChildFolder, onDelete, onDismiss, onMoveFolder, onRename, moveOptions = [] }: Props) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [draftName, setDraftName] = useState(folder.name);

  const submitRename = async () => {
    if (await onRename(folder.id, draftName)) {
      onDismiss();
    }
  };

  return (
    <div
      className="absolute inset-0 z-40"
      onClick={onDismiss}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        className="absolute w-[15rem] rounded-[1.15rem] border border-[#ede6ff] bg-white/95 p-2 text-left shadow-[0_24px_70px_rgba(111,87,246,0.18)] backdrop-blur dark:border-white/10 dark:bg-[#1b1530]/95"
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
        style={{ left: menu.left, top: menu.top }}
      >
        <div className="border-b border-[#f0ebfb] px-2 pb-2 dark:border-white/10">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#9b92be] dark:text-white/35">
            {isMoving ? "Move Folder" : "Folder actions"}
          </p>
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm font-medium text-[#2f294a] dark:text-white">
            <TaskTypeIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[#6f57f6] dark:text-[#c9bbff]" iconKey={isTaskTypeIconKey(folder.icon_key) ? folder.icon_key : "folder"} />
            <span className="truncate">{folder.name}</span>
          </p>
        </div>

        {isMoving ? (
          <div className="space-y-2 px-1 py-2">
            <div className="adhdice-scrollbar max-h-60 space-y-1 overflow-y-auto pb-1 pr-1 overscroll-contain">
              {moveOptions.map((option) => (
                <TaskTableChipButton
                  className="w-full justify-between gap-2"
                  key={option.id ?? "no-parent"}
                  onClick={() => {
                    const moveResult = onMoveFolder?.(folder.id, option.id);
                    if (moveResult) {
                      void moveResult.then((didMove) => {
                        if (didMove) onDismiss();
                      });
                    }
                  }}
                >
                  <span className="truncate">{option.label}</span>
                  {option.id === folder.id ? <span className="text-xs opacity-60">Current</span> : null}
                </TaskTableChipButton>
              ))}
              {moveOptions.length === 0 ? <p className="px-2 py-3 text-sm text-[#8d87a7] dark:text-white/45">No valid destinations.</p> : null}
            </div>
            <TaskTableChipButton
              className="w-full justify-between gap-2"
              onClick={() => setIsMoving(false)}
            >
              <span>Back to actions</span>
            </TaskTableChipButton>
          </div>
        ) : isRenaming ? (
          <form
            className="space-y-2 px-1 py-2"
            onSubmit={(event) => {
              event.preventDefault();
              void submitRename();
            }}
          >
            <input
              autoFocus
              aria-label={`Rename ${folder.name}`}
              className={TASK_TABLE_INPUT_CLASS}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setIsRenaming(false);
                  setDraftName(folder.name);
                }
              }}
              placeholder="Folder name"
              value={draftName}
            />
            <div className="flex justify-end gap-1.5">
              <TaskTableChipButton
                onClick={() => {
                  setIsRenaming(false);
                  setDraftName(folder.name);
                }}
                toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </TaskTableChipButton>
              <TaskTableChipButton toneClassName={TASK_LIST_QUICK_PANEL_PRIMARY_CHIP_CLASS} type="submit">
                <Check className="h-3.5 w-3.5" />
                Save
              </TaskTableChipButton>
            </div>
          </form>
        ) : (
          <div className="space-y-1 px-1 py-2">
            {onAddChildFolder ? (
              <TaskTableChipButton
                className="w-full justify-start gap-2"
                onClick={() => {
                  onAddChildFolder();
                  onDismiss();
                }}
              >
                <FolderPlus className="h-3.5 w-3.5" />
                Add Folder
              </TaskTableChipButton>
            ) : null}
            {onMoveFolder ? (
              <TaskTableChipButton
                className="w-full justify-start gap-2"
                onClick={() => setIsMoving(true)}
              >
                <MoveRight className="h-3.5 w-3.5" />
                Move Folder
              </TaskTableChipButton>
            ) : null}
            <TaskTableChipButton
              className="w-full justify-start gap-2"
              onClick={() => setIsRenaming(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
              Rename Folder
            </TaskTableChipButton>
            <TaskTableChipButton
              className="w-full justify-start gap-2"
              onClick={() => {
                if (window.confirm(`Delete "${folder.name}"?\nDirect Tasks will move to this Folder's parent (or become ungrouped if it is a root). Child Folders will be promoted.`)) {
                  void onDelete(folder.id).then((didDelete) => {
                    if (didDelete) onDismiss();
                  });
                }
              }}
              toneClassName="border-[#ffd6de] bg-[#fff1f3] text-[#d94e67] dark:border-[#5b2e3b] dark:bg-[#44232f] dark:text-[#ff9eaf]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Folder
            </TaskTableChipButton>
          </div>
        )}
      </div>
    </div>
  );
}
