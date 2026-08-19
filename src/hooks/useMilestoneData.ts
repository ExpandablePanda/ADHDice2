"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Database, Milestone, MilestoneOnlyMutationResult, MilestoneTaskMutationResult, Task } from "@/lib/database.types";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  buildMilestoneLookups,
  formatMilestoneRpcError,
  mergeMilestoneRows,
  type MilestoneCorrectionArgs,
  type MilestoneLockArgs,
  type MilestoneTaskLifecycleArgs,
} from "@/lib/milestones/milestone-ticket2";
import { invokeTaskStateCommand, type TaskStateCommandResponse } from "@/lib/task-state-command-client";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
type SetMessage = (message: { tone: "neutral" | "good" | "warn"; text: string } | null) => void;

export function useMilestoneData(client: SupabaseClient, userId: string | null, setMessage: SetMessage) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const removalPromiseRef = useRef<Promise<void> | null>(null);

  const upsertMilestone = useCallback((milestone: Milestone) => {
    setMilestones((current) => mergeMilestoneRows(current, milestone));
  }, []);

  const reloadMilestones = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!client || !userId) {
      setMilestones([]);
      setLoadError(null);
      return false;
    }
    if (!silent) setIsLoading(true);
    const { data, error } = await client
      .from("adhdice_milestones")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) {
      setLoadError(formatMilestoneRpcError(error.message));
      if (!silent) setIsLoading(false);
      if (!silent) setMessage({ tone: "warn", text: formatMilestoneRpcError(error.message) });
      return false;
    }
    setLoadError(null);
    setMilestones((current) => {
      const incoming = data ?? [];
      const incomingIds = new Set(incoming.map((row) => row.id));
      const merged = incoming.map((row) => {
        const existing = current.find((candidate) => candidate.id === row.id);
        return existing ? mergeMilestoneRows([existing], row)[0]! : row;
      });
      // Direct deletes are intentionally unavailable; retaining an RPC row that a
      // racing snapshot has not observed yet prevents a successful lock flicker.
      return [...merged, ...current.filter((row) => !incomingIds.has(row.id))];
    });
    if (!silent) setIsLoading(false);
    return true;
  }, [client, setMessage, userId]);

  useEffect(() => {
    let active = true;

    async function removeChannel(channel: RealtimeChannel) {
      try {
        await client?.removeChannel(channel);
      } catch {
        // Ignore cleanup races during auth changes and fast refresh.
      }
    }

    async function subscribe() {
      const previous = channelRef.current;
      channelRef.current = null;
      if (previous) removalPromiseRef.current = removeChannel(previous);
      await (removalPromiseRef.current ?? Promise.resolve());
      if (!active || !client || !userId) {
        setMilestones([]);
        return;
      }
      const channel = client
        .channel(`adhdice_milestones:${userId}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "adhdice_milestones",
          filter: `user_id=eq.${userId}`,
        }, (payload) => {
          if (payload.eventType === "DELETE") {
            const removedId = (payload.old as { id?: string } | null)?.id;
            if (removedId) setMilestones((current) => current.filter((row) => row.id !== removedId));
            return;
          }
          const row = payload.new as Milestone;
          if (row?.id) upsertMilestone(row);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") void reloadMilestones({ silent: true });
        });
      channelRef.current = channel;
      removalPromiseRef.current = null;
      await reloadMilestones();
    }

    void subscribe();
    return () => {
      active = false;
      const channel = channelRef.current;
      channelRef.current = null;
      if (channel) removalPromiseRef.current = removeChannel(channel);
    };
  }, [client, reloadMilestones, upsertMilestone, userId]);

  const lockMilestone = useCallback(async (args: MilestoneLockArgs) => {
    if (!client || !userId) return { error: "Authentication required", milestone: null };
    const { data, error } = await client.rpc("adhdice_lock_milestone", args);
    if (error || !data) return { error: error?.message ?? "No Milestone row was returned.", milestone: null };
    upsertMilestone(data);
    return { error: null, milestone: data };
  }, [client, upsertMilestone, userId]);

  const correctMilestone = useCallback(async (args: MilestoneCorrectionArgs) => {
    if (!client || !userId) return { error: "Authentication required", milestone: null };
    const { data, error } = await client.rpc("adhdice_correct_milestone_setup", args);
    if (error || !data) return { error: error?.message ?? "No corrected Milestone row was returned.", milestone: null };
    upsertMilestone(data);
    return { error: null, milestone: data };
  }, [client, upsertMilestone, userId]);

  const applyTaskMutationResult = useCallback((result: MilestoneTaskMutationResult | undefined, errorMessage?: string) => {
    if (!result) return { error: errorMessage ?? "No authoritative Milestone result was returned.", result: null };
    upsertMilestone(result.milestone_row);
    return { error: null, result };
  }, [upsertMilestone]);

  const completeMilestone = useCallback(async (args: MilestoneTaskLifecycleArgs) => {
    if (!client || !userId) return { error: "Authentication required", result: null };
    return invokeMilestoneTaskStateCommand(client, args.p_task_id, args.p_milestone_id, args.p_expected_milestone_revision, args.p_operation_id, "complete_task", applyTaskMutationResult);
  }, [applyTaskMutationResult, client, userId]);

  const reverseMilestoneCompletion = useCallback(async (args: MilestoneTaskLifecycleArgs) => {
    void args;
    return { error: "Canonical Task State does not currently support reopening a permanently Complete Task; no Milestone reverse transition was applied.", result: null };
  }, []);

  const trashMilestoneTask = useCallback(async (args: MilestoneTaskLifecycleArgs) => {
    if (!client || !userId) return { error: "Authentication required", result: null };
    return invokeMilestoneTaskStateCommand(client, args.p_task_id, args.p_milestone_id, args.p_expected_milestone_revision, args.p_operation_id, "trash_task", applyTaskMutationResult);
  }, [applyTaskMutationResult, client, userId]);

  const restoreMilestoneTask = useCallback(async (args: MilestoneTaskLifecycleArgs) => {
    if (!client || !userId) return { error: "Authentication required", result: null };
    return invokeMilestoneTaskStateCommand(client, args.p_task_id, args.p_milestone_id, args.p_expected_milestone_revision, args.p_operation_id, "restore_task", applyTaskMutationResult);
  }, [applyTaskMutationResult, client, userId]);

  const abandonMilestone = useCallback(async (args: Database["public"]["Functions"]["adhdice_abandon_milestone"]["Args"]) => {
    if (!client || !userId) return { error: "Authentication required", result: null };
    const { data, error } = await client.rpc("adhdice_abandon_milestone", args);
    const result = data?.[0] as MilestoneOnlyMutationResult | undefined;
    if (!result) return { error: error?.message ?? "No authoritative Milestone result was returned.", result: null };
    upsertMilestone(result.milestone_row);
    return { error: null, result };
  }, [client, upsertMilestone, userId]);

  const lookups = useMemo(() => buildMilestoneLookups(milestones), [milestones]);
  return {
    ...lookups,
    abandonMilestone,
    completeMilestone,
    correctMilestone,
    lockMilestone,
    isLoading,
    loadError,
    milestones,
    reloadMilestones,
    restoreMilestoneTask,
    reverseMilestoneCompletion,
    trashMilestoneTask,
    upsertMilestone,
  };
}

function responseMilestoneTaskResult(response: TaskStateCommandResponse): MilestoneTaskMutationResult | undefined {
  if (!response.success || !response.task_row || !response.milestone_row) return undefined;
  return {
    created_transition: response.created_transition ?? false,
    milestone_row: response.milestone_row as unknown as Milestone,
    task_row: response.task_row as unknown as Task,
  };
}

async function invokeMilestoneTaskStateCommand(
  client: NonNullable<SupabaseClient>,
  taskId: string,
  milestoneId: string,
  expectedMilestoneRevision: number,
  operationId: string,
  type: "complete_task" | "trash_task" | "restore_task",
  apply: (result: MilestoneTaskMutationResult | undefined, errorMessage?: string) => { error: string | null; result: MilestoneTaskMutationResult | null },
) {
  const response = await invokeTaskStateCommand({
    type,
    task_id: taskId,
    replay_identity: `milestone:${operationId}`,
    milestone_id: milestoneId,
    expected_milestone_revision: expectedMilestoneRevision,
    milestone_operation_id: operationId,
  }, { client });
  return apply(responseMilestoneTaskResult(response), response.error?.message);
}
