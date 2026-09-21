"use client";

export type OperationProgressView = {
  completed: number;
  failed?: number;
  label: string;
  total: number | null;
};

export function getOperationProgressPercentage(completed: number, total: number | null) {
  if (total === null || total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((completed / total) * 100)));
}

export function OperationProgressBar({ progress }: { progress: OperationProgressView }) {
  const percentage = getOperationProgressPercentage(progress.completed, progress.total);
  const failureText = progress.failed ? ` · ${progress.failed} failed` : "";
  const countText = percentage === null
    ? "Working…"
    : `${progress.completed} of ${progress.total} (${percentage}%)`;

  return (
    <div aria-label={`${progress.label} progress`} className="mt-2 grid gap-1.5">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold">
        <span>{progress.label}</span>
        <span className="tabular-nums">{countText}{failureText}</span>
      </div>
      <div
        aria-label={`${progress.label} progress`}
        aria-valuemax={progress.total ?? undefined}
        aria-valuemin={0}
        aria-valuenow={percentage === null ? undefined : progress.completed}
        className="h-2 overflow-hidden rounded-full bg-current/15"
        role="progressbar"
      >
        <div
          className={`h-full rounded-full bg-current transition-[width] duration-200 ${percentage === null ? "w-1/3 animate-pulse" : ""}`}
          style={percentage === null ? undefined : { width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
