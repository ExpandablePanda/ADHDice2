"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Mic, MicOff, Play, Square, Trash2 } from "lucide-react";

import { AdhdCard } from "@/components/ui-system/adhd-card";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import type { VoiceMemo, VoiceMemoOriginKind } from "@/lib/database.types";
import type { VoiceMemoData } from "@/hooks/useVoiceMemos";
import { getVoiceMemoMicrophoneStorageKey, VoiceMemoRecordingController, type VoiceMemoRecordingPreview, type VoiceMemoRecordingStatus } from "@/lib/voice-memo-recording";
import type { ScratchMicrophoneDevice } from "@/lib/scratch-paper-dictation";

let activeVoiceMemoAudio: HTMLAudioElement | null = null;

function claimVoiceMemoPlayback(audio: HTMLAudioElement) {
  if (activeVoiceMemoAudio && activeVoiceMemoAudio !== audio) activeVoiceMemoAudio.pause();
  activeVoiceMemoAudio = audio;
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function formatCreatedAt(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function originLabel(memo: VoiceMemo, sourceNoteTitle?: string | null) {
  if (memo.origin_kind === "home_scratchpad") return "Home Scratchpad";
  if (memo.origin_kind === "memo_library") return "Memo Library";
  if (sourceNoteTitle) return `Scratch Paper · ${sourceNoteTitle}`;
  return "Scratch Paper · source note unavailable";
}

function useVoiceMemoRecorder(userId: string | null) {
  const [devices, setDevices] = useState<ScratchMicrophoneDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<VoiceMemoRecordingPreview | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [controller] = useState(() => new VoiceMemoRecordingController({
    microphoneStorageKey: getVoiceMemoMicrophoneStorageKey(userId),
    onDevicesChange: setDevices,
    onError: setError,
    onPreviewChange: setPreview,
    onRecordingTimeChange: setRecordingSeconds,
    storage: undefined,
  }));
  const status = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.status,
    () => "unsupported" as VoiceMemoRecordingStatus,
  );
  const isSupported = useSyncExternalStore(
    () => () => undefined,
    () => controller.isSupported,
    () => false,
  );

  useEffect(() => {
    void controller.refreshDevices();
  }, [controller]);
  useEffect(() => () => controller.cancel(), [controller]);

  return {
    controller,
    devices,
    error,
    isRecording: status === "recording",
    isSupported,
    isWorking: status === "requesting_permission",
    preview,
    recordingSeconds,
    selectedDeviceId: controller.selectedMicrophoneDeviceId,
    status,
  };
}

export function VoiceMemoRecorder({
  contextLabel,
  onSaveMemo,
  originKind,
  scratchNoteId = null,
  userId,
}: {
  contextLabel: string;
  onSaveMemo: VoiceMemoData["createMemo"];
  originKind: VoiceMemoOriginKind;
  scratchNoteId?: string | null;
  userId: string | null;
}) {
  const recorder = useVoiceMemoRecorder(userId);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const previewUrl = useMemo(
    () => recorder.preview && typeof URL !== "undefined" ? URL.createObjectURL(recorder.preview.audio) : null,
    [recorder.preview],
  );
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const save = useCallback(async () => {
    if (!recorder.preview || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    const result = await onSaveMemo({
      audio: recorder.preview.audio,
      durationSeconds: recorder.preview.durationSeconds,
      originKind,
      scratchNoteId,
      title: null,
    });
    setIsSaving(false);
    if (!result.memo) {
      setSaveError(result.error ?? "Voice Memo could not be saved. Try again.");
      return;
    }
    recorder.controller.discard();
  }, [isSaving, onSaveMemo, originKind, recorder.controller, recorder.preview, scratchNoteId]);

  const isBusy = recorder.isRecording || recorder.isWorking || isSaving;
  const message = saveError ?? recorder.error;
  const timerLabel = `Recording ${formatDuration(recorder.isRecording ? recorder.recordingSeconds : recorder.preview?.durationSeconds ?? 0)}`;

  return (
    <div className="space-y-2 rounded-[1rem] border border-[#e9e3f7] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center gap-1.5">
        {recorder.isSupported ? (
          <label className="inline-flex max-w-[17rem] items-center gap-1 text-[11px] text-[#8d87a7] dark:text-white/45">
            <span>Mic:</span>
            <select
              aria-label={`${contextLabel} microphone`}
              className="min-w-0 max-w-[14rem] rounded-md border border-[#ddd2ff] bg-white px-1.5 py-1 text-[11px] text-[#69627f] outline-none dark:border-white/15 dark:bg-white/8 dark:text-white/70"
              disabled={isBusy}
              onChange={(event) => recorder.controller.setSelectedMicrophoneDevice(event.target.value)}
              value={recorder.selectedDeviceId}
            >
              <option value="">Default microphone</option>
              {recorder.devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
            </select>
          </label>
        ) : null}
        <AdhdChip
          aria-label={recorder.isRecording ? "Stop Voice Memo recording" : "Record Voice Memo"}
          disabled={!recorder.isSupported || recorder.isWorking || isSaving}
          icon={recorder.isRecording ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
          onClick={() => {
            setSaveError(null);
            if (recorder.isRecording) recorder.controller.stop();
            else void recorder.controller.start();
          }}
          onMouseDown={(event) => event.preventDefault()}
          onPointerDown={(event) => event.preventDefault()}
          toneClassName={recorder.isRecording ? "border-[#ddd2ff] bg-[#6f57f6] text-white dark:border-[#7f67ff] dark:bg-[#7f67ff]" : undefined}
        >
          {recorder.isRecording ? timerLabel : recorder.isWorking ? "Requesting microphone…" : "Record Memo"}
        </AdhdChip>
        {recorder.preview ? <span className="text-[11px] text-[#8d87a7] dark:text-white/45">Preview {formatDuration(recorder.preview.durationSeconds)}</span> : null}
      </div>
      {recorder.preview && previewUrl ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <audio aria-label={`${contextLabel} Voice Memo preview`} className="max-w-full" controls onPlay={(event) => claimVoiceMemoPlayback(event.currentTarget)} preload="metadata" src={previewUrl} />
          <AdhdChip disabled={isSaving} icon={<Square className="h-3 w-3" />} onClick={() => recorder.controller.discard()} type="button">Discard</AdhdChip>
          <AdhdChip disabled={isSaving} onClick={() => { void save(); }} selected type="button">{isSaving ? "Saving Memo…" : "Save Memo"}</AdhdChip>
        </div>
      ) : null}
      {message ? <p aria-live="polite" className="text-[11px] text-[#c64c62] dark:text-[#ffb1c0]">{message}</p> : null}
    </div>
  );
}

export function VoiceMemoCard({
  getPlaybackUrl,
  memo,
  onDelete,
  onOpenSourceNote,
  onRename,
  onTranscribe,
  sourceNoteTitle,
}: {
  getPlaybackUrl: VoiceMemoData["getPlaybackUrl"];
  memo: VoiceMemo;
  onDelete: VoiceMemoData["deleteMemo"];
  onOpenSourceNote?: (noteId: string) => void;
  onRename: VoiceMemoData["renameMemo"];
  onTranscribe: VoiceMemoData["transcribeMemo"];
  sourceNoteTitle?: string | null;
}) {
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [isLoadingPlayback, setIsLoadingPlayback] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const saveTitle = useCallback(async () => {
    const nextTitle = titleInputRef.current?.value ?? "";
    if (nextTitle.trim() === (memo.title ?? "").trim()) return;
    await onRename(memo, nextTitle);
  }, [memo, onRename]);

  const play = useCallback(async () => {
    setActionError(null);
    if (playbackUrl) {
      await audioRef.current?.play().catch(() => undefined);
      return;
    }
    setIsLoadingPlayback(true);
    const nextUrl = await getPlaybackUrl(memo);
    setIsLoadingPlayback(false);
    if (!nextUrl) {
      setActionError("Playback is unavailable. Try again.");
      return;
    }
    setPlaybackUrl(nextUrl);
    window.setTimeout(() => {
      void audioRef.current?.play().catch(() => undefined);
    }, 0);
  }, [getPlaybackUrl, memo, playbackUrl]);

  const transcribe = useCallback(async () => {
    setIsTranscribing(true);
    setActionError(null);
    const succeeded = await onTranscribe(memo);
    setIsTranscribing(false);
    if (!succeeded) setActionError("Transcription failed. The saved audio is unchanged.");
  }, [memo, onTranscribe]);

  return (
    <AdhdCard className="space-y-2" padding="sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <input
          aria-label="Voice Memo title"
          className="min-w-[12rem] flex-1 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold text-[#2f294a] outline-none focus:border-[#ddd2ff] focus:bg-white dark:text-white dark:focus:border-white/15 dark:focus:bg-white/5"
          onBlur={() => { void saveTitle(); }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          placeholder="Voice Memo"
          defaultValue={memo.title ?? ""}
          ref={titleInputRef}
        />
        <AdhdChip aria-label="Delete Voice Memo" icon={<Trash2 className="h-3 w-3" />} onClick={() => { void onDelete(memo); }} tone="danger">Delete</AdhdChip>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#8d87a7] dark:text-white/45">
        <span>{formatCreatedAt(memo.created_at)}</span>
        <span aria-hidden="true">·</span>
        <span>{formatDuration(memo.duration_seconds)}</span>
        <span aria-hidden="true">·</span>
        {memo.origin_kind === "scratch_note" && memo.scratch_note_id && sourceNoteTitle && onOpenSourceNote ? (
          <button
            className="underline decoration-dotted underline-offset-2"
            onClick={() => onOpenSourceNote(memo.scratch_note_id as string)}
            type="button"
          >
            {originLabel(memo, sourceNoteTitle)}
          </button>
        ) : <span>{originLabel(memo, sourceNoteTitle)}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <AdhdChip disabled={isLoadingPlayback} icon={<Play className="h-3 w-3" />} onClick={() => { void play(); }}>{isLoadingPlayback ? "Loading…" : "Play"}</AdhdChip>
        {playbackUrl ? <audio aria-label={`${memo.title || "Voice Memo"} playback`} className="max-w-full" controls onPlay={(event) => claimVoiceMemoPlayback(event.currentTarget)} preload="none" ref={audioRef} src={playbackUrl} /> : null}
        {!memo.transcript ? <AdhdChip disabled={isTranscribing} onClick={() => { void transcribe(); }}>{isTranscribing ? "Transcribing…" : "Transcribe"}</AdhdChip> : null}
      </div>
      {memo.transcript ? <p className="whitespace-pre-wrap rounded-lg bg-[#f7f5ff] px-2.5 py-2 text-xs leading-relaxed text-[#69627f] dark:bg-white/5 dark:text-white/70">{memo.transcript}</p> : null}
      {actionError ? <p aria-live="polite" className="text-[11px] text-[#c64c62] dark:text-[#ffb1c0]">{actionError}</p> : null}
    </AdhdCard>
  );
}

export function VoiceMemoLibrary({
  data,
  onOpenSourceNote,
  scratchNotes,
}: {
  data: VoiceMemoData;
  onOpenSourceNote?: (noteId: string) => void;
  scratchNotes: Array<{ id: string; title: string | null }>;
}) {
  const sourceTitles = useMemo(() => new Map(scratchNotes.map((note) => [note.id, note.title])), [scratchNotes]);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[#2f294a] dark:text-white">Voice Memos</h2>
        <p className="text-sm text-[#827a9e] dark:text-white/45">Saved audio from Home Scratchpad and Scratch Paper, with optional transcription.</p>
      </div>
      <VoiceMemoRecorder contextLabel="Voice Memo Library" onSaveMemo={data.createMemo} originKind="memo_library" userId={data.userId} />
      {data.error ? <p className="text-sm text-[#c64c62] dark:text-[#ffb1c0]">{data.error}</p> : null}
      {data.isLoading ? <p className="text-sm text-[#8d87a7] dark:text-white/45">Loading Voice Memos…</p> : null}
      {data.memos.length === 0 && !data.isLoading ? <p className="text-sm text-[#8d87a7] dark:text-white/45">No saved Voice Memos yet.</p> : null}
      <div className="grid gap-3">
        {data.memos.map((memo) => (
          <VoiceMemoCard
            getPlaybackUrl={data.getPlaybackUrl}
            key={memo.id}
            memo={memo}
            onDelete={data.deleteMemo}
            onOpenSourceNote={onOpenSourceNote}
            onRename={data.renameMemo}
            onTranscribe={data.transcribeMemo}
            sourceNoteTitle={memo.scratch_note_id ? sourceTitles.get(memo.scratch_note_id) : null}
          />
        ))}
      </div>
    </div>
  );
}
