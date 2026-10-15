export type NavigationDockPoint = { x: number; y: number };

export function clampNavigationBubblePosition(
  x: number,
  y: number,
  width: number,
  height: number,
  bubbleSize = 64,
  gutter = 12,
): NavigationDockPoint {
  const maxX = Math.max(0, width - bubbleSize);
  const maxY = Math.max(0, height - bubbleSize);
  const minX = Math.min(gutter, maxX);
  const minY = Math.min(gutter, maxY);

  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };
}
