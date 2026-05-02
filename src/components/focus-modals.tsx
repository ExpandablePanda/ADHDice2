import React, { useState } from "react";
import { FocusCategory, FocusType, FocusSubtype, FocusLabelOptions, CategoryIcon } from "./task-app";
import { ModalShell } from "./modal-shell";

function todayLocalISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function SessionFinishModal({
  category,
  durationSeconds,
  labelOptions,
  lightMode,
  onConfirm,
  onCancel,
}: {
  category: FocusCategory;
  durationSeconds: number;
  labelOptions: FocusLabelOptions;
  lightMode: boolean;
  onConfirm: (data: { title: string; focusType: FocusType; focusSubtype?: FocusSubtype | null; focusSubtype2?: FocusSubtype | null; notes: string }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(category.title);
  const [focusType, setFocusType] = useState<FocusType>(category.focusType);
  const [focusSubtype, setFocusSubtype] = useState<FocusSubtype>(category.focusSubtype ?? "");
  const [focusSubtype2, setFocusSubtype2] = useState(category.focusSubtype2 ?? "");
  const [notes, setNotes] = useState("");

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return `${m}m ${rs}s`;
  };

  return (
    <ModalShell className={`w-full max-w-lg max-h-[82vh] overflow-y-auto rounded-[var(--radius-modal)] border p-10 shadow-[var(--shadow-modal)] ${lightMode ? "border-[var(--border-soft)] bg-[var(--surface-elevated)]" : "border-white/10 bg-[#171329]"}`}>
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl" style={{ backgroundColor: category.color + "20", color: category.color }}>
            <CategoryIcon name={category.icon} className="h-10 w-10" />
          </div>
          <h2 className={`text-3xl font-black ${lightMode ? "text-[var(--text-primary)]" : "text-white"}`}>Session Complete</h2>
          <p className={`mt-2 text-lg font-bold ${lightMode ? "text-[var(--accent)]" : "text-[#cabfff]"}`}>
            {category.title} • {formatTime(durationSeconds)}
          </p>
        </div>

        <div className="mt-10 space-y-6">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider opacity-40">Session Title</span>
            <input
              className={`px-4 py-2 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
              list="finish-focus-titles"
              onChange={(e) => setTitle(e.target.value)}
              type="text"
              value={title}
            />
            <datalist id="finish-focus-titles">
              {labelOptions.titles.map((option) => <option key={option} value={option} />)}
            </datalist>
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wider opacity-40">Focus Type</span>
              <input
                className={`px-4 py-2 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
                list="finish-focus-types"
                onChange={(e) => setFocusType(e.target.value as FocusType)}
                type="text"
                value={focusType}
              />
              <datalist id="finish-focus-types">
                {labelOptions.types.map((option) => <option key={option} value={option} />)}
              </datalist>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wider opacity-40">Subtype</span>
              <input
                className={`px-4 py-2 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
                list="finish-primary-subtypes"
                onChange={(e) => setFocusSubtype(e.target.value as FocusSubtype)}
                type="text"
                value={focusSubtype}
              />
              <datalist id="finish-primary-subtypes">
                {labelOptions.primarySubtypes.map((option) => <option key={option} value={option} />)}
              </datalist>
            </label>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider opacity-40">Subtype 2</span>
            <input
              className={`px-4 py-2 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
              list="finish-secondary-subtypes"
              onChange={(e) => setFocusSubtype2(e.target.value)}
              placeholder="Optional"
              type="text"
              value={focusSubtype2}
            />
            <datalist id="finish-secondary-subtypes">
              {labelOptions.secondarySubtypes.map((option) => <option key={option} value={option} />)}
            </datalist>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider opacity-40">Session Notes</span>
            <textarea
              className={`min-h-[100px] resize-none px-4 py-3 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What did you accomplish?"
              value={notes}
            />
          </label>
        </div>

        <div className="mt-10 flex gap-4">
          <button
            className={`flex-1 py-4 font-bold transition hover:bg-white/5 ${lightMode ? "ui-pill-button-light" : "rounded-full text-white"}`}
            onClick={onCancel}
            type="button"
          >
            Discard
          </button>
          <button
            className={`flex-1 py-4 font-bold transition hover:scale-105 ${lightMode ? "ui-pill-button-strong-light" : "rounded-full bg-[#6f57f6] text-white shadow-xl shadow-[#6f57f6]/30"}`}
            onClick={() => onConfirm({ title, focusType, focusSubtype: focusSubtype.trim() || null, focusSubtype2: focusSubtype2.trim() || null, notes })}
            type="button"
          >
            Save Session
          </button>
        </div>
    </ModalShell>
  );
}

export function ManualEntryModal({
  categories,
  labelOptions,
  lightMode,
  onSave,
  onClose,
}: {
  categories: FocusCategory[];
  labelOptions: FocusLabelOptions;
  lightMode: boolean;
  onSave: (data: { categoryId: string | null; title: string; focusType: FocusType; focusSubtype?: FocusSubtype | null; focusSubtype2?: FocusSubtype | null; durationSeconds: number; date: string; notes: string }) => Promise<boolean>;
  onClose: () => void;
}) {
  const [catId, setCatId] = useState(categories[0]?.id ?? "__none__");
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("0");
  const [date, setDate] = useState(todayLocalISO());
  const [title, setTitle] = useState(categories[0]?.title ?? "");
  const [focusType, setFocusType] = useState<FocusType>(categories[0]?.focusType ?? "Work");
  const [focusSubtype, setFocusSubtype] = useState<FocusSubtype>(categories[0]?.focusSubtype ?? "");
  const [focusSubtype2, setFocusSubtype2] = useState(categories[0]?.focusSubtype2 ?? "");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleCategoryChange = (id: string) => {
    setCatId(id);
    if (id === "__none__") {
      return;
    }

    const cat = categories.find((c) => c.id === id);
    if (cat) {
      setTitle(cat.title);
      setFocusType(cat.focusType);
      setFocusSubtype(cat.focusSubtype ?? "");
      setFocusSubtype2(cat.focusSubtype2 ?? "");
    }
  };

  const submit = async () => {
    const totalSeconds = (parseInt(hours) || 0) * 3600 + (parseInt(minutes) || 0) * 60;
    if (totalSeconds <= 0 || !title.trim() || !focusType.trim()) return;
    setIsSaving(true);
    try {
      await onSave({
        categoryId: catId === "__none__" ? null : catId,
        title,
        focusType,
        focusSubtype: focusSubtype.trim() || null,
        focusSubtype2: focusSubtype2.trim() || null,
        durationSeconds: totalSeconds,
        date,
        notes,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalShell className={`w-full max-w-2xl max-h-[82vh] overflow-y-auto rounded-[var(--radius-modal)] border p-8 shadow-[var(--shadow-modal)] ${lightMode ? "border-[var(--border-soft)] bg-[var(--surface-elevated)]" : "border-white/10 bg-[#171329]"}`}>
        <h2 className={`text-center text-3xl font-black ${lightMode ? "text-[var(--text-primary)]" : "text-white"}`}>Manual Entry</h2>

        <div className="mt-10 space-y-6">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider opacity-40">Saved Category</span>
            <select
              className={`px-4 py-3 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
              onChange={(e) => handleCategoryChange(e.target.value)}
              value={catId}
            >
              <option value="__none__">No saved category</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.title}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider opacity-40">Session Title</span>
            <input
              className={`px-4 py-2 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
              list="manual-focus-titles"
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Deep Work"
              type="text"
              value={title}
            />
            <datalist id="manual-focus-titles">
              {labelOptions.titles.map((option) => <option key={option} value={option} />)}
            </datalist>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wider opacity-40">Hours</span>
              <input className={`px-4 py-2 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`} min="0" onChange={(e) => setHours(e.target.value)} type="number" value={hours} />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wider opacity-40">Minutes</span>
              <input className={`px-4 py-2 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`} max="59" min="0" onChange={(e) => setMinutes(e.target.value)} type="number" value={minutes} />
            </label>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider opacity-40">Date</span>
            <input className={`px-4 py-3 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`} onChange={(e) => setDate(e.target.value)} type="date" value={date} />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input
              className={`px-4 py-2 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
              list="manual-focus-types"
              onChange={(e) => setFocusType(e.target.value as FocusType)}
              placeholder="Work"
              type="text"
              value={focusType}
            />
            <datalist id="manual-focus-types">
              {labelOptions.types.map((option) => <option key={option} value={option} />)}
            </datalist>

            <input
              className={`px-4 py-2 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
              list="manual-primary-subtypes"
              onChange={(e) => setFocusSubtype(e.target.value as FocusSubtype)}
              placeholder="Productive"
              type="text"
              value={focusSubtype}
            />
            <datalist id="manual-primary-subtypes">
              {labelOptions.primarySubtypes.map((option) => <option key={option} value={option} />)}
            </datalist>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider opacity-40">Subtype 2</span>
            <input
              className={`px-4 py-2 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
              list="manual-secondary-subtypes"
              onChange={(e) => setFocusSubtype2(e.target.value)}
              placeholder="Optional"
              type="text"
              value={focusSubtype2}
            />
            <datalist id="manual-secondary-subtypes">
              {labelOptions.secondarySubtypes.map((option) => <option key={option} value={option} />)}
            </datalist>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider opacity-40">Notes</span>
            <textarea
              className={`min-h-[80px] resize-none px-4 py-3 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What happened during this time?"
              value={notes}
            />
          </label>
        </div>

        <div className="mt-10 flex gap-4">
          <button
            className={`flex-1 py-4 font-bold transition hover:bg-white/5 ${lightMode ? "ui-pill-button-light" : "rounded-full text-white"}`}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className={`flex-1 py-4 font-bold transition hover:scale-105 ${lightMode ? "ui-pill-button-strong-light" : "rounded-full bg-[#6f57f6] text-white shadow-xl shadow-[#6f57f6]/30"}`}
            disabled={isSaving || !title.trim() || !focusType.trim()}
            onClick={() => void submit()}
            type="button"
          >
            {isSaving ? "Saving..." : "Log Entry"}
          </button>
        </div>
    </ModalShell>
  );
}
