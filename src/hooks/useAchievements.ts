import { useEffect, useMemo, useReducer } from "react";

import type { AppendEconomyEventOpts } from "@/hooks/useEconomy";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
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
import type {
  AchievementUnlock,
  AchievementUnlockInsert,
  HealthAchievementAward,
  Task,
  TaskHistory as DbTaskHistory,
} from "@/lib/database.types";
import type { TaskHistoryStats } from "@/lib/task-history";
import type { HistoricalFocusSession } from "@/lib/types";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;

type AchievementStore = {
  chargedSetCodes: AchievementSetCode[];
  unlocks: AchievementUnlockRecord[];
  unlockedFaceIds: string[];
  version: 1;
};

type SetMessage = (message: { tone: "neutral" | "good" | "warn"; text: string } | null) => void;

type UseAchievementsArgs = {
  appendEconomyEvent: (opts: AppendEconomyEventOpts) => Promise<void>;
  client: SupabaseClient;
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
  storageMode: "local" | "remote";
  store: AchievementStore;
};

type AchievementAction =
  | { type: "dismiss" }
  | { mode: "local" | "remote"; store: AchievementStore; type: "hydrate"; userId: string | null }
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
  client,
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

    if (!client) {
      return;
    }

    let isActive = true;

    void (async () => {
      const { data, error } = await client
        .from("adhdice_achievement_unlocks")
        .select("*")
        .eq("user_id", currentUserId)
        .order("earned_at", { ascending: false });

      if (!isActive) {
        return;
      }

      if (error) {
        if (isMissingAchievementPersistence(error.message)) {
          setMessage({
            text: "Achievements are running in local mode until `supabase/add_achievement_unlocks.sql` is migrated.",
            tone: "neutral",
          });
        } else {
          setMessage({ text: error.message, tone: "warn" });
        }
        return;
      }

      const remoteRows = data ?? [];
      const remoteStore = buildStoreFromRemoteRows(remoteRows);
      const remoteIds = new Set(remoteStore.unlockedFaceIds.concat(remoteStore.chargedSetCodes.map((setCode) => `charged:${setCode}`)));
      const localOnlyUnlocks = localStore.unlocks.filter((unlock) => !remoteIds.has(unlock.id));

      if (localOnlyUnlocks.length > 0) {
        for (const unlock of localOnlyUnlocks) {
          const payload = buildUnlockInsertPayload(currentUserId, unlock);
          const { error: insertError } = await client.from("adhdice_achievement_unlocks").insert(payload);
          if (insertError && !isDuplicateError(insertError.message)) {
            setMessage({ text: insertError.message, tone: "warn" });
          }
        }
      }

      const refreshedRows = localOnlyUnlocks.length > 0
        ? await client
          .from("adhdice_achievement_unlocks")
          .select("*")
          .eq("user_id", currentUserId)
          .order("earned_at", { ascending: false })
        : null;

      const finalRows = refreshedRows?.data ?? remoteRows;
      const finalStore = buildStoreFromRemoteRows(finalRows);

      dispatch({
        mode: "remote",
        store: finalStore,
        type: "hydrate",
        userId: currentUserId,
      });
      persistAchievements(currentUserId, finalStore);
    })();

    return () => {
      isActive = false;
    };
  }, [client, currentUserId, setMessage]);

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

      for (const unlock of candidates) {
        if (client) {
          const payload = buildUnlockInsertPayload(currentUserId, unlock);
          const { data, error } = await client
            .from("adhdice_achievement_unlocks")
            .insert(payload)
            .select("*")
            .single();

          if (error) {
            if (isDuplicateError(error.message)) {
              recognizedRecords.push(unlock);
              continue;
            }
            if (isMissingAchievementPersistence(error.message)) {
              recognizedRecords.push(unlock);
            } else {
              setMessage({
                text: error.message,
                tone: "warn",
              });
              continue;
            }
          } else {
            const persistedRecord = mapAchievementUnlockRow(data ?? payloadToSyntheticRow(payload));
            recognizedRecords.push(persistedRecord);
            celebrationRecords.push(persistedRecord);
          }
        }

        if (!client) {
          recognizedRecords.push(unlock);
          celebrationRecords.push(unlock);
        }
      }

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
  }, [appendEconomyEvent, client, currentUserId, evaluations, setMessage, state.ownerId, store]);

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

function isMissingAchievementPersistence(message: string) {
  return message.includes("adhdice_achievement_unlocks")
    || message.includes("Could not find the table")
    || message.includes("does not exist")
    || message.includes("schema cache");
}

function isDuplicateError(message: string) {
  return message.includes("duplicate") || message.includes("unique");
}

function mapAchievementUnlockRow(row: AchievementUnlock): AchievementUnlockRecord {
  return {
    description: row.description,
    earnedAt: row.earned_at,
    encouragement: row.encouragement,
    face: row.face_level === null ? null : row.face_level as AchievementUnlockRecord["face"],
    id: row.achievement_id,
    kind: row.achievement_kind,
    rewardXp: row.reward_xp,
    setCode: row.set_code as AchievementSetCode,
    title: row.title,
  };
}

function buildStoreFromRemoteRows(rows: AchievementUnlock[]): AchievementStore {
  const unlocks = rows.map(mapAchievementUnlockRow);
  return {
    chargedSetCodes: unlocks
      .filter((unlock) => unlock.kind === "charged_die")
      .map((unlock) => unlock.setCode),
    unlocks,
    unlockedFaceIds: unlocks
      .filter((unlock) => unlock.kind === "face")
      .map((unlock) => unlock.id),
    version: STORAGE_VERSION,
  };
}

function buildUnlockInsertPayload(userId: string, unlock: AchievementUnlockRecord): AchievementUnlockInsert {
  return {
    achievement_id: unlock.id,
    achievement_kind: unlock.kind,
    description: unlock.description,
    encouragement: unlock.encouragement,
    earned_at: unlock.earnedAt,
    face_level: unlock.face,
    reward_xp: unlock.rewardXp,
    set_code: unlock.setCode,
    title: unlock.title,
    user_id: userId,
  };
}

function payloadToSyntheticRow(payload: AchievementUnlockInsert): AchievementUnlock {
  const earnedAt = payload.earned_at ?? new Date().toISOString();
  return {
    achievement_id: payload.achievement_id,
    achievement_kind: payload.achievement_kind,
    created_at: earnedAt,
    description: payload.description,
    earned_at: earnedAt,
    encouragement: payload.encouragement,
    face_level: payload.face_level ?? null,
    id: payload.id ?? payload.achievement_id,
    reward_xp: payload.reward_xp ?? 0,
    set_code: payload.set_code,
    title: payload.title,
    user_id: payload.user_id,
  };
}
