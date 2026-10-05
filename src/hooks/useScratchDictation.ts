"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type RefObject } from "react";

import {
  restoreScratchEditorOffset,
  ScratchDictationController,
  type ScratchDictationControllerOptions,
  type ScratchEditorRange,
  type ScratchSpeechRecognitionFactory,
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
  recognitionFactory?: ScratchSpeechRecognitionFactory;
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
  recognitionFactory,
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
    recognitionFactory,
  };
  const [optionsStore] = useState(() => new ScratchDictationOptionsStore(latestOptions));

  const [isListening, setIsListening] = useState(false);
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
      onError: setError,
      onListeningChange: setIsListening,
      recognitionFactory,
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
      recognitionFactory,
    });
  }, [body, dismissPicker, editorRef, enabled, getCaretRange, isPickerOpen, noteKey, onBodyChange, optionsStore, recognitionFactory]);

  const isSupported = useSyncExternalStore(
    () => () => undefined,
    () => controller.isSupported,
    () => false,
  );
  useEffect(() => {
    if (!enabled) controller.stop();
  }, [controller, enabled]);
  useEffect(() => () => controller.stop(), [controller]);

  const start = useCallback(() => controller.start(), [controller]);
  const stop = useCallback(() => controller.stop(), [controller]);
  const toggle = useCallback(() => {
    if (controller.isListening) {
      controller.stop();
    } else {
      controller.start();
    }
  }, [controller]);

  return { error, isListening, isSupported, start, stop, toggle };
}
