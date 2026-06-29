"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { TaskTableChipButton } from "@/components/ui/task-table-primitives";
import { shiftDateKey } from "@/lib/task-grid-layout";

function daysBetweenDateKeys(startDateKey: string, endDateKey: string) {
  const start = new Date(`${startDateKey}T00:00:00Z`);
  const end = new Date(`${endDateKey}T00:00:00Z`);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

type TaskDelayPickerProps = {
  anchorDateKey: string;
  description?: ReactNode;
  inputClassName: string;
  onCancel?: () => void;
  onSave: (nextDueOn: string, days: number) => Promise<boolean | void> | boolean | void;
  primaryToneClassName: string;
  saveLabel?: string;
};

export function TaskDelayPicker({
  anchorDateKey,
  description,
  inputClassName,
  onCancel,
  onSave,
  primaryToneClassName,
  saveLabel = "Save delay",
}: TaskDelayPickerProps) {
  const minimumDateKey = useMemo(() => shiftDateKey(anchorDateKey, 1), [anchorDateKey]);
  const [daysDraft, setDaysDraft] = useState("1");
  const [dateDraft, setDateDraft] = useState(minimumDateKey);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDaysDraft("1");
    setDateDraft(minimumDateKey);
  }, [minimumDateKey]);

  const isValidDate = dateDraft > anchorDateKey;

  return (
    <div className="space-y-3">
      {description ? (
        <p className="text-sm leading-6 text-[#7d7597] dark:text-white/55">
          {description}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <input
          className={inputClassName}
          inputMode="numeric"
          min="1"
          onChange={(event) => {
            const nextDays = event.target.value.replace(/[^\d]/g, "");
            setDaysDraft(nextDays);
            if (!nextDays) {
              return;
            }
            const parsedDays = Number.parseInt(nextDays, 10);
            if (!Number.isFinite(parsedDays) || parsedDays <= 0) {
              return;
            }
            setDateDraft(shiftDateKey(anchorDateKey, parsedDays));
          }}
          placeholder="Days"
          type="text"
          value={daysDraft}
        />
        <input
          className={inputClassName}
          min={minimumDateKey}
          onChange={(event) => {
            const nextDate = event.target.value;
            setDateDraft(nextDate);
            if (!nextDate || nextDate <= anchorDateKey) {
              return;
            }
            setDaysDraft(String(daysBetweenDateKeys(anchorDateKey, nextDate)));
          }}
          type="date"
          value={dateDraft}
        />
      </div>
      <p className="text-xs text-[#8d87a7] dark:text-white/40">
        Choose a date after {anchorDateKey}.
      </p>
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <TaskTableChipButton
            disabled={isSaving}
            onClick={onCancel}
          >
            Cancel
          </TaskTableChipButton>
        ) : null}
        <TaskTableChipButton
          disabled={isSaving || !isValidDate}
          onClick={async () => {
            if (!isValidDate) {
              return;
            }
            setIsSaving(true);
            try {
              await onSave(dateDraft, daysBetweenDateKeys(anchorDateKey, dateDraft));
            } finally {
              setIsSaving(false);
            }
          }}
          toneClassName={primaryToneClassName}
        >
          {saveLabel}
        </TaskTableChipButton>
      </div>
    </div>
  );
}
