export type BatchEditProgressPhase = "complete" | "running" | "warning";

export type BatchEditProgress = {
  failed: number;
  fallbackCount: number;
  firstErrorMessage: string | null;
  finalizationErrorMessage: string | null;
  operationLabel: string;
  phase: BatchEditProgressPhase;
  processed: number;
  remaining: number;
  skipped: number;
  total: number;
  updated: number;
};

export function createBatchEditProgress(total: number, operationLabel = "Batch Edit"): BatchEditProgress {
  return {
    failed: 0,
    fallbackCount: 0,
    firstErrorMessage: null,
    finalizationErrorMessage: null,
    operationLabel,
    phase: "running",
    processed: 0,
    remaining: total,
    skipped: 0,
    total,
    updated: 0,
  };
}

export function recordBatchEditPlan(
  progress: BatchEditProgress,
  result: { errorMessage?: string | null; fallbackUsed?: boolean; skipped?: boolean; success: boolean },
): BatchEditProgress {
  const processed = progress.processed + 1;
  const skipped = Boolean(result.skipped);
  return {
    ...progress,
    failed: progress.failed + (result.success ? 0 : 1),
    fallbackCount: progress.fallbackCount + (result.fallbackUsed ? 1 : 0),
    firstErrorMessage: progress.firstErrorMessage ?? result.errorMessage ?? null,
    processed,
    remaining: progress.total - processed,
    skipped: progress.skipped + (skipped ? 1 : 0),
    updated: progress.updated + (result.success && !skipped ? 1 : 0),
  };
}

export function completeBatchEditProgress(progress: BatchEditProgress): BatchEditProgress {
  return { ...progress, phase: "complete", remaining: progress.total - progress.processed };
}

export function warnBatchEditProgress(progress: BatchEditProgress, errorMessage: string): BatchEditProgress {
  return {
    ...progress,
    finalizationErrorMessage: errorMessage,
    phase: "warning",
    remaining: progress.total - progress.processed,
  };
}

export function formatBatchEditProgressText(progress: BatchEditProgress): string {
  const countText = `${progress.processed} of ${progress.total} (${getBatchEditProgressPercentage(progress.processed, progress.total)}%)`;
  const failureText = progress.failed > 0 ? ` · ${progress.failed} failed` : "";
  const skippedText = progress.skipped > 0 ? ` · ${progress.skipped} skipped` : "";
  if (progress.phase === "complete") {
    return `${progress.operationLabel} complete · ${countText} · ${progress.updated} updated${skippedText}${failureText}`;
  }

  const phaseText = progress.phase === "warning" ? " · Finalization warning" : "";
  return `${progress.operationLabel}… ${countText} · ${progress.remaining} remaining${skippedText}${failureText}${phaseText}`;
}

export function getBatchEditProgressPercentage(processed: number, total: number) {
  if (total <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((processed / total) * 100)));
}

export function formatBatchEditProgressDetail(progress: BatchEditProgress): string | null {
  const details: string[] = [];
  if (progress.finalizationErrorMessage) {
    details.push(progress.finalizationErrorMessage);
  }
  if (progress.firstErrorMessage) {
    details.push(progress.firstErrorMessage);
  }
  if (progress.fallbackCount > 0) {
    details.push(`${progress.fallbackCount} task${progress.fallbackCount === 1 ? "" : "s"} used low energy because your database is missing the newer "none" energy level.`);
  }
  return details.length > 0 ? details.join(" ") : null;
}
