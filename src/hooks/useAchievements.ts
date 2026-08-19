import { useEffect, useMemo, useReducer } from "react";

import type { AppendEconomyEventOpts } from "@/hooks/useEconomy";
import {
  ACHIEVEMENT_SET_META,
  buildAchievementMetricSnapshot,
  buildAchievementSetSummaries,
  evaluateAchievements,
  getChargedSetCodes,
  planAchievementUnlocks,
  type AchievementSetCode,
  type AchievementSetSummary,
  type AchievementUnlockRecord,
} from "@/lib/achievements";
import type { HealthAchievementAward, Task, TaskHistory as DbTaskHistory } from "@/lib/database.types";
import type { TaskHistoryStats } from "@/lib/task-history";
import type { HistoricalFocusSession } from "@/lib/types";

type AchievementStore = {
  chargedSetCodes: AchievementSetCode[];
  unlocks: AchievementUnlockRecord[];
  unlockedFaceIds: string[];
  version: 1;
};

type SetMessage = (message: { tone: "neutral" | "good" | "warn"; text: string } | null) => void;

type UseAchievementsArgs = {
  appendEconomyEvent: (opts: AppendEconomyEventOpts) => Promise<void>;
  currentUserId: string | null;
  focusHistory: HistoricalFocusSession[];
  healthAwards: HealthAchievementAward[];
  setMessage: SetMessage;
  taskHistory: DbTaskHistory[];
  taskHistoryStats: TaskHistoryStats;
  tasks: Task[];
};

const STORAGE_VERSION = 1;

type AchievementUiState = {
  celebrationQueue: AchievementUnlockRecord[];
  ownerId: string | null;
  storageMode: "local";
  store: AchievementStore;
};

type AchievementAction =
  | { type: "dismiss" }
  | { mode: "local"; store: AchievementStore; type: "hydrate"; userId: string | null }
  | { nextStore: AchievementStore; records: AchievementUnlockRecord[]; type: "unlock" };

function storageKey(userId: string) {
  return `adhdice-achievements:${userId}`;
}

function emptyStore(): AchievementStore {
  return {
    chargedSetCodes: [],
    unlocks: [],
    unlockedFaceIds: [],
    version: STORAGE_VERSION,
  };
}

function readStoredAchievements(userId: string): AchievementStore {
  if (typeof window === "undefined") {
    return emptyStore();
  }

  const rawValue = window.localStorage.getItem(storageKey(userId));
  if (!rawValue) {
    return emptyStore();
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<AchievementStore>;
    return {
      chargedSetCodes: Array.isArray(parsed.chargedSetCodes) ? parsed.chargedSetCodes : [],
      unlocks: Array.isArray(parsed.unlocks) ? parsed.unlocks : [],
      unlockedFaceIds: Array.isArray(parsed.unlockedFaceIds) ? parsed.unlockedFaceIds : [],
      version: STORAGE_VERSION,
    };
  } catch {
    window.localStorage.removeItem(storageKey(userId));
    return emptyStore();
  }
}

function persistAchievements(userId: string, store: AchievementStore) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey(userId), JSON.stringify(store));
}

function appendNewUnlocks(existing: AchievementUnlockRecord[], next: AchievementUnlockRecord[]) {
  const seen = new Set(existing.map((entry) => entry.id));
  const deduped = next.filter((entry) => !seen.has(entry.id));
  return [...deduped, ...existing].sort((left, right) => right.earnedAt.localeCompare(left.earnedAt));
}

function createUiState(userId: string | null): AchievementUiState {
  return {
    celebrationQueue: [],
    ownerId: userId,
    storageMode: "local",
    store: userId ? readStoredAchievements(userId) : emptyStore(),
  };
}

function achievementReducer(state: AchievementUiState, action: AchievementAction): AchievementUiState {
  switch (action.type) {
    case "hydrate":
      return {
        celebrationQueue: [],
        ownerId: action.userId,
        storageMode: action.mode,
        store: action.store,
      };
    case "unlock":
      return {
        ...state,
        celebrationQueue: [...state.celebrationQueue, ...action.records],
        store: action.nextStore,
      };
    case "dismiss":
      return {
        ...state,
        celebrationQueue: state.celebrationQueue.slice(1),
      };
    default:
      return state;
  }
}

export function useAchievements({
  appendEconomyEvent,
  currentUserId,
  focusHistory,
  healthAwards,
  setMessage,
  taskHistory,
  taskHistoryStats,
  tasks,
}: UseAchievementsArgs) {
  const [state, dispatch] = useReducer(achievementReducer, currentUserId, createUiState);

  useEffect(() => {
    if (!currentUserId) {
      dispatch({
        mode: "local",
        store: emptyStore(),
        type: "hydrate",
        userId: null,
      });
      return;
    }

    const localStore = readStoredAchievements(currentUserId);
    dispatch({
      mode: "local",
      store: localStore,
      type: "hydrate",
      userId: currentUserId,
    });

  }, [currentUserId]);

  const metrics = useMemo(
    () => buildAchievementMetricSnapshot({
      focusHistory,
      healthAwards,
      taskHistory,
      taskHistoryStats,
      tasks,
    }),
    [focusHistory, healthAwards, taskHistory, taskHistoryStats, tasks],
  );
  const evaluations = useMemo(() => evaluateAchievements(metrics), [metrics]);
  const store = state.ownerId === currentUserId ? state.store : currentUserId ? readStoredAchievements(currentUserId) : emptyStore();

  useEffect(() => {
    if (!currentUserId || state.ownerId !== currentUserId) {
      return;
    }

    const earnedAt = new Date().toISOString();
    const {
      newChargedRecords,
      newFaceRecords,
      nextChargedSetCodes,
      nextUnlockedFaceIds,
    } = planAchievementUnlocks({
      earnedAt,
      evaluations,
      existingChargedSetCodes: store.chargedSetCodes,
      existingUnlockedFaceIds: store.unlockedFaceIds,
    });

    if (newFaceRecords.length === 0 && newChargedRecords.length === 0) {
      return;
    }

    void (async () => {
      const candidates = [...newFaceRecords, ...newChargedRecords];
      const recognizedRecords: AchievementUnlockRecord[] = [];
      const celebrationRecords: AchievementUnlockRecord[] = [];

      recognizedRecords.push(...candidates);
      celebrationRecords.push(...candidates);

      if (recognizedRecords.length === 0) {
        return;
      }

      const nextStore: AchievementStore = {
        chargedSetCodes: nextChargedSetCodes,
        unlocks: appendNewUnlocks(store.unlocks, recognizedRecords),
        unlockedFaceIds: nextUnlockedFaceIds,
        version: STORAGE_VERSION,
      };

      dispatch({ nextStore, records: celebrationRecords, type: "unlock" });
      persistAchievements(currentUserId, nextStore);

      for (const unlock of celebrationRecords) {
        if (unlock.rewardXp > 0) {
          try {
            await appendEconomyEvent({
              points: 0,
              reason: unlock.kind === "charged_die"
                ? `Charged die completed: ${ACHIEVEMENT_SET_META[unlock.setCode].title}`
                : `Achievement unlocked: ${unlock.title}`,
              refId: unlock.id,
              source: "system",
              xp: unlock.rewardXp,
            });
          } catch (error) {
            setMessage({
              text: error instanceof Error ? error.message : "Achievement reward XP could not be awarded.",
              tone: "warn",
            });
          }
        }
      }
    })();
  }, [appendEconomyEvent, currentUserId, evaluations, setMessage, state.ownerId, store]);

  const chargedSetCodes = useMemo(() => getChargedSetCodes(store.unlockedFaceIds), [store.unlockedFaceIds]);
  const setSummaries = useMemo<AchievementSetSummary[]>(
    () => buildAchievementSetSummaries({
      chargedSetCodes,
      evaluations,
      unlockedFaceIds: store.unlockedFaceIds,
    }),
    [chargedSetCodes, evaluations, store.unlockedFaceIds],
  );
  const latestUnlock = store.unlocks[0] ?? null;
  const unlockedFaceCount = store.unlockedFaceIds.length;
  const totalFaces = evaluations.length;
  const completionPercent = totalFaces === 0 ? 0 : Math.round((unlockedFaceCount / totalFaces) * 100);
  const nextSet = setSummaries
    .filter((setSummary) => !setSummary.isCharged)
    .sort((left, right) => right.unlockedCount - left.unlockedCount || left.id.localeCompare(right.id))[0] ?? null;

  const activeCelebration = state.ownerId === currentUserId ? state.celebrationQueue[0] ?? null : null;

  function dismissCelebration() {
    dispatch({ type: "dismiss" });
  }

  return {
    activeCelebration,
    chargedSetCodes,
    completionPercent,
    dismissCelebration,
    latestUnlock,
    nextSet,
    setSummaries,
    storageMode: state.storageMode,
    totalFaces,
    unlockedFaceCount,
  };
}
