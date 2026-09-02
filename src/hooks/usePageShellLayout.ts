"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  getPageShellLayoutStorageKey,
  normalizePageShellOrder,
  readPageShellOrder,
  removePageShellOrder,
  writePageShellOrder,
} from "@/lib/page-shell-layout";

export type PageShellLayoutState = {
  canEdit: boolean;
  finishEditing: () => void;
  isEditing: boolean;
  order: string[];
  pageKey: string;
  reset: () => void;
  setOrder: Dispatch<SetStateAction<string[]>>;
  startEditing: () => void;
};

export function usePageShellLayout(userId: string | null, pageKey: string, defaultShellIds: readonly string[]): PageShellLayoutState {
  const defaultIdsKey = defaultShellIds.join("|");
  const storageKey = userId ? getPageShellLayoutStorageKey(userId) : null;
  const instanceKey = [storageKey ?? "anonymous", pageKey, defaultIdsKey].join(":");
  const defaults = useMemo(() => (defaultIdsKey ? defaultIdsKey.split("|") : []), [defaultIdsKey]);
  const [order, setOrder] = useState<string[]>(defaults);
  const [hydratedInstanceKey, setHydratedInstanceKey] = useState<string | null>(null);
  const [editingInstanceKey, setEditingInstanceKey] = useState<string | null>(null);
  const canEdit = defaults.length >= 2;

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!storageKey || typeof window === "undefined") {
        setOrder(defaults);
      } else {
        setOrder(readPageShellOrder(window.localStorage, storageKey, pageKey, defaults));
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
    writePageShellOrder(window.localStorage, storageKey, pageKey, normalizePageShellOrder(order, defaults));
  }, [defaults, hydratedInstanceKey, instanceKey, order, pageKey, storageKey]);

  const startEditing = useCallback(() => {
    if (canEdit) setEditingInstanceKey(instanceKey);
  }, [canEdit, instanceKey]);

  const finishEditing = useCallback(() => {
    setEditingInstanceKey(null);
  }, []);

  const reset = useCallback(() => {
    setOrder(defaults);
    if (storageKey && typeof window !== "undefined") {
      removePageShellOrder(window.localStorage, storageKey, pageKey);
    }
  }, [defaults, pageKey, storageKey]);

  return {
    canEdit,
    finishEditing,
    isEditing: canEdit && editingInstanceKey === instanceKey,
    order: normalizePageShellOrder(order, defaults),
    pageKey,
    reset,
    setOrder,
    startEditing,
  };
}
