"use client";

import { useMemo, useState } from "react";
import type { Task } from "@/lib/database.types";
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
  onWorkspaceRefresh?: () => Promise<void>;
  tasks: Task[];
  theme: ThemeMode;
  timeZone: string;
  userId?: string;
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
  tasks,
  theme,
  timeZone,
}: SettingsPageProps) {
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isResettingEconomy, setIsResettingEconomy] = useState(false);
  const [economyStatus, setEconomyStatus] = useState<string | null>(null);
  const timezoneOptions = useMemo(() => {
    if (typeof Intl === "undefined" || typeof Intl.supportedValuesOf !== "function") return [timeZone];
    const supported = Intl.supportedValuesOf("timeZone");
    return supported.includes(timeZone) ? supported : [timeZone, ...supported];
  }, [timeZone]);

  function handleExportJSON() {
    const exportable = tasks.map((task) => {
      const row = { ...task } as Partial<Task>;
      delete row.user_id;
      return row;
    });
    const url = URL.createObjectURL(new Blob([JSON.stringify(exportable, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `adhdice-tasks-${getTodayKey()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportJSON() {
    setImportStatus(null);
    try {
      const parsed = JSON.parse(importText.trim()) as unknown;
      if (!Array.isArray(parsed)) {
        setImportStatus("Expected a JSON array.");
        return;
      }
      const rows = (parsed as Task[]).filter((row) => typeof row.title === "string" && row.title.trim());
      setImportStatus(rows.length > 0 ? "JSON restore is retired. Use the canonical Task import flow instead." : "No valid tasks found.");
    } catch {
      setImportStatus("Invalid JSON.");
    }
  }

  async function handleResetEconomy() {
    if (!window.confirm("Reset XP, points, tokens, and free-roll bank back to 0?")) return;
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
              <button aria-label={`Set accent to ${color}`} className={`h-9 w-9 rounded-full border-2 transition ${accentColor === color ? "scale-105 border-[#221d4e] dark:border-white" : "border-transparent"}`} key={color} onClick={() => onAccentColorChange(color)} style={{ backgroundColor: color }} type="button" />
            ))}
          </div>
        </div>
      </div>
      <p className={sectionTitle}>Day reset</p>
      <div className={sectionClass}>
        <div className={row}><span className={label}>Day starts at</span><input className="rounded-full bg-white px-3 py-2 text-sm font-semibold text-[#27304c] outline-none dark:bg-white/8 dark:text-white" onChange={(event) => onDayStartTimeChange(event.target.value)} type="time" value={dayStartTime} /></div>
        <div className={row}><span className={label}>Time zone</span><select className="max-w-[14rem] rounded-full bg-white px-3 py-2 text-sm font-semibold text-[#27304c] outline-none dark:bg-white/8 dark:text-white" onChange={(event) => onTimeZoneChange(event.target.value)} value={timeZone}>{timezoneOptions.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}</select></div>
      </div>
      <p className={sectionTitle}>Economy</p>
      <div className={sectionClass}>
        <div className={`${row} gap-4`}><div><p className={label}>Reset XP, points, tokens, and free-roll bank</p><p className="mt-1 text-xs text-[#7d88a1] dark:text-white/55">Leaves task history in place and sets level back to 1.</p></div><button className="ui-pill-button-danger-light shrink-0 transition disabled:cursor-not-allowed disabled:opacity-60" disabled={isResettingEconomy} onClick={() => { void handleResetEconomy(); }} type="button">{isResettingEconomy ? "Resetting..." : "Reset economy"}</button></div>
        {economyStatus ? <div className="px-5 pb-4 text-xs text-[#7d88a1] dark:text-white/55">{economyStatus}</div> : null}
      </div>
      <p className={sectionTitle}>Import / export</p>
      <div className={`${sectionClass} overflow-hidden`}>
        <div className="px-5 py-4"><button className="ui-pill-button-strong-light" onClick={handleExportJSON} type="button">Export tasks JSON</button><textarea className="mt-4 min-h-40 w-full rounded-[1.2rem] bg-white px-4 py-3 text-sm text-[#27304c] outline-none dark:bg-white/8 dark:text-white" onChange={(event) => setImportText(event.target.value)} placeholder="Paste exported tasks JSON here..." value={importText} /><div className="mt-3 flex items-center justify-between gap-3"><button className="ui-pill-button-strong-light" onClick={() => { void handleImportJSON(); }} type="button">Import JSON</button>{importStatus ? <p className="text-right text-xs text-[#7d88a1] dark:text-white/55">{importStatus}</p> : null}</div></div>
      </div>
    </section>
  );
}

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
