"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import {
  getDefaultPageShellSizes,
  getPageShellLayoutStorageKey,
  normalizePageShellLayout,
  readPageShellLayout,
  removePageShellLayout,
  type PageShellLayoutPreference,
  type PageShellSize,
  type PageShellSizeDefaults,
  writePageShellLayout,
} from "@/lib/page-shell-layout";

export type PageShellLayoutState = {
  beginPreview: (layout: PageShellLayoutPreference) => void;
  canEdit: boolean;
  cancelPreview: () => void;
  commitPreview: () => void;
  finishEditing: () => void;
  isEditing: boolean;
  order: string[];
  pageKey: string;
  reset: () => void;
  setPreviewOrder: (next: SetStateAction<string[]>) => void;
  setPreviewSizes: (next: SetStateAction<Record<string, PageShellSize>>) => void;
  sizes: Record<string, PageShellSize>;
  startEditing: () => void;
};

function clonePageShellLayout(layout: PageShellLayoutPreference): PageShellLayoutPreference {
  return {
    order: [...layout.order],
    sizes: Object.fromEntries(Object.entries(layout.sizes).map(([id, size]) => [id, { ...size }])),
  };
}

function pageShellLayoutsEqual(left: PageShellLayoutPreference, right: PageShellLayoutPreference) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function usePageShellLayout(
  userId: string | null,
  pageKey: string,
  defaultShellIds: readonly string[],
  defaultSizes: PageShellSizeDefaults = {},
): PageShellLayoutState {
  const defaultIdsKey = defaultShellIds.join("|");
  const defaultSizesKey = defaultShellIds.map((id) => `${id}:${defaultSizes[id]?.span ?? 12}:${defaultSizes[id]?.minHeight ?? "natural"}`).join("|");
  const storageKey = userId ? getPageShellLayoutStorageKey(userId) : null;
  const instanceKey = [storageKey ?? "anonymous", pageKey, defaultIdsKey, defaultSizesKey].join(":");
  const defaults = useMemo(() => (defaultIdsKey ? defaultIdsKey.split("|") : []), [defaultIdsKey]);
  const normalizedDefaultSizes = useMemo(() => getDefaultPageShellSizes(defaults, defaultSizes), [defaultIdsKey, defaultSizes, defaults]);
  const defaultLayout = useMemo(() => ({ order: defaults, sizes: normalizedDefaultSizes }), [defaults, normalizedDefaultSizes]);
  const [committedLayout, setCommittedLayout] = useState<PageShellLayoutPreference>(defaultLayout);
  const [previewLayout, setPreviewLayout] = useState<PageShellLayoutPreference | null>(null);
  const previewRef = useRef<PageShellLayoutPreference | null>(null);
  const skipNextPersistRef = useRef(false);
  const [hydratedInstanceKey, setHydratedInstanceKey] = useState<string | null>(null);
  const [editingInstanceKey, setEditingInstanceKey] = useState<string | null>(null);
  const canEdit = defaults.length >= 2;

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      previewRef.current = null;
      skipNextPersistRef.current = false;
      setPreviewLayout(null);
      if (!storageKey || typeof window === "undefined") {
        setCommittedLayout(defaultLayout);
      } else {
        setCommittedLayout(readPageShellLayout(window.localStorage, storageKey, pageKey, defaults, defaultSizes));
      }
      setHydratedInstanceKey(instanceKey);
    });
    return () => {
      cancelled = true;
    };
  }, [defaultLayout, defaults, defaultSizes, instanceKey, pageKey, storageKey]);

  useEffect(() => {
    if (hydratedInstanceKey !== instanceKey || !storageKey || typeof window === "undefined") {
      return;
    }
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    writePageShellLayout(window.localStorage, storageKey, pageKey, normalizePageShellLayout(committedLayout, defaults, defaultSizes));
  }, [committedLayout, defaultSizes, defaults, hydratedInstanceKey, instanceKey, pageKey, storageKey]);

  const startEditing = useCallback(() => {
    if (canEdit) setEditingInstanceKey(instanceKey);
  }, [canEdit, instanceKey]);

  const cancelPreview = useCallback(() => {
    previewRef.current = null;
    setPreviewLayout(null);
  }, []);

  const commitPreview = useCallback(() => {
    const preview = previewRef.current;
    previewRef.current = null;
    setPreviewLayout(null);
    if (!preview || pageShellLayoutsEqual(preview, committedLayout)) return;
    setCommittedLayout(clonePageShellLayout(preview));
  }, [committedLayout]);

  const finishEditing = useCallback(() => {
    cancelPreview();
    setEditingInstanceKey(null);
  }, [cancelPreview]);

  const beginPreview = useCallback((layout: PageShellLayoutPreference) => {
    const normalized = normalizePageShellLayout(layout, defaults, defaultSizes);
    const next = clonePageShellLayout(normalized);
    previewRef.current = next;
    setPreviewLayout(next);
  }, [defaultSizes, defaults]);

  const setPreviewOrder = useCallback((next: SetStateAction<string[]>) => {
    const current = previewRef.current;
    if (!current) return;
    const nextOrder = typeof next === "function" ? next(current.order) : next;
    const updated = { ...current, order: [...nextOrder] };
    previewRef.current = updated;
    setPreviewLayout(updated);
  }, []);

  const setPreviewSizes = useCallback((next: SetStateAction<Record<string, PageShellSize>>) => {
    const current = previewRef.current;
    if (!current) return;
    const nextSizes = typeof next === "function" ? next(current.sizes) : next;
    const updated = {
      ...current,
      sizes: Object.fromEntries(Object.entries(nextSizes).map(([id, size]) => [id, { ...size }])),
    };
    previewRef.current = updated;
    setPreviewLayout(updated);
  }, []);

  const reset = useCallback(() => {
    previewRef.current = null;
    setPreviewLayout(null);
    skipNextPersistRef.current = true;
    setCommittedLayout(clonePageShellLayout(defaultLayout));
    if (storageKey && typeof window !== "undefined") {
      removePageShellLayout(window.localStorage, storageKey, pageKey);
    }
  }, [defaultLayout, pageKey, storageKey]);

  const activeLayout = previewLayout ?? committedLayout;
  return {
    beginPreview,
    canEdit,
    cancelPreview,
    commitPreview,
    finishEditing,
    isEditing: canEdit && editingInstanceKey === instanceKey,
    order: normalizePageShellLayout(activeLayout, defaults, defaultSizes).order,
    pageKey,
    reset,
    setPreviewOrder,
    setPreviewSizes,
    sizes: normalizePageShellLayout(activeLayout, defaults, defaultSizes).sizes,
    startEditing,
  };
}
