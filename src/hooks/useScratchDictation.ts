"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type RefObject } from "react";

import {
  getScratchMicrophoneStorageKey,
  restoreScratchEditorOffset,
  ScratchDictationController,
  type ScratchDictationControllerOptions,
  type ScratchDictationStatus,
  type ScratchEditorRange,
  type ScratchMicrophoneDevice,
} from "@/lib/scratch-paper-dictation";

export type UseScratchDictationOptions = {
  body: string;
  dismissPicker?: () => void;
  editorRef?: RefObject<HTMLDivElement | null>;
  enabled?: boolean;
  getCaretRange: () => ScratchEditorRange | null;
  isPickerOpen?: boolean;
  noteKey: string;
  onBodyChange: (body: string, range: ScratchEditorRange) => void;
  onTranscribeAudio: (audio: Blob) => Promise<string>;
  userId: string | null;
};

class ScratchDictationOptionsStore {
  private options: UseScratchDictationOptions;

  constructor(options: UseScratchDictationOptions) {
    this.options = options;
  }

  get() {
    return this.options;
  }

  update(options: UseScratchDictationOptions) {
    this.options = options;
  }
}

export function useScratchDictation({
  body,
  dismissPicker,
  editorRef,
  enabled = true,
  getCaretRange,
  isPickerOpen = false,
  noteKey,
  onBodyChange,
  onTranscribeAudio,
  userId,
}: UseScratchDictationOptions) {
  const latestOptions: UseScratchDictationOptions = {
    body,
    dismissPicker,
    editorRef,
    enabled,
    getCaretRange,
    isPickerOpen,
    noteKey,
    onBodyChange,
    onTranscribeAudio,
    userId,
  };
  const [optionsStore] = useState(() => new ScratchDictationOptionsStore(latestOptions));

  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [devices, setDevices] = useState<ScratchMicrophoneDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [controller] = useState(() => {
    const controllerOptions: ScratchDictationControllerOptions = {
      dismissPicker: () => optionsStore.get().dismissPicker?.(),
      getBody: () => optionsStore.get().body,
      getCaretRange: () => optionsStore.get().getCaretRange(),
      getNoteKey: () => optionsStore.get().noteKey,
      isPickerOpen: () => Boolean(optionsStore.get().isPickerOpen),
      onBodyChange: (nextBody, range) => {
        const current = optionsStore.get();
        current.onBodyChange(nextBody, range);
        const expectedNoteKey = current.noteKey;
        if (current.editorRef && typeof window !== "undefined") {
          window.requestAnimationFrame(() => {
            const latest = optionsStore.get();
            const editor = latest.editorRef?.current;
            if (!editor || !latest.enabled || latest.noteKey !== expectedNoteKey) return;
            editor.focus();
            restoreScratchEditorOffset(editor, range.end);
          });
        }
      },
      onDevicesChange: setDevices,
      onError: setError,
      onRecordingTimeChange: setRecordingSeconds,
      storage: undefined,
      transcribeAudio: (audio) => optionsStore.get().onTranscribeAudio(audio),
      microphoneStorageKey: getScratchMicrophoneStorageKey(userId),
    };
    return new ScratchDictationController(controllerOptions);
  });

  useEffect(() => {
    optionsStore.update({
      body,
      dismissPicker,
      editorRef,
      enabled,
      getCaretRange,
      isPickerOpen,
      noteKey,
      onBodyChange,
      onTranscribeAudio,
      userId,
    });
  }, [body, dismissPicker, editorRef, enabled, getCaretRange, isPickerOpen, noteKey, onBodyChange, onTranscribeAudio, optionsStore, userId]);

  const isSupported = useSyncExternalStore(
    () => () => undefined,
    () => controller.isSupported,
    () => false,
  );
  const status = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.status,
    () => "unsupported" as ScratchDictationStatus,
  );
  const selectedDeviceId = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.selectedMicrophoneDeviceId,
    () => "",
  );
  useEffect(() => {
    void controller.refreshDevices();
  }, [controller]);
  useEffect(() => {
    if (!enabled) controller.cancel();
  }, [controller, enabled]);
  useEffect(() => () => controller.cancel(), [controller]);

  const start = useCallback(() => { void controller.start(); }, [controller]);
  const stop = useCallback(() => controller.stop(), [controller]);
  const cancel = useCallback(() => controller.cancel(), [controller]);
  const selectMicrophone = useCallback((deviceId: string) => controller.setSelectedMicrophoneDevice(deviceId), [controller]);
  const toggle = useCallback(() => {
    if (controller.isRecording) {
      controller.stop();
    } else if (!controller.isTranscribing) {
      void controller.start();
    }
  }, [controller]);

  return {
    cancel,
    devices,
    error,
    isListening: status === "recording" || status === "requesting_permission",
    isRecording: status === "recording",
    isSupported,
    isTranscribing: status === "transcribing",
    recordingSeconds,
    selectedDeviceId,
    selectMicrophone,
    start,
    status,
    stop,
    toggle,
  };
}
