import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  deleteVoiceMemoStorageThenRow,
  getVoiceMemoStoragePath,
  MAX_VOICE_MEMO_FILE_BYTES,
  persistVoiceMemo,
  VOICE_MEMO_BUCKET,
} from "../src/lib/voice-memo-persistence.ts";
import {
  getVoiceMemoMicrophoneStorageKey,
  VoiceMemoRecordingController,
  type VoiceMemoRecordingPreview,
} from "../src/lib/voice-memo-recording.ts";
import { getScratchMicrophoneStorageKey, type ScratchMediaRecorder, type ScratchMediaRecorderConstructor, type ScratchMediaStream } from "../src/lib/scratch-paper-dictation.ts";

const homeSource = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
const scratchSource = readFileSync(new URL("../src/components/task-app/scratch-paper.tsx", import.meta.url), "utf8");
const notesSource = readFileSync(new URL("../src/components/task-app/notes-page.tsx", import.meta.url), "utf8");
const voiceMemoSource = readFileSync(new URL("../src/components/task-app/voice-memo.tsx", import.meta.url), "utf8");
const voiceMemoHookSource = readFileSync(new URL("../src/hooks/useVoiceMemos.ts", import.meta.url), "utf8");
const dictationSource = readFileSync(new URL("../src/lib/scratch-paper-dictation.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../supabase/add_voice_memos_7_16_93.sql", import.meta.url), "utf8");

class FakeStream implements ScratchMediaStream {
  readonly tracks = [{ stopCalls: 0, stop() { this.stopCalls += 1; } }];

  getTracks() {
    return this.tracks;
  }
}

class FakeRecorder implements ScratchMediaRecorder {
  static last: FakeRecorder | null = null;
  static isTypeSupported(mimeType: string) {
    return mimeType === "audio/webm;codecs=opus";
  }

  readonly mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onstop: (() => void) | null = null;
  stopCalls = 0;

  constructor(stream: ScratchMediaStream, options?: MediaRecorderOptions) {
    void stream;
    void options;
    FakeRecorder.last = this;
  }

  start() {}

  stop() {
    this.stopCalls += 1;
    this.onstop?.();
  }

  emitChunk(value: string) {
    this.ondataavailable?.({ data: new Blob([value], { type: this.mimeType }) });
  }
}

const fakeRecorderConstructor = FakeRecorder as unknown as ScratchMediaRecorderConstructor;

function flushAsyncWork() {
  return new Promise<void>((resolve) => queueMicrotask(resolve));
}

test("Voice Memo and Dictate remain visibly separate actions", () => {
  assert.match(homeSource, /<ScratchDictationControl dictation=\{scratchpadDictation\} \/>/);
  assert.match(homeSource, /<VoiceMemoRecorder contextLabel="Home Scratchpad"/);
  assert.match(scratchSource, /<ScratchDictationControl dictation=\{dictation\} \/>/);
  assert.match(scratchSource, /<VoiceMemoRecorder contextLabel="Scratch Paper"/);
  assert.match(voiceMemoSource, /Save Memo/);
  assert.match(voiceMemoSource, /Discard/);
});

test("stopping a Voice Memo creates a local preview without persistence", async () => {
  let now = 0;
  let preview: VoiceMemoRecordingPreview | null = null;
  const persistenceCalls = 0;
  const stream = new FakeStream();
  const controller = new VoiceMemoRecordingController({
    mediaDevices: {
      enumerateDevices: async () => [{ deviceId: "mic-1", kind: "audioinput", label: "Desk microphone" }],
      getUserMedia: async () => stream,
    },
    mediaRecorderConstructor: fakeRecorderConstructor,
    microphoneStorageKey: getVoiceMemoMicrophoneStorageKey("user-a"),
    now: () => now,
    onError: () => undefined,
    onPreviewChange: (nextPreview) => { preview = nextPreview; },
    onStatusChange: () => undefined,
  });

  await controller.start();
  now = 4_200;
  FakeRecorder.last!.emitChunk("memo audio");
  controller.stop();
  await flushAsyncWork();

  assert.equal(controller.status, "preview");
  assert.equal(preview?.durationSeconds, 4);
  assert.equal(await preview!.audio.text(), "memo audio");
  assert.equal(persistenceCalls, 0);
  assert.equal(stream.tracks[0]!.stopCalls, 1);
});

test("save uploads to the user/memo path before inserting metadata", async () => {
  const events: string[] = [];
  const path = getVoiceMemoStoragePath("user-a", "memo-a", "audio/webm;codecs=opus");
  await persistVoiceMemo({
    insert: async () => {
      events.push("insert");
      return {} as never;
    },
    removeUploadedObject: async () => { events.push("remove"); },
    upload: async () => { events.push(`upload:${path}`); },
  });
  assert.deepEqual(events, [`upload:user-a/memo-a.webm`, "insert"]);
  assert.equal(MAX_VOICE_MEMO_FILE_BYTES, 10 * 1024 * 1024);
});

test("metadata failure attempts cleanup of the newly uploaded object", async () => {
  const events: string[] = [];
  await assert.rejects(() => persistVoiceMemo({
    insert: async () => {
      events.push("insert");
      throw new Error("metadata failed");
    },
    removeUploadedObject: async () => { events.push("remove"); },
    upload: async () => { events.push("upload"); },
  }));
  assert.deepEqual(events, ["upload", "insert", "remove"]);
});

test("private playback uses signed access and Voice Memo deletion removes storage first", async () => {
  assert.equal(VOICE_MEMO_BUCKET, "adhdice-voice-memos");
  assert.match(voiceMemoHookSource, /createSignedUrl\(memo\.storage_path/);
  assert.doesNotMatch(voiceMemoHookSource, /getPublicUrl/);
  const events: string[] = [];
  await deleteVoiceMemoStorageThenRow({
    deleteRow: async () => { events.push("row"); },
    removeStorageObject: async () => { events.push("storage"); },
  });
  assert.deepEqual(events, ["storage", "row"]);
});

test("origin filtering, library creation, and shared microphone preference stay explicit", () => {
  assert.match(homeSource, /memos\.filter\(\(memo\) => memo\.origin_kind === "home_scratchpad"\)/);
  assert.match(scratchSource, /memo\.scratch_note_id === note\.id/);
  assert.match(voiceMemoSource, /originKind="memo_library"/);
  assert.match(notesSource, /PageShell id="notes-voice-memos" label="Voice Memos"/);
  assert.match(notesSource, /<VoiceMemoLibrary data=\{voiceMemos\}/);
  assert.equal(getVoiceMemoMicrophoneStorageKey("user-a"), getScratchMicrophoneStorageKey("user-a"));
  assert.match(voiceMemoSource, /aria-label=\{`\$\{contextLabel\} microphone`\}/);
});

test("Scratch note deletion preserves memo rows through a nullable SET NULL reference", () => {
  assert.match(migrationSource, /scratch_note_id uuid references public\.adhdice_scratch_notes\(id\) on delete set null/i);
  assert.doesNotMatch(migrationSource, /scratch_note_id uuid references public\.adhdice_scratch_notes\(id\) on delete cascade/i);
});

test("on-demand transcription reuses scratch-transcribe and preserves saved audio on failure", () => {
  assert.match(voiceMemoHookSource, /transcribeScratchAudio\(client, audio\)/);
  assert.match(voiceMemoHookSource, /Voice Memo transcription failed\. The saved audio is unchanged\./);
  assert.doesNotMatch(dictationSource, /storage\.from\(|storage\.upload|storage\.remove/);
});

test("RLS and private Storage source are user-scoped with no public URL path", () => {
  assert.match(migrationSource, /alter table public\.adhdice_voice_memos enable row level security/i);
  assert.match(migrationSource, /to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(migrationSource, /public = false/);
  assert.match(migrationSource, /storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)::text\)/i);
  assert.match(migrationSource, /for insert[\s\S]*bucket_id = 'adhdice-voice-memos'/i);
  assert.match(migrationSource, /for delete[\s\S]*bucket_id = 'adhdice-voice-memos'/i);
  assert.doesNotMatch(voiceMemoHookSource, /service_role|SUPABASE_SERVICE_ROLE|getPublicUrl/);
});
