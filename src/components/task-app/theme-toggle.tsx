"use client";

type ThemeMode = "light" | "dark";

export function DarkModeToggleButton({
  onThemeChange,
  theme,
}: {
  onThemeChange: (theme: ThemeMode) => void;
  theme: ThemeMode;
}) {
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      aria-label={`Switch to ${nextTheme} mode`}
      aria-pressed={theme === "dark"}
      className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
        theme === "dark"
          ? "bg-[#c8baff] text-[#181127] shadow-sm"
          : "bg-white text-[#221d4e] shadow-sm dark:bg-white/10 dark:text-white/70"
      }`}
      onClick={() => onThemeChange(nextTheme)}
      type="button"
    >
      {theme === "dark" ? (
        <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20.742 13.045A8.088 8.088 0 0 1 10.955 3.258a.75.75 0 0 0-.822-1.078A9.589 9.589 0 1 0 21.82 13.867a.75.75 0 0 0-1.078-.822Z" />
        </svg>
      ) : (
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
          />
        </svg>
      )}
    </button>
  );
}

export function CalmModeButton({
  lowStim,
  onLowStimChange,
}: {
  lowStim: boolean;
  onLowStimChange: (value: boolean) => void;
}) {
  return (
    <button
      aria-label={lowStim ? "Disable low stimulation mode" : "Enable low stimulation mode"}
      aria-pressed={lowStim}
      className={`flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${
        lowStim
          ? "bg-[#f1ecff] text-[#6f57f6] dark:bg-[#cabfff]/20 dark:text-[#cabfff]"
          : "text-[#8d87a7] hover:bg-[#f1ecff] dark:text-white/40 dark:hover:bg-white/10"
      }`}
      onClick={() => onLowStimChange(!lowStim)}
      type="button"
    >
      <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364-.707.707M6.343 17.657l-.707.707m12.728 0-.707-.707M6.343 6.343l-.707-.707" />
      </svg>
      Calm
    </button>
  );
}

export function ThemeToggle({
  lowStim,
  onLowStimChange,
  onThemeChange,
  theme,
}: {
  lowStim: boolean;
  onLowStimChange: (value: boolean) => void;
  onThemeChange: (theme: ThemeMode) => void;
  theme: ThemeMode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <DarkModeToggleButton theme={theme} onThemeChange={onThemeChange} />
      <CalmModeButton lowStim={lowStim} onLowStimChange={onLowStimChange} />
    </div>
  );
}
