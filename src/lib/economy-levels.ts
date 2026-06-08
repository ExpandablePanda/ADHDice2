export type LevelProgress = {
  currentLevelXp: number;
  level: number;
  nextLevelThresholdXp: number;
  percentToNextLevel: number;
  previousLevelThresholdXp: number;
  xpIntoLevel: number;
  xpNeededForLevel: number;
};

function getThresholdForLevel(level: number) {
  if (level <= 1) {
    return 100;
  }

  return 100 + ((level - 1) * 200);
}

export function getLevelFromXp(xp: number) {
  const safeXp = Math.max(0, xp);
  let level = 1;

  while (safeXp >= getThresholdForLevel(level)) {
    level += 1;
  }

  return level;
}

export function getLevelProgress(xp: number): LevelProgress {
  const currentLevelXp = Math.max(0, xp);
  const level = getLevelFromXp(currentLevelXp);
  const previousLevelThresholdXp = level === 1 ? 0 : getThresholdForLevel(level - 1);
  const nextLevelThresholdXp = getThresholdForLevel(level);
  const xpIntoLevel = currentLevelXp - previousLevelThresholdXp;
  const xpNeededForLevel = Math.max(1, nextLevelThresholdXp - previousLevelThresholdXp);

  return {
    currentLevelXp,
    level,
    nextLevelThresholdXp,
    percentToNextLevel: Math.max(0, Math.min(100, (xpIntoLevel / xpNeededForLevel) * 100)),
    previousLevelThresholdXp,
    xpIntoLevel,
    xpNeededForLevel,
  };
}

export function getLevelUpsEarned(previousXp: number, nextXp: number) {
  const previousLevel = getLevelFromXp(previousXp);
  const nextLevel = getLevelFromXp(nextXp);
  return Math.max(0, nextLevel - previousLevel);
}
