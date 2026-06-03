import {
  parseAppleHealthBuffer,
  type AppleHealthImportParseProgress,
  type AppleHealthImportPreview,
} from "@/lib/health-apple-import-core";

type ParseMessage = {
  buffer: ArrayBuffer;
  fileName: string;
  type: "parse";
};

type WorkerResponse = {
  error?: string;
  preview?: AppleHealthImportPreview;
  progress?: AppleHealthImportParseProgress;
  type: "error" | "progress" | "success";
};

self.onmessage = async (event: MessageEvent<ParseMessage>) => {
  if (event.data.type !== "parse") {
    return;
  }

  try {
    const preview = await parseAppleHealthBuffer(event.data.buffer, event.data.fileName, {
      onProgress(progress) {
        const response: WorkerResponse = { progress, type: "progress" };
        self.postMessage(response);
      },
    });
    const response: WorkerResponse = { preview, type: "success" };
    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      error: error instanceof Error ? error.message : "Apple Health import could not be parsed.",
      type: "error",
    };
    self.postMessage(response);
  }
};
