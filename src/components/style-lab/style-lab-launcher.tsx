"use client";

import { Palette } from "lucide-react";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { requestStyleLabEnablement } from "./style-lab-runtime";

export function StyleLabLauncher() {
  if (process.env.NODE_ENV !== "development") return null;

  return (
    <AdhdChip
      icon={<Palette aria-hidden="true" className="h-3.5 w-3.5" />}
      onClick={() => { requestStyleLabEnablement(); }}
      tone="purple"
      type="button"
    >
      Open Style Lab
    </AdhdChip>
  );
}
