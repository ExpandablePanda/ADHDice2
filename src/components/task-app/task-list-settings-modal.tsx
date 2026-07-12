"use client";

import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, ChevronsUp, GripVertical, Plus, X } from "lucide-react";
import { useState, type DragEvent } from "react";
import { ModalShell } from "@/components/modal-shell";
import { TaskTableChipButton, TASK_TABLE_INACTIVE_CHIP_CLASS, TASK_TABLE_TAG_CHIP_CLASS } from "@/components/ui/task-table-primitives";
import type { TaskEnergy, TaskStatus } from "@/lib/database.types";
import {
  appendTaskListRuleRow,
  normalizeTaskListRuleGroup,
  removeTaskListRuleRow,
  summarizeTaskListRules,
  type TaskListRuleField,
  type TaskListRuleRowOperator,
  updateTaskListRuleRow,
  updateTaskListRuleRowConnector,
} from "@/lib/task-list-rule-editor";
import { isTaskListSettingsEligible, type TaskListDefinition, type TaskListId, type TaskListRuleGroup, type parseTaskListRules } from "@/lib/task-lists";
import { TaskListRuleRowEditor } from "./task-list-rule-row-editor";

type TaskListSettingsDraft = {
  isCollapsed: boolean;
  isVisible: boolean;
  name: string;
  rules: TaskListRuleGroup | null;
};

export type TaskListSaveInput = {
  id: TaskListId;
  isVisible: boolean;
  name: string;
  orderedListIds: TaskListId[];
  rules: ReturnType<typeof parseTaskListRules>;
};

export type CustomTaskListInput = {
  membershipMode: "manual" | "rules";
  name: string;
  rules: ReturnType<typeof parseTaskListRules>;
};

type TaskListSettingsModalProps = {
  energyOptions: TaskEnergy[];
  fieldOptions: Array<{ label: string; value: TaskListRuleField }>;
  listCounts: Record<string, number>;
  lists: TaskListDefinition[];
  onClose: () => void;
  onCreateCustomList: (input: CustomTaskListInput) => Promise<boolean | { id: TaskListId; persisted: boolean }>;
  onDeleteList: (listId: TaskListId) => Promise<boolean>;
  onSaveList: (input: TaskListSaveInput) => Promise<boolean>;
  operatorOptionsByField: Record<TaskListRuleField, Array<{ label: string; value: TaskListRuleRowOperator }>>;
  taskStatusOptions: TaskStatus[];
};

function buildInitialDrafts(lists: TaskListDefinition[]) {
  return Object.fromEntries(
    lists.map((list, index) => [
      list.id,
      {
        isCollapsed: !(index === 0 && list.isVisible && list.type === "system"),
        isVisible: list.isVisible,
        name: list.name,
        rules: normalizeTaskListRuleGroup(list.rules),
      },
    ]),
  ) as Record<string, TaskListSettingsDraft>;
}

function reorderListIdsWithinGroup(
  listIds: TaskListId[],
  listId: TaskListId,
  targetListId: TaskListId,
  reorderableListIds: TaskListId[],
) {
  if (listId === targetListId) {
    return listIds;
  }

  const reorderableListIdSet = new Set(reorderableListIds);
  const orderedReorderableListIds = listIds.filter((currentListId) => reorderableListIdSet.has(currentListId));
  const currentIndex = orderedReorderableListIds.indexOf(listId);
  const targetIndex = orderedReorderableListIds.indexOf(targetListId);
  if (currentIndex < 0 || targetIndex < 0 || currentIndex === targetIndex) {
    return listIds;
  }

  const nextOrderedReorderableListIds = [...orderedReorderableListIds];
  const [movedListId] = nextOrderedReorderableListIds.splice(currentIndex, 1);
  if (!movedListId) {
    return listIds;
  }
  nextOrderedReorderableListIds.splice(targetIndex, 0, movedListId);

  let reorderableIndex = 0;
  const nextListIds = listIds.map((currentListId) => (
    reorderableListIdSet.has(currentListId)
      ? nextOrderedReorderableListIds[reorderableIndex++] ?? currentListId
      : currentListId
  ));

  return nextListIds.every((currentListId, index) => currentListId === listIds[index]) ? listIds : nextListIds;
}

function moveListIdToTopOfGroup(listIds: TaskListId[], listId: TaskListId, reorderableListIds: TaskListId[]) {
  const firstReorderableListId = listIds.find((currentListId) => reorderableListIds.includes(currentListId));
  if (!firstReorderableListId) {
    return listIds;
  }
  return reorderListIdsWithinGroup(listIds, listId, firstReorderableListId, reorderableListIds);
}

function moveListIdWithinGroup(
  listIds: TaskListId[],
  listId: TaskListId,
  direction: "up" | "down",
  reorderableListIds: TaskListId[],
) {
  const orderedReorderableListIds = listIds.filter((currentListId) => reorderableListIds.includes(currentListId));
  const currentIndex = orderedReorderableListIds.indexOf(listId);
  if (currentIndex < 0) {
    return listIds;
  }
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= orderedReorderableListIds.length) {
    return listIds;
  }
  return reorderListIdsWithinGroup(listIds, listId, orderedReorderableListIds[targetIndex]!, reorderableListIds);
}

export function TaskListSettingsModal({
  energyOptions,
  fieldOptions,
  listCounts,
  lists,
  onClose,
  onCreateCustomList,
  onDeleteList,
  onSaveList,
  operatorOptionsByField,
  taskStatusOptions,
}: TaskListSettingsModalProps) {
  const eligibleLists = lists.filter(isTaskListSettingsEligible);
  const listOptions = eligibleLists.map((list) => ({
    label: list.name,
    value: list.id,
  }));
  const listLabelById = Object.fromEntries(listOptions.map((list) => [list.value, list.label])) as Partial<Record<TaskListId, string>>;
  const [drafts, setDrafts] = useState<Record<string, TaskListSettingsDraft>>(() => buildInitialDrafts(eligibleLists));
  const [orderedListIds, setOrderedListIds] = useState<TaskListId[]>(() => eligibleLists.map((list) => list.id));
  const reorderableListIds = eligibleLists.map((list) => list.id);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [newListName, setNewListName] = useState("");
  const [newListMode, setNewListMode] = useState<"manual" | "rules">("manual");
  const [newListRules, setNewListRules] = useState<TaskListRuleGroup>({ rules: [] });
  const [createError, setCreateError] = useState<string | null>(null);
  const [draggedListId, setDraggedListId] = useState<TaskListId | null>(null);
  const [dragOverListId, setDragOverListId] = useState<TaskListId | null>(null);

  function updateDraft(listId: string, patch: Partial<TaskListSettingsDraft>) {
    setDrafts((current) => {
      const existing = current[listId];
      if (!existing) return current;
      return {
        ...current,
        [listId]: {
          ...existing,
          ...patch,
        },
      };
    });
  }

  async function handleSave(list: TaskListDefinition, draftOverride?: Partial<Pick<TaskListSettingsDraft, "isVisible">>) {
    const currentDraft = drafts[list.id];
    const draft = currentDraft ? { ...currentDraft, ...draftOverride } : null;
    if (!draft) return;

    let parsedRules = null;
    if (list.membershipMode !== "manual" && list.membershipMode !== "system") {
      parsedRules = draft.rules;
      if (!parsedRules || parsedRules.rules.length === 0) {
        setRowErrors((current) => ({
          ...current,
          [list.id]: "Pick at least one rule for a rules-based list.",
        }));
        return;
      }
    }

    setRowErrors((current) => {
      const next = { ...current };
      delete next[list.id];
      return next;
    });

    const success = await onSaveList({
      id: list.id,
      isVisible: draft.isVisible,
      name: draft.name.trim() || list.name,
      orderedListIds,
      rules: parsedRules,
    });

    if (!success) {
      setRowErrors((current) => ({
        ...current,
        [list.id]: current[list.id] ?? "Save failed. Check the banner message for details.",
      }));
    }
  }

  async function handleCreateCustomList() {
    const trimmedName = newListName.trim();
    if (!trimmedName) {
      setCreateError("Custom lists need a name.");
      return;
    }

    let parsedRules = null;
    if (newListMode === "rules") {
      parsedRules = newListRules;
      if (!parsedRules.rules.length) {
        setCreateError("Custom smart lists need at least one rule.");
        return;
      }
    }

    setCreateError(null);
    const success = await onCreateCustomList({
      membershipMode: newListMode,
      name: trimmedName,
      rules: parsedRules,
    });

    if (success) {
      setNewListName("");
      setNewListMode("manual");
      setNewListRules({ rules: [] });
    }
  }

  function handleReorderDragStart(event: DragEvent<HTMLButtonElement>, listId: TaskListId) {
    event.dataTransfer.effectAllowed = "move";
    setDraggedListId(listId);
    setDragOverListId(listId);
  }

  function handleReorderDragOver(event: DragEvent<HTMLElement>, targetListId: TaskListId) {
    if (!draggedListId || draggedListId === targetListId) {
      return;
    }

    event.preventDefault();
    setDragOverListId(targetListId);
    setOrderedListIds((current) => reorderListIdsWithinGroup(current, draggedListId, targetListId, reorderableListIds));
  }

  function handleReorderDragEnd() {
    setDraggedListId(null);
    setDragOverListId(null);
  }

  return (
    <ModalShell className="adhdice-scrollbar w-full max-w-[56rem] max-h-[92vh] overflow-y-auto rounded-[2rem] border border-[#ece8f8] bg-white p-6 shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]" label="List settings" onClose={onClose}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#7a63f7] dark:text-[#c9bbff]">Lists</p>
            <h2 className="mt-2 text-2xl font-black text-[#1f2642] dark:text-white">List settings</h2>
            <p className="mt-2 text-sm text-[#7d88a1] dark:text-white/55">
              Review built-in behavior, change visibility, and edit smart-list rules. Custom lists can be manual or rules-based.
            </p>
          </div>
          <button aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f0ff] text-[#6f57f6] dark:bg-white/8 dark:text-white" onClick={onClose} type="button">
            <X className="h-4 w-4" />
          </button>
        </div>

        <section className="rounded-[1.5rem] border border-[#ece8f8] bg-[#faf8ff] p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">New custom list</p>
              <p className="mt-1 text-sm text-[#68738f] dark:text-white/55">Create a manual list or a smart list that matches tasks by rules.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.2fr)_12rem]">
            <input className="rounded-[1rem] border border-[#ddd6fb] bg-white px-4 py-3 text-sm text-[#27304c] outline-none dark:border-white/10 dark:bg-white/[0.05] dark:text-white" onChange={(event) => setNewListName(event.target.value)} placeholder="Weekend Reset" value={newListName} />
            <select className="rounded-[1rem] border border-[#ddd6fb] bg-white px-4 py-3 text-sm text-[#27304c] outline-none dark:border-white/10 dark:bg-white/[0.05] dark:text-white" onChange={(event) => setNewListMode(event.target.value as "manual" | "rules")} value={newListMode}>
              <option value="manual">Manual custom list</option>
              <option value="rules">Smart custom list</option>
            </select>
          </div>
          {newListMode === "rules" ? (
            <div className="mt-3 space-y-3 rounded-[1rem] border border-[#ddd6fb] bg-white px-4 py-3 dark:border-white/10 dark:bg-white/[0.05]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Rules</span>
              </div>
              <div className="space-y-2">
                {newListRules.rules.map((row, ruleIndex) => (
                  <div className="space-y-2" key={`new-list-rule-${ruleIndex}`}>
                    {ruleIndex > 0 ? (
                      <div className="flex items-center gap-2 px-2">
                        {(["and", "or"] as const).map((connector) => (
                          <TaskTableChipButton
                            className="transition"
                            key={`new-list-${ruleIndex}-${connector}`}
                            onClick={() => setNewListRules((current) => updateTaskListRuleRowConnector(current, ruleIndex, connector))}
                            toneClassName={row.connector === connector ? TASK_TABLE_TAG_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}
                          >
                            {connector === "and" ? "And" : "Or"}
                          </TaskTableChipButton>
                        ))}
                      </div>
                    ) : null}
                    <TaskListRuleRowEditor
                      energyOptions={energyOptions}
                      fieldOptions={fieldOptions}
                      listLabelById={listLabelById}
                      listOptions={listOptions}
                      onChange={(nextRule) => setNewListRules((current) => updateTaskListRuleRow(current, ruleIndex, nextRule))}
                      onRemove={() => setNewListRules((current) => removeTaskListRuleRow(current, ruleIndex))}
                      operatorOptionsByField={operatorOptionsByField}
                      rule={row.rule}
                      taskStatusOptions={taskStatusOptions}
                    />
                  </div>
                ))}
              </div>
              <TaskTableChipButton
                className="gap-2 transition"
                onClick={() => setNewListRules((current) => appendTaskListRuleRow(current))}
              >
                <Plus className="h-4 w-4" />
                Add rule
              </TaskTableChipButton>
            </div>
          ) : null}
          {createError ? <p className="mt-3 text-sm text-[#d94e67] dark:text-[#ff9eaf]">{createError}</p> : null}
          <div className="mt-4 flex justify-end">
            <button className="ui-pill-button-strong-light transition hover:bg-[#5e49d6] dark:bg-[#cabfff] dark:text-[#1a1431] dark:hover:bg-[#bda9ff]" onClick={() => { void handleCreateCustomList(); }} type="button">
              Create custom list
            </button>
          </div>
        </section>

        <div className="space-y-4">
          {orderedListIds.map((listId, listIndex) => {
            const list = eligibleLists.find((entry) => entry.id === listId);
            if (!list) return null;
            const draft = drafts[list.id];
            if (!draft) return null;
            const isReorderable = true;
            const reorderableListIndex = orderedListIds.filter((currentListId) => reorderableListIds.includes(currentListId)).indexOf(list.id);
            const reorderableListCount = reorderableListIds.length;
            return (
              <section
                className={`rounded-[1.5rem] border bg-white p-4 shadow-[0_12px_30px_rgba(81,61,168,0.05)] dark:bg-white/[0.03] ${
                  draggedListId === list.id
                    ? "border-[#c9bcff] opacity-80 dark:border-[#6e5ab2]"
                    : dragOverListId === list.id
                      ? "border-[#b9a8ff] ring-2 ring-[#ede7ff] dark:border-[#7f6cd1] dark:ring-[#2d214f]"
                      : "border-[#ece8f8] dark:border-white/10"
                }`}
                key={list.id}
                onDragOver={isReorderable ? (event) => handleReorderDragOver(event, list.id) : undefined}
                onDrop={isReorderable ? (event) => {
                  event.preventDefault();
                  handleReorderDragEnd();
                } : undefined}
              >
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-[#1f2642] dark:text-white">{list.name}</h3>
                      <span className="rounded-full bg-[#f3efff] px-2.5 py-1 text-[11px] font-semibold text-[#6f57f6] dark:bg-[#261e49] dark:text-[#cabfff]">{list.type === "system" ? "System List" : list.type === "smart" ? "Smart List" : "Custom List"}</span>
                      <span className="rounded-full bg-[#f7f4ff] px-2.5 py-1 text-[11px] font-semibold text-[#7a7397] dark:bg-white/[0.06] dark:text-white/55">{list.membershipMode === "manual" ? "Manual" : list.membershipMode === "hybrid" ? "Hybrid" : list.membershipMode === "system" ? "System" : "Rules only"}</span>
                    </div>
                    <p className="mt-2 text-sm text-[#68738f] dark:text-white/55">{list.description}</p>
                    <p className="mt-1 text-xs text-[#8d87a7] dark:text-white/35">{listCounts[list.id] ?? 0} task{(listCounts[list.id] ?? 0) === 1 ? "" : "s"} currently visible</p>
                    <p className="mt-1 text-xs text-[#8d87a7] dark:text-white/35">Rail order: {listIndex + 1}</p>
                    {draft.isCollapsed ? <p className="mt-2 text-xs text-[#7a7397] dark:text-white/45">{list.membershipMode === "manual" ? "Manual list membership." : list.membershipMode === "system" ? "Membership is controlled from the task toolbar." : summarizeTaskListRules(draft.rules, (listId) => listLabelById[listId] ?? "")}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2 md:self-start">
                    {isReorderable ? (
                      <>
                        <TaskTableChipButton
                          className="gap-2 transition"
                          disabled={reorderableListIndex <= 0}
                          onClick={() => setOrderedListIds((current) => moveListIdToTopOfGroup(current, list.id, reorderableListIds))}
                          toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}
                        >
                          <ChevronsUp className="h-4 w-4" />
                          Move to top
                        </TaskTableChipButton>
                        <button
                          aria-label={`Drag to reorder ${list.name}`}
                          className="inline-flex h-10 w-10 cursor-grab items-center justify-center rounded-full border border-[#ddd6fb] bg-white text-[#5c6684] transition hover:border-[#c9bcff] hover:text-[#6f57f6] active:cursor-grabbing dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70 dark:hover:text-[#cabfff]"
                          draggable
                          onDragEnd={handleReorderDragEnd}
                          onDragStart={(event) => handleReorderDragStart(event, list.id)}
                          type="button"
                        >
                          <GripVertical className="h-4 w-4" />
                        </button>
                      </>
                    ) : null}
                    <button
                      aria-label={`Move ${list.name} earlier in the rail`}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#ddd6fb] bg-white text-[#5c6684] transition hover:border-[#c9bcff] hover:text-[#6f57f6] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70 dark:hover:text-[#cabfff]"
                      disabled={isReorderable ? reorderableListIndex <= 0 : listIndex === 0}
                      onClick={() => setOrderedListIds((current) => (
                        isReorderable
                          ? moveListIdWithinGroup(current, list.id, "up", reorderableListIds)
                          : current
                      ))}
                      type="button"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      aria-label={`Move ${list.name} later in the rail`}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#ddd6fb] bg-white text-[#5c6684] transition hover:border-[#c9bcff] hover:text-[#6f57f6] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70 dark:hover:text-[#cabfff]"
                      disabled={isReorderable ? reorderableListIndex === reorderableListCount - 1 : listIndex === orderedListIds.length - 1}
                      onClick={() => setOrderedListIds((current) => (
                        isReorderable
                          ? moveListIdWithinGroup(current, list.id, "down", reorderableListIds)
                          : current
                      ))}
                      type="button"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button aria-label={draft.isCollapsed ? `Expand ${list.name}` : `Collapse ${list.name}`} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#ddd6fb] bg-white text-[#5c6684] transition hover:border-[#c9bcff] hover:text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70 dark:hover:text-[#cabfff]" onClick={() => updateDraft(list.id, { isCollapsed: !draft.isCollapsed })} type="button">
                      {draft.isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                    </button>
                    {list.type === "custom" && list.isDeletable ? (
                      <button className="ui-pill-button-danger-light transition hover:border-[#ef9aab] dark:border-[#5b2e3b] dark:bg-white/[0.05] dark:text-[#ff9eaf]" onClick={() => { void onDeleteList(list.id); }} type="button">
                        Delete
                      </button>
                    ) : null}
                    {list.type !== "custom" && list.id !== "all" ? (
                      <button
                        className="ui-pill-button-light transition hover:border-[#c9bcff] hover:text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70 dark:hover:text-[#cabfff]"
                        onClick={() => {
                          const nextIsVisible = !draft.isVisible;
                          updateDraft(list.id, { isVisible: nextIsVisible });
                          void handleSave(list, { isVisible: nextIsVisible });
                        }}
                        type="button"
                      >
                        {draft.isVisible ? "Hide" : "Show"}
                      </button>
                    ) : null}
                    <button className="ui-pill-button-light transition hover:border-[#c9bcff] hover:text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70 dark:hover:text-[#cabfff]" onClick={() => { void handleSave(list); }} type="button">
                      Save
                    </button>
                  </div>
                </div>
                {!draft.isCollapsed ? (
                  <>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Name</span>
                        <input className="w-full rounded-[1rem] border border-[#ddd6fb] bg-white px-4 py-3 text-sm text-[#27304c] outline-none disabled:cursor-not-allowed disabled:bg-[#f7f4ff] disabled:text-[#8d87a7] dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:disabled:bg-white/[0.03] dark:disabled:text-white/35" disabled={list.type !== "custom"} onChange={(event) => updateDraft(list.id, { name: event.target.value })} value={draft.name} />
                      </label>
                      <label className="flex items-end">
                        <span className="flex w-full items-center justify-between rounded-[1rem] border border-[#ddd6fb] bg-white px-4 py-3 text-sm text-[#27304c] dark:border-white/10 dark:bg-white/[0.05] dark:text-white">
                          <span>
                            <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Visible in rail</span>
                            <span className="mt-1 block">Show this list in the main rail.</span>
                          </span>
                          <input checked={draft.isVisible} className="h-4 w-4 rounded border-[#d9cffb] text-[#6f57f6] focus:ring-[#6f57f6]" onChange={(event) => updateDraft(list.id, { isVisible: event.target.checked })} type="checkbox" />
                        </span>
                      </label>
                    </div>
                    {list.membershipMode !== "manual" && list.membershipMode !== "system" ? (
                      <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Rules</span>
                        </div>
                        <div className="space-y-2">
                          {(draft.rules?.rules ?? []).map((row, ruleIndex) => (
                            <div className="space-y-2" key={`${list.id}-rule-${ruleIndex}`}>
                              {ruleIndex > 0 ? (
                                <div className="flex items-center gap-2 px-2">
                                  {(["and", "or"] as const).map((connector) => (
                                    <TaskTableChipButton
                                      className="transition"
                                      key={`${list.id}-${ruleIndex}-${connector}`}
                                      onClick={() => updateDraft(list.id, { rules: updateTaskListRuleRowConnector(draft.rules ?? { rules: [] }, ruleIndex, connector) })}
                                      toneClassName={row.connector === connector ? TASK_TABLE_TAG_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}
                                    >
                                      {connector === "and" ? "And" : "Or"}
                                    </TaskTableChipButton>
                                  ))}
                                </div>
                              ) : null}
                              <TaskListRuleRowEditor
                                energyOptions={energyOptions}
                                fieldOptions={fieldOptions}
                                listLabelById={listLabelById}
                                listOptions={listOptions}
                                onChange={(nextRule) => updateDraft(list.id, { rules: updateTaskListRuleRow(draft.rules ?? { rules: [] }, ruleIndex, nextRule) })}
                                onRemove={() => updateDraft(list.id, { rules: removeTaskListRuleRow(draft.rules ?? { rules: [] }, ruleIndex) })}
                                operatorOptionsByField={operatorOptionsByField}
                                rule={row.rule}
                                taskStatusOptions={taskStatusOptions}
                              />
                            </div>
                          ))}
                        </div>
                        <TaskTableChipButton
                          className="gap-2 transition"
                          onClick={() => updateDraft(list.id, { rules: appendTaskListRuleRow(draft.rules ?? { rules: [] }) })}
                        >
                          <Plus className="h-4 w-4" />
                          Add rule
                        </TaskTableChipButton>
                      </div>
                    ) : list.membershipMode === "manual" ? (
                      <div className="mt-4 rounded-[1rem] border border-dashed border-[#ddd6fb] bg-[#faf8ff] px-4 py-3 text-sm text-[#68738f] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55">
                        This is a manual list. Tasks appear here when you explicitly add them.
                      </div>
                    ) : null}
                    {rowErrors[list.id] ? <p className="mt-3 text-sm text-[#d94e67] dark:text-[#ff9eaf]">{rowErrors[list.id]}</p> : null}
                  </>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    </ModalShell>
  );
}
