import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createScratchSpeechRecognition,
  insertScratchDictationText,
  ScratchDictationController,
  type ScratchEditorRange,
  type ScratchSpeechRecognition,
  type ScratchSpeechRecognitionErrorEvent,
  type ScratchSpeechRecognitionResult,
  type ScratchSpeechRecognitionResultEvent,
} from "../src/lib/scratch-paper-dictation.ts";
import { buildScratchTaskLinkToken } from "../src/lib/scratch-paper-task-links.ts";
import { createTask } from "../src/lib/task-buckets.ts";

const scratchSource = readFileSync(new URL("../src/components/task-app/scratch-paper.tsx", import.meta.url), "utf8");
const dictationHookSource = readFileSync(new URL("../src/hooks/useScratchDictation.ts", import.meta.url), "utf8");

function range(start: number, end = start): ScratchEditorRange {
  return { end, start };
}

class FakeRecognition implements ScratchSpeechRecognition {
  continuous = false;
  interimResults = true;
  lang = "";
  maxAlternatives = 0;
  onend: (() => void) | null = null;
  onerror: ((event: ScratchSpeechRecognitionErrorEvent) => void) | null = null;
  onresult: ((event: ScratchSpeechRecognitionResultEvent) => void) | null = null;
  startCalls = 0;
  stopCalls = 0;

  start() {
    this.startCalls += 1;
  }

  stop() {
    this.stopCalls += 1;
  }

  emit(transcript: string, isFinal: boolean, resultIndex = 0) {
    const result: ScratchSpeechRecognitionResult = { isFinal, 0: { transcript } };
    this.onresult?.({ resultIndex, results: [result] });
  }

  emitError(error?: string) {
    this.onerror?.({ error });
  }

  emitEnd() {
    this.onend?.();
  }
}

function controllerHarness({
  body: initialBody,
  caret = null,
  noteKey: initialNoteKey = "note-a",
  pickerOpen = false,
}: {
  body: string;
  caret?: ScratchEditorRange | null;
  noteKey?: string;
  pickerOpen?: boolean;
}) {
  let body = initialBody;
  let currentCaret = caret;
  let noteKey = initialNoteKey;
  let isPickerOpen = pickerOpen;
  let dirtyCount = 0;
  let saveCount = 0;
  let isListening = false;
  let error: string | null = null;
  let dismissCount = 0;
  const recognition = new FakeRecognition();
  const controller = new ScratchDictationController({
    dismissPicker: () => {
      dismissCount += 1;
      isPickerOpen = false;
    },
    getBody: () => body,
    getCaretRange: () => currentCaret,
    getNoteKey: () => noteKey,
    isPickerOpen: () => isPickerOpen,
    onBodyChange: (nextBody, nextRange) => {
      body = nextBody;
      currentCaret = nextRange;
      dirtyCount += 1;
    },
    onError: (nextError) => { error = nextError; },
    onListeningChange: (nextListening) => { isListening = nextListening; },
    recognitionFactory: () => recognition,
  });

  return {
    controller,
    get body() { return body; },
    get caret() { return currentCaret; },
    get dirtyCount() { return dirtyCount; },
    get dismissCount() { return dismissCount; },
    get error() { return error; },
    get isListening() { return isListening; },
    get noteKey() { return noteKey; },
    get recognition() { return recognition; },
    get saveCount() { return saveCount; },
    set body(nextBody: string) { body = nextBody; },
    set caret(nextCaret: ScratchEditorRange | null) { currentCaret = nextCaret; },
    set noteKey(nextNoteKey: string) { noteKey = nextNoteKey; },
    set saveCount(nextSaveCount: number) { saveCount = nextSaveCount; },
  };
}

test("dictation helper inserts at the beginning, end, and middle of plain text", () => {
  assert.deepEqual(insertScratchDictationText("Hello", range(0), "Start"), {
    body: "Start Hello",
    caretOffset: 6,
  });
  assert.deepEqual(insertScratchDictationText("Hello", range(5), "world"), {
    body: "Hello world",
    caretOffset: 11,
  });
  assert.deepEqual(insertScratchDictationText("Hello world", range(5), "beautiful"), {
    body: "Hello beautiful world",
    caretOffset: 15,
  });
});

test("dictation helper replaces an ordinary selected range", () => {
  assert.deepEqual(insertScratchDictationText("Hello cruel world", range(6, 11), "kind"), {
    body: "Hello kind world",
    caretOffset: 10,
  });
});

test("dictation helper preserves Task tokens before and after insertion", () => {
  const task = createTask({ id: "task-1", status: "pending", title: "Dentist" });
  const token = buildScratchTaskLinkToken(task);
  const body = `Call ${token} tomorrow`;
  const afterToken = insertScratchDictationText(body, range(`Call ${token}`.length), "because I need to reschedule");
  assert.equal(afterToken.body, `Call ${token} because I need to reschedule tomorrow`);
  assert.equal(afterToken.body.includes(token), true);

  const beforeToken = insertScratchDictationText(`tomorrow ${token}`, range(9), "today");
  assert.equal(beforeToken.body, `tomorrow today ${token}`);
  assert.equal(beforeToken.body.includes(token), true);
});

test("dictation helper never splits or corrupts a Task token", () => {
  const task = createTask({ id: "task-2", status: "pending", title: "Laundry" });
  const token = buildScratchTaskLinkToken(task);
  const insertion = insertScratchDictationText(token, range(4), "carefully");
  assert.equal(insertion.body, `carefully ${token}`);
  assert.equal(insertion.body.includes(token), true);
});

test("final transcript chunks append in sequence while interim results are ignored", () => {
  const harness = controllerHarness({ body: "" });
  harness.controller.start();
  harness.recognition.emit("interim", false);
  assert.equal(harness.body, "");
  harness.recognition.emit("first", true);
  harness.recognition.emit("second", true);
  assert.equal(harness.body, "first second");
  assert.equal(harness.dirtyCount, 2);
  assert.equal(harness.saveCount, 0);
});

test("dictation without a saved caret defaults to the note end", () => {
  const harness = controllerHarness({ body: "Existing text", caret: null });
  harness.controller.start();
  harness.recognition.emit("more", true);
  assert.equal(harness.body, "Existing text more");
  assert.deepEqual(harness.caret, range(harness.body.length));
});

test("starting dictation dismisses the Task picker and dictated slash stays ordinary text", () => {
  const harness = controllerHarness({ body: "", pickerOpen: true });
  harness.controller.start();
  assert.equal(harness.dismissCount, 1);
  harness.recognition.emit("/", true);
  assert.equal(harness.body, "/");
  assert.equal(harness.dismissCount, 1);
  assert.match(scratchSource, /if \(slashCommand\) \{\s+openTaskPicker\(slashCommand/);
});

test("recognition error preserves text and exits Listening state", () => {
  const harness = controllerHarness({ body: "already dictated" });
  harness.controller.start();
  harness.recognition.emit("safe", true);
  const dictatedBody = harness.body;
  harness.recognition.emitError("not-allowed");
  assert.equal(harness.body, dictatedBody);
  assert.equal(harness.isListening, false);
  assert.equal(harness.error, "Microphone permission was denied.");
});

test("service end exits Listening state and explicit stop ends recognition", () => {
  const harness = controllerHarness({ body: "" });
  harness.controller.start();
  harness.recognition.emitEnd();
  assert.equal(harness.isListening, false);

  harness.controller.start();
  harness.controller.stop();
  assert.equal(harness.isListening, false);
  assert.equal(harness.recognition.stopCalls, 1);
});

test("switching notes stops and fences the old recognition session", () => {
  const harness = controllerHarness({ body: "Note A" });
  harness.controller.start();
  const oldBody = harness.body;
  harness.noteKey = "note-b";
  harness.controller.stop();
  harness.recognition.emit("late result", true);
  assert.equal(harness.body, oldBody);
  assert.equal(harness.recognition.stopCalls, 1);
});

test("starting a New Note can cleanly stop the old session", () => {
  const harness = controllerHarness({ body: "Old note", noteKey: "note-a" });
  harness.controller.start();
  harness.noteKey = "new";
  harness.controller.stop();
  harness.recognition.emit("late", true);
  assert.equal(harness.body, "Old note");
  assert.equal(harness.isListening, false);
});

test("unsupported browser fails gracefully", () => {
  const harness = controllerHarness({ body: "" });
  const errors: string[] = [];
  const unsupported = new ScratchDictationController({
    getBody: () => "",
    getCaretRange: () => null,
    getNoteKey: () => "note-a",
    onBodyChange: () => undefined,
    onError: (message) => { if (message) errors.push(message); },
    onListeningChange: () => undefined,
  });
  assert.equal(unsupported.isSupported, false);
  assert.equal(unsupported.start(), false);
  assert.deepEqual(errors, ["Voice dictation is not available in this browser."]);
  assert.equal(harness.controller.isSupported, true);
});

test("the browser adapter configures continuous final-only recognition", () => {
  const originalWindow = globalThis.window;
  const originalNavigator = globalThis.navigator;
  class BrowserRecognition extends FakeRecognition {}
  Object.defineProperty(globalThis, "window", { configurable: true, value: { SpeechRecognition: BrowserRecognition } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { language: "en-GB" } });
  try {
    const recognition = createScratchSpeechRecognition();
    assert.ok(recognition);
    assert.equal(recognition.continuous, true);
    assert.equal(recognition.interimResults, false);
    assert.equal(recognition.lang, "en-GB");
    assert.equal(recognition.maxAlternatives, 1);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
  }
});

test("Scratch Paper exposes one shared Dictate control for current and existing-note edit modes", () => {
  assert.equal((scratchSource.match(/<ScratchDictationControl dictation=\{dictation\} \/>/g) ?? []).length, 2);
  assert.match(scratchSource, /enabled: isEditing/);
  assert.match(scratchSource, /onUpdate\(note\.id, \{ body, linkedTaskIds, title \}\)/);
  assert.match(scratchSource, /onCreate\(\{ body, linkedTaskIds, title \}\)/);
});

test("dictation lifecycle cleanup is wired through the shared hook", () => {
  assert.match(dictationHookSource, /useEffect\(\(\) => \(\) => controller\.stop\(\), \[controller\]\)/);
  assert.match(dictationHookSource, /if \(!enabled\) controller\.stop\(\)/);
  assert.match(scratchSource, /stopDictation\(\);\s+const hasDraftContent/);
});

test("Scratch Task chips retain render, open, and status-change bindings", () => {
  assert.match(scratchSource, /data-task-token=\{token\}/);
  assert.match(scratchSource, /onOpenTask=\{onOpenTask\}/);
  assert.match(scratchSource, /onSetTaskStatus=\{onSetTaskStatus\}/);
  assert.match(scratchSource, /const selection = getScratchEditorSelection\(editor\)/);
  assert.match(scratchSource, /onSelectionRangeChange\(selection\.range\)/);
  assert.match(scratchSource, /onKeyDown=\{\(event\) => \{/);
});
