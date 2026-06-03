"use client";

import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { useState } from "react";
import { ModalShell } from "@/components/modal-shell";
import type { TaskEnergy, TaskStatus } from "@/lib/database.types";
import {
  createDefaultTaskListRule,
  normalizeTaskListRuleGroup,
  summarizeTaskListRules,
  type TaskListRuleField,
  type TaskListRuleRowOperator,
} from "@/lib/task-list-rule-editor";
import type { TaskListDefinition, TaskListId, TaskListRuleGroup, parseTaskListRules } from "@/lib/task-lists";
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
  onCreateCustomList: (input: CustomTaskListInput) => Promise<boolean>;
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
  const [drafts, setDrafts] = useState<Record<string, TaskListSettingsDraft>>(() => buildInitialDrafts(lists));
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [newListName, setNewListName] = useState("");
  const [newListMode, setNewListMode] = useState<"manual" | "rules">("manual");
  const [newListRules, setNewListRules] = useState<TaskListRuleGroup>({ combinator: "all", rules: [] });
  const [createError, setCreateError] = useState<string | null>(null);

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

  async function handleSave(list: TaskListDefinition) {
    const draft = drafts[list.id];
    if (!draft) return;

    let parsedRules = null;
    if (list.membershipMode !== "manual") {
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
      setNewListRules({ combinator: "all", rules: [] });
    }
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
                <div className="flex items-center gap-2">
                  {(["all", "any"] as const).map((value) => {
                    const active = newListRules.combinator === value;
                    return (
                      <button className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${active ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]" : "bg-[#f5f1ff] text-[#6f57f6] dark:bg-white/[0.06] dark:text-[#cabfff]"}`} key={`new-list-${value}`} onClick={() => setNewListRules((current) => ({ ...current, combinator: value }))} type="button">
                        {value === "all" ? "Match all" : "Match any"}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                {newListRules.rules.map((rule, ruleIndex) => (
                  <TaskListRuleRowEditor
                    energyOptions={energyOptions}
                    fieldOptions={fieldOptions}
                    key={`new-list-rule-${ruleIndex}`}
                    onChange={(nextRule) => setNewListRules((current) => ({
                      ...current,
                      rules: current.rules.map((entry, index) => (index === ruleIndex ? nextRule : entry)),
                    }))}
                    onRemove={() => setNewListRules((current) => ({
                      ...current,
                      rules: current.rules.filter((_, index) => index !== ruleIndex),
                    }))}
                    operatorOptionsByField={operatorOptionsByField}
                    rule={rule}
                    taskStatusOptions={taskStatusOptions}
                  />
                ))}
              </div>
              <button className="inline-flex items-center gap-2 rounded-full border border-[#ddd6fb] bg-white px-4 py-2 text-sm font-semibold text-[#5c6684] transition hover:border-[#c9bcff] hover:text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70 dark:hover:text-[#cabfff]" onClick={() => setNewListRules((current) => ({ ...current, rules: [...current.rules, createDefaultTaskListRule()] }))} type="button">
                <Plus className="h-4 w-4" />
                Add rule
              </button>
            </div>
          ) : null}
          {createError ? <p className="mt-3 text-sm text-[#d94e67] dark:text-[#ff9eaf]">{createError}</p> : null}
          <div className="mt-4 flex justify-end">
            <button className="rounded-full bg-[#6f57f6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5e49d6] dark:bg-[#cabfff] dark:text-[#1a1431] dark:hover:bg-[#bda9ff]" onClick={() => { void handleCreateCustomList(); }} type="button">
              Create custom list
            </button>
          </div>
        </section>

        <div className="space-y-4">
          {lists.map((list) => {
            const draft = drafts[list.id];
            if (!draft) return null;
            return (
              <section className="rounded-[1.5rem] border border-[#ece8f8] bg-white p-4 shadow-[0_12px_30px_rgba(81,61,168,0.05)] dark:border-white/10 dark:bg-white/[0.03]" key={list.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-[#1f2642] dark:text-white">{list.name}</h3>
                      <span className="rounded-full bg-[#f3efff] px-2.5 py-1 text-[11px] font-semibold text-[#6f57f6] dark:bg-[#261e49] dark:text-[#cabfff]">{list.type === "system" ? "System List" : list.type === "smart" ? "Smart List" : "Custom List"}</span>
                      <span className="rounded-full bg-[#f7f4ff] px-2.5 py-1 text-[11px] font-semibold text-[#7a7397] dark:bg-white/[0.06] dark:text-white/55">{list.membershipMode === "manual" ? "Manual" : list.membershipMode === "hybrid" ? "Hybrid" : "Rules only"}</span>
                    </div>
                    <p className="mt-2 text-sm text-[#68738f] dark:text-white/55">{list.description}</p>
                    <p className="mt-1 text-xs text-[#8d87a7] dark:text-white/35">{listCounts[list.id] ?? 0} task{(listCounts[list.id] ?? 0) === 1 ? "" : "s"} currently visible</p>
                    {draft.isCollapsed ? <p className="mt-2 text-xs text-[#7a7397] dark:text-white/45">{list.membershipMode === "manual" ? "Manual list membership." : summarizeTaskListRules(draft.rules)}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button aria-label={draft.isCollapsed ? `Expand ${list.name}` : `Collapse ${list.name}`} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#ddd6fb] bg-white text-[#5c6684] transition hover:border-[#c9bcff] hover:text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70 dark:hover:text-[#cabfff]" onClick={() => updateDraft(list.id, { isCollapsed: !draft.isCollapsed })} type="button">
                      {draft.isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                    </button>
                    {list.type === "custom" && list.isDeletable ? (
                      <button className="rounded-full border border-[#f5c9d1] bg-white px-4 py-2 text-sm font-semibold text-[#d94e67] transition hover:border-[#ef9aab] dark:border-[#5b2e3b] dark:bg-white/[0.05] dark:text-[#ff9eaf]" onClick={() => { void onDeleteList(list.id); }} type="button">
                        Delete
                      </button>
                    ) : null}
                    <button className="rounded-full border border-[#ddd6fb] bg-white px-4 py-2 text-sm font-semibold text-[#5c6684] transition hover:border-[#c9bcff] hover:text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70 dark:hover:text-[#cabfff]" onClick={() => { void handleSave(list); }} type="button">
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
                    {list.membershipMode !== "manual" ? (
                      <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Rules</span>
                          <div className="flex items-center gap-2">
                            {(["all", "any"] as const).map((value) => {
                              const active = (draft.rules?.combinator ?? "all") === value;
                              return (
                                <button className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${active ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]" : "bg-[#f5f1ff] text-[#6f57f6] dark:bg-white/[0.06] dark:text-[#cabfff]"}`} key={`${list.id}-${value}`} onClick={() => updateDraft(list.id, { rules: { combinator: value, rules: draft.rules?.rules ?? [] } })} type="button">
                                  {value === "all" ? "Match all" : "Match any"}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="space-y-2">
                          {(draft.rules?.rules ?? []).map((rule, ruleIndex) => (
                            <TaskListRuleRowEditor
                              energyOptions={energyOptions}
                              fieldOptions={fieldOptions}
                              key={`${list.id}-rule-${ruleIndex}`}
                              onChange={(nextRule) => updateDraft(list.id, { rules: { combinator: draft.rules?.combinator ?? "all", rules: (draft.rules?.rules ?? []).map((entry, index) => (index === ruleIndex ? nextRule : entry)) } })}
                              onRemove={() => updateDraft(list.id, { rules: { combinator: draft.rules?.combinator ?? "all", rules: (draft.rules?.rules ?? []).filter((_, index) => index !== ruleIndex) } })}
                              operatorOptionsByField={operatorOptionsByField}
                              rule={rule}
                              taskStatusOptions={taskStatusOptions}
                            />
                          ))}
                        </div>
                        <button className="inline-flex items-center gap-2 rounded-full border border-[#ddd6fb] bg-white px-4 py-2 text-sm font-semibold text-[#5c6684] transition hover:border-[#c9bcff] hover:text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70 dark:hover:text-[#cabfff]" onClick={() => updateDraft(list.id, { rules: { combinator: draft.rules?.combinator ?? "all", rules: [...(draft.rules?.rules ?? []), createDefaultTaskListRule()] } })} type="button">
                          <Plus className="h-4 w-4" />
                          Add rule
                        </button>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[1rem] border border-dashed border-[#ddd6fb] bg-[#faf8ff] px-4 py-3 text-sm text-[#68738f] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55">
                        This is a manual list. Tasks appear here when you explicitly add them.
                      </div>
                    )}
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
