export type EditingSessionSnapshot<Draft> = Readonly<{
  draftId: string;
  canonicalRecordId: string;
  ownerId: string;
  baseline: Draft;
  draft: Draft;
  dirty: boolean;
  isSaving: boolean;
  saveError: string | null;
  revision: number;
  saveRevision: number | null;
  viewIds: readonly string[];
}>;

type MutableSession<Draft> = EditingSessionSnapshot<Draft>;

function cloneValue<Value>(value: Value, seen = new WeakMap<object, unknown>()): Value {
  if (value === null || typeof value !== "object") return value;
  const existing = seen.get(value);
  if (existing) return existing as Value;
  if (value instanceof Date) return new Date(value.getTime()) as Value;
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) copy.push(cloneValue(item, seen));
    return copy as Value;
  }
  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const [key, child] of Object.entries(value)) copy[key] = cloneValue(child, seen);
  return copy as Value;
}

function freezeValue<Value>(value: Value, seen = new WeakSet<object>()): Value {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freezeValue(child, seen);
  return Object.freeze(value);
}

function immutable<Value>(value: Value): Value {
  return freezeValue(cloneValue(value));
}

const EMPTY_VIEW_IDS: readonly string[] = Object.freeze([]);
const EMPTY_SESSIONS: readonly never[] = Object.freeze([]);
const NO_SESSION = null;

export type EditingSessionStore<Draft> = {
  readonly ownerId: string;
  ensureSession(draftId: string, canonicalRecordId: string, initialDraft: Draft): EditingSessionSnapshot<Draft>;
  getSnapshot(draftId: string): EditingSessionSnapshot<Draft> | null;
  getStoreSnapshot(): Readonly<{ revision: number; sessions: readonly EditingSessionSnapshot<Draft>[] }>;
  subscribeToSession(draftId: string, listener: () => void): () => void;
  subscribe(listener: () => void): () => void;
  attachView(draftId: string, viewId: string): boolean;
  detachView(viewId: string): void;
  getDraftIdsForView(viewId: string): readonly string[];
  canCloseView(viewId: string): boolean;
  updateDraft(draftId: string, update: (current: Draft) => Draft): boolean;
  discardDraft(draftId: string): boolean;
  beginSave(draftId: string): number | null;
  saveSucceeded(draftId: string, saveRevision: number, savedDraft: Draft): boolean;
  saveFailed(draftId: string, saveRevision: number, error: string): boolean;
  rebaseIfClean(draftId: string, nextBaseline: Draft): boolean;
  hasUnsavedDrafts(): boolean;
  reset(): void;
};

export function createEditingSessionStore<Draft>(
  ownerId: string,
  areEqual: (left: Draft, right: Draft) => boolean,
): EditingSessionStore<Draft> {
  const sessions = new Map<string, MutableSession<Draft>>();
  const draftIdsByCanonicalRecord = new Map<string, string>();
  const sessionListeners = new Map<string, Set<() => void>>();
  const storeListeners = new Set<() => void>();
  const draftIdsByView = new Map<string, Set<string>>();
  let storeSnapshot: Readonly<{ revision: number; sessions: readonly EditingSessionSnapshot<Draft>[] }> = Object.freeze({ revision: 0, sessions: EMPTY_SESSIONS });

  function publish(draftId?: string) {
    storeSnapshot = Object.freeze({
      revision: storeSnapshot.revision + 1,
      sessions: Object.freeze([...sessions.values()]),
    });
    if (draftId) for (const listener of sessionListeners.get(draftId) ?? []) listener();
    for (const listener of storeListeners) listener();
  }

  function updateSession(draftId: string, update: (current: MutableSession<Draft>) => MutableSession<Draft>) {
    const current = sessions.get(draftId);
    if (!current) return false;
    const next = update(current);
    if (next === current) return false;
    sessions.set(draftId, next);
    publish(draftId);
    return true;
  }

  return {
    ownerId,
    ensureSession(draftId, canonicalRecordId, initialDraft) {
      const current = sessions.get(draftId);
      if (current) {
        if (current.canonicalRecordId !== canonicalRecordId || current.ownerId !== ownerId) {
          throw new Error("Editing session identity does not match its owner or canonical record.");
        }
        if (!current.dirty && !current.isSaving && !areEqual(current.baseline, initialDraft)) {
          const nextBaseline = immutable(initialDraft);
          return updateSession(draftId, (session) => ({
            ...session,
            baseline: nextBaseline,
            draft: nextBaseline,
            dirty: false,
            saveError: null,
          })) ? sessions.get(draftId)! : current;
        }
        return current;
      }
      const existingDraftId = draftIdsByCanonicalRecord.get(canonicalRecordId);
      if (existingDraftId && existingDraftId !== draftId) {
        throw new Error("A canonical record can only own one editing session identity.");
      }
      const nextDraft = immutable(initialDraft);
      const session: MutableSession<Draft> = Object.freeze({
        draftId,
        canonicalRecordId,
        ownerId,
        baseline: nextDraft,
        draft: nextDraft,
        dirty: false,
        isSaving: false,
        saveError: null,
        revision: 0,
        saveRevision: null,
        viewIds: EMPTY_VIEW_IDS,
      });
      sessions.set(draftId, session);
      draftIdsByCanonicalRecord.set(canonicalRecordId, draftId);
      publish(draftId);
      return session;
    },
    getSnapshot(draftId) {
      return sessions.get(draftId) ?? NO_SESSION;
    },
    getStoreSnapshot() {
      return storeSnapshot;
    },
    subscribeToSession(draftId, listener) {
      const listeners = sessionListeners.get(draftId) ?? new Set();
      listeners.add(listener);
      sessionListeners.set(draftId, listeners);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) sessionListeners.delete(draftId);
      };
    },
    subscribe(listener) {
      storeListeners.add(listener);
      return () => storeListeners.delete(listener);
    },
    attachView(draftId, viewId) {
      if (!viewId || !sessions.has(draftId)) return false;
      const current = sessions.get(draftId)!;
      if (current.viewIds.includes(viewId)) return true;
      const nextViewIds = Object.freeze([...current.viewIds, viewId]);
      sessions.set(draftId, Object.freeze({ ...current, viewIds: nextViewIds }));
      const draftIds = draftIdsByView.get(viewId) ?? new Set<string>();
      draftIds.add(draftId);
      draftIdsByView.set(viewId, draftIds);
      publish(draftId);
      return true;
    },
    detachView(viewId) {
      const draftIds = draftIdsByView.get(viewId);
      if (!draftIds) return;
      draftIdsByView.delete(viewId);
      for (const draftId of draftIds) {
        const current = sessions.get(draftId);
        if (!current) continue;
        const viewIds = Object.freeze(current.viewIds.filter((candidate) => candidate !== viewId));
        if (viewIds.length === 0 && !current.dirty && !current.isSaving) {
          sessions.delete(draftId);
          if (draftIdsByCanonicalRecord.get(current.canonicalRecordId) === draftId) {
            draftIdsByCanonicalRecord.delete(current.canonicalRecordId);
          }
        }
        else sessions.set(draftId, Object.freeze({ ...current, viewIds }));
        publish(draftId);
      }
    },
    getDraftIdsForView(viewId) {
      return Object.freeze([...(draftIdsByView.get(viewId) ?? [])]);
    },
    canCloseView(viewId) {
      const draftIds = draftIdsByView.get(viewId);
      if (!draftIds) return true;
      for (const draftId of draftIds) {
        const session = sessions.get(draftId);
        if ((session?.dirty || session?.isSaving) && session.viewIds.length === 1) return false;
      }
      return true;
    },
    updateDraft(draftId, update) {
      return updateSession(draftId, (current) => {
        if (current.isSaving) return current;
        const nextDraft = immutable(update(current.draft));
        if (areEqual(current.draft, nextDraft)) return current;
        return Object.freeze({
          ...current,
          draft: nextDraft,
          dirty: !areEqual(current.baseline, nextDraft),
          saveError: null,
          revision: current.revision + 1,
        });
      });
    },
    discardDraft(draftId) {
      return updateSession(draftId, (current) => {
        if (current.isSaving || (!current.dirty && !current.saveError)) return current;
        const baseline = immutable(current.baseline);
        return Object.freeze({ ...current, draft: baseline, dirty: false, saveError: null, revision: current.revision + 1 });
      });
    },
    beginSave(draftId) {
      const current = sessions.get(draftId);
      if (!current || current.isSaving) return null;
      const saveRevision = current.revision;
      updateSession(draftId, (session) => Object.freeze({ ...session, isSaving: true, saveRevision, saveError: null }));
      return saveRevision;
    },
    saveSucceeded(draftId, saveRevision, savedDraft) {
      return updateSession(draftId, (current) => {
        if (!current.isSaving || current.saveRevision !== saveRevision) return current;
        const reconciled = immutable(savedDraft);
        return Object.freeze({
          ...current,
          baseline: reconciled,
          draft: reconciled,
          dirty: false,
          isSaving: false,
          saveError: null,
          saveRevision: null,
          revision: current.revision + 1,
        });
      });
    },
    saveFailed(draftId, saveRevision, error) {
      return updateSession(draftId, (current) => {
        if (!current.isSaving || current.saveRevision !== saveRevision) return current;
        return Object.freeze({ ...current, isSaving: false, saveError: error, saveRevision: null });
      });
    },
    rebaseIfClean(draftId, nextBaseline) {
      const current = sessions.get(draftId);
      if (!current || current.dirty || current.isSaving || areEqual(current.baseline, nextBaseline)) return false;
      const baseline = immutable(nextBaseline);
      return updateSession(draftId, (session) => Object.freeze({ ...session, baseline, draft: baseline, dirty: false, saveError: null }));
    },
    hasUnsavedDrafts() {
      return [...sessions.values()].some((session) => session.dirty || session.isSaving);
    },
    reset() {
      if (sessions.size === 0 && draftIdsByView.size === 0) return;
      const activeSessionListeners = [...sessionListeners.values()].flatMap((listeners) => [...listeners]);
      sessions.clear();
      draftIdsByCanonicalRecord.clear();
      draftIdsByView.clear();
      publish();
      for (const listener of activeSessionListeners) listener();
    },
  };
}
