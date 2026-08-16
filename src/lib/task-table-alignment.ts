export type TaskTableColumnAlignment = "left" | "center" | "right";

export const TASK_TABLE_GRID_ORIGIN_PX = 10;
export const TASK_TABLE_GRID_ORIGIN_CLASS = "ml-[10px]";

export function getTaskTableAlignmentClass(alignment: TaskTableColumnAlignment) {
  if (alignment === "left") return "items-start text-left justify-start";
  if (alignment === "right") return "items-end text-right justify-end";
  return "items-center text-center justify-center";
}

export function getTaskTableInlineAlignmentClass(alignment: TaskTableColumnAlignment) {
  if (alignment === "left") return "justify-start";
  if (alignment === "right") return "justify-end";
  return "justify-center";
}

export function getTaskTableChildAlignmentClass(
  columnId: string,
  alignment: TaskTableColumnAlignment,
) {
  const resolvedAlignment = columnId === "title" ? "left" : alignment;
  if (resolvedAlignment === "left") return "items-center text-left justify-start";
  if (resolvedAlignment === "right") return "items-center text-right justify-end";
  return "items-center text-center justify-center";
}
