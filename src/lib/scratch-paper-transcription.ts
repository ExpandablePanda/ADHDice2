import type { createBrowserSupabaseClient } from "@/lib/supabase";

type BrowserSupabaseClient = NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;

function scratchRecordingExtension(mimeType: string) {
  const baseMimeType = mimeType.split(";", 1)[0]?.toLowerCase() ?? "";
  if (baseMimeType === "audio/mp4") return "m4a";
  if (baseMimeType === "audio/ogg") return "ogg";
  if (baseMimeType === "audio/wav" || baseMimeType === "audio/x-wav") return "wav";
  if (baseMimeType === "audio/mpeg" || baseMimeType === "audio/mp3") return "mp3";
  return "webm";
}

function isTranscriptResponse(value: unknown): value is { transcript: string } {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && typeof (value as { transcript?: unknown }).transcript === "string";
}

export async function transcribeScratchAudio(client: BrowserSupabaseClient | null, audio: Blob) {
  if (!client) throw new Error("Scratch transcription is unavailable.");
  const formData = new FormData();
  formData.append("file", audio, `scratch-recording.${scratchRecordingExtension(audio.type)}`);
  const { data, error } = await client.functions.invoke<unknown>("scratch-transcribe", { body: formData });
  if (error || !isTranscriptResponse(data)) throw new Error("Scratch transcription is unavailable.");
  return data.transcript;
}
