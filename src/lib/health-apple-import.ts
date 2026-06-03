"use client";

export {
  parseAppleHealthBuffer,
  parseAppleHealthFile,
  parseAppleHealthXml,
  type AppleHealthImportParseProgress,
  type AppleHealthImportPreview,
} from "@/lib/health-apple-import-core";

import {
  parseAppleHealthFile,
  type AppleHealthImportParseProgress,
  type AppleHealthImportPreview,
} from "@/lib/health-apple-import-core";

export async function parseAppleHealthFileInWorker(
  file: File,
  options?: { onProgress?: (progress: AppleHealthImportParseProgress) => void; signal?: AbortSignal },
) {
  if (typeof Worker === "undefined") {
    return parseAppleHealthFile(file, options);
  }

  const buffer = await file.arrayBuffer();

  return await new Promise<AppleHealthImportPreview>((resolve, reject) => {
    const worker = new Worker(new URL("./health-apple-import-worker.ts", import.meta.url), { type: "module" });

    const cleanup = () => {
      worker.terminate();
      options?.signal?.removeEventListener("abort", handleAbort);
    };

    const handleAbort = () => {
      cleanup();
      reject(new DOMException("Apple Health import was canceled.", "AbortError"));
    };

    worker.onmessage = (event: MessageEvent<{
      error?: string;
      preview?: AppleHealthImportPreview;
      progress?: AppleHealthImportParseProgress;
      type: "error" | "progress" | "success";
    }>) => {
      const payload = event.data;
      if (payload.type === "progress" && payload.progress) {
        options?.onProgress?.(payload.progress);
        return;
      }
      cleanup();
      if (payload.type === "error") {
        reject(new Error(payload.error ?? "Apple Health import could not be parsed."));
        return;
      }
      if (payload.preview) {
        resolve(payload.preview);
        return;
      }
      reject(new Error("Apple Health import worker returned no preview."));
    };

    worker.onerror = () => {
      cleanup();
      void parseAppleHealthFile(file, options).then(resolve).catch(reject);
    };

    if (options?.signal) {
      if (options.signal.aborted) {
        handleAbort();
        return;
      }
      options.signal.addEventListener("abort", handleAbort, { once: true });
    }

    worker.postMessage({
      buffer,
      fileName: file.name,
      type: "parse",
    });
  });
}
