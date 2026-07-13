export type GoogleMapsBrowserConfigState =
  | { available: true; browserKey: string; appOrigin: string | null }
  | { available: false; reason: "disabled" | "missing_browser_key" };

export function getGoogleMapsBrowserConfig(): GoogleMapsBrowserConfigState {
  const enabled = process.env.NEXT_PUBLIC_GOOGLE_MAPS_ENABLED?.trim().toLowerCase();
  if (enabled !== "true") return { available: false, reason: "disabled" };
  const browserKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY?.trim();
  if (!browserKey) return { available: false, reason: "missing_browser_key" };
  return { available: true, browserKey, appOrigin: process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() || null };
}
