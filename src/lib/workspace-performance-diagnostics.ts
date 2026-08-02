type DiagnosticDependencies = Record<string, unknown>;

export function isWorkspacePerformanceDiagnosticsEnabled() {
  return process.env.NODE_ENV === "development"
    && typeof window !== "undefined"
    && (window as Window & { __ADHDICE_WORKSPACE_PERFORMANCE_DIAGNOSTICS__?: boolean })
      .__ADHDICE_WORKSPACE_PERFORMANCE_DIAGNOSTICS__ === true;
}

export type DevelopmentComputationDiagnostic = {
  activePage: string;
  changedDependencies: string;
  computationName: string;
  historyRevision: string;
  listRevision: string;
  nextRevisionId: string;
  previousRevisionId: string;
  settingsRevision: string;
  sourceOwner: string;
  taskRevision: string;
};

type DiagnosticCapture = {
  activePage: string;
  dependencies: DiagnosticDependencies;
  revisionSources: {
    history: DiagnosticDependencies;
    list: DiagnosticDependencies;
    settings: DiagnosticDependencies;
    task: DiagnosticDependencies;
  };
};

function changedKeys(previous: DiagnosticDependencies | null, next: DiagnosticDependencies) {
  if (!previous) return ["initial"];
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return Array.from(keys).filter((key) => !Object.is(previous[key], next[key]));
}

export function createDevelopmentComputationTracker(computationName: string, sourceOwner: string) {
  let dependencies: DiagnosticDependencies | null = null;
  let runRevision = 0;
  const sourceSnapshots: Record<keyof DiagnosticCapture["revisionSources"], DiagnosticDependencies | null> = {
    history: null,
    list: null,
    settings: null,
    task: null,
  };
  const sourceRevisions = { history: 0, list: 0, settings: 0, task: 0 };

  return {
    capture(next: DiagnosticCapture): DevelopmentComputationDiagnostic {
      const previousRevisionId = runRevision === 0 ? "none" : `${computationName}:r${runRevision}`;
      runRevision += 1;
      const dependencyChanges = changedKeys(dependencies, next.dependencies);
      dependencies = { ...next.dependencies };

      for (const source of Object.keys(sourceSnapshots) as Array<keyof typeof sourceSnapshots>) {
        if (changedKeys(sourceSnapshots[source], next.revisionSources[source]).length > 0) {
          sourceRevisions[source] += 1;
          sourceSnapshots[source] = { ...next.revisionSources[source] };
        }
      }

      return {
        activePage: next.activePage,
        changedDependencies: dependencyChanges.length > 0 ? dependencyChanges.join(",") : "none (repeat evaluation)",
        computationName,
        historyRevision: `history:r${sourceRevisions.history}`,
        listRevision: `list:r${sourceRevisions.list}`,
        nextRevisionId: `${computationName}:r${runRevision}`,
        previousRevisionId,
        settingsRevision: `settings:r${sourceRevisions.settings}`,
        sourceOwner,
        taskRevision: `task:r${sourceRevisions.task}`,
      };
    },
  };
}

export function logDevelopmentComputation(diagnostic: DevelopmentComputationDiagnostic, durationMs: number) {
  if (!isWorkspacePerformanceDiagnosticsEnabled()) return;
  console.info(
    `[workspace:compute] computation=${diagnostic.computationName} owner=${diagnostic.sourceOwner}`
      + ` revision=${diagnostic.previousRevisionId}->${diagnostic.nextRevisionId}`
      + ` changed=${diagnostic.changedDependencies}`
      + ` taskRevision=${diagnostic.taskRevision} historyRevision=${diagnostic.historyRevision}`
      + ` listRevision=${diagnostic.listRevision} settingsRevision=${diagnostic.settingsRevision}`
      + ` activePage=${diagnostic.activePage} durationMs=${Math.round(durationMs)}`,
  );
}
