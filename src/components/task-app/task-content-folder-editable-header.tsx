"use client";

import { ChevronRight, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TaskContentFolder } from "@/lib/database.types";
import { isTaskTypeIconKey, searchTaskTypeIcons } from "@/lib/task-type-presentation";
import { TaskTypeIcon } from "@/components/ui/lucide-icon";
import {
  TASK_TABLE_INPUT_CLASS,
  TASK_TABLE_INLINE_RENAME_EDITOR_CLASS,
  TASK_TABLE_TITLE_RENAME_INPUT_TYPOGRAPHY_STYLE,
} from "@/components/ui/task-table-primitives";

export type TaskContentFolderEditSurface = {
  folderId: string;
  kind: "icon" | "rename";
} | null;

type Props = {
  activeSurface: TaskContentFolderEditSurface;
  collapsed: boolean;
  folder: Pick<TaskContentFolder, "icon_key" | "id" | "name">;
  memberCount: number;
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  onRename?: (folderId: string, name: string) => Promise<boolean>;
  onSurfaceChange: (surface: TaskContentFolderEditSurface) => void;
  onToggle: () => void;
  onUpdateIcon?: (folderId: string, iconKey: string) => Promise<boolean>;
};

export function TaskContentFolderEditableHeader({
  activeSurface,
  collapsed,
  folder,
  memberCount,
  onContextMenu,
  onRename,
  onSurfaceChange,
  onToggle,
  onUpdateIcon,
}: Props) {
  const [draftName, setDraftName] = useState(folder.name);
  const [iconQuery, setIconQuery] = useState("");
  const submittingRenameRef = useRef(false);
  const switchingSurfaceRef = useRef(false);
  const chooserRef = useRef<HTMLDivElement | null>(null);
  const currentIconKey = isTaskTypeIconKey(folder.icon_key) ? folder.icon_key : "folder";
  const filteredIcons = searchTaskTypeIcons(iconQuery);
  const isActiveFolder = activeSurface?.folderId === folder.id;
  const isRenaming = isActiveFolder && activeSurface?.kind === "rename";
  const isChoosingIcon = isActiveFolder && activeSurface?.kind === "icon";

  useEffect(() => {
    if (!isRenaming) {
      setDraftName(folder.name);
      submittingRenameRef.current = false;
    }
  }, [folder.name, isRenaming]);

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

  return (
    <div
      className="relative flex w-full items-center gap-2 rounded-[1rem] border border-[#e7defb] bg-[#faf8ff] px-3 py-2 text-left text-sm text-[#4b4469] transition hover:border-[#c9bbff] dark:border-white/10 dark:bg-white/[0.035] dark:text-white/80"
      data-style-role="tasks.content-folder.header"
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

      {isRenaming ? (
        <input
          aria-label={`Rename ${folder.name}`}
          autoFocus
          className={`${TASK_TABLE_INLINE_RENAME_EDITOR_CLASS} min-w-0 flex-1 rounded-[0.45rem] border border-[#ddd2ff] bg-white outline-none transition focus:border-[#b7a7ff] dark:border-[#42306f] dark:bg-[#22193f] dark:focus:border-[#6d56d6]`}
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
          className="min-w-0 flex-1 appearance-none truncate border-0 bg-transparent p-0 text-left text-sm font-medium outline-none transition hover:opacity-85 focus-visible:rounded-[0.5rem] focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80 dark:focus-visible:ring-[#3b2f68]/90"
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

      <span className="shrink-0 text-xs text-[#8d87a7] dark:text-white/50" data-style-role="tasks.content-folder.count">
        {memberCount} visible {memberCount === 1 ? "Task" : "Tasks"}
      </span>
    </div>
  );
}
