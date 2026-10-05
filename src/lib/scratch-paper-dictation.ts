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
  if (/[([{\"']$/.test(left) || /^[\])},.!?;:]/.test(right)) return false;
  return true;
}

/**
 * Inserts final speech text into the serialized Scratch Paper body.
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

export type ScratchSpeechRecognitionResult = {
  isFinal: boolean;
  [index: number]: { transcript?: string } | undefined;
};

export type ScratchSpeechRecognitionResultEvent = {
  resultIndex?: number;
  results: ArrayLike<ScratchSpeechRecognitionResult>;
};

export type ScratchSpeechRecognitionErrorEvent = {
  error?: string;
};

export type ScratchSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onend: (() => void) | null;
  onerror: ((event: ScratchSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: ScratchSpeechRecognitionResultEvent) => void) | null;
  start: () => void;
  stop: () => void;
};

export type ScratchSpeechRecognitionConstructor = new () => ScratchSpeechRecognition;
export type ScratchSpeechRecognitionFactory = () => ScratchSpeechRecognition | null;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: ScratchSpeechRecognitionConstructor;
  webkitSpeechRecognition?: ScratchSpeechRecognitionConstructor;
};

export function getScratchSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  const speechWindow = window as SpeechRecognitionWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function isScratchSpeechRecognitionSupported() {
  return getScratchSpeechRecognitionConstructor() !== null;
}

export function createScratchSpeechRecognition(): ScratchSpeechRecognition | null {
  const Constructor = getScratchSpeechRecognitionConstructor();
  if (!Constructor) return null;

  const recognition = new Constructor();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";
  recognition.maxAlternatives = 1;
  return recognition;
}

export type ScratchDictationControllerOptions = {
  dismissPicker?: () => void;
  getBody: () => string;
  getCaretRange: () => ScratchEditorRange | null;
  getNoteKey: () => string;
  isPickerOpen?: () => boolean;
  onBodyChange: (body: string, range: ScratchEditorRange) => void;
  onError: (message: string | null) => void;
  onListeningChange: (isListening: boolean) => void;
  recognitionFactory?: ScratchSpeechRecognitionFactory;
};

function speechErrorMessage(error: string | undefined) {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "Microphone permission was denied.";
  }
  return "Voice dictation unavailable.";
}

export class ScratchDictationController {
  private readonly options: ScratchDictationControllerOptions;
  private readonly recognitionFactory: ScratchSpeechRecognitionFactory;
  private activeSession: {
    body: string;
    id: number;
    insertionRange: ScratchEditorRange;
    noteKey: string;
    recognition: ScratchSpeechRecognition;
  } | null = null;
  private nextSessionId = 0;

  constructor(options: ScratchDictationControllerOptions) {
    this.options = options;
    this.recognitionFactory = options.recognitionFactory ?? createScratchSpeechRecognition;
  }

  get isListening() {
    return this.activeSession !== null;
  }

  get isSupported() {
    return this.recognitionFactory === createScratchSpeechRecognition
      ? isScratchSpeechRecognitionSupported()
      : true;
  }

  start() {
    this.stop();
    this.options.onError(null);
    if (!this.isSupported) {
      this.options.onError("Voice dictation is not available in this browser.");
      return false;
    }

    if (this.options.isPickerOpen?.()) {
      this.options.dismissPicker?.();
    }

    const recognition = this.recognitionFactory();
    if (!recognition) {
      this.options.onError("Voice dictation unavailable.");
      return false;
    }

    const id = ++this.nextSessionId;
    const body = this.options.getBody();
    const savedRange = this.options.getCaretRange() ?? { end: body.length, start: body.length };
    const session = {
      body,
      id,
      insertionRange: savedRange,
      noteKey: this.options.getNoteKey(),
      recognition,
    };
    this.activeSession = session;
    recognition.onresult = (event) => this.handleResult(session, event);
    recognition.onend = () => this.finishSession(session);
    recognition.onerror = (event) => this.finishSession(session, speechErrorMessage(event.error));
    this.options.onListeningChange(true);

    try {
      recognition.start();
      return true;
    } catch {
      this.finishSession(session, "Voice dictation unavailable.");
      return false;
    }
  }

  stop() {
    const session = this.activeSession;
    if (!session) return;
    this.activeSession = null;
    this.options.onListeningChange(false);
    try {
      session.recognition.stop();
    } catch {
      // A browser may throw when the service has already ended.
    }
  }

  private finishSession(session: NonNullable<ScratchDictationController["activeSession"]>, error?: string) {
    if (this.activeSession?.id !== session.id) return;
    this.activeSession = null;
    this.options.onListeningChange(false);
    if (error) {
      try {
        session.recognition.stop();
      } catch {
        // The browser may already have stopped the service after an error.
      }
      this.options.onError(error);
    }
  }

  private handleResult(
    session: NonNullable<ScratchDictationController["activeSession"]>,
    event: ScratchSpeechRecognitionResultEvent,
  ) {
    if (this.activeSession?.id !== session.id || this.options.getNoteKey() !== session.noteKey) return;
    const firstChangedResult = Math.max(0, Math.trunc(event.resultIndex ?? 0));
    for (let index = firstChangedResult; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (!result?.isFinal) continue;
      const transcript = result[0]?.transcript ?? "";
      if (!transcript) continue;

      const inserted = insertScratchDictationText(session.body, session.insertionRange, transcript);
      session.body = inserted.body;
      session.insertionRange = { end: inserted.caretOffset, start: inserted.caretOffset };
      this.options.onBodyChange(session.body, session.insertionRange);
    }
  }
}
