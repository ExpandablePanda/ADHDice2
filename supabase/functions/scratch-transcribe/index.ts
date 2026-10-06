import { withSupabase } from "npm:@supabase/server@1.4.1";

import {
  audioFileExtension,
  isSupportedAudioMimeType,
  MAX_AUDIO_BYTES,
  normalizeAudioMimeType,
  GROQ_TRANSCRIPTION_MODEL,
  GROQ_TRANSCRIPTIONS_URL,
  transcriptFromProviderPayload,
} from "./domain.ts";

function json(payload: unknown, status: number) {
  return Response.json(payload, {
    headers: { "Cache-Control": "no-store" },
    status,
  });
}

export default {
  fetch: withSupabase({ auth: "user" }, async (request, context) => {
    if (request.method !== "POST") return json({ error: "Only POST is supported." }, 405);
    if (typeof context.userClaims?.id !== "string" || !context.userClaims.id) {
      return json({ error: "A verified Supabase user is required." }, 401);
    }

    const groqApiKey = Deno.env.get("GROQ_API_KEY");
    if (!groqApiKey) return json({ error: "Transcription is not configured." }, 503);

    const declaredBytes = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_AUDIO_BYTES) {
      return json({ error: "Audio recording is too large." }, 413);
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return json({ error: "Audio upload could not be read." }, 400);
    }

    const uploadedFile = formData.get("file");
    if (!(uploadedFile instanceof Blob) || uploadedFile.size <= 0) {
      return json({ error: "An audio recording is required." }, 400);
    }
    if (uploadedFile.size > MAX_AUDIO_BYTES) {
      return json({ error: "Audio recording is too large." }, 413);
    }

    const mimeType = normalizeAudioMimeType(uploadedFile.type);
    const extension = audioFileExtension(mimeType);
    if (!isSupportedAudioMimeType(mimeType) || !extension) {
      return json({ error: "This audio format is not supported." }, 415);
    }

    const filename = uploadedFile instanceof File && uploadedFile.name.trim()
      ? uploadedFile.name
      : `scratch-recording.${extension}`;
    const providerForm = new FormData();
    providerForm.append("file", new File([uploadedFile], filename, { type: mimeType }));
    providerForm.append("model", GROQ_TRANSCRIPTION_MODEL);
    providerForm.append("response_format", "json");

    let providerResponse: Response;
    try {
      providerResponse = await fetch(GROQ_TRANSCRIPTIONS_URL, {
        body: providerForm,
        headers: { Authorization: `Bearer ${groqApiKey}` },
        method: "POST",
      });
    } catch {
      return json({ error: "Transcription service is temporarily unavailable." }, 503);
    }

    if (providerResponse.status === 429) {
      return json({ error: "Transcription service is temporarily unavailable." }, 503);
    }
    if (!providerResponse.ok) {
      return json({ error: "Transcription service rejected the recording." }, 502);
    }

    let providerPayload: unknown;
    try {
      providerPayload = await providerResponse.json();
    } catch {
      return json({ error: "Transcription service returned an invalid response." }, 502);
    }

    const transcript = transcriptFromProviderPayload(providerPayload);
    if (transcript === null) return json({ error: "Transcription service returned no transcript." }, 502);
    return json({ transcript }, 200);
  }),
};
