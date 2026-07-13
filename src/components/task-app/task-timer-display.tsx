"use client";

import { useEffect, useState } from "react";
import type { RunningTaskTimer } from "@/components/ui/task-management-table-v2";
import { getTaskTimerDisplaySeconds } from "@/hooks/useTaskTimers";
import { TASK_TABLE_ACTIVE_LIST_CHIP_CLASS, TaskTableChipButton } from "@/components/ui/task-table-primitives";

export function formatTaskTimerElapsed(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function getTaskTimerPresentation(timer: RunningTaskTimer, now: number) {
  const isPaused = Boolean(timer.pausedAt);
  const elapsedSeconds = getTaskTimerDisplaySeconds(timer, now);
  return { elapsedSeconds, isPaused, label: formatTaskTimerElapsed(elapsedSeconds), stateLabel: isPaused ? "Timer paused" : "Timer running" };
}

function useTaskTimerNow(timer: RunningTaskTimer) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (timer.pausedAt) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [timer.pausedAt, timer.startedAt]);
  return now;
}

export function TaskTimerDial({ timer }: { timer: RunningTaskTimer }) {
  const presentation = getTaskTimerPresentation(timer, useTaskTimerNow(timer));
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const progress = (presentation.elapsedSeconds % 60) / 60;
  return <div aria-label={`${presentation.stateLabel}: ${presentation.label}`} className="relative flex h-14 w-14 items-center justify-center">
    <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100"><circle className="text-[#f0ecfc] dark:text-white/[0.05]" cx="50" cy="50" fill="transparent" r={radius} stroke="currentColor" strokeWidth="5" /><circle cx="50" cy="50" fill="transparent" r={radius} stroke="#6f57f6" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} strokeLinecap="round" strokeWidth="5" style={{ filter: presentation.isPaused ? "none" : "drop-shadow(0 0 4px #6f57f680)", transition: presentation.isPaused ? "stroke-dashoffset 0.4s ease-out" : "stroke-dashoffset 1s linear" }} /></svg>
    <time className="relative z-10 max-w-[2.9rem] text-[10px] font-medium leading-none tabular-nums text-[#38305b] dark:text-white">{presentation.label}</time>
  </div>;
}

export function TaskTimerStateChip({ onClick, timer }: { onClick?: () => void; timer: RunningTaskTimer }) {
  const presentation = getTaskTimerPresentation(timer, useTaskTimerNow(timer));
  const toneClassName = presentation.isPaused ? "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]" : TASK_TABLE_ACTIVE_LIST_CHIP_CLASS;
  const label = `${presentation.stateLabel}: ${presentation.label}`;
  return <TaskTableChipButton aria-label={label} className="tabular-nums" onClick={(event) => { event.stopPropagation(); onClick?.(); }} toneClassName={toneClassName}>{presentation.isPaused ? "Paused" : "Timing"} · {presentation.label}</TaskTableChipButton>;
}
