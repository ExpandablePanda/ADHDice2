export function isMissingParentSubtaskColumnError(message: string) {
  return message.includes("parent_subtask_id")
    && message.includes("adhdice_task_subtasks")
    && message.includes("schema cache");
}

export function isMissingTaskListsTableError(message: string) {
  return message.includes("adhdice_task_lists")
    && message.includes("schema cache");
}

export function isMissingTaskListManualMembershipsTableError(message: string) {
  return message.includes("adhdice_task_list_manual_memberships")
    && message.includes("schema cache");
}

export function isMissingTaskEnergyNoneEnumError(message: string) {
  return message.includes("adhdice_clean_task_energy")
    && message.includes("invalid input value for enum")
    && message.includes("\"none\"");
}

export function isMissingTaskActualSecondsColumnError(message: string) {
  return message.includes("actual_seconds")
    && message.includes("adhdice_clean_tasks")
    && message.includes("schema cache");
}

export function isMissingTaskRewardRollsTableError(message: string) {
  return message.includes("adhdice_task_reward_rolls")
    && message.includes("schema cache");
}

export function isMissingTaskRewardClaimsTableError(message: string) {
  return message.includes("adhdice_task_reward_claims")
    && message.includes("schema cache");
}

export function isMissingTaskRewardClaimSubtaskColumnError(message: string) {
  return message.includes("subtask_id")
    && message.includes("adhdice_task_reward_claims")
    && message.includes("schema cache");
}
