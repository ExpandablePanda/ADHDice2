"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import type { ActiveTaskTimer as DbActiveTaskTimer } from "@/lib/database.types";
import type { RunningTaskTimer } from "@/components/ui/task-management-table-v2";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
type SetMessage = (msg: { tone: "neutral" | "good" | "warn"; text: string } | null) => void;

export type StoppedTaskTimer = RunningTaskTimer & { elapsedSeconds: number };

export function getTaskTimerDisplaySeconds(timer: RunningTaskTimer, now: number) {
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
    occurrenceKey: row.occurrence_key,
    occurrenceDueOn: row.occurrence_due_on,
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
  const taskTimerChannelRef = useRef<RealtimeChannel | null>(null);
  const taskTimerChannelRemovalPromiseRef = useRef<Promise<void> | null>(null);
  const setMessageRef = useRef(setMessage);

  useEffect(() => {
    setMessageRef.current = setMessage;
  }, [setMessage]);

  useEffect(() => {
    let isActive = true;

    async function loadTaskTimers({ silent = false }: { silent?: boolean } = {}) {
      if (!client || !userId) {
        return;
      }

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
          setMessageRef.current({ tone: "warn", text: formatTaskTimerPersistenceError(error.message) });
        }
        return;
      }

      setRunningTaskTimers((data ?? []).map(mapTaskTimerRow));
    }

    async function removeTaskTimerChannel(channel: RealtimeChannel) {
      try {
        await client.removeChannel(channel);
      } catch {
        // Ignore cleanup races when dependencies change quickly.
      }
    }

    async function subscribeToTaskTimerChannel() {
      const previousRemoval = taskTimerChannelRemovalPromiseRef.current ?? Promise.resolve();
      const previousChannel = taskTimerChannelRef.current;
      taskTimerChannelRef.current = null;

      if (previousChannel) {
        taskTimerChannelRemovalPromiseRef.current = removeTaskTimerChannel(previousChannel);
      }

      await previousRemoval;

      if (!isActive || !client || !userId) {
        if (!userId) {
          setRunningTaskTimers([]);
        }
        return;
      }

      void loadTaskTimers();

      const nextChannel = client
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

      taskTimerChannelRef.current = nextChannel;
      taskTimerChannelRemovalPromiseRef.current = null;
    }

    void subscribeToTaskTimerChannel();

    return () => {
      isActive = false;
      const currentChannel = taskTimerChannelRef.current;
      taskTimerChannelRef.current = null;
      if (currentChannel) {
        taskTimerChannelRemovalPromiseRef.current = removeTaskTimerChannel(currentChannel);
      }
    };
  }, [client, userId]);

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
      occurrence_key: timer.occurrenceKey ?? null,
      occurrence_due_on: timer.occurrenceDueOn ?? null,
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
      ...currentTimer,
      baseSeconds: getTaskTimerDisplaySeconds(currentTimer, now),
      elapsedSeconds,
      occurrenceDueOn: currentTimer.occurrenceDueOn ?? null,
      occurrenceKey: currentTimer.occurrenceKey ?? null,
      pausedAt: now,
    };
  }

  async function restoreStoppedTaskTimer(timer: StoppedTaskTimer) {
    if (!client || !userId) {
      return false;
    }

    const { data, error } = await client
      .from("adhdice_task_active_timers")
      .upsert({
        user_id: userId,
        task_id: timer.taskId,
        title_snapshot: timer.title,
        start_time: null,
        accumulated_seconds: timer.baseSeconds,
        started_actual_seconds: timer.startedActualSeconds,
        is_running: false,
        occurrence_key: timer.occurrenceKey ?? null,
        occurrence_due_on: timer.occurrenceDueOn ?? null,
      }, { onConflict: "user_id,task_id" })
      .select("*")
      .single();

    if (error) {
      setMessage({ tone: "warn", text: `The timer could not be restored after cancellation: ${formatTaskTimerPersistenceError(error.message)}` });
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

  async function discardTaskTimer(taskId: string) {
    if (!client || !userId) {
      return false;
    }

    const currentTimer = runningTaskTimers.find((entry) => entry.taskId === taskId);
    if (!currentTimer) {
      return false;
    }

    const { error } = await client
      .from("adhdice_task_active_timers")
      .delete()
      .eq("user_id", userId)
      .eq("task_id", taskId);

    if (error) {
      setMessage({ tone: "warn", text: formatTaskTimerPersistenceError(error.message) });
      return false;
    }

    setRunningTaskTimers((current) => current.filter((entry) => entry.taskId !== taskId));
    return true;
  }

  return {
    runningTaskTimers,
    startTaskTimer,
    pauseTaskTimer,
    resumeTaskTimer,
    stopTaskTimer,
    restoreStoppedTaskTimer,
    discardTaskTimer,
  };
}
