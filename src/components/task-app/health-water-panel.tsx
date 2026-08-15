"use client";

import { Check, Droplets, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { AdhdCard } from "@/components/ui-system/adhd-card";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import type { HealthWaterEntry, HealthWaterUnit } from "@/lib/database.types";
import {
  formatQuantity,
  millilitersToWaterAmount,
  sumWaterForDate,
  waterAmountToMilliliters,
} from "@/lib/health-library";
import { formatHealthDateLabel } from "@/lib/health-utils";
import { HealthCollapsiblePanel } from "./health-collapsible-panel";

type HealthWaterPanelProps = {
  addWaterEntry: (input: {
    amount: number;
    amount_ml: number;
    entry_date: string;
    unit: HealthWaterUnit;
  }) => Promise<boolean>;
  deleteWaterEntry: (id: string) => Promise<boolean>;
  today: string;
  updateWaterEntry: (entryId: string, input: {
    amount: number;
    amount_ml: number;
    entry_date: string;
    logged_at: string;
    unit: HealthWaterUnit;
  }) => Promise<boolean>;
  waterEntries: HealthWaterEntry[];
};

export function HealthWaterPanel({
  addWaterEntry,
  deleteWaterEntry,
  today,
  updateWaterEntry,
  waterEntries,
}: HealthWaterPanelProps) {
  const [amount, setAmount] = useState("1");
  const [unit, setUnit] = useState<HealthWaterUnit>("cup");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    amount: "1",
    date: today,
    time: "12:00",
    unit: "cup" as HealthWaterUnit,
  });
  const todayEntries = useMemo(
    () => waterEntries.filter((entry) => entry.entry_date === today),
    [today, waterEntries],
  );
  const totals = useMemo(() => sumWaterForDate(waterEntries, today), [today, waterEntries]);
  const waterHistory = useMemo(() => {
    const dateKeys = Array.from(new Set(waterEntries.map((entry) => entry.entry_date)))
      .filter((dateKey) => dateKey !== today)
      .sort((left, right) => right.localeCompare(left))
      .slice(0, 14);
    return dateKeys.map((dateKey) => ({
      dateKey,
      entryCount: waterEntries.filter((entry) => entry.entry_date === dateKey).length,
      totals: sumWaterForDate(waterEntries, dateKey),
    }));
  }, [today, waterEntries]);

  async function addAmount(nextAmount: number, nextUnit: HealthWaterUnit) {
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      return;
    }
    const saved = await addWaterEntry({
      amount: nextAmount,
      amount_ml: waterAmountToMilliliters(nextAmount, nextUnit),
      entry_date: today,
      unit: nextUnit,
    });
    if (saved) {
      setAmount(nextUnit === "cup" ? "1" : "8");
      setUnit(nextUnit);
    }
  }

  function startEditing(entry: HealthWaterEntry) {
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
    const saved = await updateWaterEntry(entryId, {
      amount: nextAmount,
      amount_ml: waterAmountToMilliliters(nextAmount, editDraft.unit),
      entry_date: editDraft.date,
      logged_at: buildLoggedAt(editDraft.date, editDraft.time),
      unit: editDraft.unit,
    });
    if (saved) {
      setEditingId(null);
    }
  }

  return (
    <div aria-labelledby="health-tab-water" className="mt-6 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]" id="health-panel-water" role="tabpanel">
      <div className="grid content-start gap-5">
        <HealthCollapsiblePanel
          header={(
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef5ff] text-[#4f73b8] dark:bg-[#17243a] dark:text-[#b7cdfd]">
              <Droplets aria-hidden="true" className="h-5 w-5" />
            </div>
          )}
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

          <div className="mt-5 flex flex-wrap gap-2">
            <AdhdChip contentClassName="gap-0.5" icon={<Plus aria-hidden="true" className="h-3 w-3" />} onClick={() => { void addAmount(1, "cup"); }} selected>
              1 cup
            </AdhdChip>
            <AdhdChip contentClassName="gap-0.5" icon={<Plus aria-hidden="true" className="h-3 w-3" />} onClick={() => { void addAmount(8, "fl_oz"); }}>
              8 fl oz
            </AdhdChip>
            <AdhdChip contentClassName="gap-0.5" icon={<Plus aria-hidden="true" className="h-3 w-3" />} onClick={() => { void addAmount(12, "fl_oz"); }}>
              12 fl oz
            </AdhdChip>
            <AdhdChip contentClassName="gap-0.5" icon={<Plus aria-hidden="true" className="h-3 w-3" />} onClick={() => { void addAmount(16, "fl_oz"); }}>
              16 fl oz
            </AdhdChip>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-[#7d7598] dark:text-white/55">Custom amount</span>
              <input className="health-input" inputMode="decimal" onChange={(event) => setAmount(event.target.value)} value={amount} />
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <AdhdChip onClick={() => setUnit("cup")} selected={unit === "cup"}>Cups</AdhdChip>
              <AdhdChip onClick={() => setUnit("fl_oz")} selected={unit === "fl_oz"}>Fl oz</AdhdChip>
              <AdhdChip onClick={() => { void addAmount(Number.parseFloat(amount), unit); }} selected>Add water</AdhdChip>
            </div>
          </div>
        </HealthCollapsiblePanel>
      </div>

      <div className="grid content-start gap-5">
        <HealthCollapsiblePanel subtitle={`${todayEntries.length} ${todayEntries.length === 1 ? "entry" : "entries"} today`} title="Today’s water">
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

        <HealthCollapsiblePanel subtitle="Previous days" title="Water history">
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
                    <div className="text-right">
                      <p className="text-sm font-black text-[#26324f] dark:text-white">{formatQuantity(day.totals.fluidOunces)} fl oz</p>
                      <p className="mt-1 text-xs text-[#74809b] dark:text-white/45">{formatQuantity(day.totals.cups)} cups</p>
                    </div>
                  </div>
                </AdhdCard>
              ))}
            </div>
          )}
        </HealthCollapsiblePanel>
      </div>
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
  deleteWaterEntry: (id: string) => Promise<boolean>;
  editDraft: WaterEditDraft;
  editingId: string | null;
  entry: HealthWaterEntry;
  onCancelEdit: () => void;
  onChangeDraft: (draft: WaterEditDraft) => void;
  onSaveEdit: (entryId: string) => Promise<void>;
  onStartEdit: (entry: HealthWaterEntry) => void;
};

function WaterEntryCard({
  deleteWaterEntry,
  editDraft,
  editingId,
  entry,
  onCancelEdit,
  onChangeDraft,
  onSaveEdit,
  onStartEdit,
}: WaterEntryCardProps) {
  const isEditing = editingId === entry.id;
  if (isEditing) {
    return (
      <AdhdCard>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-[#7d7598] dark:text-white/55">Amount</span>
              <input
                className="health-input"
                inputMode="decimal"
                onChange={(event) => onChangeDraft({ ...editDraft, amount: event.target.value })}
                value={editDraft.amount}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-[#7d7598] dark:text-white/55">Unit</span>
              <select
                className="health-input"
                onChange={(event) => onChangeDraft({ ...editDraft, unit: event.target.value as HealthWaterUnit })}
                value={editDraft.unit}
              >
                <option value="cup">Cups</option>
                <option value="fl_oz">Fl oz</option>
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-[#7d7598] dark:text-white/55">Date</span>
              <input
                className="health-input"
                onChange={(event) => onChangeDraft({ ...editDraft, date: event.target.value })}
                type="date"
                value={editDraft.date}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-[#7d7598] dark:text-white/55">Time</span>
              <input
                className="health-input"
                onChange={(event) => onChangeDraft({ ...editDraft, time: event.target.value })}
                type="time"
                value={editDraft.time}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <AdhdChip contentClassName="gap-1" icon={<Check aria-hidden="true" className="h-3 w-3" />} onClick={() => { void onSaveEdit(entry.id); }} selected>Save</AdhdChip>
            <AdhdChip contentClassName="gap-1" icon={<X aria-hidden="true" className="h-3 w-3" />} onClick={onCancelEdit}>Cancel</AdhdChip>
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
          <p className="mt-1 text-xs text-[#74809b] dark:text-white/45">
            {formatWaterTimestamp(entry)}
          </p>
          <p className="mt-1 text-xs text-[#9aa2b8] dark:text-white/35">
            {formatQuantity(millilitersToWaterAmount(entry.amount_ml, entry.unit === "cup" ? "fl_oz" : "cup"))} {entry.unit === "cup" ? "fl oz" : "cups"}
          </p>
        </div>
        <div className="flex shrink-0 flex-nowrap justify-end gap-2">
          <AdhdChip
            className="shrink-0"
            contentClassName="gap-1"
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
            Remove
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
