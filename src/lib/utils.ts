import { formatDateKeyInTimeZone, getLogicalDayKey, getBrowserTimeZone } from "@/lib/logical-day";

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayISO(): string {
  return getLogicalDayKey();
}

export function todayISOInTimeZone(timezone: string): string {
  return formatDateKeyInTimeZone(new Date(), timezone || getBrowserTimeZone());
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function playSound(src: string): void {
  new Audio(withBasePath(src)).play().catch(() => {});
}

export function withBasePath(path: string): string {
  if (!path) return path;
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  if (path.startsWith(basePath)) return path;
  return `${basePath}${path.startsWith("/") ? "" : "/"}${path}`;
}
