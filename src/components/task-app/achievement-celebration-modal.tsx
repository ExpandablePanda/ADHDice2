"use client";

import { Trophy } from "lucide-react";
import { ModalShell } from "@/components/modal-shell";
import { TaskTableChipButton } from "@/components/ui/task-table-primitives";
import type { AchievementCelebration } from "@/lib/achievement-progress";

export function AchievementCelebrationModal({ celebration, onAcknowledge }: {
  celebration: AchievementCelebration | null;
  onAcknowledge: () => void;
}) {
  if (!celebration) return null;
  return (
    <ModalShell className="w-full max-w-sm rounded-lg border border-[#e2daf6] bg-white p-5 shadow-[0_20px_60px_rgba(50,37,105,0.22)] dark:border-white/10 dark:bg-[#1b1530]" label="Achievement earned" onClose={onAcknowledge}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#f0ebff] text-[#6f57f6] dark:bg-[#2a2148] dark:text-[#d4ccff]"><Trophy aria-hidden="true" className="h-5 w-5" /></span>
        <div>
          <p className="text-xs font-semibold text-[#81799a] dark:text-white/45">Achievement unlocked</p>
          <h2 className="mt-1 text-lg font-semibold text-[#30294d] dark:text-white">{celebration.title}</h2>
          <p className="mt-1 text-sm text-[#716a86] dark:text-white/60">{celebration.detail}</p>
        </div>
      </div>
      <div className="mt-5 flex justify-end"><TaskTableChipButton onClick={onAcknowledge}>Got it</TaskTableChipButton></div>
    </ModalShell>
  );
}
