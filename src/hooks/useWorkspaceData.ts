"use client";

import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { User } from "@supabase/supabase-js";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import type { FocusCategory, HistoricalFocusSession } from "@/lib/types";
import type {
  FocusCategory as DbFocusCategory,
  FocusSession as DbFocusSession,
  Task,
  TaskActualTimeEntry as DbTaskActualTimeEntry,
  TaskFocusDay as DbTaskFocusDay,
  TaskGridLayout as DbTaskGridLayout,
  TaskHistory as DbTaskHistory,
  TaskList as DbTaskList,
  TaskListManualMembership as DbTaskListManualMembership,
  TaskSubtask as DbTaskSubtask,
} from "@/lib/database.types";
import type { TaskEditorLinkedNote } from "@/lib/task-notes";
import type { TaskListDefinition, TaskListManualMembership } from "@/lib/task-lists";
import type { AppPage } from "@/lib/task-ui-state";

type SupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
type ResolvedSupabaseClient = NonNullable<SupabaseClient>;
type TaskGridLayoutItem = { h: number; id: string; type: string; w: number; x: number; y: number };

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type UseWorkspaceDataOptions<TTaskGridItem extends TaskGridLayoutItem> = {
  activePage: AppPage;
  currentUser: User | null | undefined;
  mapActiveSessions: (rows: Array<{ accumulated_seconds: number; category_id: string; is_running: boolean; start_time: string | null }>) => Record<string, {
    accumulatedSeconds: number;
    categoryId: string;
    isRunning: boolean;
    startTime: number | null;
  }>;
  mapFocusCategoryRow: (row: DbFocusCategory) => FocusCategory;
  mapFocusSessionRow: (row: DbFocusSession) => HistoricalFocusSession;
  mapTaskFocusDayRows: (rows: DbTaskFocusDay[], tasks: Task[]) => Record<string, string[]>;
  mapTaskHistoryRow: (row: DbTaskHistory) => DbTaskHistory;
  mapTaskListManualMembershipRow: (row: DbTaskListManualMembership) => TaskListManualMembership;
  mapTaskListRow: (row: DbTaskList) => TaskListDefinition | null;
  mapTaskSubtaskRow: (row: DbTaskSubtask) => DbTaskSubtask;
  mergeStoredFocusCategories: (categories: FocusCategory[]) => FocusCategory[];
  mergeStoredFocusHistory: (history: HistoricalFocusSession[]) => HistoricalFocusSession[];
  migrateLocalFocusState: (client: ResolvedSupabaseClient, user: User) => Promise<boolean>;
  migrateLocalTaskFocusDays: (client: ResolvedSupabaseClient, user: User) => Promise<boolean>;
  isMissingTaskListManualMembershipsTableError: (message: string) => boolean;
  isMissingTaskListsTableError: (message: string) => boolean;
  onProfileLoaded: (profileRow: { avatar_src: string | null; display_name: string | null; logo_src: string | null } | null, user: User) => void;
  resolveTaskGridLayout: (row: DbTaskGridLayout | null) => TTaskGridItem[];
  saveFocusCategories: (categories: FocusCategory[]) => void;
  saveFocusHistory: (history: HistoricalFocusSession[]) => void;
  setActiveSessions: Dispatch<SetStateAction<Record<string, {
    accumulatedSeconds: number;
    categoryId: string;
    isRunning: boolean;
    startTime: number | null;
  }>>>;
  setAvailableTaskNotes: Dispatch<SetStateAction<TaskEditorLinkedNote[]>>;
  setEconomy: Dispatch<SetStateAction<{ level: number; points: number; tokens: number; xp: number }>>;
  setFocusCategories: Dispatch<SetStateAction<FocusCategory[]>>;
  setFocusHistory: Dispatch<SetStateAction<HistoricalFocusSession[]>>;
  setFocusedTaskIdsByDate: Dispatch<SetStateAction<Record<string, string[]>>>;
  setIsGridEditMode: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<Message | null>>;
  setSelectedGridWidgetId: Dispatch<SetStateAction<string | null>>;
  setTaskActualTimeEntries: Dispatch<SetStateAction<DbTaskActualTimeEntry[]>>;
  setTaskGridLayout: Dispatch<SetStateAction<TTaskGridItem[]>>;
  setTaskHistory: Dispatch<SetStateAction<DbTaskHistory[]>>;
  setTaskListManualMemberships: Dispatch<SetStateAction<TaskListManualMembership[]>>;
  setTaskLists: Dispatch<SetStateAction<TaskListDefinition[]>>;
  setTaskSubtasks: Dispatch<SetStateAction<DbTaskSubtask[]>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  suppressCategoryReload: MutableRefObject<boolean>;
  supabase: SupabaseClient;
  taskGridStarterLayout: TTaskGridItem[];
};

function shouldLoadSecondaryForPage(activePage: AppPage) {
  return activePage === "Stats" || activePage === "Notes" || activePage === "Focus";
}

export function useWorkspaceData<TTaskGridItem extends TaskGridLayoutItem>({
  activePage,
  currentUser,
  mapActiveSessions,
  mapFocusCategoryRow,
  mapFocusSessionRow,
  mapTaskFocusDayRows,
  mapTaskHistoryRow,
  mapTaskListManualMembershipRow,
  mapTaskListRow,
  mapTaskSubtaskRow,
  mergeStoredFocusCategories,
  mergeStoredFocusHistory,
  migrateLocalFocusState,
  migrateLocalTaskFocusDays,
  isMissingTaskListManualMembershipsTableError,
  isMissingTaskListsTableError,
  onProfileLoaded,
  resolveTaskGridLayout,
  saveFocusCategories,
  saveFocusHistory,
  setActiveSessions,
  setAvailableTaskNotes,
  setEconomy,
  setFocusCategories,
  setFocusHistory,
  setFocusedTaskIdsByDate,
  setIsGridEditMode,
  setMessage,
  setSelectedGridWidgetId,
  setTaskActualTimeEntries,
  setTaskGridLayout,
  setTaskHistory,
  setTaskListManualMemberships,
  setTaskLists,
  setTaskSubtasks,
  setTasks,
  suppressCategoryReload,
  supabase,
  taskGridStarterLayout,
}: UseWorkspaceDataOptions<TTaskGridItem>) {
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const hasLoadedSecondaryDataRef = useRef(false);
  const secondaryLoadInFlightRef = useRef(false);

  useEffect(() => {
    if (!supabase || !currentUser) {
      hasLoadedSecondaryDataRef.current = false;
      secondaryLoadInFlightRef.current = false;
      return;
    }

    const client = supabase;
    const user = currentUser;
    const userId = user.id;
    let isActive = true;

    async function loadSecondaryWorkspaceData({ silent = false }: { silent?: boolean } = {}) {
      if (!isActive || secondaryLoadInFlightRef.current) {
        return;
      }

      secondaryLoadInFlightRef.current = true;
      const [taskHistoryResult, taskActualTimeEntriesResult, noteResult, historyResult] = await Promise.all([
        client
          .from("adhdice_task_history")
          .select("*")
          .eq("user_id", userId)
          .order("entry_date", { ascending: false })
          .order("created_at", { ascending: false }),
        client
          .from("adhdice_task_actual_time_entries")
          .select("*")
          .eq("user_id", userId)
          .order("entry_date", { ascending: false })
          .order("created_at", { ascending: false }),
        client
          .from("adhdice_notes")
          .select("id,title,body,linked_task_ids,updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false }),
        client
          .from("adhdice_focus_sessions")
          .select("*")
          .eq("user_id", userId)
          .order("session_date", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);
      secondaryLoadInFlightRef.current = false;

      if (!isActive) {
        return;
      }

      const errors = [taskHistoryResult.error, taskActualTimeEntriesResult.error, noteResult.error, historyResult.error].filter(Boolean);
      if (errors.length > 0) {
        if (!silent) {
          setMessage({ tone: "warn", text: errors[0]?.message ?? "Could not finish loading workspace details." });
        }
        return;
      }

      const nextFocusHistory = mergeStoredFocusHistory((historyResult.data ?? []).map((row) => mapFocusSessionRow(row)));
      setTaskHistory((taskHistoryResult.data ?? []).map(mapTaskHistoryRow));
      setTaskActualTimeEntries(taskActualTimeEntriesResult.data ?? []);
      setAvailableTaskNotes((noteResult.data ?? []) as TaskEditorLinkedNote[]);
      setFocusHistory(nextFocusHistory);
      saveFocusHistory(nextFocusHistory);
      hasLoadedSecondaryDataRef.current = true;
    }

    async function loadCoreWorkspaceData({ silent = false }: { silent?: boolean } = {}) {
      if (!silent) {
        setIsWorkspaceLoading(true);
      }

      const [taskResult, taskSubtasksResult, profileResult, categoryResult, activeResult, historyResult, focusDayResult, taskListsResult, manualMembershipResult, gridLayoutResult] = await Promise.all([
        client
          .from("adhdice_clean_tasks")
          .select("*")
          .eq("user_id", userId)
          .neq("status", "archived")
          .order("status", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false }),
        client
          .from("adhdice_task_subtasks")
          .select("*")
          .eq("user_id", userId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        client
          .from("adhdice_user_profiles")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
        client
          .from("adhdice_focus_categories")
          .select("*")
          .eq("user_id", userId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        client
          .from("adhdice_focus_active_sessions")
          .select("*")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false }),
        client
          .from("adhdice_focus_sessions")
          .select("*")
          .eq("user_id", userId)
          .order("session_date", { ascending: false })
          .order("created_at", { ascending: false }),
        client
          .from("adhdice_task_focus_days")
          .select("*")
          .eq("user_id", userId)
          .order("focus_date", { ascending: false }),
        client
          .from("adhdice_task_lists")
          .select("*")
          .eq("user_id", userId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        client
          .from("adhdice_task_list_manual_memberships")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
        client
          .from("adhdice_task_grid_layouts")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      if (!isActive) {
        return;
      }

      const errors = [
        taskResult.error,
        taskSubtasksResult.error,
        profileResult.error,
        categoryResult.error,
        activeResult.error,
        historyResult.error,
        focusDayResult.error,
        taskListsResult.error && !isMissingTaskListsTableError(taskListsResult.error.message) ? taskListsResult.error : null,
        manualMembershipResult.error && !isMissingTaskListManualMembershipsTableError(manualMembershipResult.error.message) ? manualMembershipResult.error : null,
        gridLayoutResult.error,
      ].filter(Boolean);

      if (errors.length > 0) {
        setMessage({ tone: "warn", text: errors[0]?.message ?? "Could not load your workspace." });
        setIsWorkspaceLoading(false);
        return;
      }

      let nextCategories = mergeStoredFocusCategories((categoryResult.data ?? []).map(mapFocusCategoryRow));
      let nextActiveSessions = mapActiveSessions(activeResult.data ?? []);
      let nextFocusHistory = mergeStoredFocusHistory((historyResult.data ?? []).map((row) => mapFocusSessionRow(row)));
      let nextFocusedTaskIdsByDate = mapTaskFocusDayRows(focusDayResult.data ?? [], taskResult.data ?? []);
      const nextTaskLists = (taskListsResult.error && isMissingTaskListsTableError(taskListsResult.error.message))
        ? []
        : (taskListsResult.data ?? []).map(mapTaskListRow).filter((list): list is TaskListDefinition => list !== null);
      const nextTaskListManualMemberships = (manualMembershipResult.error && isMissingTaskListManualMembershipsTableError(manualMembershipResult.error.message))
        ? []
        : (manualMembershipResult.data ?? []).map(mapTaskListManualMembershipRow);
      const nextTaskGridLayout = resolveTaskGridLayout(gridLayoutResult.data);
      const nextTaskSubtasks = (taskSubtasksResult.data ?? []).map(mapTaskSubtaskRow);

      if (
        nextCategories.length === 0 &&
        Object.keys(nextActiveSessions).length === 0 &&
        nextFocusHistory.length === 0
      ) {
        const migrated = await migrateLocalFocusState(client, user);
        if (migrated) {
          const [freshCategories, freshActive, freshHistory] = await Promise.all([
            client
              .from("adhdice_focus_categories")
              .select("*")
              .eq("user_id", userId)
              .order("sort_order", { ascending: true })
              .order("created_at", { ascending: true }),
            client
              .from("adhdice_focus_active_sessions")
              .select("*")
              .eq("user_id", userId)
              .order("updated_at", { ascending: false }),
            client
              .from("adhdice_focus_sessions")
              .select("*")
              .eq("user_id", userId)
              .order("session_date", { ascending: false })
              .order("created_at", { ascending: false }),
          ]);

          if (!freshCategories.error && freshCategories.data) {
            nextCategories = mergeStoredFocusCategories(freshCategories.data.map(mapFocusCategoryRow));
          }
          if (!freshActive.error && freshActive.data) {
            nextActiveSessions = mapActiveSessions(freshActive.data);
          }
          if (!freshHistory.error && freshHistory.data) {
            nextFocusHistory = mergeStoredFocusHistory(freshHistory.data.map((row) => mapFocusSessionRow(row)));
          }
          if (!freshCategories.error && !freshActive.error && !freshHistory.error) {
            setMessage({
              tone: "good",
              text: "Imported your saved local focus data into your account.",
            });
          }
        }
      }

      if (Object.keys(nextFocusedTaskIdsByDate).length === 0) {
        const migratedTaskFocusDays = await migrateLocalTaskFocusDays(client, user);
        if (migratedTaskFocusDays) {
          const freshFocusDays = await client
            .from("adhdice_task_focus_days")
            .select("*")
            .eq("user_id", userId)
            .order("focus_date", { ascending: false });

          if (!freshFocusDays.error) {
            nextFocusedTaskIdsByDate = mapTaskFocusDayRows(freshFocusDays.data ?? [], taskResult.data ?? []);
            setMessage((previous) => previous ?? {
              tone: "good",
              text: "Imported your saved Focus Today selections into your account.",
            });
          }
        }
      }

      setTasks(taskResult.data ?? []);
      setFocusCategories(nextCategories);
      setActiveSessions(nextActiveSessions);
      setFocusHistory(nextFocusHistory);
      setFocusedTaskIdsByDate(nextFocusedTaskIdsByDate);
      setTaskLists(nextTaskLists);
      setTaskListManualMemberships(nextTaskListManualMemberships);
      setTaskSubtasks(nextTaskSubtasks);
      setTaskGridLayout(nextTaskGridLayout);
      saveFocusCategories(nextCategories);
      saveFocusHistory(nextFocusHistory);
      onProfileLoaded(profileResult.data ?? null, user);
      if (profileResult.data) {
        setEconomy({
          level: profileResult.data.level ?? 1,
          xp: profileResult.data.xp ?? 0,
          points: profileResult.data.points ?? 0,
          tokens: profileResult.data.tokens ?? 0,
        });
      }
      setIsWorkspaceLoading(false);

      if (shouldLoadSecondaryForPage(activePage)) {
        void loadSecondaryWorkspaceData({ silent: true });
      } else {
        window.setTimeout(() => {
          void loadSecondaryWorkspaceData({ silent: true });
        }, 0);
      }
    }

    void loadCoreWorkspaceData();

    const workspaceChannel = client
      .channel(`adhdice_workspace:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_clean_tasks",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadCoreWorkspaceData({ silent: true });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_task_subtasks",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadCoreWorkspaceData({ silent: true });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_focus_categories",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          if (!suppressCategoryReload.current) {
            void loadCoreWorkspaceData({ silent: true });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_focus_active_sessions",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadCoreWorkspaceData({ silent: true });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_task_focus_days",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadCoreWorkspaceData({ silent: true });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_task_lists",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadCoreWorkspaceData({ silent: true });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_task_list_manual_memberships",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadCoreWorkspaceData({ silent: true });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_task_grid_layouts",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadCoreWorkspaceData({ silent: true });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_notes",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          if (hasLoadedSecondaryDataRef.current || shouldLoadSecondaryForPage(activePage)) {
            void loadSecondaryWorkspaceData({ silent: true });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_task_actual_time_entries",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          if (hasLoadedSecondaryDataRef.current || shouldLoadSecondaryForPage(activePage)) {
            void loadSecondaryWorkspaceData({ silent: true });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "adhdice_task_history",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          if (hasLoadedSecondaryDataRef.current || shouldLoadSecondaryForPage(activePage)) {
            void loadSecondaryWorkspaceData({ silent: true });
          }
        },
      )
      .subscribe();

    return () => {
      isActive = false;
      client.removeChannel(workspaceChannel);
    };
  }, [activePage, currentUser?.id, supabase, suppressCategoryReload]);

  useEffect(() => {
    if (!currentUser) {
      setTaskActualTimeEntries([]);
      setTaskHistory([]);
      setAvailableTaskNotes([]);
      setTaskGridLayout(taskGridStarterLayout);
      setIsGridEditMode(false);
      setSelectedGridWidgetId(null);
    }
  }, [
    currentUser,
    setAvailableTaskNotes,
    setIsGridEditMode,
    setSelectedGridWidgetId,
    setTaskActualTimeEntries,
    setTaskGridLayout,
    setTaskHistory,
    taskGridStarterLayout,
  ]);

  return { isWorkspaceLoading };
}
