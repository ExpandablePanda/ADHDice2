"use client";

import { useMemo } from "react";
import { ArrowRight, Check, Pencil, Trash2, X } from "lucide-react";
import { TaskTableChipButton, TASK_TABLE_ACTIVE_LIST_CHIP_CLASS, TASK_TABLE_BODY_MUTED_VALUE_CLASS, TASK_TABLE_BODY_VALUE_CLASS, TASK_TABLE_INACTIVE_CHIP_CLASS, TASK_TABLE_LIST_CHIP_CLASS, TASK_TABLE_TITLE_CELL_CLASS } from "@/components/ui/task-table-primitives";
import type { DuplicateTitleGroup } from "@/lib/task-app-derived";
import type { TaskListDefinition } from "@/lib/task-lists";

type DuplicateTaskGroupsPanelProps = {
  groups: DuplicateTitleGroup[];
  listDefinitions: TaskListDefinition[];
  listMembershipsByTaskId: Record<string, Array<{ id: string; isManual: boolean }>>;
  onClearSelection: () => void;
  onOpenBatchDelete?: () => void;
  onOpenBatchEdit?: () => void;
  onOpenDeleteTask?: (taskId: string) => void;
  onOpenTaskEditor?: (taskId: string) => void;
  onSelectTaskIds: (taskIds: string[]) => void;
  onToggleTaskSelection?: (taskId: string, options?: { additive?: boolean }) => void;
  selectedTaskIds: string[];
};

function formatCreatedAtLabel(createdAt: string) {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return "Created date unavailable";
  }

  return `Created ${parsed.toLocaleDateString()}`;
}

function getKeepNewestSelection(group: DuplicateTitleGroup) {
  return group.tasks.slice(1).map((task) => task.id);
}

function getKeepOldestSelection(group: DuplicateTitleGroup) {
  return group.tasks.slice(0, -1).map((task) => task.id);
}

export function DuplicateTaskGroupsPanel({
  groups,
  listDefinitions,
  listMembershipsByTaskId,
  onClearSelection,
  onOpenBatchDelete,
  onOpenBatchEdit,
  onOpenDeleteTask,
  onOpenTaskEditor,
  onSelectTaskIds,
  onToggleTaskSelection,
  selectedTaskIds,
}: DuplicateTaskGroupsPanelProps) {
  const selectedTaskIdSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);
  const listDefinitionById = useMemo(
    () => new Map(listDefinitions.map((list) => [list.id, list])),
    [listDefinitions],
  );

  return (
    <section className="space-y-4">
      <div className="rounded-[1.4rem] border border-[#ece8f8] bg-white/90 p-4 shadow-[0_16px_40px_rgba(81,61,168,0.06)] dark:border-white/10 dark:bg-white/6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#938ab8] dark:text-white/42">Duplicate title mode</p>
            <p className="mt-1 text-sm text-[#7d7597] dark:text-white/55">Showing duplicate titles across all non-trash tasks. No delete, trash, or merge action runs automatically here.</p>
          </div>
          {selectedTaskIds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#f1ecff] px-3 py-1.5 text-xs font-semibold text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]">
                {selectedTaskIds.length} selected
              </span>
              {selectedTaskIds.length === 1 && onOpenTaskEditor ? (
                <TaskTableChipButton onClick={() => onOpenTaskEditor(selectedTaskIds[0])}>
                  <span className="inline-flex items-center gap-1.5">
                    <Pencil className="h-3.5 w-3.5" />
                    Edit selected
                  </span>
                </TaskTableChipButton>
              ) : null}
              {selectedTaskIds.length > 1 && onOpenBatchEdit ? (
                <TaskTableChipButton onClick={onOpenBatchEdit}>
                  <span className="inline-flex items-center gap-1.5">
                    <Pencil className="h-3.5 w-3.5" />
                    Batch edit
                  </span>
                </TaskTableChipButton>
              ) : null}
              {(selectedTaskIds.length === 1 && onOpenDeleteTask) || (selectedTaskIds.length > 1 && onOpenBatchDelete) ? (
                <TaskTableChipButton onClick={() => {
                  if (selectedTaskIds.length === 1) {
                    onOpenDeleteTask?.(selectedTaskIds[0]);
                    return;
                  }

                  onOpenBatchDelete?.();
                }}>
                  <span className="inline-flex items-center gap-1.5">
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete selected
                  </span>
                </TaskTableChipButton>
              ) : null}
              <TaskTableChipButton onClick={onClearSelection}>
                <span className="inline-flex items-center gap-1.5">
                  <X className="h-3.5 w-3.5" />
                  Clear selection
                </span>
              </TaskTableChipButton>
            </div>
          ) : null}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-[1.25rem] border border-dashed border-[#ddd6f9] bg-[#faf8ff] px-4 py-5 text-sm text-[#7b84a0] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55">
          No duplicate title groups match the current search and filters.
        </div>
      ) : null}

      {groups.map((group) => (
        <article className="rounded-[1.4rem] border border-[#ece8f8] bg-white/90 p-4 shadow-[0_16px_40px_rgba(81,61,168,0.06)] dark:border-white/10 dark:bg-white/6" key={group.normalizedTitle}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#352e55] dark:text-white/82">{group.displayTitle}</h2>
              <p className="mt-1 text-sm text-[#7d7597] dark:text-white/55">{group.count} task{group.count === 1 ? "" : "s"}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <TaskTableChipButton onClick={() => onSelectTaskIds(group.tasks.map((task) => task.id))}>
                Select all in group
              </TaskTableChipButton>
              <TaskTableChipButton onClick={() => onSelectTaskIds(getKeepNewestSelection(group))}>
                Keep newest
              </TaskTableChipButton>
              <TaskTableChipButton onClick={() => onSelectTaskIds(getKeepOldestSelection(group))}>
                Keep oldest
              </TaskTableChipButton>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {group.tasks.map((task) => {
              const isSelected = selectedTaskIdSet.has(task.id);
              const memberships = (listMembershipsByTaskId[task.id] ?? [])
                .map((membership) => ({
                  id: membership.id,
                  isManual: membership.isManual,
                  label: listDefinitionById.get(membership.id)?.name ?? membership.id,
                }))
                .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));

              return (
                <div
                  className={`rounded-[1.1rem] border px-3 py-3 transition ${
                    isSelected
                      ? "border-[#d8cdfc] bg-[#f7f3ff] dark:border-[#473a73] dark:bg-[#1f1738]"
                      : "border-[#efebf8] bg-[#fcfbff] dark:border-white/10 dark:bg-[#151126]"
                  }`}
                  key={task.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <button
                        className={`min-w-0 bg-transparent p-0 text-left ${TASK_TABLE_TITLE_CELL_CLASS}`}
                        onClick={() => onOpenTaskEditor?.(task.id)}
                        type="button"
                      >
                        <span className="line-clamp-2">{task.title}</span>
                      </button>
                      <div className={`mt-1 flex flex-wrap items-center gap-2 text-sm ${TASK_TABLE_BODY_MUTED_VALUE_CLASS}`}>
                        <span>{formatCreatedAtLabel(task.created_at)}</span>
                        <span className="opacity-40">•</span>
                        <span className={TASK_TABLE_BODY_VALUE_CLASS}>{task.id.slice(0, 8)}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <TaskTableChipButton
                        onClick={() => onToggleTaskSelection?.(task.id, { additive: true })}
                        toneClassName={isSelected ? TASK_TABLE_ACTIVE_LIST_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Check className="h-3.5 w-3.5" />
                          {isSelected ? "Selected" : "Select"}
                        </span>
                      </TaskTableChipButton>
                      {onOpenTaskEditor ? (
                        <TaskTableChipButton onClick={() => onOpenTaskEditor(task.id)}>
                          <span className="inline-flex items-center gap-1.5">
                            <ArrowRight className="h-3.5 w-3.5" />
                            Open
                          </span>
                        </TaskTableChipButton>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {memberships.length > 0 ? memberships.map((membership) => (
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-1 text-[13px] font-medium leading-none ${
                          membership.isManual ? TASK_TABLE_ACTIVE_LIST_CHIP_CLASS : TASK_TABLE_LIST_CHIP_CLASS
                        }`}
                        key={`${task.id}:${membership.id}`}
                      >
                        {membership.label}
                      </span>
                    )) : (
                      <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[13px] font-medium leading-none ${TASK_TABLE_INACTIVE_CHIP_CLASS}`}>
                        No visible lists
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      ))}
    </section>
  );
}
