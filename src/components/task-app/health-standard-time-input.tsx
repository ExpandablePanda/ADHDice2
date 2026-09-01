"use client";

import { formatHealthStandardTime, normalizeHealthMealTime } from "@/lib/health-utils";

type HealthStandardTimeInputProps = {
  ariaLabel?: string;
  className?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  value: string;
};

function getTimeParts(value: string) {
  const normalized = normalizeHealthMealTime(value) ?? "12:00";
  const [rawHours, rawMinutes] = normalized.split(":");
  const hours = Number.parseInt(rawHours ?? "12", 10);
  return {
    hour: String(hours % 12 || 12),
    minute: rawMinutes ?? "00",
    period: hours >= 12 ? "PM" : "AM",
  } as const;
}

function toNormalizedTime(hour: string, minute: string, period: string) {
  const parsedHour = Number.parseInt(hour, 10);
  const parsedMinute = Number.parseInt(minute, 10);
  if (!Number.isInteger(parsedHour) || parsedHour < 1 || parsedHour > 12) return null;
  if (!Number.isInteger(parsedMinute) || parsedMinute < 0 || parsedMinute > 59) return null;
  const hours24 = (parsedHour % 12) + (period === "PM" ? 12 : 0);
  return `${String(hours24).padStart(2, "0")}:${String(parsedMinute).padStart(2, "0")}`;
}

export function HealthStandardTimeInput({ ariaLabel = "Time", className, onChange, readOnly = false, value }: HealthStandardTimeInputProps) {
  const parts = getTimeParts(value);
  const emitChange = (next: Partial<typeof parts>) => {
    const normalized = toNormalizedTime(next.hour ?? parts.hour, next.minute ?? parts.minute, next.period ?? parts.period);
    if (normalized) onChange?.(normalized);
  };

  return (
    <div className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded-[0.9rem] border border-[#e6e8f5] bg-white px-2.5 py-1.5 text-[13px] text-[#2f294a] dark:border-white/10 dark:bg-white/[0.04] dark:text-white ${className ?? ""}`}>
      {readOnly ? <span aria-label={ariaLabel} aria-readonly="true">{formatHealthStandardTime(value) ?? "Time unavailable"}</span> : <>
        <input
          aria-label={`${ariaLabel} hour`}
          className="w-7 min-w-0 bg-transparent text-center outline-none focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80"
          inputMode="numeric"
          max={12}
          min={1}
          onChange={(event) => emitChange({ hour: event.target.value })}
          onFocus={(event) => event.currentTarget.select()}
          value={parts.hour}
        />
        <span aria-hidden="true">:</span>
        <input
          aria-label={`${ariaLabel} minute`}
          className="w-8 min-w-0 bg-transparent text-center outline-none focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80"
          inputMode="numeric"
          max={59}
          min={0}
          onChange={(event) => emitChange({ minute: event.target.value })}
          onFocus={(event) => event.currentTarget.select()}
          value={parts.minute}
        />
        <select
          aria-label={`${ariaLabel} AM or PM`}
          className="bg-transparent font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#d9d0ff]/80"
          onChange={(event) => emitChange({ period: event.target.value })}
          value={parts.period}
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </>}
    </div>
  );
}
