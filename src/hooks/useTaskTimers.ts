"use client";

import { useEffect, useState } from "react";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import type { ActiveTaskTimer as DbActiveTaskTimer } from "@/lib/database.types";
import type { RunningTaskTimer } from "@/components/ui/task-management-table-v2";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
type SetMessage = (msg: { tone: "neutral" | "good" | "warn"; text: string } | null) => void;

function getTaskTimerDisplaySeconds(timer: RunningTaskTimer, now: number) {
  const endTime = timer.pausedAt ?? now;
  return timer.baseSeconds + Math.max(0, Math.floor((endTime - timer.startedAt) / 1000));
}

function mapTaskTimerRow(row: DbActiveTaskTimer): RunningTaskTimer {
  const pausedTimestamp = Date.parse(row.updated_at);
  return {
    baseSeconds: row.accumulated_seconds,
    pausedAt: row.is_running ? null : pausedTimestamp,
    startedActualSeconds: row.started_actual_seconds,
    startedAt: row.is_running && row.start_time ? Date.parse(row.start_time) : pausedTimestamp,
    taskId: row.task_id,
    title: row.title_snapshot,
  };
}

function isMissingTaskTimerTableError(message: string) {
  return message.includes("adhdice_task_active_timers");
}

function formatTaskTimerPersistenceError(message: string) {
  if (isMissingTaskTimerTableError(message)) {
    return "Task timers need the `supabase/add_task_active_timers.sql` migration before they can sync across tabs and devices.";
  }
  return message;
}

export function useTaskTimers(
  client: SupabaseClient,
  userId: string | null,
  setMessage: SetMessage,
) {
  const [runningTaskTimers, setRunningTaskTimers] = useState<RunningTaskTimer[]>([]);

  useEffect(() => {
    if (!client || !userId) {
      setRunningTaskTimers([]);
      return;
    }

    let isActive = true;

    async function loadTaskTimers({ silent = false }: { silent?: boolean } = {}) {
      const { data, error } = await client
        .from("adhdice_task_active_timers")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (!isActive) {
        return;
      }

      if (error) {
        if (!silent) {
          setMessage({ tone: "warn", text: formatTaskTimerPersistenceError(error.message) });
        }
        return;
      }

      setRunningTaskTimers((data ?? []).map(mapTaskTimerRow));
    }

    void loadTaskTimers();

    const taskTimerChannel = client
      .channel(`adhdice_task_timers:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_task_active_timers",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadTaskTimers({ silent: true });
        },
      )
      .subscribe();

    return () => {
      isActive = false;
      client.removeChannel(taskTimerChannel);
    };
  }, [client, setMessage, userId]);

  async function startTaskTimer(timer: RunningTaskTimer) {
    if (!client || !userId) {
      return false;
    }

    const payload = {
      user_id: userId,
      task_id: timer.taskId,
      title_snapshot: timer.title,
      start_time: new Date(timer.startedAt).toISOString(),
      accumulated_seconds: timer.baseSeconds,
      started_actual_seconds: timer.startedActualSeconds,
      is_running: true,
    };

    const { data, error } = await client
      .from("adhdice_task_active_timers")
      .upsert(payload, { onConflict: "user_id,task_id" })
      .select("*")
      .single();

    if (error) {
      setMessage({ tone: "warn", text: formatTaskTimerPersistenceError(error.message) });
      return false;
    }

    if (data) {
      setRunningTaskTimers((current) => [
        ...current.filter((entry) => entry.taskId !== timer.taskId),
        mapTaskTimerRow(data),
      ]);
    }

    return true;
  }

  async function pauseTaskTimer(taskId: string) {
    if (!client || !userId) {
      return false;
    }

    const currentTimer = runningTaskTimers.find((entry) => entry.taskId === taskId);
    if (!currentTimer || currentTimer.pausedAt) {
      return false;
    }

    const now = Date.now();
    const nextAccumulatedSeconds = getTaskTimerDisplaySeconds(currentTimer, now);
    const { data, error } = await client
      .from("adhdice_task_active_timers")
      .update({
        accumulated_seconds: nextAccumulatedSeconds,
        is_running: false,
        start_time: null,
      })
      .eq("user_id", userId)
      .eq("task_id", taskId)
      .select("*")
      .single();

    if (error) {
      setMessage({ tone: "warn", text: formatTaskTimerPersistenceError(error.message) });
      return false;
    }

    if (data) {
      setRunningTaskTimers((current) => current.map((entry) => (
        entry.taskId === taskId ? mapTaskTimerRow(data) : entry
      )));
    }

    return true;
  }

  async function resumeTaskTimer(taskId: string) {
    if (!client || !userId) {
      return false;
    }

    const currentTimer = runningTaskTimers.find((entry) => entry.taskId === taskId);
    if (!currentTimer || !currentTimer.pausedAt) {
      return false;
    }

    const now = Date.now();
    const { data, error } = await client
      .from("adhdice_task_active_timers")
      .update({
        accumulated_seconds: getTaskTimerDisplaySeconds(currentTimer, now),
        is_running: true,
        start_time: new Date(now).toISOString(),
      })
      .eq("user_id", userId)
      .eq("task_id", taskId)
      .select("*")
      .single();

    if (error) {
      setMessage({ tone: "warn", text: formatTaskTimerPersistenceError(error.message) });
      return false;
    }

    if (data) {
      setRunningTaskTimers((current) => current.map((entry) => (
        entry.taskId === taskId ? mapTaskTimerRow(data) : entry
      )));
    }

    return true;
  }

  async function stopTaskTimer(taskId: string) {
    if (!client || !userId) {
      return null;
    }

    const currentTimer = runningTaskTimers.find((entry) => entry.taskId === taskId);
    if (!currentTimer) {
      return null;
    }

    const now = Date.now();
    const elapsedSeconds = Math.max(
      0,
      getTaskTimerDisplaySeconds(currentTimer, now) - currentTimer.startedActualSeconds,
    );

    const { error } = await client
      .from("adhdice_task_active_timers")
      .delete()
      .eq("user_id", userId)
      .eq("task_id", taskId);

    if (error) {
      setMessage({ tone: "warn", text: formatTaskTimerPersistenceError(error.message) });
      return null;
    }

    setRunningTaskTimers((current) => current.filter((entry) => entry.taskId !== taskId));
    return {
      elapsedSeconds,
      title: currentTimer.title,
    };
  }

  return {
    runningTaskTimers,
    startTaskTimer,
    pauseTaskTimer,
    resumeTaskTimer,
    stopTaskTimer,
  };
}
