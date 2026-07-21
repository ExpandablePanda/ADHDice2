"use client";

import { ModalShell } from "@/components/modal-shell";
import { TaskTableChipButton } from "@/components/ui/task-table-primitives";
import type { AchievementCelebration } from "@/lib/achievement-progress";
import { AchievementCelebrationTrophy } from "./achievement-celebration-trophy";

export function AchievementCelebrationModal({ celebration, onAcknowledge }: {
  celebration: AchievementCelebration | null;
  onAcknowledge: () => void;
}) {
  if (!celebration) return null;
  return (
    <ModalShell className="w-full max-w-sm rounded-lg border border-[#e2daf6] bg-white p-5 shadow-[0_20px_60px_rgba(50,37,105,0.22)] dark:border-white/10 dark:bg-[#1b1530]" label="Achievement earned" onClose={onAcknowledge}>
      <div className="flex items-start gap-3">
        <AchievementCelebrationTrophy key={celebration.id} tier={celebration.tier} />
        <div>
          <p className="text-xs font-semibold text-[#81799a] dark:text-white/45">Achievement unlocked</p>
          <h2 className="mt-1 text-lg font-semibold text-[#30294d] dark:text-white">{celebration.title}</h2>
          <p className="mt-1 text-sm text-[#716a86] dark:text-white/60">{celebration.detail}</p>
          <p className="mt-1 text-sm leading-6 text-[#514a6c] dark:text-white/75">{celebration.description}</p>
        </div>
      </div>
      <div className="mt-5 flex justify-end"><TaskTableChipButton onClick={onAcknowledge}>Got it</TaskTableChipButton></div>
    </ModalShell>
  );
}
