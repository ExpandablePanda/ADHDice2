import { isWorkspacePerformanceDiagnosticsEnabled } from "@/lib/workspace-performance-diagnostics";

type ProjectionLayer =
  | "active-status"
  | "canonical-entities"
  | "complete-derived"
  | "hierarchy-status"
  | "memberships-search"
  | "workspace-facts";

type ProjectionCacheEntry = {
  revision: string;
  value: unknown;
};

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? String(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
}

function hashRevision(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

/** Content-derived key: equivalent hydration payloads keep the same revision. */
export function createProjectionDomainRevision(domain: string, value: unknown) {
  return `${domain}:${hashRevision(stableSerialize(value))}`;
}

export function combineProjectionRevisions(...revisions: string[]) {
  return hashRevision(revisions.join("|"));
}

export function createTaskDerivationRevisionKey(input: {
  historyRevision: string;
  listRevision: string;
  queryRevision: string;
  settingsRevision: string;
  taskRevision: string;
  viewRevision: string;
}) {
  return combineProjectionRevisions(
    input.taskRevision,
    input.historyRevision,
    input.listRevision,
    input.settingsRevision,
    input.queryRevision,
    input.viewRevision,
  );
}

/**
 * One TaskApp-owned cache. React development replay may call the same memo
 * calculator twice; an equivalent revision must execute its expensive layer once.
 */
export function createStableTaskProjectionCache() {
  const entries = new Map<ProjectionLayer, ProjectionCacheEntry>();
  return {
    getOrCreate<Value>(layer: ProjectionLayer, revision: string, create: () => Value): Value {
      const cached = entries.get(layer);
      if (cached?.revision === revision) {
        if (isWorkspacePerformanceDiagnosticsEnabled()) {
          console.info(`[workspace:cache-hit] layer=${layer} revision=${revision}`);
        }
        return cached.value as Value;
      }
      const value = create();
      entries.set(layer, { revision, value });
      return value;
    },
  };
}
