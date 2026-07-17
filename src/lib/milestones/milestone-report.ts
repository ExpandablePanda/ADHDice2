import type { Milestone, MilestoneEvent } from "@/lib/database.types";
import { addMilestoneCalendarDays, formatMilestoneDisplayDate } from "@/lib/milestones/milestone-dates";

export type MilestoneReportRange = { endDateKey: string | null; startDateKey: string | null };

export type MilestoneReportSummary = {
  abandoned: number;
  completionReversals: number;
  completedGracePeriod: number;
  completedLate: number;
  completedOnTime: number;
  completedTotal: number;
  completedWithoutAura: number;
  diamondAuras: number;
  promoted: number;
  standardAuras: number;
  tiers: Record<Milestone["current_tier"], number>;
  details: Milestone[];
};

function localDateKeyFromTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateKeyInRange(dateKey: string | null, range: MilestoneReportRange) {
  if (!dateKey) return false;
  return (!range.startDateKey || dateKey >= range.startDateKey) && (!range.endDateKey || dateKey <= range.endDateKey);
}

export function buildMilestoneEventOccurredAtRange(range: MilestoneReportRange) {
  const localMidnightIso = (dateKey: string) => {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(year, month - 1, day).toISOString();
  };
  return {
    endExclusive: range.endDateKey ? localMidnightIso(addMilestoneCalendarDays(range.endDateKey, 1)) : null,
    startInclusive: range.startDateKey ? localMidnightIso(range.startDateKey) : null,
  };
}

export function buildMilestoneReportSummary(events: MilestoneEvent[], milestones: Milestone[], range: MilestoneReportRange, detailLimit = 5): MilestoneReportSummary {
  const uniqueEvents = [...new Map(events.map((event) => [event.id, event])).values()]
    .filter((event) => dateKeyInRange(localDateKeyFromTimestamp(event.occurred_at), range));
  const count = (eventType: MilestoneEvent["event_type"]) => uniqueEvents.filter((event) => event.event_type === eventType).length;
  const completedOnTime = count("completed_on_time");
  const completedGracePeriod = count("completed_grace_period");
  const completedLate = count("completed_late");
  const earned = milestones.filter((milestone) => milestone.status === "completed"
    && dateKeyInRange(milestone.completion_date_key, range)
    && Boolean(milestone.trophy_awarded_at)
    && !milestone.trophy_revoked_at);
  const tiers: MilestoneReportSummary["tiers"] = { bronze: 0, gold: 0, platinum: 0, silver: 0 };
  let standardAuras = 0;
  let diamondAuras = 0;
  let completedWithoutAura = 0;
  for (const milestone of earned) {
    tiers[milestone.current_tier] += 1;
    if (milestone.aura_kind === "standard" && !milestone.aura_revoked_at) standardAuras += 1;
    else if (milestone.aura_kind === "diamond" && !milestone.aura_revoked_at) diamondAuras += 1;
    else completedWithoutAura += 1;
  }
  return {
    abandoned: count("abandoned"),
    completionReversals: count("completion_reversed"),
    completedGracePeriod,
    completedLate,
    completedOnTime,
    completedTotal: completedOnTime + completedGracePeriod + completedLate,
    completedWithoutAura,
    diamondAuras,
    promoted: count("promoted"),
    standardAuras,
    tiers,
    details: [...earned].sort((left, right) => (right.completion_date_key ?? "").localeCompare(left.completion_date_key ?? "") || right.updated_at.localeCompare(left.updated_at)).slice(0, detailLimit),
  };
}

function timingLabel(milestone: Milestone) {
  return milestone.completion_timing === "on_time" ? "On time" : milestone.completion_timing === "grace_period" ? "Grace period" : "Late";
}

function auraLabel(milestone: Milestone) {
  return milestone.aura_kind === "standard" ? "Standard Aura" : milestone.aura_kind === "diamond" ? "Diamond Aura" : "No aura";
}

export function formatMilestoneReportSection(summary: MilestoneReportSummary, detailed: boolean, warning: string | null = null) {
  const hasData = summary.promoted + summary.completedTotal + summary.abandoned + summary.completionReversals
    + Object.values(summary.tiers).reduce((sum, value) => sum + value, 0) > 0;
  const lines = ["## Milestones"];
  if (warning) lines.push(`- Warning: ${warning}`);
  if (!hasData) {
    lines.push("- No Milestone activity or currently earned trophies in the selected range.");
    return lines;
  }
  lines.push(
    `- Promoted: ${summary.promoted}`,
    `- Completed: ${summary.completedTotal} total; ${summary.completedOnTime} on time; ${summary.completedGracePeriod} grace period; ${summary.completedLate} late`,
    `- Abandoned: ${summary.abandoned}`,
    `- Completion reversed: ${summary.completionReversals}`,
    `- Earned trophies: Bronze ${summary.tiers.bronze}; Silver ${summary.tiers.silver}; Gold ${summary.tiers.gold}; Platinum ${summary.tiers.platinum}`,
    `- Auras: Standard ${summary.standardAuras}; Diamond ${summary.diamondAuras}; Completed without Aura ${summary.completedWithoutAura}`,
  );
  if (detailed && summary.details.length > 0) {
    lines.push("", "### Completed Milestones");
    for (const milestone of summary.details) {
      lines.push(`- ${milestone.task_title_snapshot} — ${milestone.current_tier} — ${formatMilestoneDisplayDate(milestone.completion_date_key!)} — ${timingLabel(milestone)} — ${auraLabel(milestone)}`);
    }
  }
  return lines;
}
