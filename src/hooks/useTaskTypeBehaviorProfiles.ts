"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  normalizeTaskBehaviorProfile,
  STANDARD_TASK_BEHAVIOR_POLICY,
  type TaskBehaviorPolicy,
  type TaskBehaviorPolicyField,
  type TaskBehaviorProfiles,
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
  userId: string | null,
  setMessage: Dispatch<SetStateAction<Message | null>>,
) {
  const [profiles, setProfiles] = useState<TaskBehaviorProfiles>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!client || !userId) {
      // The hook must clear user-scoped cached profiles when auth leaves the workspace.
      // This is an intentional synchronization with the external auth owner.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfiles({});
      setIsLoading(false);
      return () => { cancelled = true; };
    }
    setIsLoading(true);
    void loadTaskTypeBehaviorProfiles(client as unknown as TaskTypeBehaviorProfileClient, userId).then((result) => {
      if (cancelled) return;
      if (result.error && !isMissingTaskTypeBehaviorProfilesTableError(result.error)) {
        setMessage({ tone: "warn", text: result.error.message ?? "Could not load Task behavior settings." });
      }
      setProfiles(result.data);
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [client, setMessage, userId]);

  const persist = useCallback(async (nextPolicy: TaskBehaviorPolicy) => {
    if (!client || !userId) return false;
    const result = await client.from("adhdice_task_type_behavior_profiles").upsert(
      { ...taskTypeBehaviorProfileUpsertPayload(userId, nextPolicy), updated_at: new Date().toISOString() },
      { onConflict: "user_id,task_type" },
    );
    if (result.error) {
      if (!isMissingTaskTypeBehaviorProfilesTableError(result.error)) {
        setMessage({ tone: "warn", text: result.error.message ?? "Could not save Task behavior settings." });
      } else {
        setMessage({ tone: "warn", text: "Task behavior settings need the 7.13.17 database migration before they can be saved." });
      }
      return false;
    }
    return true;
  }, [client, setMessage, userId]);

  const updateTaskBehaviorProfile = useCallback(async (
    field: ConfigurableTaskBehaviorField,
    value: TaskBehaviorPolicy[typeof field],
  ) => {
    const current = profiles.task ?? STANDARD_TASK_BEHAVIOR_POLICY;
    const next = normalizeTaskBehaviorProfile({ ...current, [field]: value }, "task");
    setProfiles((previous) => ({ ...previous, task: next }));
    if (await persist(next)) return true;
    setProfiles((previous) => ({ ...previous, task: current }));
    return false;
  }, [persist, profiles.task]);

  const resetTaskDefaults = useCallback(async () => {
    const previous = profiles.task;
    setProfiles((current) => ({ ...current, task: STANDARD_TASK_BEHAVIOR_POLICY }));
    if (await persist(STANDARD_TASK_BEHAVIOR_POLICY)) return true;
    setProfiles((current) => ({ ...current, ...(previous ? { task: previous } : {}) }));
    return false;
  }, [persist, profiles.task]);

  return { isLoading, profiles, resetTaskDefaults, updateTaskBehaviorProfile };
}
