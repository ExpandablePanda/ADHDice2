import type { MilestoneEligibilityResult, MilestoneEligibilityTask } from "@/lib/milestones/milestone-types";

export function getMilestoneEligibility(task: MilestoneEligibilityTask): MilestoneEligibilityResult {
  if (task.parent_task_id !== null) {
    return { eligible: false, reason: "child_task" };
  }
  if (task.repeat_frequency !== "none" && task.repeat_frequency !== "daily_until_complete") {
    return { eligible: false, reason: "indefinitely_recurring" };
  }
  if (task.status === "complete" || task.status === "archived" || task.status === "trashed") {
    return { eligible: false, reason: "closed_task" };
  }
  return { eligible: true, reason: "eligible" };
}

export function isTaskEligibleForMilestone(task: MilestoneEligibilityTask) {
  return getMilestoneEligibility(task).eligible;
}
