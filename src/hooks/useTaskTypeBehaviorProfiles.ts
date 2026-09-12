"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  normalizeTaskBehaviorProfile,
  normalizeTaskBehaviorProfiles,
  STANDARD_TASK_BEHAVIOR_POLICY,
  type TaskBehaviorPolicy,
  type TaskBehaviorPolicyField,
  type TaskBehaviorPolicyRevision,
  type TaskBehaviorPolicyRevisionMap,
  type TaskBehaviorSelection,
} from "@/lib/task-state-engine/behavior-policy";
import type { TaskType } from "@/lib/task-type";
import {
  createCustomBehaviorRuleset,
  deleteCustomBehaviorRuleset,
  normalizeCustomBehaviorRulesetName,
  isMissingCustomBehaviorRulesetsTableError,
  loadCustomBehaviorRulesets,
  renameCustomBehaviorRuleset,
  upsertCustomBehaviorRulesetRevision,
  validateCustomBehaviorRulesetName,
  getCustomRulesetAssignedTaskCount,
  type CustomBehaviorRulesetDeleteActionResult,
  type CustomBehaviorRulesetState,
  type CustomBehaviorRulesetClient,
  type LoadedCustomBehaviorRulesets,
} from "@/lib/custom-behavior-rulesets";
import type { CustomBehaviorRuleset } from "@/lib/database.types";
import { resolveTaskBehaviorPolicyForLogicalDate } from "@/lib/task-state-engine/behavior-policy";
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
  const [customBehaviorRulesets, setCustomBehaviorRulesets] = useState<CustomBehaviorRulesetState["data"]>([]);
  const [customRulesetBehaviorPolicyRevisions, setCustomRulesetBehaviorPolicyRevisions] = useState<Record<string, readonly TaskBehaviorPolicyRevision[]>>({});
  const [behaviorSelectionsByTaskId, setBehaviorSelectionsByTaskId] = useState<Record<string, readonly TaskBehaviorSelection[]>>({});
  const [isLoading, setIsLoading] = useState(() => Boolean(userId));
  const behaviorSelectionStateRef = useRef<CustomBehaviorRulesetState>({
    data: [],
    revisions: {},
    behaviorSelectionsByTaskId: {},
  });
  const customRulesetLoadGenerationRef = useRef(0);
  const profiles = useMemo(() => normalizeTaskBehaviorProfiles(
    TASK_TYPE_VALUES.flatMap((taskType) => (profileRevisions[taskType] ?? []).map((revision) => ({
      task_type: taskType,
      effective_from_logical_date: revision.effectiveFromLogicalDate,
      unresolved_occurrence: revision.unresolvedOccurrence,
      positive_streak_on_unhandled: revision.positiveStreakOnUnhandled,
      missed_streak_on_unhandled: revision.missedStreakOnUnhandled,
      rewards: revision.rewards,
      available_actions: revision.availableActions,
    }))),
    currentLogicalDate,
  ), [currentLogicalDate, profileRevisions]);
  const customBehaviorRulesetProfiles = useMemo(
    () => Object.fromEntries(customBehaviorRulesets.map((ruleset) => [
      ruleset.id,
      resolveTaskBehaviorPolicyForLogicalDate({
        revisions: customRulesetBehaviorPolicyRevisions[ruleset.id] ?? [],
        logicalDate: currentLogicalDate,
      }),
    ])) as Record<string, TaskBehaviorPolicy>,
    [currentLogicalDate, customBehaviorRulesets, customRulesetBehaviorPolicyRevisions],
  );

  const publishCustomRulesetState = useCallback((result: LoadedCustomBehaviorRulesets) => {
    const nextState: CustomBehaviorRulesetState = {
      data: result.data,
      revisions: result.revisions,
      behaviorSelectionsByTaskId: result.behaviorSelectionsByTaskId,
    };
    // Publish the ref before scheduling React state so mutation follow-up
    // reconciliation can read the committed behavior-selection timeline immediately.
    behaviorSelectionStateRef.current = nextState;
    setCustomBehaviorRulesets(nextState.data);
    setCustomRulesetBehaviorPolicyRevisions(nextState.revisions);
    setBehaviorSelectionsByTaskId(nextState.behaviorSelectionsByTaskId);
  }, []);

  const refreshCustomBehaviorRulesets = useCallback(async () => {
    if (!client || !userId) return false;
    const loadGeneration = customRulesetLoadGenerationRef.current + 1;
    customRulesetLoadGenerationRef.current = loadGeneration;
    setIsLoading(true);
    try {
      const result = await loadCustomBehaviorRulesets(client as unknown as CustomBehaviorRulesetClient, userId);
      if (customRulesetLoadGenerationRef.current !== loadGeneration) return false;
      const customRulesetError = result.error ?? result.behaviorSelectionError;
      if (customRulesetError && !isMissingCustomBehaviorRulesetsTableError(customRulesetError)) {
        setMessage({ tone: "warn", text: customRulesetError.message ?? "Could not refresh Custom behavior rulesets." });
        return false;
      }
      publishCustomRulesetState(result);
      return true;
    } catch (error) {
      if (customRulesetLoadGenerationRef.current !== loadGeneration) return false;
      setMessage({
        tone: "warn",
        text: error instanceof Error ? error.message : "Could not refresh Custom behavior rulesets.",
      });
      return false;
    } finally {
      if (customRulesetLoadGenerationRef.current === loadGeneration) {
        setIsLoading(false);
      }
    }
  }, [client, publishCustomRulesetState, setMessage, userId]);

  useEffect(() => {
    let cancelled = false;
    const loadGeneration = customRulesetLoadGenerationRef.current + 1;
    customRulesetLoadGenerationRef.current = loadGeneration;
    if (!client || !userId) {
      // The hook must clear user-scoped cached profiles when auth leaves the workspace.
      // This is an intentional synchronization with the external auth owner.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfileRevisions({});
      behaviorSelectionStateRef.current = { data: [], revisions: {}, behaviorSelectionsByTaskId: {} };
      setCustomBehaviorRulesets([]);
      setCustomRulesetBehaviorPolicyRevisions({});
      setBehaviorSelectionsByTaskId({});
      setIsLoading(false);
      return () => { cancelled = true; };
    }
    setIsLoading(true);
    void Promise.all([
      loadTaskTypeBehaviorProfiles(client as unknown as TaskTypeBehaviorProfileClient, userId),
      loadCustomBehaviorRulesets(client as unknown as CustomBehaviorRulesetClient, userId),
    ]).then(([result, customRulesetsResult]) => {
      if (cancelled || customRulesetLoadGenerationRef.current !== loadGeneration) return;
      if (result.error && !isMissingTaskTypeBehaviorProfilesTableError(result.error)) {
        setMessage({ tone: "warn", text: result.error.message ?? "Could not load Task behavior settings." });
      }
      const customRulesetError = customRulesetsResult.error ?? customRulesetsResult.behaviorSelectionError;
      if (customRulesetError && !isMissingCustomBehaviorRulesetsTableError(customRulesetError)) {
        setMessage({ tone: "warn", text: customRulesetError.message ?? "Could not load Custom behavior rulesets." });
      }
      setProfileRevisions(result.revisions);
      if (!customRulesetError || isMissingCustomBehaviorRulesetsTableError(customRulesetError)) {
        publishCustomRulesetState(customRulesetsResult);
      }
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [client, publishCustomRulesetState, setMessage, userId]);

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

  const updateCustomBehaviorRulesetProfile = useCallback(async (
    rulesetId: string,
    field: ConfigurableTaskBehaviorField,
    value: TaskBehaviorPolicy[typeof field],
  ) => {
    const ruleset = customBehaviorRulesets.find((entry) => entry.id === rulesetId);
    if (!ruleset || ruleset.deleted_at != null) return false;
    const current = customBehaviorRulesetProfiles[rulesetId];
    if (!current) return false;
    const next = normalizeTaskBehaviorProfile({ ...current, [field]: value }, "custom");
    const error = await upsertCustomBehaviorRulesetRevision(
      client as unknown as CustomBehaviorRulesetClient,
      rulesetId,
      currentLogicalDate,
      next,
    );
    if (error) {
      setMessage({ tone: "warn", text: error.message ?? "Could not save the Custom ruleset policy." });
      return false;
    }
    return refreshCustomBehaviorRulesets();
  }, [client, currentLogicalDate, customBehaviorRulesetProfiles, customBehaviorRulesets, refreshCustomBehaviorRulesets, setMessage]);

  const createCustomRuleset = useCallback(async (nameInput: string): Promise<CustomBehaviorRuleset | null> => {
    const validation = validateCustomBehaviorRulesetName(nameInput, customBehaviorRulesets);
    if (validation.error) {
      setMessage({ tone: "warn", text: validation.error });
      return null;
    }
    const result = await createCustomBehaviorRuleset(
      client as unknown as CustomBehaviorRulesetClient,
      userId ?? "",
      normalizeCustomBehaviorRulesetName(nameInput),
      profiles.custom ?? STANDARD_TASK_BEHAVIOR_POLICY,
      currentLogicalDate,
      customBehaviorRulesets,
    );
    if (result.error || !result.data) {
      setMessage({ tone: "warn", text: result.error?.message ?? "Could not create the Custom ruleset." });
      return null;
    }
    if (!(await refreshCustomBehaviorRulesets())) return null;
    return result.data;
  }, [client, currentLogicalDate, customBehaviorRulesets, profiles.custom, refreshCustomBehaviorRulesets, setMessage, userId]);

  const renameCustomRuleset = useCallback(async (rulesetId: string, nameInput: string) => {
    const ruleset = customBehaviorRulesets.find((entry) => entry.id === rulesetId);
    if (!ruleset || ruleset.deleted_at != null) {
      setMessage({ tone: "warn", text: "The Custom ruleset has already been deleted." });
      return false;
    }
    const result = await renameCustomBehaviorRuleset(
      client as unknown as CustomBehaviorRulesetClient,
      userId ?? "",
      rulesetId,
      nameInput,
      customBehaviorRulesets,
    );
    if (result.error || !result.data) {
      setMessage({ tone: "warn", text: result.error?.message ?? "Could not rename the Custom ruleset." });
      return false;
    }
    if (!(await refreshCustomBehaviorRulesets())) return false;
    return true;
  }, [client, customBehaviorRulesets, refreshCustomBehaviorRulesets, setMessage, userId]);

  const deleteCustomRuleset = useCallback(async (rulesetId: string): Promise<CustomBehaviorRulesetDeleteActionResult> => {
    const ruleset = customBehaviorRulesets.find((entry) => entry.id === rulesetId);
    if (!ruleset || ruleset.deleted_at != null) {
      setMessage({ tone: "warn", text: "The Custom ruleset has already been deleted." });
      return { assignedTaskCount: null, error: "The Custom ruleset has already been deleted.", ok: false };
    }
    const error = await deleteCustomBehaviorRuleset(
      client as unknown as CustomBehaviorRulesetClient,
      rulesetId,
    );
    if (error) {
      const message = error.message ?? "Could not delete the Custom ruleset.";
      const assignedTaskCount = getCustomRulesetAssignedTaskCount(message);
      if (assignedTaskCount === null) {
        setMessage({ tone: "warn", text: message });
      }
      return { assignedTaskCount, error: message, ok: false };
    }
    const refreshed = await refreshCustomBehaviorRulesets();
    return refreshed
      ? { assignedTaskCount: null, error: null, ok: true }
      : { assignedTaskCount: null, error: "Could not refresh the Custom ruleset state.", ok: false };
  }, [client, customBehaviorRulesets, refreshCustomBehaviorRulesets, setMessage]);

  return {
    isLoading,
    profileRevisions,
    profiles,
    customBehaviorRulesets,
    customBehaviorRulesetProfiles,
    behaviorSelectionStateRef,
    customRulesetBehaviorPolicyRevisions,
    behaviorSelectionsByTaskId,
    refreshCustomBehaviorRulesets,
    createCustomRuleset,
    deleteCustomRuleset,
    renameCustomRuleset,
    resetTaskBehaviorProfile,
    updateTaskBehaviorProfile,
    updateCustomBehaviorRulesetProfile,
  };
}
