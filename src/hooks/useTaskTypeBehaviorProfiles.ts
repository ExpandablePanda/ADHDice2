"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  normalizeTaskBehaviorProfile,
  normalizeTaskBehaviorProfiles,
  STANDARD_TASK_BEHAVIOR_POLICY,
  type TaskBehaviorPolicy,
  type TaskBehaviorPolicyField,
  type TaskBehaviorPolicyRevision,
  type TaskBehaviorPolicyRevisionMap,
} from "@/lib/task-state-engine/behavior-policy";
import type { TaskType } from "@/lib/task-type";
import {
  isMissingCustomBehaviorRulesetsTableError,
  loadCustomBehaviorRulesets,
  type CustomBehaviorRulesetClient,
} from "@/lib/custom-behavior-rulesets";
import {
  isMissingTaskTypeBehaviorProfilesTableError,
  loadTaskTypeBehaviorProfiles,
  replaceTaskTypeBehaviorProfileRevision,
  taskTypeBehaviorProfileUpsertPayload,
  type TaskTypeBehaviorProfileClient,
} from "@/lib/task-type-behavior-profiles";

type Message = { text: string; tone: "neutral" | "good" | "warn" };
type ConfigurableTaskBehaviorField = Exclude<TaskBehaviorPolicyField, never>;
type BrowserSupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
const TASK_TYPE_VALUES: readonly TaskType[] = ["task", "pursuit", "goal", "custom"];
const CONFIGURABLE_TASK_TYPES = new Set<TaskType>(["task", "custom"]);

export function useTaskTypeBehaviorProfiles(
  client: BrowserSupabaseClient,
  currentLogicalDate: string,
  userId: string | null,
  setMessage: Dispatch<SetStateAction<Message | null>>,
) {
  const [profileRevisions, setProfileRevisions] = useState<TaskBehaviorPolicyRevisionMap>({});
  const [customRulesetBehaviorPolicyRevisions, setCustomRulesetBehaviorPolicyRevisions] = useState<Record<string, readonly TaskBehaviorPolicyRevision[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const profiles = useMemo(() => normalizeTaskBehaviorProfiles(
    TASK_TYPE_VALUES.flatMap((taskType) => (profileRevisions[taskType] ?? []).map((revision) => ({
      task_type: taskType,
      effective_from_logical_date: revision.effectiveFromLogicalDate,
      unresolved_occurrence: revision.unresolvedOccurrence,
      positive_streak_on_unhandled: revision.positiveStreakOnUnhandled,
      missed_streak_on_unhandled: revision.missedStreakOnUnhandled,
      rewards: revision.rewards,
    }))),
    currentLogicalDate,
  ), [currentLogicalDate, profileRevisions]);

  useEffect(() => {
    let cancelled = false;
    if (!client || !userId) {
      // The hook must clear user-scoped cached profiles when auth leaves the workspace.
      // This is an intentional synchronization with the external auth owner.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfileRevisions({});
      setCustomRulesetBehaviorPolicyRevisions({});
      setIsLoading(false);
      return () => { cancelled = true; };
    }
    setIsLoading(true);
    void Promise.all([
      loadTaskTypeBehaviorProfiles(client as unknown as TaskTypeBehaviorProfileClient, userId),
      loadCustomBehaviorRulesets(client as unknown as CustomBehaviorRulesetClient, userId),
    ]).then(([result, customRulesetsResult]) => {
      if (cancelled) return;
      if (result.error && !isMissingTaskTypeBehaviorProfilesTableError(result.error)) {
        setMessage({ tone: "warn", text: result.error.message ?? "Could not load Task behavior settings." });
      }
      if (customRulesetsResult.error && !isMissingCustomBehaviorRulesetsTableError(customRulesetsResult.error)) {
        setMessage({ tone: "warn", text: customRulesetsResult.error.message ?? "Could not load Custom behavior rulesets." });
      }
      setProfileRevisions(result.revisions);
      setCustomRulesetBehaviorPolicyRevisions(customRulesetsResult.revisions);
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [client, setMessage, userId]);

  const persist = useCallback(async (taskType: TaskType, nextPolicy: TaskBehaviorPolicy) => {
    if (!client || !userId || !CONFIGURABLE_TASK_TYPES.has(taskType)) return false;
    const result = await client.from("adhdice_task_type_behavior_profiles").upsert(
      { ...taskTypeBehaviorProfileUpsertPayload(userId, taskType, nextPolicy, currentLogicalDate), updated_at: new Date().toISOString() },
      { onConflict: "user_id,task_type,effective_from_logical_date" },
    );
    if (result.error) {
      if (!isMissingTaskTypeBehaviorProfilesTableError(result.error)) {
        setMessage({ tone: "warn", text: result.error.message ?? "Could not save Task behavior settings." });
      } else {
        setMessage({ tone: "warn", text: "Task behavior settings need the 7.13.18 database migration before they can be saved." });
      }
      return false;
    }
    return true;
  }, [client, currentLogicalDate, setMessage, userId]);

  const replaceCurrentRevision = useCallback((taskType: TaskType, policy: TaskBehaviorPolicy | null) => {
    if (!policy) {
      setProfileRevisions((current) => replaceTaskTypeBehaviorProfileRevision(current, taskType, currentLogicalDate, null));
      return;
    }
    const nextRevision: TaskBehaviorPolicyRevision = {
      ...normalizeTaskBehaviorProfile(policy, taskType),
      effectiveFromLogicalDate: currentLogicalDate,
    };
    setProfileRevisions((current) => replaceTaskTypeBehaviorProfileRevision(current, taskType, currentLogicalDate, nextRevision));
  }, [currentLogicalDate]);

  const updateTaskBehaviorProfile = useCallback(async (
    taskType: TaskType,
    field: ConfigurableTaskBehaviorField,
    value: TaskBehaviorPolicy[typeof field],
  ) => {
    if (!CONFIGURABLE_TASK_TYPES.has(taskType)) return false;
    const current = profiles[taskType] ?? STANDARD_TASK_BEHAVIOR_POLICY;
    const previousRevision = (profileRevisions[taskType] ?? []).find((revision) => revision.effectiveFromLogicalDate === currentLogicalDate) ?? null;
    const next = normalizeTaskBehaviorProfile({ ...current, [field]: value }, taskType);
    replaceCurrentRevision(taskType, next);
    if (await persist(taskType, next)) return true;
    replaceCurrentRevision(taskType, previousRevision);
    return false;
  }, [currentLogicalDate, persist, profileRevisions, profiles, replaceCurrentRevision]);

  const resetTaskBehaviorProfile = useCallback(async (taskType: TaskType) => {
    if (!CONFIGURABLE_TASK_TYPES.has(taskType)) return false;
    const previousRevision = (profileRevisions[taskType] ?? []).find((revision) => revision.effectiveFromLogicalDate === currentLogicalDate) ?? null;
    replaceCurrentRevision(taskType, STANDARD_TASK_BEHAVIOR_POLICY);
    if (await persist(taskType, STANDARD_TASK_BEHAVIOR_POLICY)) return true;
    replaceCurrentRevision(taskType, previousRevision);
    return false;
  }, [currentLogicalDate, persist, profileRevisions, replaceCurrentRevision]);

  return {
    isLoading,
    profileRevisions,
    profiles,
    customRulesetBehaviorPolicyRevisions,
    resetTaskBehaviorProfile,
    updateTaskBehaviorProfile,
  };
}
