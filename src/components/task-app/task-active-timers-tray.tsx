"use client";

import { CirclePause, CirclePlay, MapPin, TimerOff, TimerReset, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RunningTaskTimer } from "@/components/ui/task-management-table-v2";
import { TASK_TABLE_ACTIVE_LIST_CHIP_CLASS, TASK_TABLE_CHIP_BASE_CLASS, TASK_TABLE_INACTIVE_CHIP_CLASS, TaskTableChipButton } from "@/components/ui/task-table-primitives";
import { getTaskTimerDisplaySeconds } from "@/hooks/useTaskTimers";
import { formatTaskTimerElapsed } from "./task-timer-display";

const TRAY_ID = "active-task-timers-tray";
const CHIP_POSITION_STORAGE_KEY = "adhdice-active-task-timers-chip-position";
const CHIP_DRAG_THRESHOLD_PX = 6;

const formatElapsed = formatTaskTimerElapsed;

type Props = {
  isOpen: boolean;
  onDiscard: (taskId: string) => void;
  onGoToTask: (taskId: string) => void;
  onPause: (taskId: string) => void;
  onPendingDiscardHandled: () => void;
  onResume: (taskId: string) => void;
  onStopAndSave: (taskId: string) => void;
  onToggle: () => void;
  pendingDiscardTaskId: string | null;
  timers: RunningTaskTimer[];
};

export function TaskActiveTimersTray({
  isOpen,
  onDiscard,
  onGoToTask,
  onPause,
  onPendingDiscardHandled,
  onResume,
  onStopAndSave,
  onToggle,
  pendingDiscardTaskId,
  timers,
}: Props) {
  const chipRef = useRef<HTMLButtonElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const [confirmDiscardTaskId, setConfirmDiscardTaskId] = useState<string | null>(null);
  const [chipPosition, setChipPosition] = useState<{ x: number; y: number } | null>(() => {
    if (typeof window === "undefined") return null;
    try { const parsed = JSON.parse(window.localStorage.getItem(CHIP_POSITION_STORAGE_KEY) ?? "null"); return Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y) ? { x: Math.max(8, Math.min(parsed.x, window.innerWidth - 180)), y: Math.max(8, Math.min(parsed.y, window.innerHeight - 48)) } : null; } catch { return null; }
  });
  const dragRef = useRef<{ lastPosition: { x: number; y: number } | null; offsetX: number; offsetY: number; pointerId: number; moved: boolean; startX: number; startY: number } | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    if (!timers.some((timer) => !timer.pausedAt)) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [timers]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onToggle();
      requestAnimationFrame(() => chipRef.current?.focus());
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onToggle]);

  useEffect(() => {
    const clamp = (position: { x: number; y: number }) => ({ x: Math.max(8, Math.min(position.x, window.innerWidth - 180)), y: Math.max(8, Math.min(position.y, window.innerHeight - 48)) });
    const onResize = () => setChipPosition((current) => current ? clamp(current) : current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (typeof document === "undefined" || timers.length === 0) return null;

  const activeTimers = timers.filter((timer) => !timer.pausedAt);
  const chipLabel = timers.length === 1
    ? `1 Task ${activeTimers.length ? "Timing" : "Paused"} · ${formatElapsed(getTaskTimerDisplaySeconds(timers[0], now))}`
    : `${timers.length} Tasks ${activeTimers.length ? "Timing" : "Paused"}`;
  const confirmingTaskId = confirmDiscardTaskId ?? pendingDiscardTaskId;
  const confirmTimer = confirmingTaskId ? timers.find((timer) => timer.taskId === confirmingTaskId) ?? null : null;
  const clearDiscardConfirmation = () => {
    setConfirmDiscardTaskId(null);
    if (pendingDiscardTaskId) onPendingDiscardHandled();
  };

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-end px-3 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:px-5 sm:pb-24">
      {isOpen ? (
        <section aria-label="Active task timers" className="pointer-events-auto mb-2 flex w-full max-w-md flex-col overflow-hidden rounded-[1.5rem] border border-[#e4def5] bg-white shadow-[0_18px_48px_rgba(54,44,104,0.22)] dark:border-white/10 dark:bg-[#171328]" id={TRAY_ID} role="region">
          <div className="flex items-center justify-between border-b border-[#eee9f7] px-4 py-3 dark:border-white/10">
            <div><p className="text-sm font-black text-[#312a50] dark:text-white">Active Timers</p><p className="text-xs text-[#7d7697] dark:text-white/55">Task focus stays available everywhere.</p></div>
            <TaskTableChipButton aria-label="Minimize active timers" onClick={onToggle} toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}><X className="h-3.5 w-3.5" /></TaskTableChipButton>
          </div>
          <div className="max-h-[min(52dvh,30rem)] space-y-2 overflow-y-auto overscroll-contain p-3">
            {timers.map((timer) => {
              const elapsed = getTaskTimerDisplaySeconds(timer, now);
              const unsavedSeconds = Math.max(0, elapsed - timer.startedActualSeconds);
              const isConfirming = confirmTimer?.taskId === timer.taskId;
              return <div className="rounded-[1.1rem] border border-[#eee9f7] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.04]" key={timer.taskId}>
                <div className="flex items-start justify-between gap-3"><p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#40385f] dark:text-white">{timer.title}</p><time aria-label={`Focused elapsed time for ${timer.title}`} className="shrink-0 text-sm font-bold text-[#6f57f6] dark:text-[#c9bbff]">{formatElapsed(elapsed)}</time></div>
                {isConfirming ? <div className="mt-3 rounded-xl border border-[#ffd6de] bg-[#fff6f7] p-3 dark:border-[#5b2e3b] dark:bg-[#44232f]"><p className="text-xs font-semibold text-[#914055] dark:text-[#ffb3c1]">Discard {formatElapsed(unsavedSeconds)} of unsaved focused time?</p><div className="mt-2 flex gap-2"><TaskTableChipButton onClick={() => { clearDiscardConfirmation(); onDiscard(timer.taskId); }} toneClassName="border-[#ffd6de] bg-white text-[#b7435b] dark:border-[#6d3544] dark:bg-[#39202a] dark:text-[#ffb3c1]">Discard Timer</TaskTableChipButton><TaskTableChipButton onClick={clearDiscardConfirmation} toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}>Keep timer</TaskTableChipButton></div></div> : <div className="mt-3 flex flex-wrap gap-2">
                  <TaskTableChipButton className="gap-2" aria-label={`${timer.pausedAt ? "Resume" : "Pause"} timer for ${timer.title}`} onClick={() => timer.pausedAt ? onResume(timer.taskId) : onPause(timer.taskId)} toneClassName={TASK_TABLE_ACTIVE_LIST_CHIP_CLASS}>{timer.pausedAt ? <CirclePlay className="h-3.5 w-3.5" /> : <CirclePause className="h-3.5 w-3.5" />}{timer.pausedAt ? "Resume" : "Pause"}</TaskTableChipButton>
                  <TaskTableChipButton className="gap-2" onClick={() => onStopAndSave(timer.taskId)} toneClassName="border-[#ffd8be] bg-[#fff1e7] text-[#dc6c1c] dark:border-[#65401d] dark:bg-[#432712] dark:text-[#ffb37e]"><TimerReset className="h-3.5 w-3.5" />Stop & Save</TaskTableChipButton>
                  <TaskTableChipButton className="gap-2" onClick={() => unsavedSeconds > 0 ? setConfirmDiscardTaskId(timer.taskId) : onDiscard(timer.taskId)} toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}><TimerOff className="h-3.5 w-3.5" />Discard Timer</TaskTableChipButton>
                  <TaskTableChipButton className="gap-2" onClick={() => onGoToTask(timer.taskId)} toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}><MapPin className="h-3.5 w-3.5" />Open task</TaskTableChipButton>
                </div>}
              </div>;
            })}
          </div>
        </section>
      ) : null}
      <button
        aria-controls={TRAY_ID}
        aria-expanded={isOpen}
        className={`pointer-events-auto touch-none select-none ${TASK_TABLE_CHIP_BASE_CLASS} ${TASK_TABLE_ACTIVE_LIST_CHIP_CLASS} max-w-full cursor-pointer shadow-lg`}
        onClick={(event) => {
          if (suppressClickRef.current) {
            event.preventDefault();
            suppressClickRef.current = false;
            return;
          }
          onToggle();
        }}
        onLostPointerCapture={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
        }}
        onPointerCancel={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          suppressClickRef.current = false;
          dragRef.current = { lastPosition: null, moved: false, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <= CHIP_DRAG_THRESHOLD_PX) return;
          drag.moved = true;
          const nextPosition = {
            x: Math.max(8, Math.min(event.clientX - drag.offsetX, window.innerWidth - event.currentTarget.offsetWidth - 8)),
            y: Math.max(8, Math.min(event.clientY - drag.offsetY, window.innerHeight - event.currentTarget.offsetHeight - 8)),
          };
          drag.lastPosition = nextPosition;
          setChipPosition(nextPosition);
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          if (drag?.pointerId === event.pointerId) {
            suppressClickRef.current = drag.moved;
            if (drag.moved && drag.lastPosition) window.localStorage.setItem(CHIP_POSITION_STORAGE_KEY, JSON.stringify(drag.lastPosition));
            dragRef.current = null;
          }
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        ref={chipRef}
        style={chipPosition ? { left: chipPosition.x, position: "fixed", top: chipPosition.y } : undefined}
        type="button"
      >{chipLabel}</button>
    </div>,
    document.body,
  );
}
