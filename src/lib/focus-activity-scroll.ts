export type FocusActivityScrollMetrics = {
  clientWidth: number;
  scrollLeft: number;
  scrollWidth: number;
};

export function getFocusActivityScrollAvailability({ clientWidth, scrollLeft, scrollWidth }: FocusActivityScrollMetrics) {
  return {
    canScrollLeft: scrollLeft > 2,
    canScrollRight: scrollLeft + clientWidth < scrollWidth - 2,
  };
}

export function getFocusActivityScrollDistance(clientWidth: number) {
  return Math.max(160, clientWidth * 0.75);
}

export function getFocusActivityScrollBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? "auto" : "smooth";
}
