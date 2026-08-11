"use client";

import { useMemo, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import { TASK_STATE_CANONICAL_COMMANDS_ENABLED } from "@/lib/task-state-runtime-gate";
import {
  dryRunLegacyStepPromotion,
  promoteLegacySteps,
  type LegacyStepPromotionDryRun,
  type LegacyStepPromotionProposedRow,
  type LegacyStepPromotionResult,
} from "@/lib/task-legacy-step-promotion";
import type {
  Task,
  TaskEnergy,
  TaskPriority,
  TaskRepeatFrequency,
  TaskStatus,
} from "@/lib/database.types";

import { PageShellHeader } from "./page-shell-header";
import { ThemeToggle } from "./theme-toggle";

type ThemeMode = "light" | "dark";

type SettingsPageProps = {
  accentColor: string;
  dayStartTime: string;
  lowStim: boolean;
  onAccentColorChange: (color: string) => void;
  onDayStartTimeChange: (time: string) => void;
  onTimeZoneChange: (timezone: string) => void;
  onLowStimChange: (value: boolean) => void;
  onResetEconomy: () => Promise<boolean>;
  onThemeChange: (theme: ThemeMode) => void;
  onWorkspaceRefresh: () => Promise<void>;
  tasks: Task[];
  theme: ThemeMode;
  timeZone: string;
  userId: string;
};

const ACCENT_PRESETS = ["#6f57f6", "#e05597", "#e05050", "#e08830", "#22b87a", "#2196c8", "#7b4fe0", "#5070e0"];

export function SettingsPage({
  accentColor,
  dayStartTime,
  lowStim,
  onAccentColorChange,
  onDayStartTimeChange,
  onTimeZoneChange,
  onLowStimChange,
  onResetEconomy,
  onThemeChange,
  onWorkspaceRefresh,
  tasks,
  theme,
  timeZone,
  userId,
}: SettingsPageProps) {
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isResettingEconomy, setIsResettingEconomy] = useState(false);
  const [economyStatus, setEconomyStatus] = useState<string | null>(null);
  const [legacyPromotionDryRun, setLegacyPromotionDryRun] = useState<LegacyStepPromotionDryRun | null>(null);
  const [legacyPromotionResult, setLegacyPromotionResult] = useState<LegacyStepPromotionResult | null>(null);
  const [legacyPromotionStatus, setLegacyPromotionStatus] = useState<string | null>(null);
  const [isLegacyPromotionDryRunning, setIsLegacyPromotionDryRunning] = useState(false);
  const [isLegacyPromotionRunning, setIsLegacyPromotionRunning] = useState(false);
  const [isLegacyPromotionArmed, setIsLegacyPromotionArmed] = useState(false);
  const timezoneOptions = useMemo(() => {
    if (typeof Intl === "undefined" || typeof Intl.supportedValuesOf !== "function") {
      return [timeZone];
    }

    const supported = Intl.supportedValuesOf("timeZone");
    return supported.includes(timeZone) ? supported : [timeZone, ...supported];
  }, [timeZone]);

  function handleExportJSON() {
    const exportable = tasks.map((task) => {
      const row = { ...task } as Partial<Task>;
      delete row.user_id;
      return row;
    });
    const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `adhdice-tasks-${getTodayKey()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportJSON() {
    setImportStatus(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText.trim());
    } catch {
      setImportStatus("Invalid JSON.");
      return;
    }

    if (!Array.isArray(parsed)) {
      setImportStatus("Expected a JSON array.");
      return;
    }

    const rows = (parsed as Task[]).filter((row) => typeof row.title === "string" && row.title.trim());
    if (rows.length === 0) {
      setImportStatus("No valid tasks found.");
      return;
    }

    if (TASK_STATE_CANONICAL_COMMANDS_ENABLED) {
      setImportStatus("JSON restore is a legacy compatibility surface and is unavailable while canonical Task State is active. Use the Task editor or Task import flow instead.");
      return;
    }

    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setImportStatus("Not connected.");
      return;
    }

    const payload = rows.map((row) => ({
      id: row.id ?? undefined,
      user_id: userId,
      title: row.title,
      notes: row.notes ?? null,
      status: (row.status ?? "pending") as TaskStatus,
      priority: (row.priority ?? "normal") as TaskPriority,
      energy: (row.energy ?? "none") as TaskEnergy,
      is_urgent: row.is_urgent ?? false,
      is_important: row.is_important ?? false,
      due_on: row.due_on ?? null,
      due_time: row.due_time ?? null,
      estimated_minutes: row.estimated_minutes ?? null,
      tags: row.tags ?? [],
      external_link_label: row.external_link_label ?? null,
      external_link_url: row.external_link_url ?? null,
      one_step_at_a_time: row.one_step_at_a_time ?? false,
      subtasks_auto_reset: row.subtasks_auto_reset ?? false,
      repeat_frequency: (row.repeat_frequency ?? "none") as TaskRepeatFrequency,
      repeat_interval: row.repeat_interval ?? 1,
      repeat_days_of_week: row.repeat_days_of_week ?? [],
      repeat_day_of_month: row.repeat_day_of_month ?? null,
    }));

    const { error } = await supabase
      .from("adhdice_clean_tasks")
      .upsert(payload, { onConflict: "id" });

    if (error && isMissingTaskEnergyNoneEnumError(error.message)) {
      const fallbackPayload = payload.map((task) => ({
        ...task,
        energy: task.energy === "none" ? "low" as TaskEnergy : task.energy,
      }));
      const { error: fallbackError } = await supabase
        .from("adhdice_clean_tasks")
        .upsert(fallbackPayload, { onConflict: "id" });

      if (fallbackError) {
        setImportStatus(`Error: ${fallbackError.message}`);
      } else {
        setImportStatus(`Imported ${fallbackPayload.length} task${fallbackPayload.length === 1 ? "" : "s"} with low energy fallback because your database is missing the "none" energy migration.`);
        setImportText("");
      }
    } else if (error) {
      setImportStatus(`Error: ${error.message}`);
    } else {
      setImportStatus(`Imported ${payload.length} task${payload.length === 1 ? "" : "s"}.`);
      setImportText("");
    }
  }

  async function handleResetEconomy() {
    if (!window.confirm("Reset XP, points, tokens, and free-roll bank back to 0?")) {
      return;
    }

    setIsResettingEconomy(true);
    setEconomyStatus(null);
    const didReset = await onResetEconomy();
    setIsResettingEconomy(false);
    setEconomyStatus(didReset ? "Economy reset to 0." : "Could not reset economy.");
  }

  async function handleLegacyPromotionDryRun() {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setLegacyPromotionStatus("Not connected.");
      return;
    }

    setIsLegacyPromotionDryRunning(true);
    setLegacyPromotionStatus(null);
    setLegacyPromotionResult(null);
    setIsLegacyPromotionArmed(false);
    const result = await dryRunLegacyStepPromotion(supabase, userId);
    setIsLegacyPromotionDryRunning(false);

    if (result.error || !result.data) {
      setLegacyPromotionStatus(`Preview failed: ${result.error?.message ?? "No report returned."}`);
      return;
    }

    setLegacyPromotionDryRun(result.data);
    setLegacyPromotionStatus("Preview complete. No data changed.");
  }

  async function handleLegacyPromotionRun() {
    if (!legacyPromotionDryRun || !isLegacyPromotionArmed) {
      return;
    }

    if (!window.confirm("Promote eligible legacy checklist rows into real Steps now? This keeps legacy rows but hides mapped duplicates after refresh.")) {
      return;
    }

    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setLegacyPromotionStatus("Not connected.");
      return;
    }

    setIsLegacyPromotionRunning(true);
    setLegacyPromotionStatus(null);
    const result = await promoteLegacySteps(supabase, userId);

    if (result.error || !result.data) {
      setIsLegacyPromotionRunning(false);
      setLegacyPromotionStatus(`Promotion failed: ${result.error?.message ?? "No result returned."}`);
      return;
    }

    setLegacyPromotionResult(result.data);
    setLegacyPromotionStatus(`Promotion finished: ${result.data.promotedRows.length} promoted, ${result.data.errors.length} error${result.data.errors.length === 1 ? "" : "s"}.`);
    await onWorkspaceRefresh();

    const nextDryRun = await dryRunLegacyStepPromotion(supabase, userId);
    if (nextDryRun.data) {
      setLegacyPromotionDryRun(nextDryRun.data);
    }
    setIsLegacyPromotionArmed(false);
    setIsLegacyPromotionRunning(false);
  }

  const row = "flex items-center justify-between px-5 py-4";
  const label = "text-sm font-medium text-[#27304c] dark:text-white";
  const sectionClass = "divide-y divide-[#e5e0f5] rounded-2xl bg-[#f7f5ff] dark:divide-white/10 dark:bg-white/5";
  const sectionTitle = "mb-2 mt-8 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40";
  const taskTitleById = useMemo(() => new Map(tasks.map((task) => [task.id, task.title] as const)), [tasks]);
  const proposedTitleByTaskId = useMemo(
    () => new Map((legacyPromotionDryRun?.proposedRows ?? []).map((row) => [row.taskId, row.title] as const)),
    [legacyPromotionDryRun],
  );
  const getProposedParentLabel = (sample: LegacyStepPromotionProposedRow) => {
    const taskTitle = taskTitleById.get(sample.parentTaskId);
    if (taskTitle) {
      return `Task: ${taskTitle}`;
    }

    const stepTitle = proposedTitleByTaskId.get(sample.parentTaskId);
    if (stepTitle) {
      return `Step: ${stepTitle}`;
    }

    return sample.parentTaskId;
  };

  return (
    <section className="mx-auto max-w-lg px-4 pb-32">
      <PageShellHeader title="Settings" subtitle="Configuration" />

      <p className={sectionTitle}>Appearance</p>
      <div className={sectionClass}>
        <div className={row}>
          <span className={label}>Theme</span>
          <ThemeToggle theme={theme} onLowStimChange={onLowStimChange} onThemeChange={onThemeChange} lowStim={lowStim} />
        </div>
        <div className="px-5 py-4">
          <p className={label}>Highlight color</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {ACCENT_PRESETS.map((color) => (
              <button
                aria-label={`Set accent to ${color}`}
                className={`h-9 w-9 rounded-full border-2 transition ${accentColor === color ? "scale-105 border-[#221d4e] dark:border-white" : "border-transparent"}`}
                key={color}
                onClick={() => onAccentColorChange(color)}
                style={{ backgroundColor: color }}
                type="button"
              />
            ))}
          </div>
        </div>
      </div>

      <p className={sectionTitle}>Day reset</p>
      <div className={sectionClass}>
        <div className={row}>
          <span className={label}>Day starts at</span>
          <input
            className="rounded-full bg-white px-3 py-2 text-sm font-semibold text-[#27304c] outline-none dark:bg-white/8 dark:text-white"
            onChange={(event) => onDayStartTimeChange(event.target.value)}
            type="time"
            value={dayStartTime}
          />
        </div>
        <div className={row}>
          <span className={label}>Time zone</span>
          <select
            className="max-w-[14rem] rounded-full bg-white px-3 py-2 text-sm font-semibold text-[#27304c] outline-none dark:bg-white/8 dark:text-white"
            onChange={(event) => onTimeZoneChange(event.target.value)}
            value={timeZone}
          >
            {timezoneOptions.map((timezone) => (
              <option key={timezone} value={timezone}>
                {timezone}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className={sectionTitle}>Economy</p>
      <div className={sectionClass}>
        <div className={`${row} gap-4`}>
          <div>
            <p className={label}>Reset XP, points, tokens, and free-roll bank</p>
            <p className="mt-1 text-xs text-[#7d88a1] dark:text-white/55">
              Leaves task history in place and sets level back to 1.
            </p>
          </div>
          <button
            className="ui-pill-button-danger-light shrink-0 transition disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isResettingEconomy}
            onClick={() => { void handleResetEconomy(); }}
            type="button"
          >
            {isResettingEconomy ? "Resetting..." : "Reset economy"}
          </button>
        </div>
        {economyStatus ? (
          <div className="px-5 pb-4 text-xs text-[#7d88a1] dark:text-white/55">
            {economyStatus}
          </div>
        ) : null}
      </div>

      <p className={sectionTitle}>Import / export</p>
      <div className={`${sectionClass} overflow-hidden`}>
        <div className="px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <button
              className="ui-pill-button-strong-light"
              onClick={handleExportJSON}
              type="button"
            >
              Export tasks JSON
            </button>
          </div>
          <textarea
            className="mt-4 min-h-40 w-full rounded-[1.2rem] bg-white px-4 py-3 text-sm text-[#27304c] outline-none dark:bg-white/8 dark:text-white"
            onChange={(event) => setImportText(event.target.value)}
            placeholder="Paste exported tasks JSON here..."
            value={importText}
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              className="ui-pill-button-strong-light"
              onClick={() => { void handleImportJSON(); }}
              type="button"
            >
              Import JSON
            </button>
            {importStatus ? (
              <p className="text-right text-xs text-[#7d88a1] dark:text-white/55">{importStatus}</p>
            ) : null}
          </div>
        </div>
      </div>

      <p className={sectionTitle}>Step migration</p>
      <div className={`${sectionClass} overflow-hidden`}>
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className={label}>Legacy Step Promotion</p>
              <p className="mt-1 max-w-md text-xs leading-5 text-[#7d88a1] dark:text-white/55">
                Preview and then manually promote legacy checklist rows into real same-table Steps. Dry run does not change data.
              </p>
            </div>
            <button
              className="ui-pill-button-strong-light shrink-0 transition disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLegacyPromotionDryRunning || isLegacyPromotionRunning}
              onClick={() => { void handleLegacyPromotionDryRun(); }}
              type="button"
            >
              {isLegacyPromotionDryRunning ? "Previewing..." : "Run dry run"}
            </button>
          </div>

          {legacyPromotionDryRun ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["Legacy rows", legacyPromotionDryRun.summary.totalLegacySubtasks],
                  ["Already mapped", legacyPromotionDryRun.summary.alreadyMapped],
                  ["Eligible", legacyPromotionDryRun.summary.eligibleForPromotion],
                  ["Missing parent task", legacyPromotionDryRun.summary.skippedBecauseParentTaskMissing],
                  ["Archived/trashed parent", legacyPromotionDryRun.summary.skippedBecauseParentTaskArchivedOrTrashed],
                  ["Ambiguous", legacyPromotionDryRun.summary.duplicateOrAmbiguous],
                  ["Missing fields", legacyPromotionDryRun.summary.missingRequiredFields],
                  ["Legacy parent skipped", legacyPromotionDryRun.summary.skippedBecauseLegacyParentMissing],
                ].map(([title, value]) => (
                  <div className="rounded-[1rem] bg-white px-3 py-2 dark:bg-white/8" key={title}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8d87a7] dark:text-white/40">{title}</p>
                    <p className="mt-1 text-lg font-semibold text-[#27304c] dark:text-white">{value}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8d87a7] dark:text-white/40">Sample rows</p>
                {legacyPromotionDryRun.sampleRows.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {legacyPromotionDryRun.sampleRows.slice(0, 5).map((sample) => (
                      <div className="rounded-[1rem] bg-white px-3 py-2 text-xs text-[#5f6880] dark:bg-white/8 dark:text-white/65" key={sample.legacySubtaskId}>
                        <p className="font-semibold text-[#27304c] dark:text-white">{sample.title}</p>
                        <p className="mt-1">Parent: {getProposedParentLabel(sample)}</p>
                        <p className="mt-1">Status: {sample.sourceStatus} to {sample.proposedStatus} · Sort: {sample.sortOrder} · Depth: {sample.depth}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-[#7d88a1] dark:text-white/55">No eligible rows in the current preview.</p>
                )}
              </div>

              {legacyPromotionResult ? (
                <div className="rounded-[1rem] bg-white px-3 py-2 text-xs text-[#5f6880] dark:bg-white/8 dark:text-white/65">
                  <p className="font-semibold text-[#27304c] dark:text-white">Last promotion result</p>
                  <p className="mt-1">{legacyPromotionResult.promotedRows.length} promoted · {legacyPromotionResult.errors.length} errors</p>
                  {legacyPromotionResult.errors.length > 0 ? (
                    <p className="mt-1 text-[#b45309] dark:text-[#f3d38a]">{legacyPromotionResult.errors[0].message}</p>
                  ) : null}
                </div>
              ) : null}

              <label className="flex items-start gap-2 rounded-[1rem] bg-white px-3 py-2 text-xs text-[#5f6880] dark:bg-white/8 dark:text-white/65">
                <input
                  checked={isLegacyPromotionArmed}
                  className="mt-0.5"
                  disabled={legacyPromotionDryRun.summary.eligibleForPromotion === 0 || isLegacyPromotionRunning}
                  onChange={(event) => setIsLegacyPromotionArmed(event.target.checked)}
                  type="checkbox"
                />
                <span>I reviewed the dry run and want to enable the manual promotion action.</span>
              </label>

              <button
                className="ui-pill-button-danger-light transition disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!isLegacyPromotionArmed || legacyPromotionDryRun.summary.eligibleForPromotion === 0 || isLegacyPromotionRunning}
                onClick={() => { void handleLegacyPromotionRun(); }}
                type="button"
              >
                {isLegacyPromotionRunning ? "Promoting..." : "Promote legacy checklist rows into real Steps"}
              </button>
            </div>
          ) : null}

          {legacyPromotionStatus ? (
            <p className="mt-3 text-xs text-[#7d88a1] dark:text-white/55">{legacyPromotionStatus}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isMissingTaskEnergyNoneEnumError(message: string) {
  return message.includes("invalid input value for enum") && message.includes("none");
}
