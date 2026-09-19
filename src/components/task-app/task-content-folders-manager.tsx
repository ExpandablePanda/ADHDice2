"use client";

import { Check, Folder, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { TaskContentFolder } from "@/lib/database.types";
import { AdhdChip, AdhdIconButton } from "@/components/ui-system";
import { TASK_TABLE_LIST_CHIP_CLASS } from "@/components/ui/task-table-primitives";

type Props = {
  folders: readonly TaskContentFolder[];
  onCreate: (name: string) => Promise<TaskContentFolder | null>;
  onDelete: (folderId: string) => Promise<boolean>;
  onRename: (folderId: string, name: string) => Promise<boolean>;
};

export function TaskContentFoldersManager({ folders, onCreate, onDelete, onRename }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const submitCreate = async () => {
    const folder = await onCreate(draftName);
    if (folder) setDraftName("");
  };

  return (
    <div className="relative" data-style-role="tasks.content-folder.control">
      <AdhdChip
        className={`${TASK_TABLE_LIST_CHIP_CLASS} gap-1.5`}
        onClick={() => setIsOpen((current) => !current)}
        selected={isOpen}
        type="button"
      >
        <Folder className="h-3.5 w-3.5" />
        <span>Folders</span>
        <span className="text-[11px] opacity-65">{folders.length}</span>
      </AdhdChip>
      {isOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(22rem,calc(100vw-2rem))] rounded-[1.2rem] border border-[#e9e2fb] bg-white/95 p-3 text-left shadow-[0_22px_60px_rgba(111,87,246,0.18)] backdrop-blur dark:border-white/10 dark:bg-[#1b1530]/95">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#938ab8] dark:text-white/42">Task Folders</p>
              <p className="mt-1 text-xs text-[#7d7597] dark:text-white/55">Organize top-level Tasks without changing Task behavior.</p>
            </div>
            <AdhdIconButton aria-label="Close Folders" onClick={() => setIsOpen(false)} size="sm" title="Close" variant="rowToolbar">
              <X className="h-3.5 w-3.5" />
            </AdhdIconButton>
          </div>
          <div className="mt-3 flex gap-2">
            <input
              aria-label="New Folder name"
              className="min-w-0 flex-1 rounded-[0.8rem] border border-[#e5def8] bg-[#fbfaff] px-3 py-2 text-sm text-[#2f294a] outline-none focus:border-[#c9bbff] dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submitCreate();
              }}
              placeholder="New Folder"
              value={draftName}
            />
            <AdhdIconButton aria-label="Create Folder" onClick={() => void submitCreate()} size="sm" title="Create Folder" variant="rowToolbar">
              <Plus className="h-4 w-4" />
            </AdhdIconButton>
          </div>
          <div className="adhdice-scrollbar mt-3 max-h-64 space-y-1 overflow-y-auto">
            {folders.length === 0 ? <p className="px-2 py-3 text-sm text-[#8d87a7] dark:text-white/45">No Folders yet.</p> : null}
            {folders.map((folder) => (
              <div className="flex items-center gap-2 rounded-[0.8rem] px-2 py-1.5 hover:bg-[#f7f3ff] dark:hover:bg-white/[0.05]" data-style-role="tasks.content-folder.row" key={folder.id}>
                <Folder className="h-3.5 w-3.5 shrink-0 text-[#6f57f6] dark:text-[#c9bbff]" />
                {editingFolderId === folder.id ? (
                  <input
                    autoFocus
                    aria-label={`Rename ${folder.name}`}
                    className="min-w-0 flex-1 rounded-[0.6rem] border border-[#e5def8] bg-white px-2 py-1 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                    onChange={(event) => setEditingName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        void onRename(folder.id, editingName).then((didRename) => {
                          if (didRename) setEditingFolderId(null);
                        });
                      }
                      if (event.key === "Escape") setEditingFolderId(null);
                    }}
                    value={editingName}
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm text-[#3d3658] dark:text-white/80" data-style-role="tasks.content-folder.title">{folder.name}</span>
                )}
                {editingFolderId === folder.id ? (
                  <AdhdIconButton aria-label={`Save ${folder.name}`} onClick={() => void onRename(folder.id, editingName).then((didRename) => didRename && setEditingFolderId(null))} size="sm" title="Save" variant="rowToolbar">
                    <Check className="h-3.5 w-3.5" />
                  </AdhdIconButton>
                ) : (
                  <AdhdIconButton aria-label={`Rename ${folder.name}`} onClick={() => { setEditingFolderId(folder.id); setEditingName(folder.name); }} size="sm" title="Rename" variant="rowToolbar">
                    <Pencil className="h-3.5 w-3.5" />
                  </AdhdIconButton>
                )}
                <AdhdIconButton
                  aria-label={`Delete ${folder.name}`}
                  onClick={() => {
                    if (window.confirm(`Delete "${folder.name}"? Its Tasks will stay and become ungrouped.`)) void onDelete(folder.id);
                  }}
                  size="sm"
                  title="Delete"
                  variant="rowToolbar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </AdhdIconButton>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
