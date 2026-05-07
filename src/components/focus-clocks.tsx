import React, { useState, useEffect, useRef } from "react";
import { type FocusCategory, type ActiveFocusSession } from "@/lib/types";
import { CategoryIcon } from "./task-app";
import { formatDuration } from "@/lib/utils";
export { formatDuration } from "@/lib/utils";

export function FocusClock({
  category,
  activeSession,
  onToggle,
  onFinish,
  onAdjust,
  onReset,
}: {
  category: FocusCategory;
  activeSession?: ActiveFocusSession;
  onToggle: (catId: string) => void;
  onFinish: (catId: string) => void;
  onAdjust: (catId: string, deltaSeconds: number) => void;
  onReset: (catId: string) => void;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showAdjustMenu, setShowAdjustMenu] = useState(false);
  const [adjustSign, setAdjustSign] = useState<1 | -1>(1);
  const [adjustMinutes, setAdjustMinutes] = useState("5");
  const isRunning = activeSession?.isRunning ?? false;
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const adjustMenuRef = useRef<HTMLDivElement | null>(null);
  const displaySeconds = getDisplaySeconds(activeSession, nowMs);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    // Sync immediately when timer starts so we never render with stale wall-clock time.
    setNowMs(Date.now());
    timerRef.current = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  const progress = (displaySeconds % 60) / 60;
  // Keep the progress stroke on the outer boundary of the timer, not inside it.
  const radius = 128;
  const circumference = 2 * Math.PI * radius;

  const handleAdjustClick = (deltaSeconds: number) => {
    setShowAdjustMenu(false);
    onAdjust(category.id, deltaSeconds);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (adjustMenuRef.current && !adjustMenuRef.current.contains(event.target as Node)) {
        setShowAdjustMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`group relative flex flex-col items-center gap-3 transition-all duration-500 hover:-translate-y-2 ${showAdjustMenu ? "z-30" : "z-0"}`}>
      <div className="relative flex h-68 w-68 items-center justify-center transition-transform duration-500 group-hover:scale-[1.02]">
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
        <button
          className="relative z-10 flex h-60 w-60 flex-col items-center justify-center rounded-full border px-5 text-center transition-all duration-500 border-white/40 bg-white/45 shadow-[0_8px_32px_rgba(31,38,135,0.07)] backdrop-blur-[8px] dark:border-white/5 dark:bg-white/[0.02] dark:shadow-[0_24px_48px_rgba(0,0,0,0.2)] dark:backdrop-blur-[12px] group-hover:shadow-[0_32px_64px_rgba(0,0,0,0.4)]"
          onClick={() => setShowAdjustMenu((prev) => !prev)}
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
                <p className="line-clamp-2 text-[0.84rem] font-black uppercase leading-tight tracking-[0.16em] break-words text-[#8d87a7] dark:text-white/35">
                  {category.title}
                </p>
                <div className="mt-2 h-1.5 w-10 rounded-full transition-all duration-500 group-hover:w-14" style={{ backgroundColor: category.color }} />
              </div>
            </>
          ) : null}
        </button>

        {showAdjustMenu ? (
          <div
            ref={adjustMenuRef}
            className="absolute inset-4 z-20 flex flex-col items-center justify-center gap-4 overflow-hidden rounded-full border border-white/40 bg-white/92 shadow-[0_20px_40px_rgba(81,61,168,0.14)] backdrop-blur-[10px] dark:border-white/10 dark:bg-[#171329]/95 dark:shadow-[0_20px_40px_rgba(0,0,0,0.35)] dark:backdrop-blur-[12px]"
          >
            <input
              className="w-20 rounded-2xl border-2 px-1 py-5 text-center font-black tabular-nums tracking-tight outline-none border-[#ece8f8] bg-white text-[#1f2746] dark:border-white/10 dark:bg-white/10 dark:text-white"
              style={{ fontSize: "2.6rem", fontWeight: 900, letterSpacing: "-0.025em" }}
              min="1"
              onChange={(e) => setAdjustMinutes(e.target.value)}
              type="number"
              value={adjustMinutes}
            />
            <div className="flex items-center gap-4 pt-2">
              <button
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
                className="flex h-14 w-14 items-center justify-center rounded-full transition bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]"
                onClick={() => handleAdjustClick(adjustSign * (parseInt(adjustMinutes) || 1) * 60)}
                type="button"
              >
                <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex gap-4">
        <button
          className={`group flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all duration-300 hover:scale-110 ${
            isRunning
              ? "border-[#f05566]/20 bg-[#fff0f1] text-[#f05566] shadow-[0_8px_20px_rgba(240,85,102,0.15)] dark:border-[#ff9eaf]/20 dark:bg-[#2d1a1c] dark:text-[#ff9eaf] dark:shadow-[0_8px_20px_rgba(255,158,175,0.1)]"
              : "border-[#6f57f6]/10 bg-[#f1ecff] text-[#6f57f6] shadow-[0_8px_20px_rgba(111,87,246,0.1)] dark:border-white/10 dark:bg-[#22193f] dark:text-[#cabfff] dark:shadow-[0_8px_20px_rgba(0,0,0,0.2)]"
          }`}
          onClick={() => onToggle(category.id)}
          type="button"
        >
          {isRunning ? (
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <rect height="16" rx="1.5" width="4" x="6" y="4" />
              <rect height="16" rx="1.5" width="4" x="14" y="4" />
            </svg>
          ) : (
            <svg className="ml-1 h-7 w-7 transition-transform group-hover:scale-110" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        {displaySeconds > 0 && (
          <button
            className="flex h-14 w-14 items-center justify-center rounded-full border transition-all duration-300 hover:scale-110 border-[#ece8f8] bg-white text-[#6a738d] shadow-[0_8px_20px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-white/5 dark:text-white dark:shadow-[0_8px_20px_rgba(0,0,0,0.2)]"
            onClick={() => onFinish(category.id)}
            type="button"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {displaySeconds > 0 && (
          <button
            className="flex h-14 w-14 items-center justify-center rounded-full border transition-all duration-300 hover:scale-110 border-[#f8d9dc] bg-[#fff1f2] text-[#d64b5f] shadow-[0_8px_20px_rgba(214,75,95,0.12)] dark:border-[#5a2432] dark:bg-[#2e1820] dark:text-[#ff9fbc] dark:shadow-[0_8px_20px_rgba(0,0,0,0.2)]"
            onClick={() => onReset(category.id)}
            type="button"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path d="M3 4v6h6M21 20v-6h-6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20 9a8 8 0 00-13.66-3.66L3 10M4 15a8 8 0 0013.66 3.66L21 14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
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
    return Math.max(0, activeSession.accumulatedSeconds + elapsed);
  }

  return Math.max(0, activeSession.accumulatedSeconds);
}

export function FocusClockRow({
  categories,
  activeSessions,
  onToggle,
  onFinish,
  onAdjust,
  onReset,
}: {
  categories: FocusCategory[];
  activeSessions: Record<string, ActiveFocusSession>;
  onToggle: (catId: string) => void;
  onFinish: (catId: string) => void;
  onAdjust: (catId: string, deltaSeconds: number) => void;
  onReset: (catId: string) => void;
}) {
  const sortedCategories = [...categories].sort((a, b) => {
    const aRunning = activeSessions[a.id]?.isRunning ?? false;
    const bRunning = activeSessions[b.id]?.isRunning ?? false;
    const aActive = aRunning || (activeSessions[a.id]?.accumulatedSeconds ?? 0) > 0;
    const bActive = bRunning || (activeSessions[b.id]?.accumulatedSeconds ?? 0) > 0;
    if (aActive !== bActive) return aActive ? -1 : 1;
    if (aRunning !== bRunning) return aRunning ? -1 : 1;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });

  return (
    // Mobile: horizontal 2-row scroll carousel. sm+: standard grid.
    <div className="sm:hidden w-full overflow-x-auto pt-4 pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
      <div
        style={{
          display: "grid",
          gridTemplateRows: "repeat(2, auto)",
          gridAutoFlow: "column",
          width: "max-content",
          columnGap: 12,
          rowGap: 12,
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
  onFinish,
  onAdjust,
  onReset,
}: {
  categories: FocusCategory[];
  activeSessions: Record<string, ActiveFocusSession>;
  onToggle: (catId: string) => void;
  onFinish: (catId: string) => void;
  onAdjust: (catId: string, deltaSeconds: number) => void;
  onReset: (catId: string) => void;
}) {
  const sortedCategories = [...categories].sort((a, b) => {
    const aRunning = activeSessions[a.id]?.isRunning ?? false;
    const bRunning = activeSessions[b.id]?.isRunning ?? false;
    const aActive = aRunning || (activeSessions[a.id]?.accumulatedSeconds ?? 0) > 0;
    const bActive = bRunning || (activeSessions[b.id]?.accumulatedSeconds ?? 0) > 0;
    if (aActive !== bActive) return aActive ? -1 : 1;
    if (aRunning !== bRunning) return aRunning ? -1 : 1;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });

  return (
    <div className="hidden sm:grid grid-cols-2 justify-items-center gap-8 lg:grid-cols-3 xl:grid-cols-4">
      {sortedCategories.map((cat) => (
        <FocusClock
          key={cat.id}
          activeSession={activeSessions[cat.id]}
          category={cat}
          onAdjust={onAdjust}
          onFinish={onFinish}
          onReset={onReset}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
