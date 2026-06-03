"use client";

import { useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase";
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
  dayStartTime: string;
  lowStim: boolean;
  onDayStartTimeChange: (time: string) => void;
  onLowStimChange: (value: boolean) => void;
  onResetEconomy: () => Promise<boolean>;
  onThemeChange: (theme: ThemeMode) => void;
  tasks: Task[];
  theme: ThemeMode;
  userId: string;
};

const ACCENT_PRESETS = ["#6f57f6", "#e05597", "#e05050", "#e08830", "#22b87a", "#2196c8", "#7b4fe0", "#5070e0"];

export function SettingsPage({
  dayStartTime,
  lowStim,
  onDayStartTimeChange,
  onLowStimChange,
  onResetEconomy,
  onThemeChange,
  tasks,
  theme,
  userId,
}: SettingsPageProps) {
  const [accentColor, setAccentColor] = useState<string>(() => {
    if (typeof window === "undefined") {
      return ACCENT_PRESETS[0];
    }
    return window.localStorage.getItem("adhdice-accent-color") ?? ACCENT_PRESETS[0];
  });
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isResettingEconomy, setIsResettingEconomy] = useState(false);
  const [economyStatus, setEconomyStatus] = useState<string | null>(null);

  function applyAccent(color: string) {
    setAccentColor(color);
    window.localStorage.setItem("adhdice-accent-color", color);
    document.documentElement.style.setProperty("--accent", color);
    document.documentElement.style.setProperty("--accent-strong", color);
  }

  function handleExportJSON() {
    const exportable = tasks.map(({ user_id: _unusedUserId, ...rest }) => rest);
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
    if (!window.confirm("Reset XP, points, and tokens back to 0?")) {
      return;
    }

    setIsResettingEconomy(true);
    setEconomyStatus(null);
    const didReset = await onResetEconomy();
    setIsResettingEconomy(false);
    setEconomyStatus(didReset ? "Economy reset to 0." : "Could not reset economy.");
  }

  const row = "flex items-center justify-between px-5 py-4";
  const label = "text-sm font-medium text-[#27304c] dark:text-white";
  const sectionClass = "divide-y divide-[#e5e0f5] rounded-2xl bg-[#f7f5ff] dark:divide-white/10 dark:bg-white/5";
  const sectionTitle = "mb-2 mt-8 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40";

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
                onClick={() => applyAccent(color)}
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
      </div>

      <p className={sectionTitle}>Economy</p>
      <div className={sectionClass}>
        <div className={`${row} gap-4`}>
          <div>
            <p className={label}>Reset XP, points, and tokens</p>
            <p className="mt-1 text-xs text-[#7d88a1] dark:text-white/55">
              Leaves task history in place and sets level back to 1.
            </p>
          </div>
          <button
            className="shrink-0 rounded-full bg-[#221d4e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#171239] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#7c63f7]"
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
              className="rounded-full bg-[#6f57f6] px-4 py-2 text-sm font-semibold text-white dark:bg-[#cabfff] dark:text-[#1a1431]"
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
              className="rounded-full bg-[#221d4e] px-4 py-2 text-sm font-semibold text-white dark:bg-[#7c63f7]"
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
