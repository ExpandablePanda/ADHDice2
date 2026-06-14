"use client";

import { Bell, BellOff } from "lucide-react";

type FocusAlarmWidgetProps = {
  compact?: boolean;
  enabled: boolean;
  intervalMinutes: number;
  remainingMs: number | null;
  onDecreaseInterval: () => void;
  onIncreaseInterval: () => void;
  onToggleEnabled: () => void;
};

function formatRemainingTime(remainingMs: number | null) {
  if (remainingMs === null) {
    return "Off";
  }

  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const CONTROL_BUTTON_CLASS = "flex h-7 w-7 items-center justify-center rounded-full border border-white/35 bg-transparent text-[#6f57f6] transition hover:bg-white/[0.18] dark:border-white/10 dark:text-[#cabfff] dark:hover:bg-white/[0.06]";

export function FocusAlarmWidget({
  compact = false,
  enabled,
  intervalMinutes,
  remainingMs,
  onDecreaseInterval,
  onIncreaseInterval,
  onToggleEnabled,
}: FocusAlarmWidgetProps) {
  return (
    <div className={`flex h-full w-full items-center ${compact ? "gap-2" : "gap-3 rounded-[1.2rem] bg-[#f8f5ff] px-4 py-3 dark:bg-white/[0.05]"}`}>
      <button
        aria-label={enabled ? "Turn focus alarm off" : "Turn focus alarm on"}
        className={`${compact ? "h-9 w-9" : "h-10 w-10"} flex shrink-0 items-center justify-center rounded-full border ${enabled ? "border-[#cfc3ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#4f4189] dark:bg-[#22193f] dark:text-[#cabfff]" : "border-[#e4deef] bg-[#f4f5f8] text-[#7b7497] dark:border-white/10 dark:bg-white/8 dark:text-white/58"}`}
        onClick={onToggleEnabled}
        type="button"
      >
        {enabled ? <Bell className={compact ? "h-4 w-4" : "h-4.5 w-4.5"} /> : <BellOff className={compact ? "h-4 w-4" : "h-4.5 w-4.5"} />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`${compact ? "text-[10px]" : "text-[11px]"} whitespace-nowrap font-semibold uppercase tracking-[0.16em] text-[#8a84a3] dark:text-white/40`}>
          Focus Alarm
        </p>
        <div className="mt-1 flex items-baseline gap-1.5">
          <p className={`${compact ? "text-sm" : "text-lg"} whitespace-nowrap font-bold text-[#202743] dark:text-white`}>
            Every {intervalMinutes}m
          </p>
          <p className={`${compact ? "text-[11px]" : "text-xs"} whitespace-nowrap font-medium text-[#7d88a1] dark:text-white/45`}>
            {enabled ? `Next ${formatRemainingTime(remainingMs)}` : "Off"}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button aria-label="Decrease focus alarm interval" className={CONTROL_BUTTON_CLASS} onClick={onDecreaseInterval} type="button">-</button>
        <button aria-label="Increase focus alarm interval" className={CONTROL_BUTTON_CLASS} onClick={onIncreaseInterval} type="button">+</button>
      </div>
    </div>
  );
}
