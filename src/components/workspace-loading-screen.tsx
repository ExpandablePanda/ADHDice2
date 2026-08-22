"use client";

import Image from "next/image";

import { withBasePath } from "@/lib/utils";

export function WorkspaceLoadingScreen() {
  return (
    <main
      aria-label="ADHDice workspace loading"
      aria-live="polite"
      className="adhdice-root-safe-area flex min-h-[100dvh] items-center justify-center bg-[linear-gradient(180deg,#ffffff_0%,#faf8ff_100%)] px-6 text-[#182033] dark:bg-[linear-gradient(180deg,#0d0c17_0%,#141124_100%)] dark:text-white"
    >
      <section className="flex w-full max-w-2xl flex-col items-center justify-center text-center">
        <Image
          alt="ADHDice logo"
          className="h-auto w-[min(22rem,82vw)] object-contain"
          height={82}
          priority
          src={withBasePath("/logo.png")}
          width={280}
        />
        <h1 className="mt-8 text-2xl font-black tracking-[-0.02em] text-[#17203a] sm:text-4xl dark:text-white">
          Building Workspace One Step at a Time
        </h1>
      </section>
    </main>
  );
}
