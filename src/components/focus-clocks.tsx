import React, { useCallback, useState, useEffect, useId, useRef } from "react";
import { type FocusCategory, type ActiveFocusSession } from "@/lib/types";
import { isSystemCountdownCategoryId } from "@/lib/focus-utils";
import { CategoryIcon } from "./task-app";
import { formatDuration } from "@/lib/utils";
import { TASK_TABLE_COMPACT_CADENCE_INPUT_CLASS, TaskTableChipButton } from "./ui/task-table-primitives";
export { formatDuration } from "@/lib/utils";

const COUNTDOWN_DURATION_PRESETS = [5, 10, 20, 30, 60] as const;
export const FOCUS_TIMER_QUICK_ADJUSTMENT_MINUTES = [5, 10] as const;
export const FOCUS_TIMER_SUCCESS_CHIP_TONE = "border-[#bcebd8] bg-[#eef9f4] text-[#13845f] hover:bg-[#e4f6ed] dark:border-[#315f51] dark:bg-[#19352e] dark:text-[#7de4b8] dark:hover:bg-[#234438]";
const FOCUS_BAR_ADJUSTMENT_INPUT_CLASS = "[font-family:inherit] h-5 w-10 shrink-0 rounded-full border border-[#e4deef] bg-[#f4f5f8] px-1 text-center text-[10px] font-medium leading-none text-[#68738c] outline-none transition placeholder:text-[#9b92be] focus:border-[#c9bcff] focus:bg-white focus:text-[#595378] dark:border-white/10 dark:bg-white/8 dark:text-white/60 dark:placeholder:text-white/35 dark:focus:border-[#6d56d6] dark:focus:bg-[#22193f]";
export const FOCUS_CLOCK_BASE_WIDTH_PX = 272;
export const FOCUS_CLOCK_BASE_HEIGHT_PX = 344;
export const FOCUS_CLOCK_MOBILE_SCALE = 0.58;
export const FOCUS_CLOCK_DESKTOP_SCALE_CLASSNAME = "[--clock-scale:0.54] md:[--clock-scale:0.58] lg:[--clock-scale:0.62] xl:[--clock-scale:0.68] 2xl:[--clock-scale:0.72]";

export function FocusTimerPlayIcon({ className = "" }: { className?: string }) {
  return <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>;
}

export function FocusTimerPauseIcon({ className = "" }: { className?: string }) {
  return <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24"><rect height="16" rx="1.5" width="4" x="6" y="4" /><rect height="16" rx="1.5" width="4" x="14" y="4" /></svg>;
}

export function FocusTimerFinishIcon({ className = "" }: { className?: string }) {
  return <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function FocusTimerResetIcon({ className = "" }: { className?: string }) {
  return <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M3 4v6h6M21 20v-6h-6" strokeLinecap="round" strokeLinejoin="round" /><path d="M20 9a8 8 0 00-13.66-3.66L3 10M4 15a8 8 0 0013.66 3.66L21 14" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function FocusTimerQuickAdjustmentControls({
  clockFace = false,
  compact = false,
  onAdjust,
}: {
  clockFace?: boolean;
  compact?: boolean;
  onAdjust: (deltaSeconds: number) => Promise<boolean>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [adjustmentDirection, setAdjustmentDirection] = useState<1 | -1>(1);
  const [hasSelectedDirection, setHasSelectedDirection] = useState(false);
  const [customMinutes, setCustomMinutes] = useState("");
  const [isAdjustmentPending, setIsAdjustmentPending] = useState(false);
  const adjustmentPendingRef = useRef(false);
  const customInputId = useId();
  const customHelpId = `${customInputId}-help`;
  const customMinuteValue = parseFocusTimerCustomAdjustmentMinutes(customMinutes);

  const submitAdjustment = async (deltaSeconds: number, clearCustomMinutes = false) => {
    if (adjustmentPendingRef.current) return;
    adjustmentPendingRef.current = true;
    setIsAdjustmentPending(true);
    try {
      const succeeded = await onAdjust(deltaSeconds);
      if (succeeded) {
        if (clockFace) {
          setAdjustmentDirection(1);
          setHasSelectedDirection(false);
        }
        if (clearCustomMinutes || clockFace) setCustomMinutes("");
      }
      return succeeded;
    } finally {
      adjustmentPendingRef.current = false;
      setIsAdjustmentPending(false);
    }
  };

  const customInput = (
    <>
      <label className="sr-only" htmlFor={customInputId}>Custom adjustment minutes</label>
      <span className="flex items-center gap-1">
        <input
          aria-describedby={customHelpId}
          className={compact ? FOCUS_BAR_ADJUSTMENT_INPUT_CLASS : TASK_TABLE_COMPACT_CADENCE_INPUT_CLASS}
          disabled={isAdjustmentPending}
          id={customInputId}
          inputMode="numeric"
          onChange={(event) => setCustomMinutes(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
          pattern="[0-9]*"
          type="text"
          value={customMinutes}
        />
        <span aria-hidden="true" className={`${compact ? "text-[9px]" : "text-[13px]"} font-semibold text-[var(--text-muted)]`}>min</span>
      </span>
      <span className="sr-only" id={customHelpId}>Enter a positive whole number of minutes, then apply the selected direction.</span>
    </>
  );

  const adjustmentTone = adjustmentDirection === 1
    ? FOCUS_TIMER_SUCCESS_CHIP_TONE
    : "border-[#f0dbe1] bg-[#fff4f6] text-[#c84d68] hover:bg-[#ffecef] dark:border-[#6c3042] dark:bg-[#351b27] dark:text-[#ff9fbc]";

  const adjustmentCircleClassName = "flex h-14 w-14 items-center justify-center rounded-full border-2 text-3xl font-semibold leading-none transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40";

  const adjustmentCircleTone = (direction: 1 | -1) => direction === 1
    ? "border-[#bcebd8] bg-[#eef9f4] text-[#13845f] shadow-[0_8px_20px_rgba(19,132,95,0.15)] hover:bg-[#e4f6ed] focus-visible:ring-[#8edbbc] dark:border-[#315f51] dark:bg-[#19352e] dark:text-[#7de4b8] dark:hover:bg-[#234438]"
    : "border-[#f0dbe1] bg-[#fff4f6] text-[#c84d68] shadow-[0_8px_20px_rgba(200,77,104,0.14)] hover:bg-[#ffecef] focus-visible:ring-[#ef9aad] dark:border-[#6c3042] dark:bg-[#351b27] dark:text-[#ff9fbc] dark:hover:bg-[#452332]";

  const selectDirection = (direction: 1 | -1) => {
    setAdjustmentDirection(direction);
    if (clockFace) setHasSelectedDirection(true);
  };

  const clockFaceDirectionButton = (direction: 1 | -1) => (
    <button
      aria-label={direction === 1 ? "Add time" : "Remove time"}
      aria-pressed={hasSelectedDirection && adjustmentDirection === direction}
      className={`${adjustmentCircleClassName} ${adjustmentCircleTone(direction)} ${hasSelectedDirection && adjustmentDirection === direction ? "scale-105 ring-2 ring-offset-2" : ""}`}
      disabled={isAdjustmentPending}
      key={direction}
      onClick={() => selectDirection(direction)}
      type="button"
    >
      <span aria-hidden="true">{direction === 1 ? "+" : "−"}</span>
    </button>
  );

  return (
    <>
      {!clockFace ? (
        <TaskTableChipButton aria-expanded={isOpen} aria-label="Adjust session time" className="h-[26px] px-2 py-0" onClick={() => {
          if (!isOpen) setAdjustmentDirection(1);
          setIsOpen((current) => !current);
        }} toneClassName="border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] hover:bg-[#e9e1ff] dark:border-white/15 dark:bg-white/8 dark:text-[#cabfff] dark:hover:bg-white/12">+ / −</TaskTableChipButton>
      ) : null}
      {clockFace ? (
        <div className="flex flex-col items-center gap-3" role="group" aria-label="Adjust session time options">
          {!hasSelectedDirection ? (
            <div className="flex items-center gap-4" role="group" aria-label="Adjustment direction">
              {([1, -1] as const).map(clockFaceDirectionButton)}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label={adjustmentDirection === 1 ? "Add time amounts" : "Remove time amounts"}>
                {FOCUS_TIMER_QUICK_ADJUSTMENT_MINUTES.map((minutes) => (
                  <button
                    aria-label={`${adjustmentDirection === 1 ? "Add" : "Remove"} ${minutes} minutes`}
                    className={`${adjustmentCircleClassName} ${adjustmentCircleTone(adjustmentDirection)}`}
                    disabled={isAdjustmentPending}
                    key={minutes}
                    onClick={() => void submitAdjustment(getFocusTimerAdjustmentDeltaSeconds(adjustmentDirection, minutes))}
                    type="button"
                  >
                    {minutes}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {customInput}
                <TaskTableChipButton aria-label="Apply custom minutes" disabled={customMinuteValue === null || isAdjustmentPending} onClick={() => {
                  if (customMinuteValue !== null) void submitAdjustment(getFocusTimerAdjustmentDeltaSeconds(adjustmentDirection, customMinuteValue), true);
                }} toneClassName={adjustmentTone}>Apply</TaskTableChipButton>
              </div>
            </>
          )}
        </div>
      ) : isOpen ? (
        <div className="flex basis-full flex-col items-center gap-0.5 pt-1" role="group" aria-label="Adjust session time options">
          <div className="flex items-center gap-0.5" role="group" aria-label="Adjustment direction">
            {([1, -1] as const).map((direction) => (
              <TaskTableChipButton
                aria-label={direction === 1 ? "Add time" : "Remove time"}
                aria-pressed={adjustmentDirection === direction}
                className="h-5 min-w-5 px-1 py-0 text-[10px]"
                disabled={isAdjustmentPending}
                key={direction}
                onClick={() => selectDirection(direction)}
                toneClassName={adjustmentDirection === direction ? (direction === 1 ? FOCUS_TIMER_SUCCESS_CHIP_TONE : "border-[#f0dbe1] bg-[#fff4f6] text-[#c84d68] dark:border-[#6c3042] dark:bg-[#351b27] dark:text-[#ff9fbc]") : "border-[var(--border-soft)] bg-[var(--surface-muted)] text-[var(--text-muted)]"}
              >
                {direction === 1 ? "+" : "−"}
              </TaskTableChipButton>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-0.5">
            {FOCUS_TIMER_QUICK_ADJUSTMENT_MINUTES.map((minutes) => (
              <TaskTableChipButton
                aria-label={`${adjustmentDirection === 1 ? "Add" : "Remove"} ${minutes} minutes`}
                className="h-5 px-1 py-0 text-[10px]"
                disabled={isAdjustmentPending}
                key={minutes}
                onClick={() => void submitAdjustment(getFocusTimerAdjustmentDeltaSeconds(adjustmentDirection, minutes))}
                toneClassName={adjustmentTone}
              >
                {minutes}m
              </TaskTableChipButton>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-0.5">
            {customInput}
            <TaskTableChipButton aria-label="Apply custom minutes" className="h-5 px-1 py-0 text-[10px]" disabled={customMinuteValue === null || isAdjustmentPending} onClick={() => {
              if (customMinuteValue !== null) void submitAdjustment(getFocusTimerAdjustmentDeltaSeconds(adjustmentDirection, customMinuteValue), true);
            }} toneClassName={adjustmentTone}>Apply</TaskTableChipButton>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function getFocusTimerAdjustmentDeltaSeconds(direction: 1 | -1, minutes: number): number {
  return direction * minutes * 60;
}

export function parseFocusTimerCustomAdjustmentMinutes(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const minutes = Number(value);
  return Number.isSafeInteger(minutes) ? minutes : null;
}

export function FocusClock({
  category,
  activeSession,
  autoOpenCountdownRequest,
  onToggle,
  onSetCountdownTarget,
  onFinish,
  onAdjust,
  onDelete,
  onReset,
}: {
  category: FocusCategory;
  activeSession?: ActiveFocusSession;
  autoOpenCountdownRequest?: number;
  onToggle: (catId: string) => void;
  onSetCountdownTarget: (catId: string, targetSeconds: number, options?: { start?: boolean }) => void;
  onFinish: (catId: string) => void;
  onAdjust: (catId: string, deltaSeconds: number) => Promise<boolean>;
  onDelete: (catId: string) => void;
  onReset: (catId: string) => void;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showAdjustMenu, setShowAdjustMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [countdownMinutes, setCountdownMinutes] = useState(() =>
    String(Math.max(1, Math.round((activeSession?.countdownTargetSeconds ?? 10 * 60) / 60))),
  );
  const handledAutoOpenCountdownRequestRef = useRef(0);
  const isRunning = activeSession?.isRunning ?? false;
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const clockFaceRef = useRef<HTMLDivElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const displaySeconds = getDisplaySeconds(activeSession, nowMs);
  const isCountdown = activeSession?.mode === "countdown";
  const hasCountdownTarget = isCountdown && Boolean(activeSession?.countdownTargetSeconds && activeSession.countdownTargetSeconds > 0);
  const isCountdownZero = isCountdown && displaySeconds <= 0;
  const isSystemCountdown = isSystemCountdownCategoryId(category.id);
  const showCountdownZeroState = hasCountdownTarget && isCountdownZero && !showAdjustMenu;

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    // Sync on the next frame when the timer starts so the display does not linger on stale wall-clock time.
    const frameId = requestAnimationFrame(() => setNowMs(Date.now()));
    timerRef.current = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      cancelAnimationFrame(frameId);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  const progress = isCountdown && activeSession?.countdownTargetSeconds
    ? 1 - (displaySeconds / activeSession.countdownTargetSeconds)
    : (displaySeconds % 60) / 60;
  // Keep the progress stroke on the outer boundary of the timer, not inside it.
  const radius = 128;
  const circumference = 2 * Math.PI * radius;

  const openCountdownDurationPicker = useCallback(() => {
    setShowSettingsMenu(false);
    setCountdownMinutes(String(Math.max(1, Math.round((activeSession?.countdownTargetSeconds ?? 10 * 60) / 60))));
    setShowAdjustMenu((prev) => !prev);
  }, [activeSession?.countdownTargetSeconds]);

  const startCountdownWithMinutes = (minutesValue: string) => {
    const nextMinutes = Math.max(1, Number.parseInt(minutesValue, 10) || 10);
    setCountdownMinutes(String(nextMinutes));
    onSetCountdownTarget(category.id, nextMinutes * 60, { start: true });
    setShowAdjustMenu(false);
  };

  useEffect(() => {
    if (
      !autoOpenCountdownRequest
      || handledAutoOpenCountdownRequestRef.current === autoOpenCountdownRequest
      || !isCountdown
      || hasCountdownTarget
      || isRunning
    ) {
      return;
    }

    handledAutoOpenCountdownRequestRef.current = autoOpenCountdownRequest;
    openCountdownDurationPicker();
  }, [autoOpenCountdownRequest, hasCountdownTarget, isCountdown, isRunning, openCountdownDurationPicker]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clockFaceRef.current && !clockFaceRef.current.contains(event.target as Node)) {
        setShowAdjustMenu(false);
      }
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target as Node)) {
        setShowSettingsMenu(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowAdjustMenu(false);
        setShowSettingsMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div className={`group relative flex flex-col items-center gap-3 transition-all duration-500 hover:-translate-y-2 ${showAdjustMenu || showSettingsMenu ? "z-30" : "z-0"}`}>
      <div className="relative flex h-68 w-68 items-center justify-center transition-transform duration-500 group-hover:scale-[1.02]" ref={clockFaceRef}>
        {/* Outer Ring Background */}
        <svg
          className="absolute inset-0 h-full w-full -rotate-90 scale-[1.01] transition-all duration-1000"
          style={{ filter: isRunning ? `drop-shadow(0 0 18px ${category.color}55)` : "none" }}
          viewBox="0 0 272 272"
        >
          <circle
            className="text-[#f0ecfc] dark:text-white/[0.03]"
            cx="136"
            cy="136"
            fill="transparent"
            r={radius}
            stroke="currentColor"
            strokeWidth="7"
          />
          <circle
            cx="136"
            cy="136"
            fill="transparent"
            r={radius}
            stroke={category.color}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            strokeLinecap="round"
            strokeWidth="7"
            style={{
              transition: isRunning ? "stroke-dashoffset 1s linear" : "stroke-dashoffset 0.4s ease-out",
              filter: isRunning ? `drop-shadow(0 0 8px ${category.color}80)` : "none"
            }}
          />
        </svg>

        {/* Inner Content Card (Glassmorphism) */}
        {showCountdownZeroState ? (
          <div className="relative z-10 flex h-60 w-60 flex-col items-center justify-center rounded-full border px-5 text-center transition-all duration-500 border-white/40 bg-white/45 shadow-[0_8px_32px_rgba(31,38,135,0.07)] backdrop-blur-[8px] dark:border-white/5 dark:bg-white/[0.02] dark:shadow-[0_24px_48px_rgba(0,0,0,0.2)] dark:backdrop-blur-[12px] group-hover:shadow-[0_32px_64px_rgba(0,0,0,0.4)]">
            <p className="text-xl font-medium normal-case leading-snug tracking-normal text-[var(--text-secondary)] dark:text-white/70">
              {category.title}
            </p>
            <div className="mt-5 flex max-w-[11rem] flex-wrap items-center justify-center gap-2">
              <button className="rounded-full border border-[#f8d9dc] bg-[#fff1f2] px-3 py-1.5 text-xs font-black text-[#d64b5f]" onClick={() => onDelete(category.id)} type="button">Trash</button>
              <button className="rounded-full border border-[#ddd2ff] bg-[#f1ecff] px-3 py-1.5 text-xs font-black text-[#6f57f6]" onClick={() => onAdjust(category.id, 5 * 60)} type="button">Extend</button>
              <button
                className="rounded-full border border-[#ddd2ff] bg-[#f1ecff] px-3 py-1.5 text-xs font-black text-[#6f57f6]"
                onClick={() => {
                  if (!activeSession?.countdownTargetSeconds) {
                    openCountdownDurationPicker();
                    return;
                  }
                  onSetCountdownTarget(category.id, activeSession.countdownTargetSeconds, { start: true });
                }}
                type="button"
              >
                Reset
              </button>
            </div>
          </div>
        ) : (
          <button
            className="relative z-10 flex h-60 w-60 flex-col items-center justify-center rounded-full border px-5 text-center transition-all duration-500 border-white/40 bg-white/45 shadow-[0_8px_32px_rgba(31,38,135,0.07)] backdrop-blur-[8px] dark:border-white/5 dark:bg-white/[0.02] dark:shadow-[0_24px_48px_rgba(0,0,0,0.2)] dark:backdrop-blur-[12px] group-hover:shadow-[0_32px_64px_rgba(0,0,0,0.4)]"
            aria-label={isCountdown ? `Choose ${category.title} countdown duration` : `Adjust ${category.title} timer`}
            onClick={() => {
              if (isCountdown) {
                openCountdownDurationPicker();
                return;
              }
              setShowSettingsMenu(false);
              setShowAdjustMenu((prev) => !prev);
            }}
            type="button"
          >
            {!showAdjustMenu ? (
            <>
              <div className="mb-3 transition-transform duration-500" style={{ color: category.color, transform: isRunning ? "scale(1.1)" : "scale(1)" }}>
                <CategoryIcon name={category.icon} className="h-9 w-9" />
              </div>
              <p className="text-[2.6rem] font-black tabular-nums tracking-tight text-[#1f2746] dark:text-white">
                {formatDuration(displaySeconds)}
              </p>
              <div className="mt-3 flex max-w-[11.5rem] flex-col items-center">
                <p className="line-clamp-2 text-xl font-medium normal-case leading-snug tracking-normal break-words text-[var(--text-secondary)] dark:text-white/70">
                  {category.title}
                </p>
                <div className="mt-2 h-1.5 w-10 rounded-full transition-all duration-500 group-hover:w-14" style={{ backgroundColor: category.color }} />
              </div>
            </>
            ) : null}
          </button>
        )}

        {showAdjustMenu ? (
          <div
            className="absolute inset-4 z-20 flex flex-col items-center justify-center gap-4 overflow-hidden rounded-full border border-white/40 bg-white/92 shadow-[0_20px_40px_rgba(81,61,168,0.14)] backdrop-blur-[10px] dark:border-white/10 dark:bg-[#171329]/95 dark:shadow-[0_20px_40px_rgba(0,0,0,0.35)] dark:backdrop-blur-[12px]"
          >
            {isCountdown ? (
              <>
                <form
                  className="flex max-w-[12rem] flex-wrap items-center justify-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    startCountdownWithMinutes(countdownMinutes);
                  }}
                >
                  {COUNTDOWN_DURATION_PRESETS.map((minutes) => (
                    <button
                      className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition ${countdownMinutes === String(minutes) ? "border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]" : "border-[#e4deef] bg-[#f4f5f8] text-[#68738c] dark:border-white/10 dark:bg-white/8 dark:text-white/65"}`}
                      key={minutes}
                      onClick={() => startCountdownWithMinutes(String(minutes))}
                      type="button"
                    >
                      {minutes}
                    </button>
                  ))}
                  <input
                    aria-label="Custom countdown minutes"
                    className="h-10 w-16 rounded-full border border-[#e4deef] bg-[#f4f5f8] px-2 text-center text-sm font-semibold text-[#68738c] outline-none dark:border-white/10 dark:bg-white/8 dark:text-white"
                    inputMode="numeric"
                    onChange={(event) => setCountdownMinutes(event.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        startCountdownWithMinutes(countdownMinutes);
                      }
                    }}
                    type="text"
                    value={countdownMinutes}
                  />
                  <button
                    className="flex h-10 items-center justify-center rounded-full border border-[#ddd2ff] bg-[#6f57f6] px-3 text-sm font-semibold text-white transition hover:bg-[#5f49e8] dark:border-[#7f67ff] dark:bg-[#7f67ff] dark:hover:bg-[#927fff]"
                    type="submit"
                  >
                    Start
                  </button>
                </form>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center" data-focus-clock-adjustment-region="centered-clock-face">
                <FocusTimerQuickAdjustmentControls
                  clockFace
                  onAdjust={async (deltaSeconds) => {
                    const succeeded = await onAdjust(category.id, deltaSeconds);
                    if (succeeded) setShowAdjustMenu(false);
                    return succeeded;
                  }}
                />
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="relative flex gap-4">
        <button
          aria-label={
            isCountdown && !isRunning
              ? `Choose ${category.title} countdown duration`
              : isRunning
              ? `Pause ${category.title} timer`
              : `Resume ${category.title} timer`
          }
          className={`group flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all duration-300 hover:scale-110 ${
            isRunning
              ? "border-[#f05566]/20 bg-[#fff0f1] text-[#f05566] shadow-[0_8px_20px_rgba(240,85,102,0.15)] dark:border-[#ff9eaf]/20 dark:bg-[#2d1a1c] dark:text-[#ff9eaf] dark:shadow-[0_8px_20px_rgba(255,158,175,0.1)]"
              : "border-[#6f57f6]/10 bg-[#f1ecff] text-[#6f57f6] shadow-[0_8px_20px_rgba(111,87,246,0.1)] dark:border-white/10 dark:bg-[#22193f] dark:text-[#cabfff] dark:shadow-[0_8px_20px_rgba(0,0,0,0.2)]"
          }`}
          onClick={() => {
            if (isCountdown && !isRunning) {
              openCountdownDurationPicker();
              return;
            }
            onToggle(category.id);
          }}
          type="button"
        >
          {isRunning ? (
            <FocusTimerPauseIcon className="h-6 w-6" />
          ) : isCountdown ? (
            <svg aria-hidden="true" className="h-7 w-7 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" strokeWidth="2.1" viewBox="0 0 24 24">
              <circle cx="12" cy="13" r="7" />
              <path d="M12 9v4l2.5 1.5M9 3h6M8 5l-2 2M16 5l2 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <FocusTimerPlayIcon className="ml-1 h-7 w-7 transition-transform group-hover:scale-110" />
          )}
        </button>
        <div className="relative" ref={settingsMenuRef}>
          <button
            aria-expanded={showSettingsMenu}
            aria-label={`Open ${category.title} timer settings`}
            className="flex h-14 w-14 items-center justify-center rounded-full border transition-all duration-300 hover:scale-110 border-[#ece8f8] bg-white text-[#6a738d] shadow-[0_8px_20px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-white/5 dark:text-white dark:shadow-[0_8px_20px_rgba(0,0,0,0.2)]"
            onClick={() => {
              setShowAdjustMenu(false);
              setShowSettingsMenu((current) => !current);
            }}
            type="button"
          >
            <svg aria-hidden="true" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.97 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.52-1.03H3v-4h.08A1.7 1.7 0 0 0 4.6 8.97a1.7 1.7 0 0 0-.34-1.88L4.2 7.03 7.03 4.2l.06.06A1.7 1.7 0 0 0 8.97 4.6 1.7 1.7 0 0 0 10 3.08V3h4v.08a1.7 1.7 0 0 0 1.03 1.52 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {showSettingsMenu ? (
            <div className="absolute bottom-16 left-1/2 z-40 flex w-[17rem] -translate-x-[64%] flex-wrap items-center justify-center gap-2 rounded-[1.5rem] border border-[#e8e1f7] bg-white/95 p-3 shadow-[0_18px_42px_rgba(70,50,145,0.18)] backdrop-blur dark:border-white/10 dark:bg-[#1b1630]/95 dark:shadow-[0_18px_42px_rgba(0,0,0,0.38)]">
              {!isCountdown ? (
                <div className="flex basis-full justify-center" data-focus-clock-adjustment-region="gear-menu">
                  <FocusTimerQuickAdjustmentControls
                    clockFace
                    onAdjust={async (deltaSeconds) => {
                      const succeeded = await onAdjust(category.id, deltaSeconds);
                      if (succeeded) setShowSettingsMenu(false);
                      return succeeded;
                    }}
                  />
                </div>
              ) : null}
              {isSystemCountdown ? (
                <button
                  aria-label={`Trash ${category.title} timer`}
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-[#f8d9dc] bg-[#fff1f2] text-[#d64b5f] transition hover:scale-110 dark:border-[#5a2432] dark:bg-[#2e1820] dark:text-[#ff9fbc]"
                  onClick={() => {
                    setShowSettingsMenu(false);
                    onDelete(category.id);
                  }}
                  type="button"
                >
                  <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path d="M4 7h16" strokeLinecap="round" /><path d="M10 11v6M14 11v6" strokeLinecap="round" /><path d="M6 7l1 11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-11" strokeLinecap="round" strokeLinejoin="round" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              ) : (
                <button
                  aria-label={`Submit ${category.title} timer`}
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-[#ece8f8] bg-white text-[#6a738d] transition hover:scale-110 disabled:cursor-not-allowed disabled:opacity-35 dark:border-white/10 dark:bg-white/5 dark:text-white"
                  disabled={displaySeconds < 1}
                  onClick={() => {
                    setShowSettingsMenu(false);
                    onFinish(category.id);
                  }}
                  type="button"
                >
                  <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              )}
              <button
                aria-label={`Reset ${category.title} timer`}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-[#f8d9dc] bg-[#fff1f2] text-[#d64b5f] transition hover:scale-110 dark:border-[#5a2432] dark:bg-[#2e1820] dark:text-[#ff9fbc]"
                onClick={() => {
                  setShowSettingsMenu(false);
                  onReset(category.id);
                }}
                type="button"
              >
                <FocusTimerResetIcon className="h-5 w-5" />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function getDisplaySeconds(activeSession: ActiveFocusSession | undefined, nowMs: number) {
  if (!activeSession) {
    return 0;
  }

  if (activeSession.isRunning && activeSession.startTime) {
    const elapsed = Math.max(0, Math.floor((nowMs - activeSession.startTime) / 1000));
    if (activeSession.mode === "countdown" && activeSession.countdownTargetSeconds) {
      return Math.max(0, activeSession.countdownTargetSeconds - activeSession.accumulatedSeconds - elapsed);
    }
    return Math.max(0, activeSession.accumulatedSeconds + elapsed);
  }

  if (activeSession.mode === "countdown" && activeSession.countdownTargetSeconds) {
    return Math.max(0, activeSession.countdownTargetSeconds - activeSession.accumulatedSeconds);
  }

  return Math.max(0, activeSession.accumulatedSeconds);
}

function compareFocusClockCategories(a: FocusCategory, b: FocusCategory, activeSessions: Record<string, ActiveFocusSession>) {
  const aSession = activeSessions[a.id];
  const bSession = activeSessions[b.id];
  const aCountdown = aSession?.mode === "countdown";
  const bCountdown = bSession?.mode === "countdown";
  if (aCountdown !== bCountdown) return aCountdown ? -1 : 1;
  const aRunning = aSession?.isRunning ?? false;
  const bRunning = bSession?.isRunning ?? false;
  const aActive = aRunning || (aSession?.accumulatedSeconds ?? 0) > 0;
  const bActive = bRunning || (bSession?.accumulatedSeconds ?? 0) > 0;
  if (aActive !== bActive) return aActive ? -1 : 1;
  if (aRunning !== bRunning) return aRunning ? -1 : 1;
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

export function FocusClockRow({
  categories,
  activeSessions,
  autoOpenCountdownRequest,
  onToggle,
  onSetCountdownTarget,
  onFinish,
  onAdjust,
  onDelete,
  onReset,
}: {
  categories: FocusCategory[];
  activeSessions: Record<string, ActiveFocusSession>;
  autoOpenCountdownRequest?: number;
  onToggle: (catId: string) => void;
  onSetCountdownTarget: (catId: string, targetSeconds: number, options?: { start?: boolean }) => void;
  onFinish: (catId: string) => void;
  onAdjust: (catId: string, deltaSeconds: number) => Promise<boolean>;
  onDelete: (catId: string) => void;
  onReset: (catId: string) => void;
}) {
  const sortedCategories = [...categories].sort((a, b) => compareFocusClockCategories(a, b, activeSessions));

  return (
    // Mobile: horizontal 2-row scroll carousel. sm+: standard grid.
    <div className="adhdice-scrollbar sm:hidden w-full overflow-x-auto pt-4 pb-4" data-focus-clock-scroll-region style={{ WebkitOverflowScrolling: "touch" }}>
      <div
        style={{
          display: "grid",
          gridTemplateRows: "repeat(2, auto)",
          gridAutoFlow: "column",
          width: "max-content",
          minWidth: "100%",
          justifyContent: "center",
          columnGap: 24,
          rowGap: 10,
          paddingLeft: 16,
          paddingRight: 16,
        }}
      >
        {sortedCategories.map((cat) => (
          <div
            key={cat.id}
            style={{
              transform: `scale(${FOCUS_CLOCK_MOBILE_SCALE})`,
              transformOrigin: "top center",
              width: FOCUS_CLOCK_BASE_WIDTH_PX * FOCUS_CLOCK_MOBILE_SCALE,
              height: FOCUS_CLOCK_BASE_HEIGHT_PX * FOCUS_CLOCK_MOBILE_SCALE,
              flexShrink: 0,
            }}
          >
            <FocusClock
              activeSession={activeSessions[cat.id]}
              autoOpenCountdownRequest={isSystemCountdownCategoryId(cat.id) ? autoOpenCountdownRequest : undefined}
              category={cat}
              onAdjust={onAdjust}
              onDelete={onDelete}
              onFinish={onFinish}
              onReset={onReset}
              onSetCountdownTarget={onSetCountdownTarget}
              onToggle={onToggle}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FocusClockRowDesktop({
  categories,
  activeSessions,
  autoOpenCountdownRequest,
  embedded = false,
  onToggle,
  onSetCountdownTarget,
  onFinish,
  onAdjust,
  onDelete,
  onReset,
}: {
  categories: FocusCategory[];
  activeSessions: Record<string, ActiveFocusSession>;
  autoOpenCountdownRequest?: number;
  embedded?: boolean;
  onToggle: (catId: string) => void;
  onSetCountdownTarget: (catId: string, targetSeconds: number, options?: { start?: boolean }) => void;
  onFinish: (catId: string) => void;
  onAdjust: (catId: string, deltaSeconds: number) => Promise<boolean>;
  onDelete: (catId: string) => void;
  onReset: (catId: string) => void;
}) {
  const sortedCategories = [...categories].sort((a, b) => compareFocusClockCategories(a, b, activeSessions));
  const categoryRows = sortedCategories.reduce<FocusCategory[][]>((rows, category, index) => {
    if (index % 5 === 0) {
      rows.push([]);
    }
    rows[rows.length - 1]?.push(category);
    return rows;
  }, []);

  const content = (
    <div className={`adhdice-scrollbar h-full px-4 pb-3 pt-5 ${categoryRows.length > 1 ? "overflow-y-auto snap-y snap-mandatory" : "overflow-y-hidden"}`}>
      <div className="flex flex-col gap-14">
        {categoryRows.map((row, rowIndex) => (
          <div
            key={`focus-clock-row-${rowIndex}`}
            className="flex snap-start items-start justify-center gap-x-6 pt-5"
          >
            {row.map((cat) => (
              <div
                key={cat.id}
                className="relative h-[calc(344px*var(--clock-scale))] w-[calc(272px*var(--clock-scale))]"
              >
                <div className="absolute left-1/2 top-0 h-[344px] w-[272px] -translate-x-1/2">
                  <div
                    className="h-[344px] w-[272px]"
                    style={{
                      transform: "scale(var(--clock-scale))",
                      transformOrigin: "top center",
                    }}
                  >
                    <FocusClock
                      activeSession={activeSessions[cat.id]}
                      autoOpenCountdownRequest={isSystemCountdownCategoryId(cat.id) ? autoOpenCountdownRequest : undefined}
                      category={cat}
                      onAdjust={onAdjust}
                      onDelete={onDelete}
                      onFinish={onFinish}
                      onReset={onReset}
                      onSetCountdownTarget={onSetCountdownTarget}
                      onToggle={onToggle}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div className={`hidden h-[calc(344px*var(--clock-scale)+3.75rem)] sm:block ${FOCUS_CLOCK_DESKTOP_SCALE_CLASSNAME}`}>
        {content}
      </div>
    );
  }

  return (
    <div className="hidden sm:block">
      <div className={`mx-auto max-w-[86rem] overflow-hidden rounded-[2rem] border border-[#ebe4fb] bg-white/82 shadow-[0_18px_48px_rgba(81,61,168,0.08)] backdrop-blur ${FOCUS_CLOCK_DESKTOP_SCALE_CLASSNAME} h-[calc(344px*var(--clock-scale)+3.75rem)] dark:border-white/10 dark:bg-white/[0.05]`}>
        {content}
      </div>
    </div>
  );
}
