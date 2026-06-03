import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskInsert, TaskUpdate } from "@/lib/database.types";

export async function insertTaskRowWithLegacyEnergyFallback(
  client: SupabaseClient,
  payload: TaskInsert,
  isMissingTaskEnergyNoneEnumError: (message: string) => boolean,
) {
  const initialResult = await client
    .from("adhdice_clean_tasks")
    .insert(payload)
    .select("*")
    .single();

  if (
    initialResult.error
    && payload.energy === "none"
    && isMissingTaskEnergyNoneEnumError(initialResult.error.message)
  ) {
    const retryResult = await client
      .from("adhdice_clean_tasks")
      .insert({ ...payload, energy: "low" })
      .select("*")
      .single();

    return {
      data: retryResult.data,
      error: retryResult.error,
      usedEnergyFallback: !retryResult.error,
    };
  }

  return {
    data: initialResult.data,
    error: initialResult.error,
    usedEnergyFallback: false,
  };
}

export async function updateTaskRowWithLegacyEnergyFallback(
  client: SupabaseClient,
  taskId: string,
  values: TaskUpdate,
  isMissingTaskActualSecondsColumnError: (message: string) => boolean,
  isMissingTaskEnergyNoneEnumError: (message: string) => boolean,
) {
  const initialResult = await client
    .from("adhdice_clean_tasks")
    .update(values)
    .eq("id", taskId)
    .select("*")
    .single();

  if (
    initialResult.error
    && values.actual_seconds !== undefined
    && isMissingTaskActualSecondsColumnError(initialResult.error.message)
  ) {
    const fallbackValues = {
      ...values,
      actual_seconds: undefined,
    };
    const retryResult = await client
      .from("adhdice_clean_tasks")
      .update(fallbackValues)
      .eq("id", taskId)
      .select("*")
      .single();

    return {
      data: retryResult.data,
      error: retryResult.error,
      usedEnergyFallback: false,
      usedActualSecondsFallback: !retryResult.error,
    };
  }

  if (
    initialResult.error
    && values.energy === "none"
    && isMissingTaskEnergyNoneEnumError(initialResult.error.message)
  ) {
    const retryResult = await client
      .from("adhdice_clean_tasks")
      .update({ ...values, energy: "low" })
      .eq("id", taskId)
      .select("*")
      .single();

    return {
      data: retryResult.data,
      error: retryResult.error,
      usedEnergyFallback: !retryResult.error,
      usedActualSecondsFallback: false,
    };
  }

  return {
    data: initialResult.data,
    error: initialResult.error,
    usedEnergyFallback: false,
    usedActualSecondsFallback: false,
  };
}
