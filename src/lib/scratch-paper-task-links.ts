import type { Task } from "@/lib/database.types";

export type LinkableTaskSearchCandidate = Pick<Task, "notes" | "tags" | "title">;

export type ScratchTaskTokenSegment =
  | { kind: "text"; text: string }
  | { fallbackTitle: string; kind: "task"; taskId: string };

export type ScratchSlashCommand = {
  query: string;
  range: {
    end: number;
    start: number;
  };
};

const TASK_TOKEN_PATTERN = /\[\[task:([^\]|]+)\|([^\]]*)\]\]/g;
const TASK_TOKEN_AT_END_PATTERN = /\[\[task:[^\]|]+\|[^\]]*\]\]$/;

function sanitizeTaskTokenTitle(title: string) {
  return title.replaceAll("|", "/").replaceAll("]", ")");
}

function isLinkableScratchTask(task: Pick<Task, "status">) {
  return task.status !== "archived" && task.status !== "complete" && task.status !== "trashed";
}

export function buildScratchTaskLinkToken(task: Pick<Task, "id" | "title">) {
  return `[[task:${task.id}|${sanitizeTaskTokenTitle(task.title.trim() || "Untitled task")}]]`;
}

export function extractScratchSlashCommand(body: string, caretOffset = body.length): ScratchSlashCommand | null {
  const commandEnd = Math.max(0, Math.min(caretOffset, body.length));
  const bodyBeforeCaret = body.slice(0, commandEnd);
  const lastLineStart = bodyBeforeCaret.lastIndexOf("\n") + 1;
  const line = bodyBeforeCaret.slice(lastLineStart);
  const slashIndex = line.lastIndexOf("/");

  if (slashIndex < 0) {
    return null;
  }

  const contentBeforeSlash = line.slice(0, slashIndex);
  if (slashIndex > 0 && /\S/.test(line[slashIndex - 1] ?? "") && !TASK_TOKEN_AT_END_PATTERN.test(contentBeforeSlash)) {
    return null;
  }

  const query = line.slice(slashIndex + 1);
  if (/[\[\]\n]/.test(query)) {
    return null;
  }

  return {
    query,
    range: {
      end: commandEnd,
      start: lastLineStart + slashIndex,
    },
  };
}

export function extractScratchSlashCommandFromAnchor(body: string, slashStart: number, caretOffset = body.length): ScratchSlashCommand | null {
  const commandStart = Math.max(0, Math.min(slashStart, body.length));
  const commandEnd = Math.max(commandStart, Math.min(caretOffset, body.length));
  if (body[commandStart] !== "/" || commandEnd <= commandStart) {
    return null;
  }

  const query = body.slice(commandStart + 1, commandEnd);
  if (/[\[\]\n]/.test(query)) {
    return null;
  }

  return {
    query,
    range: {
      end: commandEnd,
      start: commandStart,
    },
  };
}

export function filterScratchLinkableTasks(tasks: Task[], query: string, linkedTaskIds: string[]) {
  const normalizedQuery = query.trim().toLowerCase();
  const linkedIdSet = new Set(linkedTaskIds);
  return tasks.filter((task) => {
    if (linkedIdSet.has(task.id) || !isLinkableScratchTask(task)) {
      return false;
    }

    return matchesLinkableTaskSearch(task, normalizedQuery);
  });
}

export function matchesLinkableTaskSearch(task: LinkableTaskSearchCandidate, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return true;
  }

  return task.title.toLowerCase().includes(normalizedQuery)
    || (typeof task.notes === "string" && task.notes.toLowerCase().includes(normalizedQuery))
    || task.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery));
}

export function parseScratchTaskTokenSegments(body: string): ScratchTaskTokenSegment[] {
  const segments: ScratchTaskTokenSegment[] = [];
  let lastIndex = 0;

  for (const match of body.matchAll(TASK_TOKEN_PATTERN)) {
    const fullMatch = match[0];
    const taskId = match[1];
    const fallbackTitle = match[2];
    const matchIndex = match.index ?? -1;
    if (matchIndex < 0) {
      continue;
    }

    if (matchIndex > lastIndex) {
      segments.push({ kind: "text", text: body.slice(lastIndex, matchIndex) });
    }

    segments.push({
      fallbackTitle,
      kind: "task",
      taskId,
    });
    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < body.length || segments.length === 0) {
    segments.push({ kind: "text", text: body.slice(lastIndex) });
  }

  return segments;
}

export function removeScratchTaskToken(body: string, taskId: string) {
  return body.replaceAll(TASK_TOKEN_PATTERN, (fullMatch, currentTaskId: string) => (
    currentTaskId === taskId ? "" : fullMatch
  )).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/ {2,}/g, " ").trimEnd();
}

export function stripScratchTaskTokens(body: string) {
  return body.replaceAll(TASK_TOKEN_PATTERN, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/ {2,}/g, " ").trimEnd();
}

export function removeScratchLinkQuery(body: string, range: { end: number; start: number }) {
  const before = body.slice(0, range.start);
  const after = /[ \t]$/.test(before) ? body.slice(range.end).replace(/^[ \t]+/, "") : body.slice(range.end);
  const needsSpace = before.length > 0 && after.length > 0 && !/\s/.test(before[before.length - 1] ?? "") && !/[\s),.!?]/.test(after[0] ?? "");

  return `${before}${needsSpace ? " " : ""}${after}`;
}

export function replaceScratchRangeWithTaskToken(
  body: string,
  range: { end: number; start: number },
  task: Pick<Task, "id" | "title">,
) {
  const token = buildScratchTaskLinkToken(task);
  const before = body.slice(0, range.start);
  const after = body.slice(range.end);
  const needsLeadingSpace = before.length > 0 && !/\s/.test(before[before.length - 1] ?? "");
  const needsTrailingSpace = after.length > 0 && !/[\s),.!?]/.test(after[0] ?? "");

  return `${before}${needsLeadingSpace ? " " : ""}${token}${needsTrailingSpace ? " " : ""}${after}`;
}
