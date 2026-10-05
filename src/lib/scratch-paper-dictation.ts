import { parseScratchTaskTokenSegments } from "@/lib/scratch-paper-task-links";

export type ScratchEditorRange = {
  end: number;
  start: number;
};

type ScratchTaskTokenRange = {
  end: number;
  start: number;
};

function clampOffset(offset: number, length: number) {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.min(Math.trunc(offset), length));
}

function getScratchTaskTokenRanges(body: string): ScratchTaskTokenRange[] {
  let offset = 0;
  return parseScratchTaskTokenSegments(body).flatMap((segment) => {
    if (segment.kind === "text") {
      offset += segment.text.length;
      return [];
    }

    const token = `[[task:${segment.taskId}|${segment.fallbackTitle}]]`;
    const range = { end: offset + token.length, start: offset };
    offset = range.end;
    return [range];
  });
}

function nearestTokenBoundary(offset: number, token: ScratchTaskTokenRange) {
  return offset - token.start <= token.end - offset ? token.start : token.end;
}

function resolveSafeInsertionRange(body: string, range: ScratchEditorRange): ScratchEditorRange {
  const start = clampOffset(range.start, body.length);
  const end = clampOffset(range.end, body.length);
  const orderedStart = Math.min(start, end);
  const orderedEnd = Math.max(start, end);
  const tokenRanges = getScratchTaskTokenRanges(body);
  const intersectingToken = tokenRanges.find((token) => orderedStart === orderedEnd
    ? orderedStart > token.start && orderedStart < token.end
    : orderedStart < token.end && orderedEnd > token.start);

  if (!intersectingToken) {
    return { end: orderedEnd, start: orderedStart };
  }

  const safeOffset = orderedStart <= intersectingToken.start
    ? intersectingToken.start
    : nearestTokenBoundary(orderedStart, intersectingToken);
  return { end: safeOffset, start: safeOffset };
}

function needsBoundarySpace(left: string, right: string) {
  if (!left || !right || /\s$/.test(left) || /^\s/.test(right)) return false;
  if (/[([{"']$/.test(left) || /^[\])},.!?;:]/.test(right)) return false;
  return true;
}

/**
 * Inserts final transcription text into the serialized Scratch Paper body.
 * Task tokens are treated as indivisible ranges and are never partially replaced.
 */
export function insertScratchDictationText(
  body: string,
  range: ScratchEditorRange,
  transcript: string,
) {
  const safeRange = resolveSafeInsertionRange(body, range);
  const before = body.slice(0, safeRange.start);
  const after = body.slice(safeRange.end);
  const leadingSpace = needsBoundarySpace(before, transcript) ? " " : "";
  const trailingSpace = needsBoundarySpace(`${leadingSpace}${transcript}`, after) ? " " : "";
  const inserted = `${leadingSpace}${transcript}${trailingSpace}`;

  return {
    body: `${before}${inserted}${after}`,
    caretOffset: safeRange.start + inserted.length,
  };
}

export function restoreScratchEditorOffset(editor: HTMLElement, offset: number) {
  const selectionEditor = editor as HTMLElement & {
    setSelectionRange?: (start: number, end: number) => void;
  };
  if (typeof selectionEditor.setSelectionRange === "function") {
    selectionEditor.setSelectionRange(offset, offset);
    return;
  }

  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  let remaining = Math.max(0, offset);

  function place(node: Node): boolean {
    if (node instanceof HTMLElement && node.dataset.taskToken) {
      const tokenLength = node.dataset.taskToken.length;
      if (remaining <= tokenLength) {
        range.setStartAfter(node);
        return true;
      }
      remaining -= tokenLength;
      return false;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) {
        range.setStart(node, remaining);
        return true;
      }
      remaining -= length;
      return false;
    }
    for (const child of Array.from(node.childNodes)) {
      if (place(child)) return true;
    }
    return false;
  }

  if (!place(editor)) {
    range.selectNodeContents(editor);
    range.collapse(false);
  } else {
    range.collapse(true);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

export type ScratchDictationStatus =
  | "idle"
  | "requesting_permission"
  | "recording"
  | "transcribing"
  | "error"
  | "unsupported";

export type ScratchMicrophoneDevice = {
  deviceId: string;
  label: string;
};

export type ScratchMediaDeviceInfo = {
  deviceId: string;
  kind: string;
  label: string;
};

export type ScratchMediaStream = {
  getTracks: () => Array<{ stop: () => void }>;
};

export type ScratchMediaDevices = {
  enumerateDevices: () => Promise<readonly ScratchMediaDeviceInfo[]>;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<ScratchMediaStream>;
};

export type ScratchMediaRecorder = {
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onstop: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export type ScratchMediaRecorderConstructor = {
  new (stream: ScratchMediaStream, options?: MediaRecorderOptions): ScratchMediaRecorder;
  isTypeSupported?: (mimeType: string) => boolean;
};

export const SCRATCH_RECORDING_MIME_TYPES = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
] as const;
export const MAX_SCRATCH_RECORDING_SECONDS = 120;

const SCRATCH_MICROPHONE_STORAGE_PREFIX = "adhdice-scratch-microphone:";

function getBrowserMediaDevices(): ScratchMediaDevices | null {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) return null;
  return navigator.mediaDevices as unknown as ScratchMediaDevices;
}

function getBrowserMediaRecorderConstructor(): ScratchMediaRecorderConstructor | null {
  if (typeof globalThis.MediaRecorder !== "function") return null;
  return globalThis.MediaRecorder as unknown as ScratchMediaRecorderConstructor;
}

export function isScratchRecordingSupported(
  mediaDevices: ScratchMediaDevices | null = getBrowserMediaDevices(),
  recorderConstructor: ScratchMediaRecorderConstructor | null = getBrowserMediaRecorderConstructor(),
) {
  return Boolean(mediaDevices?.getUserMedia && recorderConstructor);
}

export function selectScratchRecordingMimeType(
  recorderConstructor: ScratchMediaRecorderConstructor | null = getBrowserMediaRecorderConstructor(),
) {
  if (!recorderConstructor?.isTypeSupported) return "";
  for (const mimeType of SCRATCH_RECORDING_MIME_TYPES) {
    try {
      if (recorderConstructor.isTypeSupported(mimeType)) return mimeType;
    } catch {
      // A browser may reject an individual capability probe.
    }
  }
  return "";
}

export function filterScratchAudioInputDevices(devices: readonly ScratchMediaDeviceInfo[]) {
  return devices
    .filter((device) => device.kind === "audioinput" && Boolean(device.deviceId))
    .map(({ deviceId, label }) => ({ deviceId, label }));
}

export async function enumerateScratchAudioInputDevices(mediaDevices: ScratchMediaDevices | null = getBrowserMediaDevices()) {
  if (!mediaDevices?.enumerateDevices) return [];
  try {
    return filterScratchAudioInputDevices(await mediaDevices.enumerateDevices());
  } catch {
    return [];
  }
}

export function getScratchMicrophoneStorageKey(userId: string | null | undefined) {
  return userId ? `${SCRATCH_MICROPHONE_STORAGE_PREFIX}${userId}` : null;
}

export function readStoredScratchMicrophoneDeviceId(
  storageKey: string | null,
  storage: Pick<Storage, "getItem"> | null = typeof window === "undefined" ? null : window.localStorage,
) {
  if (!storageKey || !storage) return "";
  try {
    return storage.getItem(storageKey) ?? "";
  } catch {
    return "";
  }
}

function writeStoredScratchMicrophoneDeviceId(
  storageKey: string | null,
  deviceId: string,
  storage: Pick<Storage, "setItem"> | null,
) {
  if (!storageKey || !storage) return;
  try {
    storage.setItem(storageKey, deviceId);
  } catch {
    // Microphone preference storage is best effort only.
  }
}

function defaultErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone permission was denied.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "No microphone was found.";
  return "Voice recording unavailable.";
}

function isOverconstrainedError(error: unknown) {
  return error instanceof DOMException && (error.name === "OverconstrainedError" || error.name === "ConstraintNotSatisfiedError");
}

export function stopScratchMediaStream(stream: ScratchMediaStream | null) {
  for (const track of stream?.getTracks() ?? []) {
    try {
      track.stop();
    } catch {
      // Track cleanup is best effort if the browser already stopped it.
    }
  }
}

export type ScratchDictationControllerOptions = {
  dismissPicker?: () => void;
  getBody: () => string;
  getCaretRange: () => ScratchEditorRange | null;
  getNoteKey: () => string;
  isPickerOpen?: () => boolean;
  mediaDevices?: ScratchMediaDevices | null;
  mediaRecorderConstructor?: ScratchMediaRecorderConstructor | null;
  microphoneStorageKey?: string | null;
  onBodyChange: (body: string, range: ScratchEditorRange) => void;
  onDevicesChange?: (devices: ScratchMicrophoneDevice[]) => void;
  onError: (message: string | null) => void;
  onRecordingTimeChange?: (seconds: number) => void;
  onSelectedDeviceChange?: (deviceId: string) => void;
  onStatusChange?: (status: ScratchDictationStatus) => void;
  now?: () => number;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  transcribeAudio: (audio: Blob) => Promise<string>;
};

type ScratchRecordingSession = {
  body: string;
  chunks: Blob[];
  id: number;
  insertionRange: ScratchEditorRange;
  mimeType: string;
  noteKey: string;
  recorder: ScratchMediaRecorder | null;
  startedAt: number;
  stream: ScratchMediaStream | null;
  transcriptionStarted: boolean;
};

export class ScratchDictationController {
  private readonly options: ScratchDictationControllerOptions;
  private activeSession: ScratchRecordingSession | null = null;
  private readonly mediaDevices: ScratchMediaDevices | null;
  private readonly mediaRecorderConstructor: ScratchMediaRecorderConstructor | null;
  private readonly microphoneStorageKey: string | null;
  private nextSessionId = 0;
  private recordingTimer: ReturnType<typeof setInterval> | null = null;
  private selectedDeviceId: string;
  private statusValue: ScratchDictationStatus;
  private readonly now: () => number;
  private readonly listeners = new Set<() => void>();

  constructor(options: ScratchDictationControllerOptions) {
    this.options = options;
    this.mediaDevices = options.mediaDevices ?? getBrowserMediaDevices();
    this.mediaRecorderConstructor = options.mediaRecorderConstructor ?? getBrowserMediaRecorderConstructor();
    this.microphoneStorageKey = options.microphoneStorageKey ?? null;
    this.selectedDeviceId = readStoredScratchMicrophoneDeviceId(this.microphoneStorageKey, options.storage);
    this.statusValue = isScratchRecordingSupported(this.mediaDevices, this.mediaRecorderConstructor) ? "idle" : "unsupported";
    this.now = options.now ?? Date.now;
  }

  get isSupported() {
    return this.statusValue !== "unsupported";
  }

  get isRecording() {
    return this.statusValue === "recording";
  }

  get isTranscribing() {
    return this.statusValue === "transcribing";
  }

  get status() {
    return this.statusValue;
  }

  get selectedMicrophoneDeviceId() {
    return this.selectedDeviceId;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async refreshDevices() {
    const devices = await enumerateScratchAudioInputDevices(this.mediaDevices);
    const labeledDevices = devices.filter((device) => device.label.trim().length > 0);
    this.options.onDevicesChange?.(labeledDevices);
    if (this.selectedDeviceId && !devices.some((device) => device.deviceId === this.selectedDeviceId)) {
      this.setSelectedMicrophoneDevice("");
    }
    return labeledDevices;
  }

  setSelectedMicrophoneDevice(deviceId: string) {
    this.selectedDeviceId = deviceId;
    writeStoredScratchMicrophoneDeviceId(this.microphoneStorageKey, deviceId, this.options.storage ?? (typeof window === "undefined" ? null : window.localStorage));
    this.options.onSelectedDeviceChange?.(deviceId);
    for (const listener of this.listeners) listener();
  }

  async start() {
    this.cancel();
    this.options.onError(null);
    if (!this.isSupported || !this.mediaDevices || !this.mediaRecorderConstructor) {
      this.setStatus("unsupported");
      this.options.onError("Voice recording unavailable in this browser.");
      return false;
    }

    if (this.options.isPickerOpen?.()) this.options.dismissPicker?.();

    const body = this.options.getBody();
    const savedRange = this.options.getCaretRange() ?? { end: body.length, start: body.length };
    const session: ScratchRecordingSession = {
      body,
      chunks: [],
      id: ++this.nextSessionId,
      insertionRange: savedRange,
      mimeType: "",
      noteKey: this.options.getNoteKey(),
      recorder: null,
      startedAt: 0,
      stream: null,
      transcriptionStarted: false,
    };
    this.activeSession = session;
    this.setStatus("requesting_permission");

    let stream: ScratchMediaStream;
    try {
      stream = await this.getUserMedia();
    } catch (error) {
      if (this.activeSession?.id !== session.id) return false;
      this.failSession(session, defaultErrorMessage(error));
      return false;
    }

    if (!this.isActiveSession(session) || this.options.getNoteKey() !== session.noteKey) {
      stopScratchMediaStream(stream);
      return false;
    }
    session.stream = stream;
    await this.refreshDevices();

    try {
      const mimeType = selectScratchRecordingMimeType(this.mediaRecorderConstructor);
      const recorder = mimeType
        ? new this.mediaRecorderConstructor(stream, { mimeType })
        : new this.mediaRecorderConstructor(stream);
      session.mimeType = recorder.mimeType || mimeType;
      session.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (this.isActiveSession(session) && event.data && event.data.size > 0) session.chunks.push(event.data);
      };
      recorder.onstop = () => this.handleRecorderStop(session);
      recorder.onerror = () => this.failSession(session, "Recording failed. Try again.");
      recorder.start();
      session.startedAt = this.now();
      this.startRecordingTimer(session);
      this.setStatus("recording");
      return true;
    } catch {
      this.failSession(session, "Voice recording unavailable.");
      return false;
    }
  }

  /** Stop the active recording and submit its temporary audio for transcription. */
  stop() {
    const session = this.activeSession;
    if (!session) return;
    if (this.statusValue !== "recording" || !session.recorder) {
      if (this.statusValue === "requesting_permission") this.cancel();
      return;
    }

    this.stopRecordingTimer();
    this.setStatus("transcribing");
    try {
      session.recorder.stop();
    } catch {
      this.failSession(session, "Recording failed. Try again.");
    }
    stopScratchMediaStream(session.stream);
    session.stream = null;
  }

  /** Fence and clean up an active recording or in-flight transcription. */
  cancel() {
    const session = this.activeSession;
    this.activeSession = null;
    this.stopRecordingTimer();
    if (session?.recorder) {
      try {
        session.recorder.stop();
      } catch {
        // The browser may have already stopped the recorder.
      }
    }
    stopScratchMediaStream(session?.stream ?? null);
    if (session) session.chunks.length = 0;
    this.setStatus(this.isSupported ? "idle" : "unsupported");
  }

  private async getUserMedia() {
    if (!this.mediaDevices) throw new Error("Media devices unavailable.");
    const audio = this.selectedDeviceId ? { deviceId: { exact: this.selectedDeviceId } } : true;
    const constraints: MediaStreamConstraints = { audio, video: false };
    try {
      return await this.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      if (!this.selectedDeviceId || !isOverconstrainedError(error)) throw error;
      this.setSelectedMicrophoneDevice("");
      return this.mediaDevices.getUserMedia({ audio: true, video: false });
    }
  }

  private isActiveSession(session: ScratchRecordingSession) {
    return this.activeSession?.id === session.id;
  }

  private setStatus(status: ScratchDictationStatus) {
    this.statusValue = status;
    this.options.onStatusChange?.(status);
    for (const listener of this.listeners) listener();
  }

  private startRecordingTimer(session: ScratchRecordingSession) {
    this.options.onRecordingTimeChange?.(0);
    this.recordingTimer = setInterval(() => {
      if (!this.isActiveSession(session)) return;
      const seconds = Math.max(0, Math.floor((this.now() - session.startedAt) / 1000));
      this.options.onRecordingTimeChange?.(seconds);
      if (seconds >= MAX_SCRATCH_RECORDING_SECONDS) this.stop();
    }, 250);
  }

  private stopRecordingTimer() {
    if (this.recordingTimer !== null) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
  }

  private failSession(session: ScratchRecordingSession, message: string) {
    if (!this.isActiveSession(session)) return;
    this.activeSession = null;
    this.stopRecordingTimer();
    stopScratchMediaStream(session.stream);
    session.stream = null;
    session.chunks.length = 0;
    this.setStatus("error");
    this.options.onError(message);
  }

  private handleRecorderStop(session: ScratchRecordingSession) {
    if (!this.isActiveSession(session) || session.transcriptionStarted) return;
    session.transcriptionStarted = true;
    session.recorder = null;
    const chunks = session.chunks.splice(0);
    const audioBlob = new Blob(chunks, { type: session.mimeType });
    if (audioBlob.size === 0) {
      this.failSession(session, "No audio recorded.");
      return;
    }

    let temporaryAudio: Blob | null = audioBlob;
    void (async () => {
      try {
        const transcript = await this.options.transcribeAudio(temporaryAudio as Blob);
        if (!this.isActiveSession(session) || this.options.getNoteKey() !== session.noteKey) return;
        const normalizedTranscript = transcript.trim();
        if (!normalizedTranscript) {
          this.failSession(session, "No speech detected.");
          return;
        }
        const inserted = insertScratchDictationText(session.body, session.insertionRange, normalizedTranscript);
        session.body = inserted.body;
        session.insertionRange = { end: inserted.caretOffset, start: inserted.caretOffset };
        this.options.onBodyChange(session.body, session.insertionRange);
        this.activeSession = null;
        this.setStatus("idle");
      } catch {
        if (this.isActiveSession(session)) this.failSession(session, "Transcription failed. Try again.");
      } finally {
        temporaryAudio = null;
        chunks.length = 0;
      }
    })();
  }
}
