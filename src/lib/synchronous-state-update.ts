export type SynchronousStateUpdater<T> = T | ((current: T) => T);

export function updateSynchronousState<T>(
  reference: { current: T },
  updater: SynchronousStateUpdater<T>,
  publish: (next: T) => void,
) {
  const current = reference.current;
  const next = typeof updater === "function" ? updater(current) : updater;
  if (next !== current) {
    reference.current = next;
    publish(next);
  }
  return next;
}
