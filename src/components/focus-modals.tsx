import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { type FocusCategory, type FocusType, type FocusSubtype, type FocusLabelOptions } from "@/lib/types";
import { CategoryIcon } from "./task-app";
import { ModalShell } from "./modal-shell";

const manualInputClassName = "h-12 rounded-full border border-[#ddd6fb] bg-white px-4 text-sm font-semibold text-[#1f2642] shadow-[0_10px_24px_rgba(111,87,246,0.08)] outline-none transition placeholder:text-[#a59cc7] focus:border-[#c8bcff] dark:border-white/10 dark:bg-white/8 dark:text-white dark:placeholder:text-white/35 dark:focus:border-white/20";

type ManualSelectOption = {
  label: string;
  value: string;
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="ui-field-label dark:text-white/40">{children}</span>;
}

function ManualSuggestionInput({
  forceSelectedTone = false,
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  forceSelectedTone?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLLabelElement>(null);
  const normalizedValue = value.trim().toLowerCase();
  const hasExactMatch = options.some((option) => option.trim().toLowerCase() === normalizedValue);
  const hasSelectedTone = forceSelectedTone || hasExactMatch;
  const filteredOptions = options.filter((option) => {
    const normalizedOption = option.trim().toLowerCase();
    if (!normalizedValue) {
      return true;
    }
    return normalizedOption.includes(normalizedValue);
  }).slice(0, 8);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <label className="flex flex-col gap-2" ref={rootRef}>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <input
          className={`w-full pr-11 px-4 py-2 ui-input-light ${manualInputClassName} ${hasSelectedTone ? "text-[#6f57f6] placeholder:text-[#8b70ff] dark:text-[#cabfff] dark:placeholder:text-[#cabfff]/70" : ""}`}
          onChange={(event) => {
            onChange(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          type="text"
          value={value}
        />
        <button
          aria-expanded={isOpen}
          className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center justify-center text-[#6f57f6] dark:text-[#cabfff]"
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
        {isOpen && filteredOptions.length > 0 ? (
          <div className="absolute left-0 top-[calc(100%+0.5rem)] z-30 w-full overflow-hidden rounded-[1.1rem] border border-[#ddd6fb] bg-white p-2 shadow-[0_22px_60px_rgba(56,42,116,0.18)] dark:border-white/10 dark:bg-[#241d3f]">
            <div className="grid gap-1">
              {filteredOptions.map((option) => {
                const isSelected = option.trim().toLowerCase() === normalizedValue;
                return (
                  <button
                    className={`flex w-full items-center rounded-[0.9rem] px-3 py-2 text-left text-sm font-semibold transition-colors ${isSelected
                      ? "bg-[#f2edff] text-[#6f57f6] dark:bg-[#312555] dark:text-[#cabfff]"
                      : "text-[#3a4260] hover:bg-[#f7f4ff] dark:text-white/80 dark:hover:bg-white/8"}`}
                    key={option}
                    onClick={() => {
                      onChange(option);
                      setIsOpen(false);
                    }}
                    type="button"
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </label>
  );
}

function ManualPillSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: ManualSelectOption[];
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? "";

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <div className="grid gap-2" ref={rootRef}>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <button
          aria-expanded={isOpen}
          className="flex h-12 w-full items-center justify-between rounded-full border border-[#ddd6fb] bg-white px-4 text-sm font-semibold text-[#1f2642] shadow-[0_10px_24px_rgba(111,87,246,0.08)] transition hover:border-[#c8bcff] dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:border-white/20"
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <span className="truncate pr-3 text-left">{selectedLabel}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[#6f57f6] transition-transform dark:text-[#cabfff] ${isOpen ? "rotate-180" : ""}`} />
        </button>
        {isOpen ? (
          <div className="absolute left-0 top-[calc(100%+0.5rem)] z-30 min-w-full overflow-hidden rounded-[1.1rem] border border-[#ddd6fb] bg-white p-2 shadow-[0_22px_60px_rgba(56,42,116,0.18)] dark:border-white/10 dark:bg-[#241d3f]">
            <div className="grid gap-1">
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    className={`flex w-full items-center rounded-[0.9rem] px-3 py-2 text-left text-sm font-semibold transition-colors ${isSelected
                      ? "bg-[#f2edff] text-[#6f57f6] dark:bg-[#312555] dark:text-[#cabfff]"
                      : "text-[#3a4260] hover:bg-[#f7f4ff] dark:text-white/80 dark:hover:bg-white/8"}`}
                    key={option.value}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    type="button"
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

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
  onConfirm,
  onCancel,
}: {
  category: FocusCategory;
  durationSeconds: number;
  labelOptions: FocusLabelOptions;
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
    <ModalShell className="w-full max-w-lg max-h-[82vh] overflow-y-auto rounded-[var(--radius-modal)] border p-10 shadow-[var(--shadow-modal)] border-[var(--border-soft)] bg-[var(--surface-elevated)] dark:border-white/10 dark:bg-[#171329]">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl" style={{ backgroundColor: category.color + "20", color: category.color }}>
            <CategoryIcon name={category.icon} className="h-10 w-10" />
          </div>
          <h2 className="text-3xl font-black text-[var(--text-primary)]">Session Complete</h2>
          <p className="mt-2 text-lg font-bold text-[var(--accent)]">
            {category.title} • {formatTime(durationSeconds)}
          </p>
        </div>

        <div className="mt-10 space-y-6">
          <label className="flex flex-col gap-2">
            <FieldLabel>Session Title</FieldLabel>
            <input
              className={`px-4 py-2 ui-input-light ${manualInputClassName}`}
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
              <FieldLabel>Focus Type</FieldLabel>
              <input
                className={`px-4 py-2 ui-input-light ${manualInputClassName}`}
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
              <FieldLabel>Subtype</FieldLabel>
              <input
                className={`px-4 py-2 ui-input-light ${manualInputClassName}`}
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
            <FieldLabel>Subtype 2</FieldLabel>
            <input
              className={`px-4 py-2 ui-input-light ${manualInputClassName}`}
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
            <FieldLabel>Session Notes</FieldLabel>
            <textarea
              className="min-h-[100px] resize-none rounded-[1.25rem] border border-[#ddd6fb] bg-white px-4 py-3 text-sm font-semibold text-[#1f2642] shadow-[0_10px_24px_rgba(111,87,246,0.08)] outline-none transition placeholder:text-[#a59cc7] focus:border-[#c8bcff] dark:border-white/10 dark:bg-white/8 dark:text-white dark:placeholder:text-white/35 dark:focus:border-white/20"
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What did you accomplish?"
              value={notes}
            />
          </label>
        </div>

        <div className="mt-10 flex gap-4">
          <button
            className="flex-1 py-4 font-bold transition hover:bg-white/5 ui-pill-button-light dark:bg-transparent dark:text-white dark:rounded-full"
            onClick={onCancel}
            type="button"
          >
            Discard
          </button>
          <button
            className="flex-1 py-4 font-bold transition hover:scale-105 ui-pill-button-strong-light dark:rounded-full dark:bg-[#6f57f6] dark:text-white dark:shadow-xl dark:shadow-[#6f57f6]/30"
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
  initialTitle,
  labelOptions,
  onSave,
  onClose,
}: {
  categories: FocusCategory[];
  initialTitle?: string;
  labelOptions: FocusLabelOptions;
  onSave: (data: { categoryId: string | null; title: string; focusType: FocusType; focusSubtype?: FocusSubtype | null; focusSubtype2?: FocusSubtype | null; durationSeconds: number; date: string; notes: string }) => Promise<boolean>;
  onClose: () => void;
}) {
  const [catId, setCatId] = useState(categories[0]?.id ?? "__none__");
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("0");
  const [date, setDate] = useState(todayLocalISO());
  const [title, setTitle] = useState(initialTitle ?? categories[0]?.title ?? "");
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
    <ModalShell className="w-full max-w-2xl max-h-[82vh] overflow-y-auto rounded-[var(--radius-modal)] border p-8 shadow-[var(--shadow-modal)] border-[var(--border-soft)] bg-[var(--surface-elevated)] dark:border-white/10 dark:bg-[#171329]">
        <h2 className="ui-display-font text-center text-3xl tracking-[0.08em] text-[#6f57f6] dark:text-[#cabfff]">Manual Entry</h2>

        <div className="mt-10 space-y-6">
          <ManualPillSelect
            label="Saved Category"
            onChange={handleCategoryChange}
            options={[
              { label: "No saved category", value: "__none__" },
              ...categories.map((category) => ({ label: category.title, value: category.id })),
            ]}
            value={catId}
          />

          <ManualSuggestionInput
            label="Session Title"
            onChange={setTitle}
            options={labelOptions.titles}
            placeholder="Deep Work"
            value={title}
          />

          <div className="grid gap-4 sm:grid-cols-[minmax(0,7rem)_minmax(0,7rem)_minmax(0,1fr)]">
            <label className="flex flex-col gap-2">
              <FieldLabel>Hours</FieldLabel>
              <input className={`px-4 py-2 ui-input-light ${manualInputClassName}`} min="0" onChange={(e) => setHours(e.target.value)} type="number" value={hours} />
            </label>
            <label className="flex flex-col gap-2">
              <FieldLabel>Minutes</FieldLabel>
              <input className={`px-4 py-2 ui-input-light ${manualInputClassName}`} max="59" min="0" onChange={(e) => setMinutes(e.target.value)} type="number" value={minutes} />
            </label>
            <label className="flex flex-col gap-2">
              <FieldLabel>Date</FieldLabel>
              <input className={`px-4 py-3 ui-input-light ${manualInputClassName}`} onChange={(e) => setDate(e.target.value)} type="date" value={date} />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ManualSuggestionInput
              label="Focus Type"
              onChange={(value) => setFocusType(value as FocusType)}
              options={labelOptions.types}
              placeholder="Work"
              value={focusType}
            />

            <ManualSuggestionInput
              label="Subtype"
              onChange={(value) => setFocusSubtype(value as FocusSubtype)}
              options={labelOptions.primarySubtypes}
              placeholder="Productive"
              value={focusSubtype}
            />
            <ManualSuggestionInput
              forceSelectedTone
              label="Subtype 2"
              onChange={setFocusSubtype2}
              options={labelOptions.secondarySubtypes}
              placeholder="Optional"
              value={focusSubtype2}
            />
          </div>

          <label className="flex flex-col gap-2">
            <FieldLabel>Notes</FieldLabel>
            <textarea
              className="min-h-[80px] resize-none rounded-[1.25rem] border border-[#ddd6fb] bg-white px-4 py-3 text-sm font-semibold text-[#1f2642] shadow-[0_10px_24px_rgba(111,87,246,0.08)] outline-none transition placeholder:text-[#a59cc7] focus:border-[#c8bcff] dark:border-white/10 dark:bg-white/8 dark:text-white dark:placeholder:text-white/35 dark:focus:border-white/20"
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What happened during this time?"
              value={notes}
            />
          </label>
        </div>

        <div className="mt-10 flex gap-4">
          <button
            className="flex-1 py-4 font-bold transition hover:bg-white/5 ui-pill-button-light dark:bg-transparent dark:text-white dark:rounded-full"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="flex-1 py-4 font-bold transition hover:scale-105 ui-pill-button-strong-light dark:rounded-full dark:bg-[#6f57f6] dark:text-white dark:shadow-xl dark:shadow-[#6f57f6]/30"
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
