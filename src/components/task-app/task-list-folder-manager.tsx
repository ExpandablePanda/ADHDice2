"use client";

import { Folder, FolderPlus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { TaskTableChipButton } from "@/components/ui/task-table-primitives";
import type { TaskListFolder } from "@/lib/database.types";
import { buildTaskListFolderTree } from "@/lib/task-list-folders";
import type { TaskListDefinition } from "@/lib/task-lists";

type Props = {
  currentFolderId: string | null;
  folders: TaskListFolder[];
  lists: TaskListDefinition[];
  onCreateFolder: (name: string, parentFolderId: string | null) => Promise<boolean>;
  onDeleteFolder: (folderId: string) => Promise<boolean>;
  onRenameFolder: (folderId: string, name: string) => Promise<boolean>;
};

export function TaskListFolderManager({
  currentFolderId,
  folders,
  lists,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
}: Props) {
  const tree = useMemo(() => buildTaskListFolderTree(folders, lists), [folders, lists]);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(currentFolderId);
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
  const folderOptions = Array.from(tree.folderById.values())
    .sort((left, right) => (tree.folderPathById.get(left.id) ?? left.name).localeCompare(tree.folderPathById.get(right.id) ?? right.name));

  return (
    <section className="rounded-[1.5rem] border border-[#ece8f8] bg-[#faf8ff] p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Folder organization</p>
        <p className="mt-1 text-sm text-[#68738f] dark:text-white/55">
          Create, rename, or delete folders here. Move every List and folder directly in the canonical rail.
        </p>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(10rem,0.7fr)_auto]">
        <input
          className="rounded-[1rem] border border-[#ddd6fb] bg-white px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.05]"
          onChange={(event) => setNewFolderName(event.target.value)}
          placeholder="New folder name"
          value={newFolderName}
        />
        <select
          className="rounded-[1rem] border border-[#ddd6fb] bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-[#211b35]"
          onChange={(event) => setNewFolderParentId(event.target.value || null)}
          value={newFolderParentId ?? ""}
        >
          <option value="">Root</option>
          {folderOptions.map((folder) => <option key={folder.id} value={folder.id}>{tree.folderPathById.get(folder.id)}</option>)}
        </select>
        <TaskTableChipButton
          className="gap-1.5"
          onClick={() => {
            const name = newFolderName.trim();
            if (!name) return;
            void onCreateFolder(name, newFolderParentId).then((saved) => {
              if (saved) setNewFolderName("");
            });
          }}
        >
          <FolderPlus className="h-3.5 w-3.5" /> Create
        </TaskTableChipButton>
      </div>

      <div className="mt-4 space-y-2">
        {folderOptions.map((folder) => {
          const path = tree.folderPathById.get(folder.id) ?? folder.name;
          return (
            <div className="rounded-xl border border-[#e9e3f8] bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]" key={folder.id}>
              <div className="flex flex-wrap items-center gap-2">
                <Folder className="h-4 w-4 text-[#6f57f6]" />
                <input
                  className="min-w-32 flex-1 bg-transparent text-sm font-semibold outline-none"
                  onChange={(event) => setRenameDrafts((current) => ({ ...current, [folder.id]: event.target.value }))}
                  value={renameDrafts[folder.id] ?? folder.name}
                />
                <span className="w-full truncate text-[11px] text-[#8d87a7] md:w-auto md:max-w-64">{path}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <TaskTableChipButton onClick={() => { void onRenameFolder(folder.id, (renameDrafts[folder.id] ?? folder.name).trim()); }}>Rename</TaskTableChipButton>
                <TaskTableChipButton
                  className="gap-1"
                  onClick={() => {
                    if (window.confirm("Delete this folder? Child folders and lists will be promoted. No lists or Tasks will be deleted.")) {
                      void onDeleteFolder(folder.id);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </TaskTableChipButton>
              </div>
            </div>
          );
        })}
      </div>
      {tree.issues.length > 0 ? (
        <p className="mt-3 text-xs text-[#b45b70]">Found {tree.issues.length} invalid folder row(s). They were hidden safely; refresh or inspect workspace data.</p>
      ) : null}
    </section>
  );
}
