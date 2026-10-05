import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  audioFileExtension,
  isSupportedAudioMimeType,
  MAX_AUDIO_BYTES,
  normalizeAudioMimeType,
  OPENAI_TRANSCRIPTION_MODEL,
  OPENAI_TRANSCRIPTIONS_URL,
  transcriptFromProviderPayload,
} from "../supabase/functions/scratch-transcribe/domain.ts";

const edgeSource = readFileSync(new URL("../supabase/functions/scratch-transcribe/index.ts", import.meta.url), "utf8");

test("Scratch transcription domain accepts recorded audio families and rejects non-audio", () => {
  assert.equal(normalizeAudioMimeType("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(isSupportedAudioMimeType("audio/mp4;codecs=mp4a.40.2"), true);
  assert.equal(isSupportedAudioMimeType("audio/webm"), true);
  assert.equal(isSupportedAudioMimeType("video/webm"), false);
  assert.equal(audioFileExtension("audio/ogg;codecs=opus"), "ogg");
  assert.equal(audioFileExtension("application/octet-stream"), null);
  assert.equal(transcriptFromProviderPayload({ text: " hello " }), "hello");
  assert.equal(transcriptFromProviderPayload({ text: 4 }), null);
});

test("Edge Function contract requires authenticated users and validates multipart audio payloads", () => {
  assert.match(edgeSource, /withSupabase\(\{ auth: "user" \}/);
  assert.match(edgeSource, /context\.userClaims\?\.id/);
  assert.match(edgeSource, /request\.formData\(\)/);
  assert.match(edgeSource, /uploadedFile instanceof Blob/);
  assert.match(edgeSource, /uploadedFile\.size <= 0/);
  assert.match(edgeSource, /uploadedFile\.size > MAX_AUDIO_BYTES/);
  assert.match(edgeSource, /isSupportedAudioMimeType\(mimeType\)/);
  assert.equal(MAX_AUDIO_BYTES, 10 * 1024 * 1024);
});

test("provider selection and credential stay server-side, with a sanitized response", () => {
  assert.match(edgeSource, /Deno\.env\.get\("OPENAI_API_KEY"\)/);
  assert.match(edgeSource, /Authorization: `Bearer \$\{openAiApiKey\}`/);
  assert.match(edgeSource, /OPENAI_TRANSCRIPTION_MODEL/);
  assert.match(edgeSource, /OPENAI_TRANSCRIPTIONS_URL/);
  assert.match(edgeSource, /return json\(\{ transcript \}, 200\)/);
  assert.doesNotMatch(edgeSource, /NEXT_PUBLIC|SUPABASE_SERVICE_ROLE|console\.log/);
  assert.doesNotMatch(edgeSource, /\.storage\b|upload\(/);
  assert.equal(OPENAI_TRANSCRIPTION_MODEL, "gpt-4o-mini-transcribe");
  assert.equal(OPENAI_TRANSCRIPTIONS_URL, "https://api.openai.com/v1/audio/transcriptions");
});

test("the provider receives the actual audio MIME and the function does not persist audio", () => {
  assert.match(edgeSource, /new File\(\[uploadedFile\], filename, \{ type: mimeType \}\)/);
  assert.match(edgeSource, /providerForm\.append\("file"/);
  assert.match(edgeSource, /providerForm\.append\("response_format", "json"\)/);
  assert.doesNotMatch(edgeSource, /supabase\.storage|from\("adhdice_/);
});
