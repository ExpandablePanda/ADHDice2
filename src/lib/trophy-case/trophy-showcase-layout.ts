export const TROPHY_SHOWCASE_CAMERA_DISTANCE = 5.4;
export const TROPHY_SHOWCASE_CAMERA_FOV = 32;
export const TROPHY_SHOWCASE_STAGE_FILL = 0.72;

export type TrophyShowcaseStage = {
  position: [number, number, number];
  scale: number;
};

export function getTrophyShowcaseStageLayout(width: number, height: number, columns: 2 | 4): TrophyShowcaseStage[] {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const rows = 4 / columns;
  const stageWidth = safeWidth / columns;
  const stageHeight = safeHeight / rows;
  const viewportHeight = 2 * TROPHY_SHOWCASE_CAMERA_DISTANCE * Math.tan((TROPHY_SHOWCASE_CAMERA_FOV * Math.PI) / 360);
  const worldPerPixel = viewportHeight / safeHeight;
  const scale = (Math.min(stageWidth, stageHeight) / safeHeight) * TROPHY_SHOWCASE_STAGE_FILL;

  return Array.from({ length: 4 }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const centerX = column * stageWidth + stageWidth / 2;
    const centerY = row * stageHeight + stageHeight / 2;
    return {
      position: [(centerX - safeWidth / 2) * worldPerPixel, (safeHeight / 2 - centerY) * worldPerPixel, 0],
      scale,
    };
  });
}
