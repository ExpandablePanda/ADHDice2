export type TaskTableColumnAlignment = "left" | "center" | "right";

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
  return getTaskTableAlignmentClass(columnId === "title" ? "left" : alignment);
}
