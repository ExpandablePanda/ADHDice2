import { addMilestoneCalendarDays, compareMilestoneCalendarDates, getMilestoneAuraDeadline } from "@/lib/milestones/milestone-dates";
import type { MilestoneReminderOpportunity } from "@/lib/milestones/milestone-types";

export function buildMilestoneReminderSchedule(
  targetDate: string,
  lockDate: string,
): MilestoneReminderOpportunity[] {
  const auraDeadline = getMilestoneAuraDeadline(targetDate);
  const opportunities: Array<Omit<MilestoneReminderOpportunity, "status">> = [
    { kind: "seven_days", scheduledDate: addMilestoneCalendarDays(targetDate, -7) },
    { kind: "three_days", scheduledDate: addMilestoneCalendarDays(targetDate, -3) },
    { kind: "target_day", scheduledDate: targetDate },
    { kind: "final_aura_day", scheduledDate: auraDeadline },
  ];

  return opportunities.map((opportunity) => ({
    ...opportunity,
    status: compareMilestoneCalendarDates(opportunity.scheduledDate, lockDate) < 0 ? "skipped" : "pending",
  }));
}
