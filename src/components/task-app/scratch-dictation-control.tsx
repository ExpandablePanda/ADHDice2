"use client";

import { Mic, MicOff } from "lucide-react";

import type { useScratchDictation } from "@/hooks/useScratchDictation";
import { AdhdChip } from "@/components/ui-system/adhd-chip";

type ScratchDictationState = ReturnType<typeof useScratchDictation>;

export function ScratchDictationControl({ dictation }: { dictation: ScratchDictationState }) {
  const isUnavailable = !dictation.isSupported;
  const isBusy = dictation.status === "requesting_permission" || dictation.status === "transcribing";
  const recordingLabel = `Recording ${String(Math.floor(dictation.recordingSeconds / 60)).padStart(2, "0")}:${String(dictation.recordingSeconds % 60).padStart(2, "0")}`;
  const buttonLabel = dictation.isRecording
    ? recordingLabel
    : dictation.status === "requesting_permission"
      ? "Requesting microphone…"
      : dictation.isTranscribing
        ? "Transcribing…"
        : "Dictate";
  const message = dictation.error ?? (isUnavailable ? "Voice recording unavailable in this browser." : null);

  return (
    <>
      {dictation.isSupported ? (
        <label className="inline-flex max-w-[15rem] items-center gap-1 text-[11px] text-[#8d87a7] dark:text-white/45">
          <span>Mic:</span>
          <select
            aria-label="Scratch Paper microphone"
            className="min-w-0 max-w-[12rem] rounded-md border border-[#ddd2ff] bg-white px-1.5 py-1 text-[11px] text-[#69627f] outline-none dark:border-white/15 dark:bg-white/8 dark:text-white/70"
            disabled={dictation.isRecording || isBusy}
            onChange={(event) => dictation.selectMicrophone(event.target.value)}
            value={dictation.selectedDeviceId}
          >
            <option value="">Default microphone</option>
            {dictation.devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
          </select>
        </label>
      ) : null}
      <AdhdChip
        aria-label={dictation.isRecording ? "Stop recording" : "Dictate note body"}
        aria-pressed={dictation.isRecording}
        disabled={isUnavailable || isBusy}
        icon={dictation.isRecording ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
        onClick={dictation.toggle}
        onMouseDown={(event) => event.preventDefault()}
        onPointerDown={(event) => event.preventDefault()}
        title={isUnavailable ? "Voice dictation is not available in this browser." : undefined}
        toneClassName={dictation.isRecording ? "border-[#ddd2ff] bg-[#6f57f6] text-white dark:border-[#7f67ff] dark:bg-[#7f67ff]" : undefined}
      >
        {buttonLabel}
      </AdhdChip>
      {message ? <span aria-live="polite" className={`text-[11px] ${dictation.error ? "text-[#c64c62] dark:text-[#ffb1c0]" : "text-[#8d87a7] dark:text-white/45"}`}>{message}</span> : null}
    </>
  );
}
