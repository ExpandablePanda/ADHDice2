"use client";

import Image from "next/image";

import { withBasePath } from "@/lib/utils";

const LOADING_RING_RADIUS = 46;

export function WorkspaceLoadingScreen({ theme = "light" }: { theme?: "light" | "dark" }) {
  return (
    <main
      aria-label="ADHDice workspace loading"
      aria-live="polite"
      aria-busy="true"
      data-theme={theme}
      role="status"
      className="adhdice-root-safe-area flex min-h-[100dvh] items-center justify-center bg-[linear-gradient(180deg,#ffffff_0%,#faf8ff_100%)] px-6 text-[#182033] dark:bg-[linear-gradient(180deg,#0d0c17_0%,#141124_100%)] dark:text-white"
    >
      <section className="flex w-full max-w-2xl flex-col items-center justify-center text-center">
        <div className="relative flex aspect-square w-[min(28rem,92vw)] items-center justify-center">
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full -rotate-90" focusable="false" viewBox="0 0 100 100">
            <circle className="text-[#f0ecfc] dark:text-white/[0.03]" cx="50" cy="50" fill="transparent" r={LOADING_RING_RADIUS} stroke="currentColor" strokeWidth="7" />
            <circle
              className="workspace-loading-ring-progress text-[#6f57f6] motion-reduce:animate-none dark:text-[#9b87ff]"
              cx="50"
              cy="50"
              fill="transparent"
              r={LOADING_RING_RADIUS}
              stroke="currentColor"
              strokeDasharray="52 237.03"
              strokeDashoffset="0"
              strokeLinecap="round"
              strokeWidth="7"
            />
          </svg>
          <Image
            alt="ADHDice logo"
            className="workspace-loading-logo relative z-10 h-auto w-[min(22rem,82vw)] object-contain"
            height={82}
            priority
            src={withBasePath("/logo.png")}
            width={280}
          />
        </div>
      </section>
    </main>
  );
}
