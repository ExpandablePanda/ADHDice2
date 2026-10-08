"use client";

import { Check, Droplets, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AdhdCard } from "@/components/ui-system/adhd-card";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdIconButton } from "@/components/ui-system/adhd-icon-button";
import { PageShell, ReorderablePageShells } from "@/components/ui-system/reorderable-page-shells";
import type { PageShellLayoutState } from "@/hooks/usePageShellLayout";
import type { HealthWaterEntry, HealthWaterUnit } from "@/lib/database.types";
import {
  buildHealthWaterHistory,
  formatQuantity,
  isHealthWaterEntryConfirmed,
  millilitersToWaterAmount,
  sumWaterForDate,
  waterAmountToMilliliters,
} from "@/lib/health-library";
import { formatHealthDateLabel, getCurrentHealthDateTimeInputs } from "@/lib/health-utils";
import { isHealthWaterDraftUnsafe, isHealthWaterGoalDraftDirty } from "@/lib/health-water-draft-safety";
import { HealthCollapsiblePanel } from "./health-collapsible-panel";
import { HEALTH_COMPACT_INPUT_CLASS } from "./health-dropdown";
import { HealthWaterLineChart } from "./health-water-line-chart";

type HealthWaterPanelProps = {
  addWaterEntry: (input: {
    amount: number;
    amount_ml: number;
    confirmed_at: string | null;
    entry_date: string;
    logged_at: string;
    unit: HealthWaterUnit;
  }) => Promise<boolean>;
  confirmWaterEntry: (id: string) => Promise<boolean>;
  deleteWaterEntry: (id: string) => Promise<boolean>;
  onDraftSafetyChange: (isUnsafe: boolean) => void;
  saveWaterGoal: (waterGoalMl: number | null) => Promise<boolean>;
  today: string;
  updateWaterEntry: (entryId: string, input: {
    amount: number;
    amount_ml: number;
    entry_date: string;
    logged_at: string;
    unit: HealthWaterUnit;
  }) => Promise<boolean>;
  waterGoalMl: number | null;
  waterEntries: HealthWaterEntry[];
  layout: PageShellLayoutState;
};

const WATER_FL_OZ_PRESETS = [5, 10, 20] as const;
const WATER_CUP_PRESETS = [1] as const;

export function HealthWaterPanel({
  addWaterEntry,
  confirmWaterEntry,
  deleteWaterEntry,
  onDraftSafetyChange,
  saveWaterGoal,
  today,
  updateWaterEntry,
  waterGoalMl,
  waterEntries,
  layout,
}: HealthWaterPanelProps) {
  const [amount, setAmount] = useState("10");
  const [unit, setUnit] = useState<HealthWaterUnit>("fl_oz");
  const [entryStatus, setEntryStatus] = useState<"confirmed" | "pending">("confirmed");
  const [entryDateTime, setEntryDateTime] = useState(() => getCurrentHealthDateTimeInputs());
  const [entryDraftBaseline, setEntryDraftBaseline] = useState(() => ({
    date: entryDateTime.date,
    entryStatus,
    time: entryDateTime.time,
    unit,
  }));
  const [isCustomAmountSelected, setIsCustomAmountSelected] = useState(false);
  const [goalAmountOverride, setGoalAmountOverride] = useState<string | null>(null);
  const [isGoalDraftDirty, setIsGoalDraftDirty] = useState(false);
  const [goalEditorOpenOverride, setGoalEditorOpenOverride] = useState<boolean | null>(null);
  const [goalUnit, setGoalUnit] = useState<HealthWaterUnit>("fl_oz");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedHistoryDates, setExpandedHistoryDates] = useState<Set<string>>(() => new Set());
  const [editDraft, setEditDraft] = useState({
    amount: "1",
    date: today,
    time: "12:00",
    unit: "cup" as HealthWaterUnit,
  });
  const [isSavingEntry, setIsSavingEntry] = useState(false);
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [isSavingExistingEntry, setIsSavingExistingEntry] = useState(false);
  const saveInProgressRef = useRef({ entry: false, goal: false, existingEntry: false });
  const todayEntries = useMemo(
    () => waterEntries.filter((entry) => entry.entry_date === today && isHealthWaterEntryConfirmed(entry)),
    [today, waterEntries],
  );
  const pendingEntries = useMemo(
    () => waterEntries
      .filter((entry) => !isHealthWaterEntryConfirmed(entry))
      .sort((left, right) => right.logged_at.localeCompare(left.logged_at)),
    [waterEntries],
  );
  const totals = useMemo(() => sumWaterForDate(waterEntries, today), [today, waterEntries]);
  const waterHistory = useMemo(() => buildHealthWaterHistory(waterEntries, today), [today, waterEntries]);
  const goalFlOz = waterGoalMl && waterGoalMl > 0 ? millilitersToWaterAmount(waterGoalMl, "fl_oz") : null;
  const goalAmount = goalAmountOverride ?? (goalFlOz === null ? "" : formatQuantity(millilitersToWaterAmount(waterGoalMl!, goalUnit)));
  const goalSummaryFlOz = goalAmountOverride === ""
    ? null
    : goalAmountOverride !== null && Number.isFinite(Number.parseFloat(goalAmountOverride))
      ? millilitersToWaterAmount(waterAmountToMilliliters(Number.parseFloat(goalAmountOverride), goalUnit), "fl_oz")
      : goalFlOz;
  const isGoalEditorOpen = goalEditorOpenOverride ?? waterGoalMl === null;
  const hasUnfinishedEntryDraft = isCustomAmountSelected
    || unit !== entryDraftBaseline.unit
    || entryStatus !== entryDraftBaseline.entryStatus
    || entryDateTime.date !== entryDraftBaseline.date
    || entryDateTime.time !== entryDraftBaseline.time;
  const hasUnfinishedGoalDraft = isGoalDraftDirty;
  const isDraftUnsafe = isHealthWaterDraftUnsafe({
    hasUnfinishedEntryDraft,
    hasUnfinishedGoalDraft,
    isEditingExistingEntry: editingId !== null,
    hasPendingSave: isSavingEntry || isSavingGoal || isSavingExistingEntry,
  });

  useEffect(() => {
    onDraftSafetyChange(isDraftUnsafe);
    return () => onDraftSafetyChange(false);
  }, [isDraftUnsafe, onDraftSafetyChange]);

  async function addAmount(nextAmount: number, nextUnit: HealthWaterUnit, draftAmount = formatQuantity(nextAmount)) {
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      return;
    }
    if (saveInProgressRef.current.entry) return;
    saveInProgressRef.current.entry = true;
    setIsSavingEntry(true);
    const nextDateTime = { ...entryDateTime };
    const nextStatus = entryStatus;
    try {
      const saved = await addWaterEntry({
        amount: nextAmount,
        amount_ml: waterAmountToMilliliters(nextAmount, nextUnit),
        confirmed_at: nextStatus === "pending" ? null : new Date().toISOString(),
        entry_date: nextDateTime.date,
        logged_at: buildLoggedAt(nextDateTime.date, nextDateTime.time),
        unit: nextUnit,
      });
      if (saved) {
        setAmount(nextUnit === "cup" ? "1" : "10");
        setUnit(nextUnit);
        setIsCustomAmountSelected(false);
        setEntryDraftBaseline({
          date: nextDateTime.date,
          entryStatus: nextStatus,
          time: nextDateTime.time,
          unit: nextUnit,
        });
      } else {
        setAmount(draftAmount);
        setUnit(nextUnit);
        setIsCustomAmountSelected(true);
      }
    } catch {
      setAmount(draftAmount);
      setUnit(nextUnit);
      setIsCustomAmountSelected(true);
    } finally {
      saveInProgressRef.current.entry = false;
      setIsSavingEntry(false);
    }
  }

  function selectEntryUnit(nextUnit: HealthWaterUnit) {
    if (isSavingEntry) return;
    setUnit(nextUnit);
    setAmount(nextUnit === "cup" ? "1" : "10");
    setIsCustomAmountSelected(false);
  }

  async function saveGoal() {
    const nextAmount = Number.parseFloat(goalAmount);
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) return;
    if (saveInProgressRef.current.goal) return;
    saveInProgressRef.current.goal = true;
    setIsSavingGoal(true);
    try {
      const saved = await saveWaterGoal(waterAmountToMilliliters(nextAmount, goalUnit));
      if (saved) {
        setGoalAmountOverride(formatQuantity(nextAmount));
        setGoalEditorOpenOverride(false);
        setIsGoalDraftDirty(false);
      }
    } finally {
      saveInProgressRef.current.goal = false;
      setIsSavingGoal(false);
    }
  }

  async function clearGoal() {
    if (saveInProgressRef.current.goal) return;
    saveInProgressRef.current.goal = true;
    setIsSavingGoal(true);
    try {
      if (await saveWaterGoal(null)) {
        setGoalAmountOverride("");
        setGoalEditorOpenOverride(false);
        setIsGoalDraftDirty(false);
      }
    } finally {
      saveInProgressRef.current.goal = false;
      setIsSavingGoal(false);
    }
  }

  function changeGoalUnit(nextUnit: HealthWaterUnit) {
    if (isSavingGoal) return;
    const currentAmount = Number.parseFloat(goalAmount);
    if (Number.isFinite(currentAmount) && currentAmount > 0) {
      const nextAmount = formatQuantity(millilitersToWaterAmount(waterAmountToMilliliters(currentAmount, goalUnit), nextUnit));
      setGoalAmountOverride(nextAmount);
      setIsGoalDraftDirty(isHealthWaterGoalDraftDirty(nextAmount, nextUnit, waterGoalMl));
    }
    setGoalUnit(nextUnit);
  }

  function startEditing(entry: HealthWaterEntry) {
    if (isSavingExistingEntry) return;
    setEditingId(entry.id);
    setEditDraft({
      amount: String(entry.amount),
      date: entry.entry_date,
      time: formatTimeInput(entry.logged_at),
      unit: entry.unit,
    });
  }

  async function saveEditing(entryId: string) {
    const nextAmount = Number.parseFloat(editDraft.amount);
    if (!Number.isFinite(nextAmount) || nextAmount <= 0 || !editDraft.date || !editDraft.time) {
      return;
    }
    if (saveInProgressRef.current.existingEntry) return;
    saveInProgressRef.current.existingEntry = true;
    setIsSavingExistingEntry(true);
    try {
      const saved = await updateWaterEntry(entryId, {
        amount: nextAmount,
        amount_ml: waterAmountToMilliliters(nextAmount, editDraft.unit),
        entry_date: editDraft.date,
        logged_at: buildLoggedAt(editDraft.date, editDraft.time),
        unit: editDraft.unit,
      });
      if (saved) {
        if (editDraft.date !== today) {
          setExpandedHistoryDates((current) => new Set(current).add(editDraft.date));
        }
        setEditingId(null);
      }
    } finally {
      saveInProgressRef.current.existingEntry = false;
      setIsSavingExistingEntry(false);
    }
  }

  function cancelEntryDraft() {
    if (isSavingEntry) return;
    setAmount(entryDraftBaseline.unit === "cup" ? "1" : "10");
    setUnit(entryDraftBaseline.unit);
    setEntryStatus(entryDraftBaseline.entryStatus);
    setEntryDateTime({ date: entryDraftBaseline.date, time: entryDraftBaseline.time });
    setIsCustomAmountSelected(false);
  }

  function cancelGoalDraft() {
    if (isSavingGoal) return;
    setGoalAmountOverride(null);
    setGoalEditorOpenOverride(false);
    setIsGoalDraftDirty(false);
  }

  function toggleHistoryDate(dateKey: string) {
    setExpandedHistoryDates((current) => {
      const next = new Set(current);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  }

  return (
    <div aria-labelledby="health-tab-water" className="mt-6 min-w-0" id="health-panel-water" role="tabpanel">
      <ReorderablePageShells layout={layout} shellsClassName="grid gap-5 xl:grid-cols-12">
      <PageShell id="water-log" label="Water Log">
        <HealthCollapsiblePanel
          header={(
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef5ff] text-[#4f73b8] dark:bg-[#17243a] dark:text-[#b7cdfd]">
              <Droplets aria-hidden="true" className="h-5 w-5" />
            </div>
          )}
          shellSurface
          subtitle="Log in cups or US fluid ounces. Both views stay available throughout the day."
          title="Water"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <AdhdCard>
              <p className="text-xs text-[#74809b] dark:text-white/45">Today in cups</p>
              <p className="mt-2 text-3xl font-black text-[#26324f] dark:text-white">{formatQuantity(totals.cups)}</p>
            </AdhdCard>
            <AdhdCard>
              <p className="text-xs text-[#74809b] dark:text-white/45">Today in fl oz</p>
              <p className="mt-2 text-3xl font-black text-[#26324f] dark:text-white">{formatQuantity(totals.fluidOunces)}</p>
            </AdhdCard>
          </div>

          <div className="mt-4 rounded-[1rem] border border-[#e4def2] bg-[#fcfbff] p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-[#4d466d] dark:text-white/80">Daily goal</p>
                <p className="mt-1 text-xs text-[#8a82a3] dark:text-white/45">{goalSummaryFlOz !== null ? `${formatQuantity(totals.fluidOunces)} / ${formatQuantity(goalSummaryFlOz)} fl oz` : "No active goal"}</p>
              </div>
              {!isGoalEditorOpen ? (
                <AdhdIconButton aria-label="Edit daily water goal" disabled={isSavingGoal} onClick={() => setGoalEditorOpenOverride(true)} size="sm" tone="ghost" variant="rowToolbar">
                  <Pencil aria-hidden="true" />
                </AdhdIconButton>
              ) : null}
            </div>
            {isGoalEditorOpen ? (
              <div className="mt-2 flex flex-wrap items-end gap-2 sm:flex-nowrap">
                <label className="grid w-20 max-w-20 shrink-0 gap-1">
                  <span className="sr-only">Daily water goal amount</span>
                  <input
                    className={`${HEALTH_COMPACT_INPUT_CLASS} w-20`}
                    disabled={isSavingGoal}
                    inputMode="decimal"
                    onChange={(event) => {
                      setGoalAmountOverride(event.target.value);
                      setIsGoalDraftDirty(isHealthWaterGoalDraftDirty(event.target.value, goalUnit, waterGoalMl));
                    }}
                    placeholder="80"
                    value={goalAmount}
                  />
                </label>
                <div className="flex shrink-0 gap-1.5">
                  <AdhdChip disabled={isSavingGoal} onClick={() => changeGoalUnit("cup")} selected={goalUnit === "cup"}>Cups</AdhdChip>
                  <AdhdChip disabled={isSavingGoal} onClick={() => changeGoalUnit("fl_oz")} selected={goalUnit === "fl_oz"}>Fl oz</AdhdChip>
                </div>
                <AdhdChip contentClassName="gap-1" disabled={isSavingGoal} icon={<Check aria-hidden="true" className="h-3 w-3" />} onClick={() => { void saveGoal(); }} selected>Save</AdhdChip>
                {waterGoalMl !== null ? <AdhdChip disabled={isSavingGoal} onClick={() => { void clearGoal(); }}>Clear</AdhdChip> : null}
                <AdhdChip disabled={isSavingGoal} icon={<X aria-hidden="true" className="h-3 w-3" />} onClick={cancelGoalDraft}>Cancel</AdhdChip>
              </div>
            ) : null}
          </div>

          <div className="mt-5 rounded-[1rem] border border-[#e4def2] bg-[#fcfbff] p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#7d7598] dark:text-white/55">
              <span className="font-semibold text-[#4d466d] dark:text-white/80">Entry status</span>
              <AdhdChip disabled={isSavingEntry} onClick={() => setEntryStatus("confirmed")} selected={entryStatus === "confirmed"}>Confirmed</AdhdChip>
              <AdhdChip disabled={isSavingEntry} onClick={() => setEntryStatus("pending")} selected={entryStatus === "pending"}>Pending</AdhdChip>
            </div>
            <div className="mt-3 grid gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#7d7598] dark:text-white/55">
                <span className="font-semibold text-[#4d466d] dark:text-white/80">Entry mode</span>
                <AdhdChip disabled={isSavingEntry} onClick={() => selectEntryUnit("fl_oz")} selected={unit === "fl_oz"}>Fl oz</AdhdChip>
                <AdhdChip disabled={isSavingEntry} onClick={() => selectEntryUnit("cup")} selected={unit === "cup"}>Cups</AdhdChip>
              </div>
              {!isCustomAmountSelected ? (
                <div className="flex flex-wrap gap-2">
                  {(unit === "fl_oz" ? WATER_FL_OZ_PRESETS : WATER_CUP_PRESETS).map((preset) => (
                    <AdhdChip contentClassName="gap-0.5" disabled={isSavingEntry} icon={<Plus aria-hidden="true" className="h-3 w-3" />} key={preset} onClick={() => { void addAmount(preset, unit); }} selected>
                      {preset} {unit === "cup" ? (preset === 1 ? "cup" : "cups") : "fl oz"}
                    </AdhdChip>
                  ))}
                  <AdhdChip disabled={isSavingEntry} onClick={() => setIsCustomAmountSelected(true)}>Custom</AdhdChip>
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="grid w-20 max-w-20 shrink-0 gap-1">
                    <span className="sr-only">Custom water amount</span>
                    <input className={`${HEALTH_COMPACT_INPUT_CLASS} w-20`} disabled={isSavingEntry} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} value={amount} />
                  </label>
                  <span className="pb-2 text-xs font-semibold text-[#7d7598] dark:text-white/55">{unit === "cup" ? "cups" : "fl oz"}</span>
                  <AdhdChip disabled={isSavingEntry} onClick={() => { void addAmount(Number.parseFloat(amount), unit, amount); }} selected>Add</AdhdChip>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[#ece8f8] pt-3 text-xs dark:border-white/10">
                <label className="flex min-w-0 items-center gap-1.5 text-[#7d7598] dark:text-white/55">
                  <span className="shrink-0 font-medium">Date</span>
                  <input className={`${HEALTH_COMPACT_INPUT_CLASS} w-40 max-w-full`} disabled={isSavingEntry} onChange={(event) => setEntryDateTime((current) => ({ ...current, date: event.target.value }))} type="date" value={entryDateTime.date} />
                </label>
                <label className="flex min-w-0 items-center gap-1.5 text-[#7d7598] dark:text-white/55">
                  <span className="shrink-0 font-medium">Time</span>
                  <input className={`${HEALTH_COMPACT_INPUT_CLASS} w-28 max-w-full`} disabled={isSavingEntry} onChange={(event) => setEntryDateTime((current) => ({ ...current, time: event.target.value }))} type="time" value={entryDateTime.time} />
                </label>
              </div>
              {hasUnfinishedEntryDraft ? (
                <AdhdChip disabled={isSavingEntry} icon={<X aria-hidden="true" className="h-3 w-3" />} onClick={cancelEntryDraft}>Cancel entry draft</AdhdChip>
              ) : null}
            </div>
          </div>
          <HealthWaterLineChart history={waterHistory} waterGoalMl={waterGoalMl} />
        </HealthCollapsiblePanel>
      </PageShell>
      <PageShell hiddenDescription="Hidden until pending water exists" id="water-pending" label="Pending Water" visible={pendingEntries.length > 0}>
        <HealthCollapsiblePanel shellSurface subtitle="These entries do not count toward totals until confirmed." title="Pending water">
        {pendingEntries.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {pendingEntries.map((entry) => (
                <WaterEntryCard
                  confirmWaterEntry={confirmWaterEntry}
                  deleteWaterEntry={deleteWaterEntry}
                  editDraft={editDraft}
                  editingId={editingId}
                  entry={entry}
                  isSaving={isSavingExistingEntry}
                  key={entry.id}
                  onCancelEdit={() => setEditingId(null)}
                  onChangeDraft={setEditDraft}
                  onSaveEdit={saveEditing}
                  onStartEdit={startEditing}
                />
              ))}
            </div>
        ) : null}
        </HealthCollapsiblePanel>
      </PageShell>
      <PageShell id="water-today" label="Today's Water">
        <HealthCollapsiblePanel shellSurface subtitle={`${todayEntries.length} ${todayEntries.length === 1 ? "entry" : "entries"} today`} title="Today’s water">
          {todayEntries.length === 0 ? (
            <p className="text-sm text-[#7d7598] dark:text-white/55">Water entries will appear here as you add them.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {todayEntries.map((entry) => (
                <WaterEntryCard
                  deleteWaterEntry={deleteWaterEntry}
                  editDraft={editDraft}
                  editingId={editingId}
                  entry={entry}
                  isSaving={isSavingExistingEntry}
                  key={entry.id}
                  onCancelEdit={() => setEditingId(null)}
                  onChangeDraft={setEditDraft}
                  onSaveEdit={saveEditing}
                  onStartEdit={startEditing}
                />
              ))}
            </div>
          )}
        </HealthCollapsiblePanel>
      </PageShell>

      <PageShell id="water-history" label="Water History">
        <HealthCollapsiblePanel shellSurface subtitle="Previous days" title="Water history">
          {waterHistory.length === 0 ? (
            <p className="text-sm text-[#7d7598] dark:text-white/55">Past water totals will appear here after entries exist on earlier days.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {waterHistory.map((day) => (
                <AdhdCard key={day.dateKey}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#26324f] dark:text-white">{formatHealthDateLabel(day.dateKey)}</p>
                      <p className="mt-1 text-xs text-[#74809b] dark:text-white/45">
                        {day.entryCount} {day.entryCount === 1 ? "entry" : "entries"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2 text-right">
                      <div>
                        <p className="text-sm font-black text-[#26324f] dark:text-white">{formatQuantity(day.totals.fluidOunces)} fl oz</p>
                        <p className="mt-1 text-xs text-[#74809b] dark:text-white/45">{formatQuantity(day.totals.cups)} cups</p>
                      </div>
                      <AdhdChip
                        aria-controls={`water-history-entries-${day.dateKey}`}
                        aria-expanded={expandedHistoryDates.has(day.dateKey)}
                        onClick={() => toggleHistoryDate(day.dateKey)}
                        selected={expandedHistoryDates.has(day.dateKey)}
                      >
                        {expandedHistoryDates.has(day.dateKey) ? "Hide entries" : "Entries"}
                      </AdhdChip>
                    </div>
                  </div>
                  {expandedHistoryDates.has(day.dateKey) ? (
                    <div className="mt-4 grid gap-3 border-t border-[#ece8f8] pt-4 dark:border-white/10" id={`water-history-entries-${day.dateKey}`}>
                      {day.entries.map((entry) => (
                        <WaterEntryCard
                          deleteWaterEntry={deleteWaterEntry}
                          editDraft={editDraft}
                          editingId={editingId}
                          entry={entry}
                          isSaving={isSavingExistingEntry}
                          key={entry.id}
                          onCancelEdit={() => setEditingId(null)}
                          onChangeDraft={setEditDraft}
                          onSaveEdit={saveEditing}
                          onStartEdit={startEditing}
                        />
                      ))}
                    </div>
                  ) : null}
                </AdhdCard>
              ))}
            </div>
          )}
        </HealthCollapsiblePanel>
      </PageShell>
      </ReorderablePageShells>
    </div>
  );
}

type WaterEditDraft = {
  amount: string;
  date: string;
  time: string;
  unit: HealthWaterUnit;
};

type WaterEntryCardProps = {
  confirmWaterEntry?: (id: string) => Promise<boolean>;
  deleteWaterEntry: (id: string) => Promise<boolean>;
  editDraft: WaterEditDraft;
  editingId: string | null;
  entry: HealthWaterEntry;
  isSaving: boolean;
  onCancelEdit: () => void;
  onChangeDraft: (draft: WaterEditDraft) => void;
  onSaveEdit: (entryId: string) => Promise<void>;
  onStartEdit: (entry: HealthWaterEntry) => void;
};

function WaterEntryCard({
  confirmWaterEntry,
  deleteWaterEntry,
  editDraft,
  editingId,
  entry,
  isSaving,
  onCancelEdit,
  onChangeDraft,
  onSaveEdit,
  onStartEdit,
}: WaterEntryCardProps) {
  const isEditing = editingId === entry.id;
  const isPending = !isHealthWaterEntryConfirmed(entry);
  if (isEditing) {
    return (
      <AdhdCard>
        <div className="grid gap-3">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
            <label className="grid w-20 max-w-full gap-1.5">
              <span className="text-xs font-medium text-[#7d7598] dark:text-white/55">Amount</span>
              <input
                className={`${HEALTH_COMPACT_INPUT_CLASS} w-20 max-w-full text-[13px]`}
                disabled={isSaving}
                inputMode="decimal"
                onChange={(event) => onChangeDraft({ ...editDraft, amount: event.target.value })}
                value={editDraft.amount}
              />
            </label>
            <label className="grid w-28 max-w-full gap-1.5">
              <span className="text-xs font-medium text-[#7d7598] dark:text-white/55">Unit</span>
              <select
                className={`${HEALTH_COMPACT_INPUT_CLASS} w-28 max-w-full text-[13px]`}
                disabled={isSaving}
                onChange={(event) => onChangeDraft({ ...editDraft, unit: event.target.value as HealthWaterUnit })}
                value={editDraft.unit}
              >
                <option value="cup">Cups</option>
                <option value="fl_oz">Fl oz</option>
              </select>
            </label>
            <label className="grid w-40 max-w-full gap-1.5">
              <span className="text-xs font-medium text-[#7d7598] dark:text-white/55">Date</span>
              <input
                className={`${HEALTH_COMPACT_INPUT_CLASS} w-40 max-w-full text-[13px]`}
                disabled={isSaving}
                onChange={(event) => onChangeDraft({ ...editDraft, date: event.target.value })}
                type="date"
                value={editDraft.date}
              />
            </label>
            <label className="grid w-28 max-w-full gap-1.5">
              <span className="text-xs font-medium text-[#7d7598] dark:text-white/55">Time</span>
              <input
                className={`${HEALTH_COMPACT_INPUT_CLASS} w-28 max-w-full text-[13px]`}
                disabled={isSaving}
                onChange={(event) => onChangeDraft({ ...editDraft, time: event.target.value })}
                type="time"
                value={editDraft.time}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <AdhdChip contentClassName="gap-1" disabled={isSaving} icon={<Check aria-hidden="true" className="h-3 w-3" />} onClick={() => { void onSaveEdit(entry.id); }} selected>Save</AdhdChip>
            <AdhdChip contentClassName="gap-1" disabled={isSaving} icon={<X aria-hidden="true" className="h-3 w-3" />} onClick={onCancelEdit}>Cancel</AdhdChip>
          </div>
        </div>
      </AdhdCard>
    );
  }

  return (
    <AdhdCard>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#26324f] dark:text-white">
            {formatQuantity(entry.amount)} {entry.unit === "cup" ? (entry.amount === 1 ? "cup" : "cups") : "fl oz"}
          </p>
          {isPending ? <span className="mt-1 inline-flex rounded-full border border-[#e6c97e] bg-[#fff8df] px-2 py-0.5 text-[11px] font-semibold text-[#96701d] dark:border-[#6b5317] dark:bg-[#44350d]/55 dark:text-[#f3d38a]">Pending</span> : null}
          <p className="mt-1 text-xs text-[#74809b] dark:text-white/45">
            {formatWaterTimestamp(entry)}
          </p>
          <p className="mt-1 text-xs text-[#9aa2b8] dark:text-white/35">
            {formatQuantity(millilitersToWaterAmount(entry.amount_ml, entry.unit === "cup" ? "fl_oz" : "cup"))} {entry.unit === "cup" ? "fl oz" : "cups"}
          </p>
        </div>
        <div className="flex shrink-0 flex-nowrap justify-end gap-2">
          {isPending && confirmWaterEntry ? (
            <AdhdChip className="shrink-0" contentClassName="gap-1" icon={<Check aria-hidden="true" className="h-3 w-3" />} onClick={() => { void confirmWaterEntry(entry.id); }} selected>
              Confirm
            </AdhdChip>
          ) : null}
          <AdhdChip
            className="shrink-0"
            contentClassName="gap-1"
            disabled={isSaving}
            icon={<Pencil aria-hidden="true" className="h-3 w-3" />}
            onClick={() => onStartEdit(entry)}
          >
            Edit
          </AdhdChip>
          <AdhdChip
            className="shrink-0"
            contentClassName="gap-1"
            icon={<Trash2 aria-hidden="true" className="h-3 w-3" />}
            onClick={() => { void deleteWaterEntry(entry.id); }}
            tone="danger"
          >
            Delete
          </AdhdChip>
        </div>
      </div>
    </AdhdCard>
  );
}

function buildLoggedAt(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

function formatTimeInput(loggedAt: string) {
  const date = new Date(loggedAt);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatWaterTimestamp(entry: HealthWaterEntry) {
  return `${formatHealthDateLabel(entry.entry_date)} - ${new Date(entry.logged_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}
