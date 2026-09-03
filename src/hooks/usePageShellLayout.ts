"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import {
  getDefaultPageShellSizes,
  getPageShellLayoutStorageKey,
  hasPageShellLayout,
  normalizePageShellLayout,
  readPageShellLayout,
  removePageShellLayout,
  type PageShellCanonicalLayout,
  type PageShellLayoutPreference,
  type PageShellSize,
  type PageShellSizeDefaults,
  writePageShellLayout,
} from "@/lib/page-shell-layout";

export type PageShellLayoutState = {
  beginPreview: (layout: PageShellLayoutPreference) => void;
  canEdit: boolean;
  canReorder: boolean;
  canResize: boolean;
  canonicalLayout: PageShellCanonicalLayout;
  cancelPreview: () => void;
  commitPreview: () => void;
  finishEditing: () => void;
  isEditing: boolean;
  isCanonical: boolean;
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
  canonicalLayout?: PageShellCanonicalLayout,
): PageShellLayoutState {
  const defaultIdsKey = defaultShellIds.join("|");
  const storageKey = userId ? getPageShellLayoutStorageKey(userId) : null;
  const defaults = useMemo(() => (defaultIdsKey ? defaultIdsKey.split("|") : []), [defaultIdsKey]);
  const resolvedCanonicalLayout = useMemo(() => {
    const order = normalizePageShellLayout(canonicalLayout?.order ?? defaults, defaults).order;
    const sizes = getDefaultPageShellSizes(order, canonicalLayout?.sizes ?? defaultSizes);
    return {
      ...canonicalLayout,
      order,
      sizes,
    };
  }, [canonicalLayout, defaultSizes, defaults]);
  const canonicalSizesKey = resolvedCanonicalLayout.order
    .map((id) => `${id}:${resolvedCanonicalLayout.sizes[id]?.span ?? 12}:${resolvedCanonicalLayout.sizes[id]?.heightPx ?? "natural"}`)
    .join("|");
  const instanceKey = [storageKey ?? "anonymous", pageKey, defaultIdsKey, resolvedCanonicalLayout.order.join("|"), canonicalSizesKey].join(":");
  const defaultLayout = useMemo(() => ({ order: [...resolvedCanonicalLayout.order], sizes: resolvedCanonicalLayout.sizes }), [resolvedCanonicalLayout]);
  const [committedLayout, setCommittedLayout] = useState<PageShellLayoutPreference>(defaultLayout);
  const [previewLayout, setPreviewLayout] = useState<PageShellLayoutPreference | null>(null);
  const previewRef = useRef<PageShellLayoutPreference | null>(null);
  const [hasCustomLayoutPreference, setHasCustomLayoutPreference] = useState(false);
  const [hydratedInstanceKey, setHydratedInstanceKey] = useState<string | null>(null);
  const [editingInstanceKey, setEditingInstanceKey] = useState<string | null>(null);
  const canEdit = defaults.length >= 1;
  const canResize = defaults.length >= 1;
  const canReorder = defaults.length >= 2;

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      previewRef.current = null;
      setPreviewLayout(null);
      if (!storageKey || typeof window === "undefined") {
        setCommittedLayout(defaultLayout);
        setHasCustomLayoutPreference(false);
      } else {
        setCommittedLayout(readPageShellLayout(window.localStorage, storageKey, pageKey, resolvedCanonicalLayout.order, resolvedCanonicalLayout.sizes));
        setHasCustomLayoutPreference(hasPageShellLayout(window.localStorage, storageKey, pageKey));
      }
      setHydratedInstanceKey(instanceKey);
    });
    return () => {
      cancelled = true;
    };
  }, [defaultLayout, instanceKey, pageKey, resolvedCanonicalLayout.order, resolvedCanonicalLayout.sizes, storageKey]);

  useEffect(() => {
    if (hydratedInstanceKey !== instanceKey || !storageKey || typeof window === "undefined") {
      return;
    }
    if (!hasCustomLayoutPreference) return;
    writePageShellLayout(window.localStorage, storageKey, pageKey, normalizePageShellLayout(committedLayout, resolvedCanonicalLayout.order, resolvedCanonicalLayout.sizes));
  }, [committedLayout, hasCustomLayoutPreference, hydratedInstanceKey, instanceKey, pageKey, resolvedCanonicalLayout.order, resolvedCanonicalLayout.sizes, storageKey]);

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
    setHasCustomLayoutPreference(true);
    setCommittedLayout(clonePageShellLayout(preview));
  }, [committedLayout]);

  const finishEditing = useCallback(() => {
    cancelPreview();
    setEditingInstanceKey(null);
  }, [cancelPreview]);

  const beginPreview = useCallback((layout: PageShellLayoutPreference) => {
    const normalized = normalizePageShellLayout(layout, resolvedCanonicalLayout.order, resolvedCanonicalLayout.sizes);
    const next = clonePageShellLayout(normalized);
    previewRef.current = next;
    setPreviewLayout(next);
  }, [resolvedCanonicalLayout.order, resolvedCanonicalLayout.sizes]);

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
    setCommittedLayout(clonePageShellLayout(defaultLayout));
    setHasCustomLayoutPreference(false);
    if (storageKey && typeof window !== "undefined") {
      removePageShellLayout(window.localStorage, storageKey, pageKey);
    }
  }, [defaultLayout, pageKey, storageKey]);

  const activeLayout = previewLayout ?? committedLayout;
  return {
    beginPreview,
    canEdit,
    canReorder,
    canResize,
    canonicalLayout: resolvedCanonicalLayout,
    cancelPreview,
    commitPreview,
    finishEditing,
    isEditing: canEdit && editingInstanceKey === instanceKey,
    isCanonical: hydratedInstanceKey !== instanceKey || (!hasCustomLayoutPreference && previewLayout === null),
    order: normalizePageShellLayout(activeLayout, resolvedCanonicalLayout.order, resolvedCanonicalLayout.sizes).order,
    pageKey,
    reset,
    setPreviewOrder,
    setPreviewSizes,
    sizes: normalizePageShellLayout(activeLayout, resolvedCanonicalLayout.order, resolvedCanonicalLayout.sizes).sizes,
    startEditing,
  };
}
