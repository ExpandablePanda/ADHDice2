export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const GROQ_TRANSCRIPTION_MODEL = "whisper-large-v3-turbo";
export const GROQ_TRANSCRIPTIONS_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  "audio/flac",
  "audio/mp3",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/mpga",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
]);

export function normalizeAudioMimeType(value: string | null | undefined) {
  return (value ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

export function isSupportedAudioMimeType(value: string | null | undefined) {
  return SUPPORTED_AUDIO_MIME_TYPES.has(normalizeAudioMimeType(value));
}

export function audioFileExtension(value: string | null | undefined) {
  switch (normalizeAudioMimeType(value)) {
    case "audio/flac": return "flac";
    case "audio/mp3": return "mp3";
    case "audio/m4a":
    case "audio/mp4":
    case "audio/x-m4a": return "m4a";
    case "audio/mpeg":
    case "audio/mpga": return "mp3";
    case "audio/ogg": return "ogg";
    case "audio/wav":
    case "audio/x-wav": return "wav";
    case "audio/webm": return "webm";
    default: return null;
  }
}

export function transcriptFromProviderPayload(value: unknown) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const transcript = (value as { text?: unknown }).text;
  return typeof transcript === "string" ? transcript.trim() : null;
}
