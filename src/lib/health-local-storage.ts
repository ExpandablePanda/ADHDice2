export type LocalStorageWriter = {
  setItem: (key: string, value: string) => void;
};

export type LocalStorageWriteResult =
  | { ok: true }
  | { ok: false; reason: "quota" | "storage" };

function storageErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") {
    return { code: null, message: "", name: "" };
  }
  const candidate = error as { code?: unknown; message?: unknown; name?: unknown };
  return {
    code: typeof candidate.code === "number" ? candidate.code : null,
    message: typeof candidate.message === "string" ? candidate.message : "",
    name: typeof candidate.name === "string" ? candidate.name.toLowerCase() : "",
  };
}

export function isLocalStorageQuotaError(error: unknown) {
  const { code, message, name } = storageErrorDetails(error);
  if (name === "quotaexceedederror" || name === "ns_error_dom_quota_reached" || name === "quota_exceeded_err") {
    return true;
  }
  if (code === 22 || code === 1014) {
    return true;
  }
  return /(?:quota|storage).*(?:exceed|full|limit)|(?:exceed|full|limit).*(?:quota|storage)/i.test(message);
}

export function writeLocalStorageEntries(
  storage: LocalStorageWriter,
  entries: readonly (readonly [key: string, value: string])[],
): LocalStorageWriteResult {
  for (const [key, value] of entries) {
    try {
      storage.setItem(key, value);
    } catch (error) {
      return { ok: false, reason: isLocalStorageQuotaError(error) ? "quota" : "storage" };
    }
  }
  return { ok: true };
}
