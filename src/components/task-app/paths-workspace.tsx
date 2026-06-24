"use client";

import { useEffect, useState } from "react";
import {
  createPrototypePathsStorageAdapter,
  LOCAL_PATHS_PROTOTYPE_USER_ID,
  type PathRecord,
} from "@/lib/paths-domain";

const pathsStorageAdapter = createPrototypePathsStorageAdapter();

export function PathsWorkspace() {
  const [pathRecords, setPathRecords] = useState<PathRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    void pathsStorageAdapter.listPaths({ userId: LOCAL_PATHS_PROTOTYPE_USER_ID }).then((records) => {
      if (!cancelled) {
        setPathRecords(records);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const primaryPath = pathRecords[0] ?? null;

  return (
    <section className="mt-4">
      <div className="mx-auto max-w-3xl rounded-[1.75rem] border border-[#ece8f8] bg-white/92 p-6 shadow-[0_20px_55px_rgba(81,61,168,0.08)] dark:border-white/10 dark:bg-white/[0.04]">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8e88a9] dark:text-white/40">
            Paths
          </p>
          <h2 className="mt-2 text-2xl font-black text-[#1f2746] dark:text-white">
            Guided reset and routine flows
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#6c6685] dark:text-white/65">
            PATHS will live here as a calm home for guided reset flows, routines, and branching action sequences.
          </p>
          <p className="mt-2 text-sm leading-6 text-[#8a84a3] dark:text-white/50">
            Phase 2 adds a model and storage boundary only. Full creation, editing, branching, and linked-task actions are
            still pending.
          </p>
          {primaryPath ? (
            <div className="mt-5 rounded-3xl border border-[#ece8f8] bg-[#fbfaff] px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8e88a9] dark:text-white/40">
                Prototype path
              </p>
              <p className="mt-2 text-base font-semibold text-[#1f2746] dark:text-white">
                {primaryPath.path.title}
              </p>
              <p className="mt-1 text-sm text-[#6c6685] dark:text-white/65">
                {primaryPath.nodes.length} nodes, type {primaryPath.path.pathType}, linked tasks stay reference-only in v1.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
