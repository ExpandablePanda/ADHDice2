import React, { useState, useEffect, useRef } from "react";
import { type FocusCategory, type ActiveFocusSession } from "@/lib/types";
import { isSystemCountdownCategoryId } from "@/lib/focus-utils";
import { CategoryIcon } from "./task-app";
import { formatDuration } from "@/lib/utils";
export { formatDuration } from "@/lib/utils";

const COUNTDOWN_DURATION_PRESETS = [10, 20, 30, 60] as const;

export function FocusClock({
  category,
  activeSession,
  onToggle,
  onSetCountdownTarget,
  onFinish,
  onAdjust,
  onReset,
}: {
  category: FocusCategory;
  activeSession?: ActiveFocusSession;
  onToggle: (catId: string) => void;
  onSetCountdownTarget: (catId: string, targetSeconds: number, options?: { start?: boolean }) => void;
  onFinish: (catId: string) => void;
  onAdjust: (catId: string, deltaSeconds: number) => void;
  onReset: (catId: string) => void;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showAdjustMenu, setShowAdjustMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [quickAdjustSign, setQuickAdjustSign] = useState<1 | -1 | null>(null);
  const [adjustSign, setAdjustSign] = useState<1 | -1>(1);
  const [adjustMinutes, setAdjustMinutes] = useState("5");
  const [countdownMinutes, setCountdownMinutes] = useState(() =>
    String(Math.max(1, Math.round((activeSession?.countdownTargetSeconds ?? 10 * 60) / 60))),
  );
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

  const handleAdjustClick = (deltaSeconds: number) => {
    setShowAdjustMenu(false);
    onAdjust(category.id, deltaSeconds);
  };

  const openCountdownDurationPicker = () => {
    setShowSettingsMenu(false);
    setQuickAdjustSign(null);
    setCountdownMinutes(String(Math.max(1, Math.round((activeSession?.countdownTargetSeconds ?? 10 * 60) / 60))));
    setShowAdjustMenu((prev) => !prev);
  };

  const startCountdownWithMinutes = (minutesValue: string) => {
    const nextMinutes = Math.max(1, Number.parseInt(minutesValue, 10) || 10);
    setCountdownMinutes(String(nextMinutes));
    onSetCountdownTarget(category.id, nextMinutes * 60, { start: true });
    setShowAdjustMenu(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clockFaceRef.current && !clockFaceRef.current.contains(event.target as Node)) {
        setShowAdjustMenu(false);
      }
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target as Node)) {
        setShowSettingsMenu(false);
        setQuickAdjustSign(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowAdjustMenu(false);
        setShowSettingsMenu(false);
        setQuickAdjustSign(null);
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
              <button className="rounded-full border border-[#f8d9dc] bg-[#fff1f2] px-3 py-1.5 text-xs font-black text-[#d64b5f]" onClick={() => onReset(category.id)} type="button">Trash</button>
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
              setQuickAdjustSign(null);
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
                <div className="flex max-w-[12rem] flex-wrap items-center justify-center gap-2">
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
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`focus-adjust-${category.id}`}>Adjustment minutes</label>
                  <input
                    className="w-28 rounded-2xl border-2 px-3 py-4 text-center font-black tabular-nums tracking-tight outline-none border-[#ece8f8] bg-white text-[#1f2746] dark:border-white/10 dark:bg-white/10 dark:text-white"
                    id={`focus-adjust-${category.id}`}
                    inputMode="numeric"
                    onChange={(event) => setAdjustMinutes(event.target.value.replace(/[^0-9]/g, ""))}
                    style={{ fontSize: "2.6rem", fontWeight: 900, letterSpacing: "-0.025em" }}
                    type="text"
                    value={adjustMinutes}
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      aria-label="Increase adjustment by 5 minutes"
                      className="flex h-8 w-9 items-center justify-center rounded-full border border-[#ddd2ff] bg-[#f5f1ff] text-[#6f57f6] transition hover:scale-105 dark:border-white/10 dark:bg-white/10 dark:text-[#cabfff]"
                      onClick={() => setAdjustMinutes((value) => String((parseInt(value) || 0) + 5))}
                      type="button"
                    >
                      <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="m6 15 6-6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    <button
                      aria-label="Decrease adjustment by 5 minutes"
                      className="flex h-8 w-9 items-center justify-center rounded-full border border-[#ddd2ff] bg-[#f5f1ff] text-[#6f57f6] transition hover:scale-105 dark:border-white/10 dark:bg-white/10 dark:text-[#cabfff]"
                      onClick={() => setAdjustMinutes((value) => String(Math.max(5, (parseInt(value) || 5) - 5)))}
                      type="button"
                    >
                      <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4 pt-2">
                  <button
                    aria-label={adjustSign === 1 ? "Switch to subtract time" : "Switch to add time"}
                    className={`flex h-14 w-14 items-center justify-center rounded-full transition ${
                      adjustSign === -1
                        ? "bg-[#fff3f5] text-[#d64b5f] dark:bg-[#311b23] dark:text-[#ff9fbc]"
                        : "bg-[#eef9f4] text-[#12a876] dark:bg-[#19352e] dark:text-[#7de4b8]"
                    }`}
                    onClick={() => setAdjustSign((s) => s === 1 ? -1 : 1)}
                    type="button"
                  >
                    {adjustSign === 1 ? (
                      <svg className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                        <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                        <path d="M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  <button
                    aria-label={`Apply ${adjustMinutes || 1} minute adjustment`}
                    className="flex h-14 w-14 items-center justify-center rounded-full transition bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]"
                    onClick={() => handleAdjustClick(adjustSign * (parseInt(adjustMinutes) || 1) * 60)}
                    type="button"
                  >
                    <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </>
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
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <rect height="16" rx="1.5" width="4" x="6" y="4" />
              <rect height="16" rx="1.5" width="4" x="14" y="4" />
            </svg>
          ) : isCountdown ? (
            <svg aria-hidden="true" className="h-7 w-7 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" strokeWidth="2.1" viewBox="0 0 24 24">
              <circle cx="12" cy="13" r="7" />
              <path d="M12 9v4l2.5 1.5M9 3h6M8 5l-2 2M16 5l2 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg className="ml-1 h-7 w-7 transition-transform group-hover:scale-110" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
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
              setQuickAdjustSign(null);
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
              {isSystemCountdown ? (
                <button
                  aria-label={`Trash ${category.title} timer`}
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-[#f8d9dc] bg-[#fff1f2] text-[#d64b5f] transition hover:scale-110 dark:border-[#5a2432] dark:bg-[#2e1820] dark:text-[#ff9fbc]"
                  onClick={() => {
                    setShowSettingsMenu(false);
                    onReset(category.id);
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
                <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M3 4v6h6M21 20v-6h-6" strokeLinecap="round" strokeLinejoin="round" /><path d="M20 9a8 8 0 00-13.66-3.66L3 10M4 15a8 8 0 0013.66 3.66L21 14" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              {([1, -1] as const).map((sign) => (
                <button
                  aria-label={`${sign === 1 ? "Add" : "Subtract"} time`}
                  className={`flex h-12 w-12 items-center justify-center rounded-full border transition hover:scale-110 ${quickAdjustSign === sign ? (sign === 1 ? "border-[#bcebd8] bg-[#e9f8f2] text-[#12a876] dark:border-[#315f51] dark:bg-[#19352e] dark:text-[#7de4b8]" : "border-[#f8d9dc] bg-[#fff1f2] text-[#d64b5f] dark:border-[#5a2432] dark:bg-[#2e1820] dark:text-[#ff9fbc]") : "border-[#ece8f8] bg-white text-[#6a738d] dark:border-white/10 dark:bg-white/5 dark:text-white"}`}
                  key={sign}
                  onClick={() => setQuickAdjustSign((current) => current === sign ? null : sign)}
                  type="button"
                >
                  <svg aria-hidden="true" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.7" viewBox="0 0 24 24"><path d={sign === 1 ? "M12 5v14M5 12h14" : "M5 12h14"} strokeLinecap="round" /></svg>
                </button>
              ))}
              {quickAdjustSign ? [5, 10].map((minutes) => (
                <button
                  aria-label={`${quickAdjustSign === 1 ? "Add" : "Subtract"} ${minutes} minutes`}
                  className={`flex h-12 w-12 items-center justify-center rounded-full border text-xl font-black tabular-nums transition hover:scale-110 ${quickAdjustSign === 1 ? "border-[#bcebd8] bg-[#eef9f4] text-[#12a876] dark:border-[#315f51] dark:bg-[#19352e] dark:text-[#7de4b8]" : "border-[#f8d9dc] bg-[#fff1f2] text-[#d64b5f] dark:border-[#5a2432] dark:bg-[#2e1820] dark:text-[#ff9fbc]"}`}
                  key={minutes}
                  onClick={() => onAdjust(category.id, quickAdjustSign * minutes * 60)}
                  type="button"
                >
                  {minutes}
                </button>
              )) : null}
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
  onToggle,
  onSetCountdownTarget,
  onFinish,
  onAdjust,
  onReset,
}: {
  categories: FocusCategory[];
  activeSessions: Record<string, ActiveFocusSession>;
  onToggle: (catId: string) => void;
  onSetCountdownTarget: (catId: string, targetSeconds: number, options?: { start?: boolean }) => void;
  onFinish: (catId: string) => void;
  onAdjust: (catId: string, deltaSeconds: number) => void;
  onReset: (catId: string) => void;
}) {
  const sortedCategories = [...categories].sort((a, b) => compareFocusClockCategories(a, b, activeSessions));

  return (
    // Mobile: horizontal 2-row scroll carousel. sm+: standard grid.
    <div className="adhdice-scrollbar sm:hidden w-full overflow-x-auto pt-4 pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
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
              transform: "scale(0.58)",
              transformOrigin: "top center",
              width: 272 * 0.58,
              height: (272 + 72) * 0.58,
              flexShrink: 0,
            }}
          >
            <FocusClock
              activeSession={activeSessions[cat.id]}
              category={cat}
              onAdjust={onAdjust}
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
  onToggle,
  onSetCountdownTarget,
  onFinish,
  onAdjust,
  onReset,
}: {
  categories: FocusCategory[];
  activeSessions: Record<string, ActiveFocusSession>;
  onToggle: (catId: string) => void;
  onSetCountdownTarget: (catId: string, targetSeconds: number, options?: { start?: boolean }) => void;
  onFinish: (catId: string) => void;
  onAdjust: (catId: string, deltaSeconds: number) => void;
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

  return (
    <div className="hidden sm:block">
      <div className="mx-auto max-w-[86rem] overflow-hidden rounded-[2rem] border border-[#ebe4fb] bg-white/82 shadow-[0_18px_48px_rgba(81,61,168,0.08)] backdrop-blur [--clock-scale:0.54] md:[--clock-scale:0.58] lg:[--clock-scale:0.62] xl:[--clock-scale:0.68] 2xl:[--clock-scale:0.72] h-[calc(344px*var(--clock-scale)+3.75rem)] dark:border-white/10 dark:bg-white/[0.05]">
        <div className={`adhdice-scrollbar h-full px-4 pt-5 pb-3 ${categoryRows.length > 1 ? "overflow-y-auto snap-y snap-mandatory" : "overflow-y-hidden"}`}>
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
                        category={cat}
                        onAdjust={onAdjust}
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
      </div>
    </div>
  );
}
