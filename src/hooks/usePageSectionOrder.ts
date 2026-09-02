"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getPageSectionOrderStorageKey,
  normalizePageSectionOrder,
  readPageSectionOrder,
  removePageSectionOrder,
  writePageSectionOrder,
} from "@/lib/page-section-order";

export function usePageSectionOrder(userId: string | null, pageKey: string, defaultIds: readonly string[]) {
  const defaultIdsKey = defaultIds.join("|");
  const storageKey = userId ? getPageSectionOrderStorageKey(userId) : null;
  const instanceKey = [storageKey ?? "anonymous", pageKey, defaultIdsKey].join(":");
  const defaults = useMemo(() => (defaultIdsKey ? defaultIdsKey.split("|") : []), [defaultIdsKey]);
  const [order, setOrder] = useState<string[]>(defaults);
  const [hydratedInstanceKey, setHydratedInstanceKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!storageKey || typeof window === "undefined") {
        setOrder(defaults);
      } else {
        setOrder(readPageSectionOrder(window.localStorage, storageKey, pageKey, defaults));
      }
      setHydratedInstanceKey(instanceKey);
    });
    return () => {
      cancelled = true;
    };
  }, [defaults, instanceKey, pageKey, storageKey]);

  useEffect(() => {
    if (hydratedInstanceKey !== instanceKey || !storageKey || typeof window === "undefined") {
      return;
    }
    writePageSectionOrder(window.localStorage, storageKey, pageKey, normalizePageSectionOrder(order, defaults));
  }, [defaults, hydratedInstanceKey, instanceKey, order, pageKey, storageKey]);

  const reset = useCallback(() => {
    setOrder(defaults);
    if (storageKey && typeof window !== "undefined") {
      removePageSectionOrder(window.localStorage, storageKey, pageKey);
    }
  }, [defaults, pageKey, storageKey]);

  return {
    order: normalizePageSectionOrder(order, defaults),
    reset,
    setOrder,
  };
}
