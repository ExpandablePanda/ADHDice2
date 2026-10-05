import {
  enumerateScratchAudioInputDevices,
  getScratchMicrophoneStorageKey,
  isScratchRecordingSupported,
  MAX_SCRATCH_RECORDING_SECONDS,
  selectScratchRecordingMimeType,
  stopScratchMediaStream,
  type ScratchMediaDevices,
  type ScratchMediaRecorder,
  type ScratchMediaRecorderConstructor,
  type ScratchMediaStream,
  type ScratchMicrophoneDevice,
} from "@/lib/scratch-paper-dictation";

export type VoiceMemoRecordingStatus =
  | "idle"
  | "requesting_permission"
  | "recording"
  | "preview"
  | "error"
  | "unsupported";

export type VoiceMemoRecordingPreview = {
  audio: Blob;
  durationSeconds: number;
  mimeType: string;
};

export type VoiceMemoRecordingControllerOptions = {
  mediaDevices?: ScratchMediaDevices | null;
  mediaRecorderConstructor?: ScratchMediaRecorderConstructor | null;
  microphoneStorageKey?: string | null;
  now?: () => number;
  onDevicesChange?: (devices: ScratchMicrophoneDevice[]) => void;
  onError: (message: string | null) => void;
  onPreviewChange?: (preview: VoiceMemoRecordingPreview | null) => void;
  onRecordingTimeChange?: (seconds: number) => void;
  onStatusChange?: (status: VoiceMemoRecordingStatus) => void;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
};

type VoiceMemoRecordingSession = {
  chunks: Blob[];
  id: number;
  mimeType: string;
  recorder: ScratchMediaRecorder | null;
  startedAt: number;
  stream: ScratchMediaStream | null;
};

function recordingErrorMessage(error: unknown) {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone permission was denied.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "No microphone was found.";
  return "Voice memo recording is unavailable.";
}

function isOverconstrainedError(error: unknown) {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  return name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError";
}

function browserMediaDevices(): ScratchMediaDevices | null {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) return null;
  return navigator.mediaDevices as unknown as ScratchMediaDevices;
}

function browserMediaRecorder(): ScratchMediaRecorderConstructor | null {
  if (typeof globalThis.MediaRecorder !== "function") return null;
  return globalThis.MediaRecorder as unknown as ScratchMediaRecorderConstructor;
}

export class VoiceMemoRecordingController {
  private readonly options: VoiceMemoRecordingControllerOptions;
  private readonly mediaDevices: ScratchMediaDevices | null;
  private readonly mediaRecorderConstructor: ScratchMediaRecorderConstructor | null;
  private readonly microphoneStorageKey: string | null;
  private readonly now: () => number;
  private activeSession: VoiceMemoRecordingSession | null = null;
  private nextSessionId = 0;
  private recordingTimer: ReturnType<typeof setInterval> | null = null;
  private selectedDeviceId: string;
  private statusValue: VoiceMemoRecordingStatus;
  private previewValue: VoiceMemoRecordingPreview | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(options: VoiceMemoRecordingControllerOptions) {
    this.options = options;
    this.mediaDevices = options.mediaDevices ?? browserMediaDevices();
    this.mediaRecorderConstructor = options.mediaRecorderConstructor ?? browserMediaRecorder();
    this.microphoneStorageKey = options.microphoneStorageKey ?? null;
    this.now = options.now ?? Date.now;
    this.selectedDeviceId = this.readStoredDeviceId(options.storage);
    this.statusValue = isScratchRecordingSupported(this.mediaDevices, this.mediaRecorderConstructor) ? "idle" : "unsupported";
  }

  get isSupported() {
    return this.statusValue !== "unsupported";
  }

  get isRecording() {
    return this.statusValue === "recording";
  }

  get preview() {
    return this.previewValue;
  }

  get recordingSeconds() {
    return this.previewValue?.durationSeconds ?? 0;
  }

  get selectedMicrophoneDeviceId() {
    return this.selectedDeviceId;
  }

  get status() {
    return this.statusValue;
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
    if (this.microphoneStorageKey && (this.options.storage ?? (typeof window === "undefined" ? null : window.localStorage))) {
      try {
        (this.options.storage ?? window.localStorage)?.setItem(this.microphoneStorageKey, deviceId);
      } catch {
        // Microphone preference storage is best effort only.
      }
    }
    this.emit();
  }

  async start() {
    this.discard();
    this.options.onError(null);
    if (!this.isSupported || !this.mediaDevices || !this.mediaRecorderConstructor) {
      this.setStatus("unsupported");
      this.options.onError("Voice memo recording is unavailable in this browser.");
      return false;
    }

    const session: VoiceMemoRecordingSession = {
      chunks: [],
      id: ++this.nextSessionId,
      mimeType: "",
      recorder: null,
      startedAt: 0,
      stream: null,
    };
    this.activeSession = session;
    this.setStatus("requesting_permission");

    let stream: ScratchMediaStream;
    try {
      stream = await this.getUserMedia();
    } catch (error) {
      if (this.activeSession?.id !== session.id) return false;
      this.failSession(session, recordingErrorMessage(error));
      return false;
    }

    if (!this.isActiveSession(session)) {
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
      this.failSession(session, "Voice memo recording is unavailable.");
      return false;
    }
  }

  stop() {
    const session = this.activeSession;
    if (!session) return;
    if (this.statusValue !== "recording" || !session.recorder) {
      if (this.statusValue === "requesting_permission") this.cancel();
      return;
    }
    this.stopRecordingTimer();
    try {
      session.recorder.stop();
    } catch {
      this.failSession(session, "Recording failed. Try again.");
    }
    stopScratchMediaStream(session.stream);
    session.stream = null;
  }

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
    this.setPreview(null);
    this.setStatus(this.isSupported ? "idle" : "unsupported");
  }

  discard() {
    if (this.statusValue === "recording" || this.statusValue === "requesting_permission") {
      this.cancel();
      return;
    }
    this.activeSession = null;
    this.stopRecordingTimer();
    this.setPreview(null);
    this.setStatus(this.isSupported ? "idle" : "unsupported");
  }

  private readStoredDeviceId(storage: Pick<Storage, "getItem"> | null | undefined) {
    if (!this.microphoneStorageKey) return "";
    try {
      return (storage ?? (typeof window === "undefined" ? null : window.localStorage))?.getItem(this.microphoneStorageKey) ?? "";
    } catch {
      return "";
    }
  }

  private async getUserMedia() {
    if (!this.mediaDevices) throw new Error("Media devices unavailable.");
    const audio = this.selectedDeviceId ? { deviceId: { exact: this.selectedDeviceId } } : true;
    try {
      return await this.mediaDevices.getUserMedia({ audio, video: false });
    } catch (error) {
      if (!this.selectedDeviceId || !isOverconstrainedError(error)) throw error;
      this.setSelectedMicrophoneDevice("");
      return this.mediaDevices.getUserMedia({ audio: true, video: false });
    }
  }

  private isActiveSession(session: VoiceMemoRecordingSession) {
    return this.activeSession?.id === session.id;
  }

  private setPreview(preview: VoiceMemoRecordingPreview | null) {
    this.previewValue = preview;
    this.options.onPreviewChange?.(preview);
    this.emit();
  }

  private setStatus(status: VoiceMemoRecordingStatus) {
    this.statusValue = status;
    this.options.onStatusChange?.(status);
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  private startRecordingTimer(session: VoiceMemoRecordingSession) {
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

  private failSession(session: VoiceMemoRecordingSession, message: string) {
    if (!this.isActiveSession(session)) return;
    this.activeSession = null;
    this.stopRecordingTimer();
    stopScratchMediaStream(session.stream);
    session.stream = null;
    session.chunks.length = 0;
    this.setPreview(null);
    this.setStatus("error");
    this.options.onError(message);
  }

  private handleRecorderStop(session: VoiceMemoRecordingSession) {
    if (!this.isActiveSession(session)) return;
    this.activeSession = null;
    session.recorder = null;
    const chunks = session.chunks.splice(0);
    const audio = new Blob(chunks, { type: session.mimeType });
    if (audio.size === 0) {
      stopScratchMediaStream(session.stream);
      session.stream = null;
      this.setPreview(null);
      this.setStatus("error");
      this.options.onError("No audio recorded.");
      return;
    }
    const durationSeconds = Math.min(MAX_SCRATCH_RECORDING_SECONDS, Math.max(0, Math.round((this.now() - session.startedAt) / 1000)));
    this.setPreview({ audio, durationSeconds, mimeType: session.mimeType || audio.type });
    this.setStatus("preview");
  }
}

export function getVoiceMemoMicrophoneStorageKey(userId: string | null | undefined) {
  return getScratchMicrophoneStorageKey(userId);
}
