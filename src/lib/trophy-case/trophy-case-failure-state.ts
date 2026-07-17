export type TrophyRendererRuntimeFailureReason = "renderer-error" | "context-lost" | "dynamic-import-error";
export type TrophyRendererFallbackReason = "none" | "explicit-static" | "detection-failed" | TrophyRendererRuntimeFailureReason;

export type TrophyRendererFailureState = {
  contextLossPending: boolean;
  failureCount: number;
  fallbackReason: TrophyRendererRuntimeFailureReason | "none";
  lastFailureAt: string | null;
  latestFailureReason: TrophyRendererRuntimeFailureReason | null;
  retryKey: number;
};

export type PersistedTrophyRendererFailureState = {
  appVersion: string;
  failureCount: number;
  lastFailureAt: string | null;
  latestFailureReason: TrophyRendererRuntimeFailureReason | null;
  userId: string;
};

export type TrophyRendererFailureAction =
  | { at: string; reason: "renderer-error" | "dynamic-import-error"; type: "fail" }
  | { at: string; type: "context-lost" }
  | { type: "context-restored" | "context-restore-timeout" | "manual-retry" };

export const INITIAL_TROPHY_RENDERER_FAILURE_STATE: TrophyRendererFailureState = {
  contextLossPending: false,
  failureCount: 0,
  fallbackReason: "none",
  lastFailureAt: null,
  latestFailureReason: null,
  retryKey: 0,
};
export const TROPHY_RENDERER_AUTOMATIC_RETRY_LIMIT = 2;
export const TROPHY_CONTEXT_RESTORE_GRACE_MS = 2000;

export function trophyRendererFailureReducer(state: TrophyRendererFailureState, action: TrophyRendererFailureAction): TrophyRendererFailureState {
  if (action.type === "manual-retry") return { ...state, contextLossPending: false, fallbackReason: "none", retryKey: state.retryKey + 1 };
  if (action.type === "context-restored") return { ...state, contextLossPending: false, fallbackReason: "none", retryKey: state.retryKey + 1 };
  if (action.type === "context-restore-timeout") return { ...state, contextLossPending: false, fallbackReason: "context-lost" };
  if (action.type === "context-lost") return {
    ...state,
    contextLossPending: true,
    failureCount: state.failureCount + 1,
    fallbackReason: "none",
    lastFailureAt: action.at,
    latestFailureReason: "context-lost",
  };
  return {
    ...state,
    contextLossPending: false,
    failureCount: state.failureCount + 1,
    fallbackReason: action.reason,
    lastFailureAt: action.at,
    latestFailureReason: action.reason,
  };
}

export function canAutomaticallyRetryTrophyRenderer(state: TrophyRendererFailureState) {
  return state.failureCount < TROPHY_RENDERER_AUTOMATIC_RETRY_LIMIT;
}

export function canRetryTrophyRenderer() { return true; }

export function resolveTrophyRendererFallbackReason(input: {
  explicitStatic: boolean;
  runtimeReason: TrophyRendererFailureState["fallbackReason"];
  webGLSupported: boolean | null;
}): TrophyRendererFallbackReason {
  if (input.explicitStatic) return "explicit-static";
  if (input.runtimeReason !== "none") return input.runtimeReason;
  if (input.webGLSupported === false) return "detection-failed";
  return "none";
}

export function persistTrophyRendererFailureState(state: TrophyRendererFailureState, userId: string, appVersion: string): PersistedTrophyRendererFailureState {
  return {
    appVersion,
    failureCount: state.failureCount,
    lastFailureAt: state.lastFailureAt,
    latestFailureReason: state.latestFailureReason,
    userId,
  };
}

export function hydrateTrophyRendererFailureState(value: unknown, userId: string, appVersion: string): TrophyRendererFailureState {
  if (!value || typeof value !== "object") return INITIAL_TROPHY_RENDERER_FAILURE_STATE;
  const candidate = value as Partial<PersistedTrophyRendererFailureState>;
  const reason = candidate.latestFailureReason;
  if (candidate.userId !== userId || candidate.appVersion !== appVersion || !Number.isInteger(candidate.failureCount) || (reason !== null && reason !== "renderer-error" && reason !== "context-lost" && reason !== "dynamic-import-error")) {
    return INITIAL_TROPHY_RENDERER_FAILURE_STATE;
  }
  return {
    ...INITIAL_TROPHY_RENDERER_FAILURE_STATE,
    failureCount: Math.max(0, candidate.failureCount as number),
    lastFailureAt: typeof candidate.lastFailureAt === "string" ? candidate.lastFailureAt : null,
    latestFailureReason: reason ?? null,
  };
}

export function classifyTrophyRendererError(error: unknown): TrophyRendererRuntimeFailureReason {
  if (error instanceof Error && (error.name === "TrophyDynamicImportError" || /chunk|dynamically imported module|module script/i.test(error.message))) return "dynamic-import-error";
  return "renderer-error";
}

export function isLikelyWebGLRendererCreationError(error: unknown) {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /WebGLRenderer|WebGL context|creating WebGL|webglcontextcreationerror/i.test(message);
}

export function detectWebGL2Support(canvasFactory?: () => HTMLCanvasElement) {
  if (!canvasFactory && typeof document === "undefined") return false;
  const createCanvas = canvasFactory ?? (() => document.createElement("canvas"));
  let context: WebGL2RenderingContext | null = null;
  try { context = createCanvas().getContext("webgl2", { failIfMajorPerformanceCaveat: true }); } catch { /* ordinary WebGL2 may still work */ }
  if (!context) {
    try { context = createCanvas().getContext("webgl2"); } catch { return false; }
  }
  const supported = Boolean(context);
  try { context?.getExtension("WEBGL_lose_context")?.loseContext(); } catch { /* releasing a temporary probe is best effort */ }
  return supported;
}
