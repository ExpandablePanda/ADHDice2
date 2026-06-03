"use client";

import { X } from "lucide-react";
import { useState } from "react";

import type { TaskEnergy, TaskPriority, TaskRepeatFrequency } from "@/lib/database.types";
import type { TaskRoutingBucket } from "@/lib/task-buckets";

import { ModalShell } from "../modal-shell";
import {
  CompactDateTimeField,
  CompactSelectField,
  EditorCollapsibleSection,
  LabeledInput,
  Pill,
  TagChipInput,
} from "./task-editor-fields";

type BatchFieldMode = "clear" | "set" | "unchanged";
type BatchBooleanChoice = "false" | "true" | "unchanged";
type BatchRouteChoice = TaskRoutingBucket | "clear" | "focus" | "unchanged";
type BatchTagsMode = "clear" | "replace" | "unchanged";

export type BatchTaskEditDraft = {
  dueOn: string;
  dueOnMode: BatchFieldMode;
  energy: TaskEnergy | "unchanged";
  estimatedMinutes: string;
  estimatedMinutesMode: BatchFieldMode;
  focusToday: BatchBooleanChoice;
  isImportant: BatchBooleanChoice;
  isUrgent: BatchBooleanChoice;
  oneStepAtATime: BatchBooleanChoice;
  priority: TaskPriority | "unchanged";
  repeatDayOfMonth: string;
  repeatDaysOfWeek: number[];
  repeatFrequency: TaskRepeatFrequency | "unchanged";
  repeatInterval: string;
  route: BatchRouteChoice;
  status: "done" | "did_my_best" | "in_progress" | "missed" | "not_due" | "pending" | "unchanged" | "upcoming";
  subtasksAutoReset: BatchBooleanChoice;
  tags: string[];
  tagsMode: BatchTagsMode;
};

export function TaskBatchEditModal({
  allTags,
  count,
  energyOptions,
  onClose,
  onSave,
  priorityOptions,
  repeatFrequencyOptions,
  repeatWeekdayOptions,
}: {
  allTags: string[];
  count: number;
  energyOptions: TaskEnergy[];
  onClose: () => void;
  onSave: (draft: BatchTaskEditDraft) => Promise<void>;
  priorityOptions: TaskPriority[];
  repeatFrequencyOptions: TaskRepeatFrequency[];
  repeatWeekdayOptions: readonly { label: string; value: number }[];
}) {
  const [draft, setDraft] = useState<BatchTaskEditDraft>(() => createEmptyBatchTaskEditDraft());
  const [isSaving, setIsSaving] = useState(false);
  const isDirty = serializeBatchTaskEditDraft(draft) !== serializeBatchTaskEditDraft(createEmptyBatchTaskEditDraft());

  const statusOptions = ["unchanged", "pending", "in_progress", "done", "missed", "did_my_best", "upcoming", "not_due"] as const;
  const routeOptions = ["unchanged", "inbox", "today", "focus", "waiting", "later", "clear"] as const;
  const priorityOptionsWithUnchanged = ["unchanged", ...priorityOptions] as const;
  const energyOptionsWithUnchanged = ["unchanged", ...energyOptions] as const;
  const repeatOptions = ["unchanged", ...repeatFrequencyOptions] as const;
  const booleanOptions = ["unchanged", "true", "false"] as const;
  const fieldModeOptions = ["unchanged", "set", "clear"] as const;
  const tagsModeOptions = ["unchanged", "replace", "clear"] as const;

  return (
    <ModalShell className="adhdice-scrollbar max-h-[92vh] w-full max-w-[42rem] overflow-y-auto rounded-[2rem] border border-[#ece8f8] bg-white shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]" label="Batch edit tasks" onClose={onClose}>
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#ece8f8] bg-white px-5 py-4 dark:border-white/10 dark:bg-[#171328]">
        <button aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f0ff] text-[#6f57f6] dark:bg-white/8 dark:text-white" onClick={onClose} type="button">
          <X className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#7a63f7] dark:text-[#c9bbff]">Batch Edit</p>
          <p className="text-sm text-[#7d88a1] dark:text-white/50">Apply structured changes to {count} selected task{count === 1 ? "" : "s"}.</p>
        </div>
      </div>

      <form
        className="space-y-6 px-5 pb-6 pt-5"
        onSubmit={async (event) => {
          event.preventDefault();
          setIsSaving(true);
          await onSave(draft);
          setIsSaving(false);
        }}
      >
        <EditorCollapsibleSection defaultOpen summary="Status, routing, urgency, and focus." title="Core metadata">
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <CompactSelectField
                label="Status"
                onChange={(value) => setDraft((current) => ({ ...current, status: value }))}
                options={statusOptions}
                renderValueLabel={(value) => value === "unchanged" ? "Leave unchanged" : formatOptionLabel(value)}
                value={draft.status}
              />
              <CompactSelectField
                label="Lists / Routing"
                onChange={(value) => setDraft((current) => ({ ...current, route: value }))}
                options={routeOptions}
                renderValueLabel={(value) => value === "unchanged"
                  ? "Leave unchanged"
                  : value === "clear"
                    ? "Clear route"
                    : value === "focus"
                      ? "Focus Today"
                      : formatOptionLabel(value)}
                value={draft.route}
              />
              <CompactSelectField
                label="Priority"
                onChange={(value) => setDraft((current) => ({ ...current, priority: value }))}
                options={priorityOptionsWithUnchanged}
                renderValueLabel={(value) => value === "unchanged" ? "Leave unchanged" : formatOptionLabel(value)}
                value={draft.priority}
              />
              <CompactSelectField
                label="Energy"
                onChange={(value) => setDraft((current) => ({ ...current, energy: value }))}
                options={energyOptionsWithUnchanged}
                renderValueLabel={(value) => value === "unchanged" ? "Leave unchanged" : formatOptionLabel(value)}
                value={draft.energy}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                ["Focus Today", "focusToday"],
                ["Urgent", "isUrgent"],
                ["Important", "isImportant"],
                ["One Step At A Time", "oneStepAtATime"],
                ["Subtasks Auto Reset", "subtasksAutoReset"],
              ] as const).map(([label, key]) => (
                <CompactSelectField
                  key={key}
                  label={label}
                  onChange={(value) => setDraft((current) => ({ ...current, [key]: value }))}
                  options={booleanOptions}
                  renderValueLabel={(value) => value === "unchanged" ? "Leave unchanged" : value === "true" ? "Turn on" : "Turn off"}
                  value={draft[key]}
                />
              ))}
            </div>
          </div>
        </EditorCollapsibleSection>

        <EditorCollapsibleSection defaultOpen summary="Due date, repeat cadence, and estimate." title="Schedule">
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <CompactSelectField
                label="Due date"
                onChange={(value) => setDraft((current) => ({ ...current, dueOnMode: value }))}
                options={fieldModeOptions}
                renderValueLabel={(value) => value === "unchanged" ? "Leave unchanged" : value === "set" ? "Set due date" : "Clear due date"}
                value={draft.dueOnMode}
              />
              <CompactSelectField
                label="Estimated time"
                onChange={(value) => setDraft((current) => ({ ...current, estimatedMinutesMode: value }))}
                options={fieldModeOptions}
                renderValueLabel={(value) => value === "unchanged" ? "Leave unchanged" : value === "set" ? "Set estimate" : "Clear estimate"}
                value={draft.estimatedMinutesMode}
              />
            </div>
            {draft.dueOnMode === "set" ? (
              <CompactDateTimeField clearLabel="Clear due date" label="Due date value" onChange={(value) => setDraft((current) => ({ ...current, dueOn: value }))} onClear={() => setDraft((current) => ({ ...current, dueOn: "" }))} type="date" value={draft.dueOn} />
            ) : null}
            {draft.estimatedMinutesMode === "set" ? (
              <div className="sm:max-w-[12rem]">
                <LabeledInput label="Estimated minutes" onChange={(value) => setDraft((current) => ({ ...current, estimatedMinutes: value }))} placeholder="25" type="number" value={draft.estimatedMinutes} />
              </div>
            ) : null}
            <CompactSelectField
              label="Repeat"
              onChange={(value) => setDraft((current) => ({ ...current, repeatFrequency: value }))}
              options={repeatOptions}
              renderValueLabel={(value) => value === "unchanged" ? "Leave unchanged" : value === "custom" ? "Custom cadence" : formatOptionLabel(value)}
              value={draft.repeatFrequency}
            />
            {draft.repeatFrequency !== "unchanged" && draft.repeatFrequency !== "none" && draft.repeatFrequency !== "daily" ? (
              <div className="sm:max-w-[12rem]">
                <LabeledInput label="Repeat interval" onChange={(value) => setDraft((current) => ({ ...current, repeatInterval: value }))} placeholder="1" type="number" value={draft.repeatInterval} />
              </div>
            ) : null}
            {draft.repeatFrequency === "weekly" || draft.repeatFrequency === "custom" ? (
              <div className="flex flex-wrap gap-2">
                {repeatWeekdayOptions.map((option) => {
                  const selected = draft.repeatDaysOfWeek.includes(option.value);
                  return (
                    <Pill
                      key={option.value}
                      onClick={() => setDraft((current) => ({
                        ...current,
                        repeatDaysOfWeek: selected
                          ? current.repeatDaysOfWeek.filter((value) => value !== option.value)
                          : [...current.repeatDaysOfWeek, option.value],
                      }))}
                      selected={selected}
                    >
                      {option.label}
                    </Pill>
                  );
                })}
              </div>
            ) : null}
            {draft.repeatFrequency === "monthly" || draft.repeatFrequency === "custom" ? (
              <div className="sm:max-w-[12rem]">
                <LabeledInput label="Day of month" onChange={(value) => setDraft((current) => ({ ...current, repeatDayOfMonth: value }))} placeholder="15" type="number" value={draft.repeatDayOfMonth} />
              </div>
            ) : null}
          </div>
        </EditorCollapsibleSection>

        <EditorCollapsibleSection defaultOpen summary="Replace or clear tags across the selection." title="Tags">
          <div className="grid gap-4">
            <CompactSelectField
              label="Tags"
              onChange={(value) => setDraft((current) => ({ ...current, tagsMode: value }))}
              options={tagsModeOptions}
              renderValueLabel={(value) => value === "unchanged" ? "Leave unchanged" : value === "replace" ? "Replace tags" : "Clear tags"}
              value={draft.tagsMode}
            />
            {draft.tagsMode === "replace" ? (
              <TagChipInput allTags={allTags} onChange={(tags) => setDraft((current) => ({ ...current, tags }))} values={draft.tags} />
            ) : null}
          </div>
        </EditorCollapsibleSection>

        <div className="sticky bottom-4 z-20 flex justify-end gap-3 pt-2">
          <button
            className="rounded-full border border-[#ddd6fb] bg-white px-5 py-3 text-sm font-semibold text-[#5c6684] transition hover:border-[#c9bcff] hover:text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70 dark:hover:text-[#cabfff]"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-full bg-[#6f57f6] px-6 py-3 text-base font-bold text-white shadow-[0_18px_40px_rgba(111,87,246,0.28)] disabled:opacity-50 dark:bg-[#cabfff] dark:text-[#1a1431]"
            disabled={!isDirty || isSaving}
            type="submit"
          >
            {isSaving ? "Applying..." : `Update ${count} task${count === 1 ? "" : "s"}`}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function createEmptyBatchTaskEditDraft(): BatchTaskEditDraft {
  return {
    dueOn: "",
    dueOnMode: "unchanged",
    energy: "unchanged",
    estimatedMinutes: "",
    estimatedMinutesMode: "unchanged",
    focusToday: "unchanged",
    isImportant: "unchanged",
    isUrgent: "unchanged",
    oneStepAtATime: "unchanged",
    priority: "unchanged",
    repeatDayOfMonth: "",
    repeatDaysOfWeek: [],
    repeatFrequency: "unchanged",
    repeatInterval: "1",
    route: "unchanged",
    status: "unchanged",
    subtasksAutoReset: "unchanged",
    tags: [],
    tagsMode: "unchanged",
  };
}

function serializeBatchTaskEditDraft(draft: BatchTaskEditDraft) {
  return JSON.stringify({
    ...draft,
    repeatDaysOfWeek: [...draft.repeatDaysOfWeek].sort((left, right) => left - right),
    tags: [...draft.tags].sort(),
  });
}

function formatOptionLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
