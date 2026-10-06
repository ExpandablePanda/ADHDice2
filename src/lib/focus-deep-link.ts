export const ADHDICE_FOCUS_DEEP_LINK = "adhdice://focus";

export type FocusDeepLinkDestination = "Focus";

export function parseFocusDeepLink(value: unknown): FocusDeepLinkDestination | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  try {
    const url = new URL(value);
    if (
      url.protocol.toLowerCase() !== "adhdice:"
      || url.hostname.toLowerCase() !== "focus"
      || (url.pathname !== "" && url.pathname !== "/")
      || url.search !== ""
      || url.hash !== ""
    ) {
      return null;
    }
    return "Focus";
  } catch {
    return null;
  }
}

export function shouldApplyPendingFocusDeepLink(input: {
  hasPendingRequest: boolean;
  isAuthenticated: boolean;
  isNativeIos: boolean;
  isRestoringUiState: boolean;
  isAuthenticatedAppBootReady: boolean;
}) {
  return input.hasPendingRequest
    && input.isAuthenticated
    && input.isNativeIos
    && !input.isRestoringUiState
    && input.isAuthenticatedAppBootReady;
}
