import type { VoiceMemo, VoiceMemoInsert } from "@/lib/database.types";

export const VOICE_MEMO_BUCKET = "adhdice-voice-memos";
export const VOICE_MEMO_SIGNED_URL_SECONDS = 60 * 60;
export const MAX_VOICE_MEMO_FILE_BYTES = 10 * 1024 * 1024;

export function voiceMemoFileExtension(mimeType: string) {
  const baseMimeType = mimeType.split(";", 1)[0]?.toLowerCase() ?? "";
  if (baseMimeType === "audio/mp4") return "m4a";
  if (baseMimeType === "audio/ogg") return "ogg";
  if (baseMimeType === "audio/wav" || baseMimeType === "audio/x-wav") return "wav";
  if (baseMimeType === "audio/mpeg" || baseMimeType === "audio/mp3") return "mp3";
  return "webm";
}

export function getVoiceMemoStoragePath(userId: string, memoId: string, mimeType: string) {
  return `${userId}/${memoId}.${voiceMemoFileExtension(mimeType)}`;
}

export async function persistVoiceMemo({
  insert,
  removeUploadedObject,
  upload,
}: {
  insert: () => Promise<VoiceMemo>;
  removeUploadedObject: () => Promise<void>;
  upload: () => Promise<void>;
}) {
  await upload();
  try {
    return await insert();
  } catch (error) {
    try {
      await removeUploadedObject();
    } catch {
      // The original metadata failure remains the user-visible failure. Cleanup is best effort.
    }
    throw error;
  }
}

export async function deleteVoiceMemoStorageThenRow({
  deleteRow,
  removeStorageObject,
}: {
  deleteRow: () => Promise<void>;
  removeStorageObject: () => Promise<void>;
}) {
  await removeStorageObject();
  await deleteRow();
}

export function buildVoiceMemoInsert(input: Omit<VoiceMemoInsert, "id" | "storage_path"> & { id: string; storage_path: string }): VoiceMemoInsert {
  return input;
}
