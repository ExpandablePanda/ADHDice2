"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Download, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import type { Database, Task } from "@/lib/database.types";
import {
  canCreateHomeRecoveryPoint,
  compareHomeRecoveryLists,
  createHomeOnlyBackupDocument,
  createManualHomeRecoveryPoint,
  formatHomeRecoveryBytes,
  formatHomeRecoveryDate,
  getHomeRecoveryListIds,
  getHomeRecoveryPointType,
  getHomeRecoveryTaskLabel,
  getNextHomeRecoveryEligibility,
  loadHomeRecoveryPoints,
  loadHomeRecoveryPreview,
  loadHomeRecoveryStatus,
  type HomeRecoveryPoint,
  type HomeRecoveryPreview,
  type HomeRecoveryRequestResult,
  type HomeRecoveryRpcClient,
  type HomeRecoveryStatus,
} from "@/lib/home-recovery-dashboard";

type SettingsHomeBackupRecoveryProps = {
  client: SupabaseClient<Database> | null;
  tasks: Task[];
  userId?: string;
};

type SelectionPreview = {
  selected: HomeRecoveryRequestResult<HomeRecoveryPreview>;
  previous: HomeRecoveryRequestResult<HomeRecoveryPreview> | null;
};

function statusDetail(result: HomeRecoveryRequestResult<unknown> | null) {
  return result?.kind === "unavailable" || result?.kind === "error" ? result.message : null;
}

function attemptResultLabel(status: HomeRecoveryStatus | null) {
  if (!status?.latest_attempt_result) return "No recovery attempt is recorded.";
  if (status.latest_attempt_result === "failed") {
    return `Latest attempt failed · ${formatHomeRecoveryDate(status.latest_failure_at)}.`;
  }
  if (status.latest_attempt_result === "created") return "Latest attempt created a verified recovery point.";
  if (status.latest_attempt_result === "unchanged") return "Latest attempt found an identical verified recovery point.";
  if (status.latest_attempt_result === "no_state") return "Latest attempt found no saved Home Todo state.";
  if (status.latest_attempt_result === "not_due") return "The last scheduled check found that a checkpoint was not due.";
  return `Latest attempt result: ${status.latest_attempt_result}.`;
}

function captureFailureDetails(reason: string | null) {
  switch (reason) {
    case "database_capacity_reached": return "Database capacity has reached its capture limit.";
    case "recovery_storage_limit_reached": return "Recovery storage has reached its capture limit.";
    case "retention_blocked_by_protected_points": return "All eligible recovery points are protected from rotation.";
    case "snapshot_verification_failed": return "Snapshot integrity verification failed.";
    case "invalid_home_state_schema": return "The saved Home state did not match a supported schema.";
    case null: return "The database did not provide a failure reason.";
    default: return "The database could not complete the recovery attempt.";
  }
}

function changeSummary(
  label: string,
  change: ReturnType<typeof compareHomeRecoveryLists>["todo"],
  tasks: readonly Task[],
) {
  const additions = change.added.length ? `${change.added.length} added` : "no additions";
  const removals = change.removed.length ? `${change.removed.length} removed` : "no removals";
  const ordering = change.orderChanged ? "sequence changed" : "sequence unchanged";
  const changedIds = [...change.added.map((id) => `+ ${getHomeRecoveryTaskLabel(id, tasks, [])}`), ...change.removed.map((id) => `− ${getHomeRecoveryTaskLabel(id, tasks, [])}`)];
  return (
    <li className="min-w-0 rounded-xl bg-white/70 px-3 py-2 dark:bg-white/5" key={label}>
      <p className="font-semibold text-[#27304c] dark:text-white">{label}: {additions}, {removals}, {ordering}</p>
      {changedIds.length ? <p className="mt-1 break-words text-xs text-[#7d88a1] dark:text-white/55">{changedIds.slice(0, 5).join(" · ")}{changedIds.length > 5 ? ` · +${changedIds.length - 5} more` : ""}</p> : null}
    </li>
  );
}

function HomeRecoveryTaskList({
  emptyLabel,
  ids,
  label,
  state,
  tasks,
  missingTaskIds,
}: {
  emptyLabel: string;
  ids: string[];
  label: string;
  state: Record<string, unknown>;
  tasks: readonly Task[];
  missingTaskIds: readonly string[];
}) {
  const routineSections = Array.isArray(state.routineSections) ? state.routineSections : [];
  const routineSectionById = new Map(routineSections.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const section = value as Record<string, unknown>;
    return typeof section.id === "string" && typeof section.name === "string" ? [[section.id, section.name] as const] : [];
  }));
  const routineAssignment = state.routineSectionIdByTaskId && typeof state.routineSectionIdByTaskId === "object"
    ? state.routineSectionIdByTaskId as Record<string, unknown>
    : {};
  const dayOffsets = state.taskDayOffsets && typeof state.taskDayOffsets === "object"
    ? state.taskDayOffsets as Record<string, unknown>
    : {};
  return (
    <section className="min-w-0 rounded-2xl border border-[#e5e0f5] bg-white/55 p-3 dark:border-white/10 dark:bg-white/[0.03]" aria-label={`${label} snapshot contents`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="text-sm font-bold text-[#27304c] dark:text-white">{label}</h4>
        <span className="rounded-full bg-[#eeeaff] px-2 py-1 text-[11px] font-semibold text-[#6f57f6] dark:bg-[#6f57f6]/15 dark:text-[#d6ccff]">{ids.length}</span>
      </div>
      {ids.length ? (
        <ol className="grid min-w-0 gap-1.5">
          {ids.map((taskId, index) => {
            const sectionId = routineAssignment[taskId];
            const sectionLabel = typeof sectionId === "string" ? routineSectionById.get(sectionId) : null;
            const dayOffset = dayOffsets[taskId];
            return (
              <li className="min-w-0 rounded-lg bg-white/80 px-3 py-2 text-xs text-[#27304c] dark:bg-white/5 dark:text-white/85" key={`${taskId}-${index}`}>
                <span className="mr-2 font-bold tabular-nums text-[#8d87a7] dark:text-white/45">{index + 1}.</span>
                <span className="break-words">{getHomeRecoveryTaskLabel(taskId, tasks, missingTaskIds)}</span>
                {label === "Routine" && sectionLabel ? <span className="ml-2 text-[#7d88a1] dark:text-white/50">· {sectionLabel}</span> : null}
                {label === "Home Todo" && typeof dayOffset === "number" && dayOffset !== 0 ? <span className="ml-2 text-[#7d88a1] dark:text-white/50">· Day offset {dayOffset}</span> : null}
              </li>
            );
          })}
        </ol>
      ) : <p className="text-xs text-[#7d88a1] dark:text-white/55">{emptyLabel}</p>}
    </section>
  );
}

function downloadFilename(point: HomeRecoveryPoint | HomeRecoveryPreview) {
  const stamp = (point.created_at ?? new Date().toISOString()).replace(/[:.]/g, "-");
  return `ADHDice-Home-only-backup-${stamp}.json`;
}

export function SettingsHomeBackupRecovery({ client, tasks, userId }: SettingsHomeBackupRecoveryProps) {
  const [statusResult, setStatusResult] = useState<HomeRecoveryRequestResult<HomeRecoveryStatus> | null>(null);
  const [pointsResult, setPointsResult] = useState<HomeRecoveryRequestResult<HomeRecoveryPoint[]> | null>(null);
  const [selectionPreview, setSelectionPreview] = useState<SelectionPreview | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const refreshGeneration = useRef(0);
  const previewGeneration = useRef(0);
  const mounted = useRef(false);
  const rpcClient = client as unknown as HomeRecoveryRpcClient | null;
  const status = statusResult?.kind === "available" ? statusResult.value : null;
  const points = pointsResult?.kind === "available" ? pointsResult.value : [];
  const selectedPoint = points.find((point) => point.id === selectedPointId) ?? null;
  const preview = selectionPreview?.selected.kind === "available" ? selectionPreview.selected.value : null;
  const previousPreview = selectionPreview?.previous?.kind === "available" ? selectionPreview.previous.value : null;
  const dashboardAvailable = statusResult?.kind === "available" && pointsResult?.kind === "available";
  const actionsAvailable = canCreateHomeRecoveryPoint({
    clientAvailable: Boolean(rpcClient),
    userId,
    statusAvailable: statusResult?.kind === "available" && !statusResult.value.database_capture_suspended && !statusResult.value.recovery_capacity_exhausted,
    pointsAvailable: pointsResult?.kind === "available",
  });

  const loadPointPreview = useCallback(async (pointId: string, currentPoints: HomeRecoveryPoint[]) => {
    if (!rpcClient || !userId) return;
    const generation = ++previewGeneration.current;
    setPreviewMessage(null);
    setSelectionPreview({ selected: { kind: "error", message: "Loading preview…" }, previous: null });
    const index = currentPoints.findIndex((point) => point.id === pointId);
    const priorPoint = index >= 0 ? currentPoints[index + 1] ?? null : null;
    const [selectedResult, previousResult] = await Promise.all([
      loadHomeRecoveryPreview(rpcClient, pointId),
      priorPoint ? loadHomeRecoveryPreview(rpcClient, priorPoint.id) : Promise.resolve(null),
    ]);
    if (!mounted.current || generation !== previewGeneration.current) return;
    setSelectionPreview({
      selected: selectedResult,
      previous: previousResult,
    });
    if (selectedResult.kind !== "available") setPreviewMessage(selectedResult.message);
    else if (selectedResult.value.status === "not_found") setPreviewMessage("This recovery point is no longer available. Refresh the list and try again.");
    else if (selectedResult.value.status !== "preview") setPreviewMessage("The database could not preview this recovery point.");
    else if (!selectedResult.value.integrity_valid || !selectedResult.value.schema_compatible || !selectedResult.value.home_state) {
      setPreviewMessage("This recovery point failed integrity or schema checks and cannot be displayed or downloaded.");
    }
  }, [rpcClient, userId]);

  const refresh = useCallback(async (preferredPointId?: string) => {
    if (!rpcClient || !userId) {
      setStatusResult({ kind: "error", message: "An authenticated account is required to view Home recovery information." });
      setPointsResult({ kind: "error", message: "An authenticated account is required to view Home recovery information." });
      setSelectionPreview(null);
      setSelectedPointId(null);
      return;
    }
    const generation = ++refreshGeneration.current;
    setIsRefreshing(true);
    setCaptureMessage(null);
    try {
      const [nextStatusResult, nextPointsResult] = await Promise.all([
        loadHomeRecoveryStatus(rpcClient),
        loadHomeRecoveryPoints(rpcClient),
      ]);
      if (!mounted.current || generation !== refreshGeneration.current) return;
      setStatusResult(nextStatusResult);
      setPointsResult(nextPointsResult);
      const availablePoints = nextPointsResult.kind === "available" ? nextPointsResult.value : [];
      const nextSelectedId = preferredPointId && availablePoints.some((point) => point.id === preferredPointId)
        ? preferredPointId
        : selectedPointId && availablePoints.some((point) => point.id === selectedPointId)
          ? selectedPointId
          : availablePoints[0]?.id ?? null;
      setSelectedPointId(nextSelectedId);
      setSelectionPreview(null);
      if (nextSelectedId) void loadPointPreview(nextSelectedId, availablePoints);
    } finally {
      if (mounted.current && generation === refreshGeneration.current) setIsRefreshing(false);
    }
  }, [loadPointPreview, rpcClient, selectedPointId, userId]);

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    mounted.current = true;
    void refreshRef.current();
    return () => {
      mounted.current = false;
      refreshGeneration.current += 1;
      previewGeneration.current += 1;
    };
  }, [client, userId]);

  async function handleCreateManualPoint() {
    if (!rpcClient || !actionsAvailable) {
      setCaptureMessage("Recovery functions are not available, so no Home backup was requested.");
      return;
    }
    setIsCapturing(true);
    setCaptureMessage(null);
    const result = await createManualHomeRecoveryPoint(rpcClient);
    if (!mounted.current) return;
    await refresh(result.kind === "created" ? result.recoveryPointId : undefined);
    if (!mounted.current) return;
    if (result.kind === "created") {
      setCaptureMessage(result.unchanged
        ? "This Home state already has a verified recovery point. The existing point was retained."
        : "A verified Home-only recovery point was created.");
    } else {
      setCaptureMessage(result.message);
    }
    if (mounted.current) setIsCapturing(false);
  }

  function handleDownload() {
    if (!preview || !preview.integrity_valid) return;
    const document = createHomeOnlyBackupDocument(preview);
    if (!document) {
      setPreviewMessage("This recovery point does not contain a verified Home snapshot to download.");
      return;
    }
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: "application/json" }));
    const anchor = window.document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = downloadFilename(preview);
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  }

  function selectPoint(pointId: string) {
    setSelectedPointId(pointId);
    setPreviewMessage(null);
    const selected = points.find((point) => point.id === pointId);
    setSelectionPreview(selected ? { selected: { kind: "error", message: "Loading preview…" }, previous: null } : null);
    void loadPointPreview(pointId, points);
  }

  const availabilityLabel = dashboardAvailable
    ? "Available in this database"
    : statusResult?.kind === "unavailable" || pointsResult?.kind === "unavailable"
      ? "Unavailable in this database"
      : statusResult?.kind === "error" || pointsResult?.kind === "error"
        ? "Could not verify"
        : "Loading";
  const nextEligibleAt = getNextHomeRecoveryEligibility(status?.last_scheduled_attempt_at);
  const storageMaximum = status?.recovery_limit_bytes ?? 0;
  const storageUsed = status?.recovery_storage_bytes ?? 0;
  const storagePercent = storageMaximum > 0 ? Math.min(100, (storageUsed / storageMaximum) * 100) : 0;
  const selectedPointIndex = points.findIndex((point) => point.id === selectedPointId);
  const hasPrecedingPoint = selectedPointIndex >= 0 && selectedPointIndex + 1 < points.length;
  const unavailableMessage = statusResult?.kind === "unavailable"
    ? statusResult.message
    : pointsResult?.kind === "unavailable" ? pointsResult.message : null;
  const dashboardErrorMessage = unavailableMessage ?? statusDetail(statusResult) ?? statusDetail(pointsResult);

  return (
    <div className="settings-recovery-dashboard grid min-w-0 gap-4 px-3 pb-4">
      <div className="settings-recovery-actions flex min-w-0 flex-col gap-3 rounded-2xl border border-[#e5e0f5] bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.035]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span aria-live="polite" className={`rounded-full px-2.5 py-1 text-xs font-bold ${dashboardAvailable ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200" : "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-100"}`}>{availabilityLabel}</span>
            <span className="text-xs text-[#7d88a1] dark:text-white/55">Home-only recovery points</span>
          </div>
          <p className="mt-2 text-sm text-[#5f6982] dark:text-white/65">Home snapshots can contain Scratchpad text and items. Keep recovery information and downloaded files private.</p>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap gap-2">
          <button className="max-w-full whitespace-normal ui-pill-button-strong-light inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-55" disabled={!client || !userId || isRefreshing} onClick={() => { void refresh(); }} type="button">
            {isRefreshing ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}
            Refresh
          </button>
          <button className="max-w-full whitespace-normal ui-pill-button-strong-light inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-55" disabled={!actionsAvailable || isCapturing || isRefreshing} onClick={() => { void handleCreateManualPoint(); }} type="button">
            {isCapturing ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
            {isCapturing ? "Creating…" : "Create Home backup"}
          </button>
        </div>
      </div>

      {captureMessage ? <p aria-live="polite" className="rounded-xl border border-[#e5e0f5] bg-white/65 px-4 py-3 text-sm text-[#5f6982] dark:border-white/10 dark:bg-white/5 dark:text-white/70">{captureMessage}</p> : null}
      {dashboardErrorMessage ? (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">
          {dashboardErrorMessage}
          {statusResult?.kind === "unavailable" || pointsResult?.kind === "unavailable" ? <span> An unavailable recovery service is different from an empty list.</span> : null}
        </div>
      ) : null}

      <dl className="settings-recovery-stats-grid grid min-w-0 gap-2">
        <div className="min-w-0 rounded-xl bg-[#f7f5ff] px-4 py-3 dark:bg-white/5"><dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8d87a7] dark:text-white/45">Scheduled interval</dt><dd className="mt-1 text-sm font-semibold text-[#27304c] dark:text-white">4 hours · runtime setting not exposed</dd></div>
        <div className="min-w-0 rounded-xl bg-[#f7f5ff] px-4 py-3 dark:bg-white/5"><dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8d87a7] dark:text-white/45">Scheduler status</dt><dd className="mt-1 text-sm font-semibold text-[#27304c] dark:text-white">Not verifiable in the app</dd><p className="mt-1 text-xs text-[#7d88a1] dark:text-white/55">Last scheduled attempt: {statusResult?.kind === "available" ? formatHomeRecoveryDate(status?.last_scheduled_attempt_at) : "Not confirmed"}. Automatic backups are not reported as active.</p></div>
        <div className="min-w-0 rounded-xl bg-[#f7f5ff] px-4 py-3 dark:bg-white/5"><dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8d87a7] dark:text-white/45">Last successful recovery point</dt><dd className="mt-1 break-words text-sm font-semibold text-[#27304c] dark:text-white">{statusResult?.kind === "available" ? formatHomeRecoveryDate(status?.latest_successful_point_at) : statusResult?.kind === "unavailable" ? "Unavailable" : "Not confirmed"}</dd></div>
        <div className="min-w-0 rounded-xl bg-[#f7f5ff] px-4 py-3 dark:bg-white/5"><dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8d87a7] dark:text-white/45">Estimated next eligibility</dt><dd className="mt-1 break-words text-sm font-semibold text-[#27304c] dark:text-white">{statusResult?.kind === "unavailable" ? "Unavailable" : nextEligibleAt ? `Approx. ${formatHomeRecoveryDate(nextEligibleAt)}` : "Not determinable yet"}</dd><p className="mt-1 text-xs text-[#7d88a1] dark:text-white/55">Estimated from the last scheduled attempt and four-hour default. The configured interval and active scheduler are not exposed.</p></div>
      </dl>

      <section aria-label="Recovery storage usage" className="min-w-0 rounded-2xl border border-[#e5e0f5] bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><h3 className="text-sm font-bold text-[#27304c] dark:text-white">Shared recovery storage</h3><p className="mt-1 text-xs text-[#7d88a1] dark:text-white/55">Database allocated space across recovery points, including indexes and retained table space.</p></div>
          <p className="text-sm font-semibold text-[#27304c] dark:text-white">{status ? `${formatHomeRecoveryBytes(storageUsed)} / ${formatHomeRecoveryBytes(storageMaximum)}` : availabilityLabel === "Unavailable in this database" ? "Unavailable" : "Not confirmed"}</p>
        </div>
        {status ? <div aria-label={`${Math.round(storagePercent)} percent of the recovery storage limit used`} className="mt-3 h-2 overflow-hidden rounded-full bg-[#e8e4f4] dark:bg-white/10" role="progressbar" aria-valuenow={Math.round(storagePercent)} aria-valuemin={0} aria-valuemax={100}><div className={`h-full rounded-full ${status.recovery_warning || status.recovery_capacity_exhausted ? "bg-amber-500" : "bg-[#6f57f6]"}`} style={{ width: `${storagePercent}%` }} /></div> : null}
        {status?.recovery_warning || status?.recovery_capacity_exhausted ? <p className="mt-2 text-sm font-semibold text-amber-800 dark:text-amber-100">{status.recovery_capacity_exhausted ? "Recovery storage is at its configured limit. New captures may fail." : `Recovery storage has reached its warning threshold (${formatHomeRecoveryBytes(status.recovery_warning_bytes)}).`}</p> : null}
        {status ? <p className="mt-2 text-xs text-[#7d88a1] dark:text-white/55">Whole database allocation: {formatHomeRecoveryBytes(status.database_bytes)} / {formatHomeRecoveryBytes(status.database_limit_bytes)}.</p> : null}
        {status?.database_capture_suspended ? <p className="mt-2 text-sm font-semibold text-amber-800 dark:text-amber-100">Database capacity has reached its capture limit. New checkpoints are suspended.</p> : null}
      </section>

      <div className="settings-recovery-panels-grid grid min-w-0 gap-4">
        <section aria-labelledby="home-recovery-points-title" className="min-w-0 rounded-2xl border border-[#e5e0f5] bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#27304c] dark:text-white" id="home-recovery-points-title">Recovery points</h3>
            <span className="rounded-full bg-[#eeeaff] px-2.5 py-1 text-xs font-bold text-[#6f57f6] dark:bg-[#6f57f6]/15 dark:text-[#d6ccff]">{dashboardAvailable && status ? `${status.recovery_point_count} / ${status.max_recovery_points}` : availabilityLabel === "Unavailable in this database" ? "Unavailable" : "—"}</span>
          </div>
          <p className="mt-1 text-xs text-[#7d88a1] dark:text-white/55">Date, saved size, capture type, and retention protection.</p>
          {pointsResult?.kind === "available" && points.length === 0 && status?.recovery_point_count === 0 ? <p className="mt-4 rounded-xl bg-[#f7f5ff] px-3 py-3 text-sm text-[#7d88a1] dark:bg-white/5 dark:text-white/55">No saved recovery points yet.</p> : null}
          {pointsResult?.kind === "available" && points.length === 0 && status && status.recovery_point_count > 0 ? <p className="mt-4 rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">Status reports {status.recovery_point_count} saved points, but the list was empty. Refresh to check again.</p> : null}
          {pointsResult?.kind === "available" && points.length > 0 ? (
            <ul className="mt-3 grid min-w-0 gap-2">
              {points.map((point) => (
                <li className="min-w-0" key={point.id}>
                  <button aria-pressed={selectedPointId === point.id} className={`settings-recovery-point-button grid w-full min-w-0 gap-1 rounded-xl border px-3 py-3 text-left transition ${selectedPointId === point.id ? "border-[#8b78ff] bg-[#f0edff] dark:border-[#9486ff] dark:bg-[#6f57f6]/15" : "border-[#e5e0f5] bg-white/70 hover:bg-[#f7f5ff] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"}`} onClick={() => selectPoint(point.id)} type="button">
                    <span className="min-w-0 break-words text-sm font-semibold text-[#27304c] dark:text-white">{formatHomeRecoveryDate(point.created_at)}</span>
                    <span className="text-xs font-semibold text-[#6f57f6] dark:text-[#d6ccff]">{formatHomeRecoveryBytes(point.payload_bytes)}</span>
                    <span className="text-xs text-[#7d88a1] dark:text-white/55">{getHomeRecoveryPointType(point)} · {point.verification_status}</span>
                    <span className="text-xs text-[#7d88a1] dark:text-white/55">{point.is_protected ? `Protected${point.protected_reason ? ` · ${point.protected_reason}` : ""}` : "Not protected"}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : pointsResult?.kind !== "available" ? <p className="mt-4 text-sm text-[#7d88a1] dark:text-white/55">{pointsResult?.kind === "error" || pointsResult?.kind === "unavailable" ? pointsResult.message : "Loading recovery points…"}</p> : null}
        </section>

        <section aria-labelledby="home-recovery-preview-title" className="grid min-w-0 content-start gap-3 rounded-2xl border border-[#e5e0f5] bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-sm font-bold text-[#27304c] dark:text-white" id="home-recovery-preview-title">Home-only snapshot preview</h3>{selectedPoint ? <p className="mt-1 text-xs text-[#7d88a1] dark:text-white/55">{formatHomeRecoveryDate(selectedPoint.created_at)} · {getHomeRecoveryPointType(selectedPoint)}</p> : null}</div>
            <button className="max-w-full whitespace-normal ui-pill-button-strong-light inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-55" disabled={!preview || !preview.integrity_valid || !preview.schema_compatible || preview.verification_status !== "verified" || !preview.home_state} onClick={handleDownload} type="button"><Download aria-hidden="true" className="h-4 w-4" />Download Home-only backup</button>
          </div>
          <p className="rounded-xl bg-[#f7f5ff] px-3 py-2 text-xs text-[#68627d] dark:bg-white/5 dark:text-white/60">This read-only preview leaves your current Home state unchanged. Home snapshots store list memberships and Task IDs; visible Task titles come from current Task data. Change details compare this point with the preceding saved recovery point, when one exists, and cover membership and ordering in these three lists.</p>
          {previewMessage ? <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">{previewMessage}</p> : null}
          {status?.latest_attempt_result === "failed" ? <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">{attemptResultLabel(status)} {captureFailureDetails(status.latest_failure_reason)}</p> : null}
          {preview?.status === "preview" && preview.integrity_valid && preview.schema_compatible && preview.home_state ? (
            <>
              {preview.missing_task_ids?.length ? <div role="alert" className="min-w-0 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100"><p className="font-bold">Missing Task references ({preview.missing_task_ids.length})</p><p className="mt-1 break-words">{preview.missing_task_ids.join(" · ")}</p></div> : null}
              <div className="settings-recovery-preview-lists grid min-w-0 gap-2">
                {(() => {
                  const ids = getHomeRecoveryListIds(preview.home_state);
                  return <>
                    <HomeRecoveryTaskList emptyLabel="No Home Todo Tasks in this snapshot." ids={ids.todo} label="Home Todo" missingTaskIds={preview.missing_task_ids ?? []} state={preview.home_state} tasks={tasks} />
                    <HomeRecoveryTaskList emptyLabel="No Urgent Tasks in this snapshot." ids={ids.urgent} label="Urgent" missingTaskIds={preview.missing_task_ids ?? []} state={preview.home_state} tasks={tasks} />
                    <HomeRecoveryTaskList emptyLabel="No Routine Tasks in this snapshot." ids={ids.routine} label="Routine" missingTaskIds={preview.missing_task_ids ?? []} state={preview.home_state} tasks={tasks} />
                  </>;
                })()}
              </div>
              {previousPreview?.status === "preview" && previousPreview.home_state ? (
                <section aria-label="Changes since previous recovery point" className="rounded-2xl bg-[#f7f5ff] p-3 dark:bg-white/5">
                  <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-[#6f57f6] dark:text-[#d6ccff]">List changes since preceding saved point</h4>
                  <ul className="settings-recovery-changes-grid mt-2 grid min-w-0 gap-2">{(() => {
                    const changes = compareHomeRecoveryLists(preview.home_state, previousPreview.home_state ?? null);
                    return <>{changeSummary("Home Todo", changes.todo, tasks)}{changeSummary("Urgent", changes.urgent, tasks)}{changeSummary("Routine", changes.routine, tasks)}</>;
                  })()}</ul>
                </section>
              ) : hasPrecedingPoint ? <p className="text-xs text-[#7d88a1] dark:text-white/55">The preceding saved point could not be compared.</p> : <p className="text-xs text-[#7d88a1] dark:text-white/55">No preceding saved point is available for comparison.</p>}
              <button aria-describedby="home-recovery-restore-note" className="max-w-full whitespace-normal ui-pill-button-strong-light w-fit cursor-not-allowed opacity-55" disabled type="button">Restore · available in a later release</button>
              <p className="text-xs text-[#7d88a1] dark:text-white/55" id="home-recovery-restore-note">Safe restoration is not enabled in this release.</p>
            </>
          ) : selectionPreview?.selected.kind === "error" && selectionPreview.selected.message === "Loading preview…" ? <p className="inline-flex items-center gap-2 text-sm text-[#7d88a1] dark:text-white/55"><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />Loading Home snapshot preview…</p>
            : selectionPreview ? null
              : <p className="text-sm text-[#7d88a1] dark:text-white/55">Select a recovery point to preview its saved Home contents.</p>}
        </section>
      </div>
    </div>
  );
}
