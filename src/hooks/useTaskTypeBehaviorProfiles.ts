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
} from "@/lib/task-state-engine/behavior-policy";
import {
  isMissingTaskTypeBehaviorProfilesTableError,
  loadTaskTypeBehaviorProfiles,
  taskTypeBehaviorProfileUpsertPayload,
  type TaskTypeBehaviorProfileClient,
} from "@/lib/task-type-behavior-profiles";

type Message = { text: string; tone: "neutral" | "good" | "warn" };
type ConfigurableTaskBehaviorField = Exclude<TaskBehaviorPolicyField, never>;
type BrowserSupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;

export function useTaskTypeBehaviorProfiles(
  client: BrowserSupabaseClient,
  currentLogicalDate: string,
  userId: string | null,
  setMessage: Dispatch<SetStateAction<Message | null>>,
) {
  const [profileRevisions, setProfileRevisions] = useState<TaskBehaviorPolicyRevision[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const profiles = useMemo(() => normalizeTaskBehaviorProfiles(profileRevisions.map((revision) => ({
    task_type: "task",
    effective_from_logical_date: revision.effectiveFromLogicalDate,
    unresolved_occurrence: revision.unresolvedOccurrence,
    positive_streak_on_unhandled: revision.positiveStreakOnUnhandled,
    missed_streak_on_unhandled: revision.missedStreakOnUnhandled,
    rewards: revision.rewards,
  })), currentLogicalDate), [currentLogicalDate, profileRevisions]);

  useEffect(() => {
    let cancelled = false;
    if (!client || !userId) {
      // The hook must clear user-scoped cached profiles when auth leaves the workspace.
      // This is an intentional synchronization with the external auth owner.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfileRevisions([]);
      setIsLoading(false);
      return () => { cancelled = true; };
    }
    setIsLoading(true);
    void loadTaskTypeBehaviorProfiles(client as unknown as TaskTypeBehaviorProfileClient, userId).then((result) => {
      if (cancelled) return;
      if (result.error && !isMissingTaskTypeBehaviorProfilesTableError(result.error)) {
        setMessage({ tone: "warn", text: result.error.message ?? "Could not load Task behavior settings." });
      }
      setProfileRevisions([...result.revisions]);
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [client, setMessage, userId]);

  const persist = useCallback(async (nextPolicy: TaskBehaviorPolicy) => {
    if (!client || !userId) return false;
    const result = await client.from("adhdice_task_type_behavior_profiles").upsert(
      { ...taskTypeBehaviorProfileUpsertPayload(userId, nextPolicy, currentLogicalDate), updated_at: new Date().toISOString() },
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

  const replaceCurrentRevision = useCallback((policy: TaskBehaviorPolicy | null) => {
    if (!policy) {
      setProfileRevisions((current) => current.filter((revision) => revision.effectiveFromLogicalDate !== currentLogicalDate));
      return;
    }
    const nextRevision: TaskBehaviorPolicyRevision = {
      ...normalizeTaskBehaviorProfile(policy, "task"),
      effectiveFromLogicalDate: currentLogicalDate,
    };
    setProfileRevisions((current) => [
      ...current.filter((revision) => revision.effectiveFromLogicalDate !== currentLogicalDate),
      nextRevision,
    ].sort((left, right) => left.effectiveFromLogicalDate.localeCompare(right.effectiveFromLogicalDate)));
  }, [currentLogicalDate]);

  const updateTaskBehaviorProfile = useCallback(async (
    field: ConfigurableTaskBehaviorField,
    value: TaskBehaviorPolicy[typeof field],
  ) => {
    const current = profiles.task ?? STANDARD_TASK_BEHAVIOR_POLICY;
    const previousRevision = profileRevisions.find((revision) => revision.effectiveFromLogicalDate === currentLogicalDate) ?? null;
    const next = normalizeTaskBehaviorProfile({ ...current, [field]: value }, "task");
    replaceCurrentRevision(next);
    if (await persist(next)) return true;
    replaceCurrentRevision(previousRevision);
    return false;
  }, [currentLogicalDate, persist, profileRevisions, profiles.task, replaceCurrentRevision]);

  const resetTaskDefaults = useCallback(async () => {
    const previousRevision = profileRevisions.find((revision) => revision.effectiveFromLogicalDate === currentLogicalDate) ?? null;
    replaceCurrentRevision(STANDARD_TASK_BEHAVIOR_POLICY);
    if (await persist(STANDARD_TASK_BEHAVIOR_POLICY)) return true;
    replaceCurrentRevision(previousRevision);
    return false;
  }, [currentLogicalDate, persist, profileRevisions, replaceCurrentRevision]);

  return {
    isLoading,
    profileRevisions,
    profiles,
    resetTaskDefaults,
    updateTaskBehaviorProfile,
  };
}
