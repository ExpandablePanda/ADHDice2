import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const functionRoot = resolve(repoRoot, "supabase/functions/task-state-command");
const entrypoint = resolve(functionRoot, "index.ts");
const backfillFunctionRoot = resolve(repoRoot, "supabase/functions/task-current-projection-backfill");
const backfillEntrypoint = resolve(backfillFunctionRoot, "index.ts");
const activeStatusProjectionEntrypoint = resolve(repoRoot, "src/lib/task-state-canonical/active-status-read.ts");

function localImportSpecifiers(source: string) {
  return [
    ...source.matchAll(/\bfrom\s+["']([^"']+)["']/g),
    ...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
  ].map((match) => match[1]);
}

function resolveLocalImport(importer: string, specifier: string) {
  if (specifier.startsWith("npm:")) return null;
  if (specifier.startsWith("@/")) {
    throw new Error(`Broad or undeclared Edge alias remains: ${specifier} in ${relative(repoRoot, importer)}`);
  }
  if (!specifier.startsWith(".")) {
    throw new Error(`Unexpected non-relative Edge import: ${specifier} in ${relative(repoRoot, importer)}`);
  }
  const candidate = resolve(dirname(importer), specifier);
  const resolved = candidate.endsWith(".ts") ? candidate : `${candidate}.ts`;
  if (!existsSync(resolved)) {
    throw new Error(`Unresolved Edge import: ${specifier} in ${relative(repoRoot, importer)}`);
  }
  return resolved;
}

function collectLocalGraph(start = entrypoint) {
  const graph = new Set<string>();
  const pending = [start];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (graph.has(current)) continue;
    graph.add(current);
    const source = readFileSync(current, "utf8");
    for (const specifier of localImportSpecifiers(source)) {
      const resolved = resolveLocalImport(current, specifier);
      if (resolved) pending.push(resolved);
    }
  }
  return graph;
}

test("task-state-command uses no broad alias and has a narrow resolvable local graph", () => {
  const config = JSON.parse(readFileSync(resolve(functionRoot, "deno.json"), "utf8")) as {
    imports?: Record<string, string>;
  };
  assert.deepEqual(config.imports ?? {}, {});

  const graph = collectLocalGraph();
  const graphPaths = new Set([...graph].map((file) => relative(repoRoot, file)));
  const expectedPaths = new Set([
    "supabase/functions/task-state-command/index.ts",
    "supabase/functions/task-state-command/auth.ts",
    "supabase/functions/task-state-command/orchestration.ts",
    "supabase/functions/task-state-command/domain.ts",
    "src/lib/custom-behavior-rulesets.ts",
    "src/lib/database.types.ts",
    "src/lib/date-key.ts",
    "src/lib/records/persisted-types.ts",
    "src/lib/stable-task-projection.ts",
    "src/lib/task-current-projection-rebuild.ts",
    "src/lib/task-current-projection.ts",
    "src/lib/task-history-cutover.ts",
    "src/lib/task-history-last-handled.ts",
    "src/lib/task-history-streak-summaries.ts",
    "src/lib/task-history.ts",
    "src/lib/task-repeat.ts",
    "src/lib/task-state-canonical/active-status-read.ts",
    "src/lib/task-state-canonical/command-service.ts",
    "src/lib/task-state-canonical/digest.ts",
    "src/lib/task-state-canonical/engine-input.ts",
    "src/lib/task-state-canonical/history-deduplication.ts",
    "src/lib/task-state-canonical/history-projection.ts",
    "src/lib/task-state-canonical/read-model.ts",
    "src/lib/task-state-canonical/schedule-projection.ts",
    "src/lib/task-state-canonical/types.ts",
    "src/lib/task-state-engine/action-authority.ts",
    "src/lib/task-state-engine/behavior-policy.ts",
    "src/lib/task-state-engine/calendar-authority.ts",
    "src/lib/task-state-engine/calendar.ts",
    "src/lib/task-state-engine/direct-input.ts",
    "src/lib/task-state-engine/effective-timeline.ts",
    "src/lib/task-state-engine/engine.ts",
    "src/lib/task-state-engine/persistence-projection.ts",
    "src/lib/task-state-engine/recurrence.ts",
    "src/lib/task-state-engine/types.ts",
    "src/lib/task-tracking.ts",
    "src/lib/task-type-behavior-profiles.ts",
    "src/lib/task-type-domain.ts",
    "src/lib/task-type-presentation-domain.ts",
    "src/lib/workspace-performance-diagnostics.ts",
  ]);

  assert.deepEqual([...graphPaths].sort(), [...expectedPaths].sort());
  for (const path of graphPaths) {
    assert.doesNotMatch(path, /^src\/(app|components|hooks)\//);
    assert.doesNotMatch(path, /(?:health|achievements|paths|hud|focus)/i);
  }
  assert.equal(graphPaths.has("src/lib/records/types.ts"), false);
});

test("compact Active Status projection has a Deno-resolvable server-safe local graph", () => {
  const graph = collectLocalGraph(activeStatusProjectionEntrypoint);
  const graphPaths = new Set([...graph].map((file) => relative(repoRoot, file)));

  assert.equal(graphPaths.has("src/lib/task-state-canonical/active-status-read.ts"), true);
  assert.equal(graphPaths.has("src/lib/task-state-canonical/history-deduplication.ts"), true);
  for (const path of graphPaths) {
    assert.doesNotMatch(path, /^src\/(app|components|hooks)\//);
    assert.doesNotMatch(path, /(?:task-history|stable-task-projection)/i);
  }
});

test("current projection backfill has a Deno-resolvable local graph with no broad alias", () => {
  const config = JSON.parse(readFileSync(resolve(backfillFunctionRoot, "deno.json"), "utf8")) as {
    imports?: Record<string, string>;
  };
  assert.deepEqual(config.imports ?? {}, {});

  const graphPaths = new Set([...collectLocalGraph(backfillEntrypoint)].map((file) => relative(repoRoot, file)));
  for (const path of graphPaths) {
    assert.doesNotMatch(path, /^src\/(app|components|hooks)\//);
  }
  assert.equal(graphPaths.has("supabase/functions/task-current-projection-backfill/index.ts"), true);
  assert.equal(graphPaths.has("supabase/functions/task-current-projection-backfill/domain.ts"), true);
  assert.equal(graphPaths.has("supabase/functions/task-state-command/auth.ts"), true);
  assert.equal(graphPaths.has("src/lib/task-current-projection-rebuild.ts"), true);
});
