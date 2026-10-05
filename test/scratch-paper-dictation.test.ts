import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  enumerateScratchAudioInputDevices,
  filterScratchAudioInputDevices,
  getScratchMicrophoneStorageKey,
  isScratchRecordingSupported,
  MAX_SCRATCH_RECORDING_SECONDS,
  ScratchDictationController,
  selectScratchRecordingMimeType,
  type ScratchDictationStatus,
  type ScratchEditorRange,
  type ScratchMediaDevices,
  type ScratchMediaRecorder,
  type ScratchMediaRecorderConstructor,
  type ScratchMediaStream,
} from "../src/lib/scratch-paper-dictation.ts";
import { buildScratchTaskLinkToken } from "../src/lib/scratch-paper-task-links.ts";
import { createTask } from "../src/lib/task-buckets.ts";

const scratchSource = readFileSync(new URL("../src/components/task-app/scratch-paper.tsx", import.meta.url), "utf8");
const dictationHookSource = readFileSync(new URL("../src/hooks/useScratchDictation.ts", import.meta.url), "utf8");
const transcriptionClientSource = readFileSync(new URL("../src/lib/scratch-paper-transcription.ts", import.meta.url), "utf8");

function range(start: number, end = start): ScratchEditorRange {
  return { end, start };
}

function flushAsyncWork() {
  return new Promise<void>((resolve) => queueMicrotask(() => queueMicrotask(resolve)));
}

class FakeStorage {
  private readonly values = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.values.set(key, value);
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

class FakeStream implements ScratchMediaStream {
  readonly tracks = [{ stopCalls: 0, stop() { this.stopCalls += 1; } }];

  getTracks() {
    return this.tracks;
  }
}

class FakeRecorder implements ScratchMediaRecorder {
  static supportedMimeTypes = new Set(["audio/webm;codecs=opus", "audio/webm"]);
  static last: FakeRecorder | null = null;
  static isTypeSupported(mimeType: string) {
    return FakeRecorder.supportedMimeTypes.has(mimeType);
  }

  readonly mimeType: string;
  readonly stream: ScratchMediaStream;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onstop: (() => void) | null = null;
  startCalls = 0;
  stopCalls = 0;

  constructor(stream: ScratchMediaStream, options?: MediaRecorderOptions) {
    this.stream = stream;
    this.mimeType = options?.mimeType ?? "audio/webm";
    FakeRecorder.last = this;
  }

  start() {
    this.startCalls += 1;
  }

  stop() {
    this.stopCalls += 1;
    this.onstop?.();
  }

  emitChunk(text: string) {
    this.ondataavailable?.({ data: new Blob([text], { type: this.mimeType }) });
  }
}

const fakeRecorderConstructor = FakeRecorder as unknown as ScratchMediaRecorderConstructor;

function controllerHarness({
  body: initialBody = "",
  caret = null,
  devices = [{ deviceId: "mic-1", kind: "audioinput", label: "Desk microphone" }],
  noteKey: initialNoteKey = "note-a",
  storage,
  transcribeAudio = async () => "transcript",
}: {
  body?: string;
  caret?: ScratchEditorRange | null;
  devices?: Array<{ deviceId: string; kind: string; label: string }>;
  noteKey?: string;
  storage?: FakeStorage;
  transcribeAudio?: (audio: Blob) => Promise<string>;
} = {}) {
  let body = initialBody;
  let currentCaret = caret;
  let noteKey = initialNoteKey;
  let isPickerOpen = false;
  let error: string | null = null;
  let status: ScratchDictationStatus = "idle";
  const submittedAudio: Blob[] = [];
  const requestedConstraints: MediaStreamConstraints[] = [];
  const stream = new FakeStream();
  const mediaDevices: ScratchMediaDevices = {
    enumerateDevices: async () => devices,
    getUserMedia: async (constraints) => {
      requestedConstraints.push(constraints);
      return stream;
    },
  };
  const controller = new ScratchDictationController({
    dismissPicker: () => { isPickerOpen = false; },
    getBody: () => body,
    getCaretRange: () => currentCaret,
    getNoteKey: () => noteKey,
    isPickerOpen: () => isPickerOpen,
    mediaDevices,
    mediaRecorderConstructor: fakeRecorderConstructor,
    microphoneStorageKey: getScratchMicrophoneStorageKey("user-a"),
    onBodyChange: (nextBody, nextRange) => {
      body = nextBody;
      currentCaret = nextRange;
    },
    onError: (nextError) => { error = nextError; },
    onStatusChange: (nextStatus) => { status = nextStatus; },
    storage,
    transcribeAudio: async (audio) => {
      submittedAudio.push(audio);
      return transcribeAudio(audio);
    },
  });

  return {
    controller,
    get body() { return body; },
    get currentCaret() { return currentCaret; },
    get error() { return error; },
    get requestedConstraints() { return requestedConstraints; },
    get status() { return status; },
    get submittedAudio() { return submittedAudio; },
    get stream() { return stream; },
    set body(value: string) { body = value; },
    set noteKey(value: string) { noteKey = value; },
    set pickerOpen(value: boolean) { isPickerOpen = value; },
  };
}

test("recording support requires media capture and MediaRecorder", () => {
  assert.equal(isScratchRecordingSupported(null, fakeRecorderConstructor), false);
  assert.equal(isScratchRecordingSupported({ getUserMedia: async () => new FakeStream(), enumerateDevices: async () => [] }, null), false);
  assert.equal(isScratchRecordingSupported({ getUserMedia: async () => new FakeStream(), enumerateDevices: async () => [] }, fakeRecorderConstructor), true);
});

test("audio device enumeration filters to audioinput devices", async () => {
  const devices = [
    { deviceId: "mic", kind: "audioinput", label: "Mic" },
    { deviceId: "camera", kind: "videoinput", label: "Camera" },
    { deviceId: "", kind: "audioinput", label: "Default" },
  ];
  assert.deepEqual(filterScratchAudioInputDevices(devices), [{ deviceId: "mic", label: "Mic" }]);
  assert.deepEqual(await enumerateScratchAudioInputDevices({ enumerateDevices: async () => devices, getUserMedia: async () => new FakeStream() }), [{ deviceId: "mic", label: "Mic" }]);
});

test("selected microphone deviceId is used and only audio permission is requested", async () => {
  const storageKey = getScratchMicrophoneStorageKey("user-a")!;
  const harness = controllerHarness({ storage: new FakeStorage({ [storageKey]: "mic-1" }) });
  await harness.controller.start();
  assert.deepEqual(harness.requestedConstraints[0], { audio: { deviceId: { exact: "mic-1" } }, video: false });
  assert.equal(harness.status, "recording");
  harness.controller.cancel();
});

test("a missing stored microphone falls back to the default microphone", async () => {
  const storageKey = getScratchMicrophoneStorageKey("user-a")!;
  const storage = new FakeStorage({ [storageKey]: "removed-mic" });
  const harness = controllerHarness({ storage });
  await harness.controller.refreshDevices();
  assert.equal(harness.controller.selectedMicrophoneDeviceId, "");
  await harness.controller.start();
  assert.deepEqual(harness.requestedConstraints[0], { audio: true, video: false });
  harness.controller.cancel();
});

test("MediaRecorder MIME selection is capability based and can fall back to browser default", () => {
  assert.equal(selectScratchRecordingMimeType(fakeRecorderConstructor), "audio/webm;codecs=opus");
  assert.equal(selectScratchRecordingMimeType({ isTypeSupported: () => false } as ScratchMediaRecorderConstructor), "");
});

test("recording starts, stop combines chunks, stops every track, and submits one Blob", async () => {
  const harness = controllerHarness();
  await harness.controller.start();
  const recorder = FakeRecorder.last!;
  recorder.emitChunk("one ");
  recorder.emitChunk("two");
  harness.controller.stop();
  await flushAsyncWork();
  assert.equal(recorder.startCalls, 1);
  assert.equal(recorder.stopCalls, 1);
  assert.equal(harness.stream.tracks[0].stopCalls, 1);
  assert.equal(harness.submittedAudio.length, 1);
  assert.equal(await harness.submittedAudio[0]!.text(), "one two");
  assert.equal(harness.status, "idle");
});

test("cancelling an active recording stops the recorder and tracks without submitting audio", async () => {
  const harness = controllerHarness();
  await harness.controller.start();
  const recorder = FakeRecorder.last!;
  harness.controller.cancel();
  await flushAsyncWork();
  assert.equal(recorder.stopCalls, 1);
  assert.equal(harness.stream.tracks[0].stopCalls, 1);
  assert.equal(harness.submittedAudio.length, 0);
  assert.equal(harness.status, "idle");
});

test("successful transcript uses the saved caret and preserves Task tokens", async () => {
  const task = createTask({ id: "task-1", status: "pending", title: "Dentist" });
  const token = buildScratchTaskLinkToken(task);
  const body = `Call ${token} tomorrow`;
  const insertionOffset = body.indexOf(" tomorrow");
  const harness = controllerHarness({ body, caret: range(insertionOffset), transcribeAudio: async () => "because I need to reschedule" });
  await harness.controller.start();
  FakeRecorder.last!.emitChunk("audio");
  harness.controller.stop();
  await flushAsyncWork();
  assert.equal(harness.body, `Call ${token} because I need to reschedule tomorrow`);
  assert.equal(harness.body.includes(token), true);
  assert.equal(harness.currentCaret?.start, harness.body.indexOf(" tomorrow"));
});

test("blank transcript does not mutate the note and shows a neutral message", async () => {
  const harness = controllerHarness({ body: "keep this", transcribeAudio: async () => "   " });
  await harness.controller.start();
  FakeRecorder.last!.emitChunk("audio");
  harness.controller.stop();
  await flushAsyncWork();
  assert.equal(harness.body, "keep this");
  assert.equal(harness.error, "No speech detected.");
  assert.equal(harness.status, "error");
});

test("transcription error preserves the note", async () => {
  const harness = controllerHarness({ body: "keep this", transcribeAudio: async () => { throw new Error("provider secret"); } });
  await harness.controller.start();
  FakeRecorder.last!.emitChunk("audio");
  harness.controller.stop();
  await flushAsyncWork();
  assert.equal(harness.body, "keep this");
  assert.equal(harness.error, "Transcription failed. Try again.");
});

test("permission denial fails cleanly", async () => {
  const harness = controllerHarness();
  const deniedDevices: ScratchMediaDevices = {
    enumerateDevices: async () => [],
    getUserMedia: async () => { throw new DOMException("denied", "NotAllowedError"); },
  };
  const controller = new ScratchDictationController({
    getBody: () => "",
    getCaretRange: () => null,
    getNoteKey: () => "note-a",
    mediaDevices: deniedDevices,
    mediaRecorderConstructor: fakeRecorderConstructor,
    onBodyChange: () => undefined,
    onError: (message) => { if (message) harness.body = message; },
    onStatusChange: () => undefined,
    transcribeAudio: async () => "",
  });
  assert.equal(await controller.start(), false);
  assert.equal(harness.body, "Microphone permission was denied.");
});

test("note switching fences a late transcript and cancels recording", async () => {
  let resolveTranscript: ((value: string) => void) | null = null;
  const harness = controllerHarness({ body: "Note A", transcribeAudio: () => new Promise((resolve) => { resolveTranscript = resolve; }) });
  await harness.controller.start();
  FakeRecorder.last!.emitChunk("audio");
  harness.controller.stop();
  harness.noteKey = "note-b";
  harness.controller.cancel();
  resolveTranscript?.("late transcript");
  await flushAsyncWork();
  assert.equal(harness.body, "Note A");
  assert.equal(harness.stream.tracks[0].stopCalls, 1);
});

test("New Note, Resolve, Trash, and unmount cleanup use cancellation rather than transcription", () => {
  assert.match(scratchSource, /cancelDictation\(\);/);
  assert.match(scratchSource, /loadNote\(null\)/);
  assert.match(scratchSource, /changeCurrentStatus\(status: ScratchNoteStatus\)[\s\S]{0,100}cancelDictation\(\);/);
  assert.match(scratchSource, /dictation\.cancel\(\); void onUpdate/);
  assert.match(dictationHookSource, /if \(!enabled\) controller\.cancel\(\)/);
  assert.match(dictationHookSource, /useEffect\(\(\) => \(\) => controller\.cancel\(\), \[controller\]\)/);
});

test("the recorder lifecycle has a bounded maximum and no Web Speech dependency", () => {
  assert.equal(MAX_SCRATCH_RECORDING_SECONDS, 120);
  assert.doesNotMatch(readFileSync(new URL("../src/lib/scratch-paper-dictation.ts", import.meta.url), "utf8"), /SpeechRecognition|webkitSpeechRecognition/);
  assert.doesNotMatch(dictationHookSource, /SpeechRecognition|webkitSpeechRecognition/);
  assert.doesNotMatch(scratchSource, /SpeechRecognition|webkitSpeechRecognition|Listening…/);
});

test("audio is sent only to the transcription function and never to Storage", () => {
  assert.match(transcriptionClientSource, /functions\.invoke<unknown>\("scratch-transcribe"/);
  assert.doesNotMatch(transcriptionClientSource, /\.storage\b|audio-upload|audio recording/i);
});

test("Scratch Paper keeps one shared recorder implementation for both editors and preserves manual save/slash links", () => {
  assert.equal((scratchSource.match(/<ScratchDictationControl dictation=\{dictation\} \/>/g) ?? []).length, 2);
  assert.equal((scratchSource.match(/useScratchDictation\(/g) ?? []).length, 2);
  assert.match(scratchSource, /if \(slashCommand\) \{\s+openTaskPicker\(slashCommand/);
  assert.match(scratchSource, /onUpdate\(note\.id, \{ body, linkedTaskIds, title \}\)/);
  assert.match(scratchSource, /onCreate\(\{ body, linkedTaskIds, title \}\)/);
  assert.match(scratchSource, /<ScratchInlineEditor/);
});
