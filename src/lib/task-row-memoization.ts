export type TaskRowMemoProps = {
  rowModel: unknown;
  taskId: string;
  uiRevision: string;
};

export function areTaskRowPropsEqual(previous: TaskRowMemoProps, next: TaskRowMemoProps) {
  return previous.rowModel === next.rowModel
    && previous.taskId === next.taskId
    && previous.uiRevision === next.uiRevision;
}
