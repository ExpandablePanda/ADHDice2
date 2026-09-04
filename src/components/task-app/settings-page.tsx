"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Task } from "@/lib/database.types";
import type { NavigatorSettingsSection } from "@/lib/navigator-search";
import { PageShell, PageShellBody, PageShellLayoutControls, PageShellSurface, ReorderablePageShells } from "@/components/ui-system/reorderable-page-shells";
import { usePageShellLayout } from "@/hooks/usePageShellLayout";
import { SETTINGS_PAGE_SHELL_CANONICAL_LAYOUT, SETTINGS_PAGE_SHELL_IDS } from "@/lib/page-shell-layout";
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
  onSectionRequestHandled?: (section: NavigatorSettingsSection) => void;
  onThemeChange: (theme: ThemeMode) => void;
  onWorkspaceRefresh?: () => Promise<void>;
  requestedSection?: NavigatorSettingsSection | null;
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
  onSectionRequestHandled,
  onThemeChange,
  tasks,
  theme,
  timeZone,
  userId,
  requestedSection = null,
}: SettingsPageProps) {
  const layout = usePageShellLayout(userId ?? null, "settings", SETTINGS_PAGE_SHELL_IDS, SETTINGS_PAGE_SHELL_CANONICAL_LAYOUT.sizes, SETTINGS_PAGE_SHELL_CANONICAL_LAYOUT);
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isResettingEconomy, setIsResettingEconomy] = useState(false);
  const [economyStatus, setEconomyStatus] = useState<string | null>(null);
  const handledSectionRef = useRef<NavigatorSettingsSection | null>(null);
  const timezoneOptions = useMemo(() => {
    if (typeof Intl === "undefined" || typeof Intl.supportedValuesOf !== "function") return [timeZone];
    const supported = Intl.supportedValuesOf("timeZone");
    return supported.includes(timeZone) ? supported : [timeZone, ...supported];
  }, [timeZone]);

  useEffect(() => {
    if (!requestedSection) {
      handledSectionRef.current = null;
      return;
    }
    if (handledSectionRef.current === requestedSection) {
      return;
    }
    const shellIdBySection: Record<NavigatorSettingsSection, string> = {
      appearance: "settings-appearance",
      "day-reset": "settings-day-reset",
      economy: "settings-economy",
      "import-export": "settings-import-export",
    };
    const shell = document.querySelector<HTMLElement>(`[data-page-shell-id="${shellIdBySection[requestedSection]}"]`);
    if (!shell) {
      return;
    }
    const body = shell.querySelector<HTMLElement>(".page-shell-body");
    if (body) body.scrollTop = 0;
    shell.scrollIntoView({ block: "start" });
    handledSectionRef.current = requestedSection;
    onSectionRequestHandled?.(requestedSection);
  }, [onSectionRequestHandled, requestedSection]);

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
      <PageShellHeader actions={<PageShellLayoutControls layout={layout} />} title="Settings" subtitle="Configuration" />
      <ReorderablePageShells layout={layout} shellsClassName="grid min-w-0 gap-5">
      <PageShell id="settings-appearance" label="Appearance">
      <PageShellSurface className={sectionClass}>
      <PageShellBody>
        <p className={sectionTitle} data-settings-section="appearance" id="settings-section-appearance">Appearance</p>
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
      </PageShellBody>
      </PageShellSurface>
      </PageShell>

      <PageShell id="settings-day-reset" label="Day Reset">
      <PageShellSurface className={sectionClass}>
      <PageShellBody>
        <p className={sectionTitle} data-settings-section="day-reset" id="settings-section-day-reset">Day reset</p>
        <div className={row}><span className={label}>Day starts at</span><input className="rounded-full bg-white px-3 py-2 text-sm font-semibold text-[#27304c] outline-none dark:bg-white/8 dark:text-white" onChange={(event) => onDayStartTimeChange(event.target.value)} type="time" value={dayStartTime} /></div>
        <div className={row}><span className={label}>Time zone</span><select className="max-w-[14rem] rounded-full bg-white px-3 py-2 text-sm font-semibold text-[#27304c] outline-none dark:bg-white/8 dark:text-white" onChange={(event) => onTimeZoneChange(event.target.value)} value={timeZone}>{timezoneOptions.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}</select></div>
      </PageShellBody>
      </PageShellSurface>
      </PageShell>

      <PageShell id="settings-economy" label="Economy">
      <PageShellSurface className={sectionClass}>
      <PageShellBody>
        <p className={sectionTitle} data-settings-section="economy" id="settings-section-economy">Economy</p>
        <div className={`${row} gap-4`}><div><p className={label}>Reset XP, points, tokens, and free-roll bank</p><p className="mt-1 text-xs text-[#7d88a1] dark:text-white/55">Leaves task history in place and sets level back to 1.</p></div><button className="ui-pill-button-danger-light shrink-0 transition disabled:cursor-not-allowed disabled:opacity-60" disabled={isResettingEconomy} onClick={() => { void handleResetEconomy(); }} type="button">{isResettingEconomy ? "Resetting..." : "Reset economy"}</button></div>
        {economyStatus ? <div className="px-5 pb-4 text-xs text-[#7d88a1] dark:text-white/55">{economyStatus}</div> : null}
      </PageShellBody>
      </PageShellSurface>
      </PageShell>

      <PageShell id="settings-import-export" label="Import / Export">
      <PageShellSurface className={`${sectionClass} overflow-hidden`}>
      <PageShellBody>
        <p className={sectionTitle} data-settings-section="import-export" id="settings-section-import-export">Import / export</p>
        <div className="px-5 py-4"><button className="ui-pill-button-strong-light" onClick={handleExportJSON} type="button">Export tasks JSON</button><textarea className="mt-4 min-h-40 w-full rounded-[1.2rem] bg-white px-4 py-3 text-sm text-[#27304c] outline-none dark:bg-white/8 dark:text-white" onChange={(event) => setImportText(event.target.value)} placeholder="Paste exported tasks JSON here..." value={importText} /><div className="mt-3 flex items-center justify-between gap-3"><button className="ui-pill-button-strong-light" onClick={() => { void handleImportJSON(); }} type="button">Import JSON</button>{importStatus ? <p className="text-right text-xs text-[#7d88a1] dark:text-white/55">{importStatus}</p> : null}</div></div>
      </PageShellBody>
      </PageShellSurface>
      </PageShell>
      </ReorderablePageShells>
    </section>
  );
}

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
