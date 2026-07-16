export type TaskEditorFocusPhase =
  | "not_owner"
  | "waiting_for_target"
  | "select_panel"
  | "waiting_for_input"
  | "focus_input"
  | "acknowledge"
  | "handled";

type TaskEditorFocusRequestLike = {
  field: string;
  taskId: string;
  token: number;
};

type ResolveTaskEditorFocusPhaseInput = {
  activeMetadataPanel: string | null;
  handled: boolean;
  inputMounted: boolean;
  inputOwnsFocus: boolean;
  request: TaskEditorFocusRequestLike | null;
  resolvedMetadataTaskId: string | null;
  visibleOwner: boolean;
};

type TaskEditorChildRouteState = {
  metadataTargetTaskId: string | null;
  requestedOpenTaskId: string | null;
  selectedTaskId: string | null;
};

export function isTaskEditorChildRouteSettled({
  metadataTargetTaskId,
  requestedOpenTaskId,
  selectedTaskId,
}: TaskEditorChildRouteState) {
  return Boolean(
    requestedOpenTaskId
    && selectedTaskId
    && selectedTaskId !== requestedOpenTaskId
    && metadataTargetTaskId === requestedOpenTaskId,
  );
}

export function resolveTaskEditorFocusPhase({
  activeMetadataPanel,
  handled,
  inputMounted,
  inputOwnsFocus,
  request,
  resolvedMetadataTaskId,
  visibleOwner,
}: ResolveTaskEditorFocusPhaseInput): TaskEditorFocusPhase {
  if (!visibleOwner) {
    return "not_owner";
  }
  if (!request || request.field !== "estimated_time") {
    return "handled";
  }
  if (handled) {
    return "handled";
  }
  if (!resolvedMetadataTaskId || resolvedMetadataTaskId !== request.taskId) {
    return "waiting_for_target";
  }
  if (activeMetadataPanel !== "estimated") {
    return "select_panel";
  }
  if (!inputMounted) {
    return "waiting_for_input";
  }
  if (!inputOwnsFocus) {
    return "focus_input";
  }
  return "acknowledge";
}
