export const PAGE_SHELL_NAVIGATION_GAP_PX = 12;
export const PAGE_SHELL_NAVIGATION_RECT_TOLERANCE_PX = 1;

export type PageShellNavigationRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export function isPageShellNavigationRectUsable(rect: PageShellNavigationRect) {
  return Number.isFinite(rect.top)
    && Number.isFinite(rect.left)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width > 0
    && rect.height > 0;
}

export function arePageShellNavigationRectsStable(
  previous: PageShellNavigationRect,
  current: PageShellNavigationRect,
  tolerance = PAGE_SHELL_NAVIGATION_RECT_TOLERANCE_PX,
) {
  return Math.abs(previous.top - current.top) <= tolerance
    && Math.abs(previous.left - current.left) <= tolerance
    && Math.abs(previous.width - current.width) <= tolerance
    && Math.abs(previous.height - current.height) <= tolerance;
}

export function getPageShellNavigationScrollTop(
  scrollY: number,
  shellTop: number,
  headerBottom: number,
  gap = PAGE_SHELL_NAVIGATION_GAP_PX,
) {
  return Math.max(0, scrollY + shellTop - headerBottom - gap);
}
