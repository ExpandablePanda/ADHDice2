import type {
  TaskEnergy,
  TaskPriority,
  TaskRepeatFrequency,
  TaskStatus,
} from "@/lib/database.types";
import { formatDateKey, shiftDateKey } from "@/lib/task-grid-layout";

export type ImportedTaskWarning = {
  line: number;
  message: string;
};

export type ImportedTaskSubtask = {
  actualSeconds: number | null;
  children: ImportedTaskSubtask[];
  dueOn: string | null;
  dueTime: string | null;
  energy: TaskEnergy;
  estimatedMinutes: number | null;
  id: string;
  isImportant: boolean;
  isUrgent: boolean;
  line: number;
  priority: TaskPriority;
  repeatFrequency: TaskRepeatFrequency;
  status: TaskStatus;
  tags: string[];
  title: string;
};

export type ImportedTaskDraft = {
  actualSeconds: number | null;
  dueOn: string | null;
  dueTime: string | null;
  energy: TaskEnergy;
  estimatedMinutes: number | null;
  isImportant: boolean;
  isUrgent: boolean;
  line: number;
  repeatFrequency: TaskRepeatFrequency;
  status: TaskStatus;
  subtasks: ImportedTaskSubtask[];
  tags: string[];
  title: string;
  priority: TaskPriority;
};

export function parseTagList(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

export function isProbablyValidUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseImportedTaskLines(
  lines: string[],
  options?: { todayDateKey?: string },
) {
  const todayDateKey = options?.todayDateKey ?? formatDateKey(new Date());
  const tasks: ImportedTaskDraft[] = [];
  const warnings: ImportedTaskWarning[] = [];
  let currentTask: ImportedTaskDraft | null = null;
  let stepStack: ImportedTaskSubtask[] = [];

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const trimmed = rawLine.trim();
    if (!trimmed) {
      return;
    }

    const stepMatch = trimmed.match(/^(-+)(.*)$/);
    if (!stepMatch) {
      const parsedTask = parseParentTaskLine(trimmed, lineNumber, todayDateKey);
      if (!parsedTask) {
        warnings.push({ line: lineNumber, message: "Line did not produce a usable task title." });
        currentTask = null;
        stepStack = [];
        return;
      }

      tasks.push(parsedTask.task);
      warnings.push(...parsedTask.warnings);
      currentTask = parsedTask.task;
      stepStack = [];
      return;
    }

    if (!currentTask) {
      warnings.push({ line: lineNumber, message: "Step skipped because there was no parent task above it." });
      return;
    }

    const depth = stepMatch[1].length;
    const content = stepMatch[2]?.trim() ?? "";
    const parsedStep = parseStepLine(content, lineNumber, todayDateKey);
    if (!parsedStep) {
      warnings.push({ line: lineNumber, message: "Step line did not produce a usable step title." });
      return;
    }

    warnings.push(...parsedStep.warnings);
    const nextSubtask = parsedStep.subtask;
    if (depth === 1) {
      currentTask.subtasks.push(nextSubtask);
      stepStack = [nextSubtask];
      return;
    }

    const parentStep = stepStack[depth - 2];
    if (!parentStep) {
      warnings.push({
        line: lineNumber,
        message: `Substep depth ${depth} could not attach because there was no parent step at depth ${depth - 1}.`,
      });
      return;
    }

    parentStep.children.push(nextSubtask);
    stepStack = [...stepStack.slice(0, depth - 1), nextSubtask];
  });

  return {
    tasks,
    warnings,
  };
}

function parseParentTaskLine(
  value: string,
  line: number,
  todayDateKey: string,
) {
  const parsed = parseImportTokens(value);
  const warnings: ImportedTaskWarning[] = parsed.warnings.map((warning) => ({ ...warning, line }));
  const task = {
    actualSeconds: null,
    dueOn: null,
    dueTime: null,
    energy: "none" as TaskEnergy,
    estimatedMinutes: null,
    isImportant: false,
    isUrgent: false,
    line,
    priority: "normal" as TaskPriority,
    repeatFrequency: "none" as TaskRepeatFrequency,
    status: "pending" as TaskStatus,
    subtasks: [] as ImportedTaskSubtask[],
    tags: parsed.tags,
    title: parsed.title,
  };

  for (const token of parsed.metadataTokens) {
    const handled = applyParentMetadataToken(task, token.field, token.value, todayDateKey);
    if (handled.warning) {
      warnings.push({ line, message: handled.warning });
    }
  }

  if (!task.title) {
    return null;
  }

  return {
    task,
    warnings,
  };
}

function parseStepLine(
  value: string,
  line: number,
  todayDateKey: string,
) {
  const parsed = parseImportTokens(value);
  const warnings: ImportedTaskWarning[] = parsed.warnings.map((warning) => ({ ...warning, line }));
  const subtask: ImportedTaskSubtask = {
    actualSeconds: null,
    children: [],
    dueOn: null,
    dueTime: null,
    energy: "none",
    estimatedMinutes: null,
    id: createImportedSubtaskId(line),
    isImportant: false,
    isUrgent: false,
    line,
    priority: "normal",
    repeatFrequency: "none",
    status: "pending",
    tags: parsed.tags,
    title: parsed.title,
  };

  for (const token of parsed.metadataTokens) {
    const handled = applyStepMetadataToken(subtask, token.field, token.value, todayDateKey);
    if (handled.warning) {
      warnings.push({ line, message: handled.warning });
    }
  }

  if (!subtask.title) {
    return null;
  }

  return { subtask, warnings };
}

function parseImportTokens(value: string) {
  const warnings: ImportedTaskWarning[] = [];
  const titleParts: string[] = [];
  const tags: string[] = [];
  const metadataTokens: Array<{ field: string; value: string }> = [];

  for (const token of value.split(/\s+/).filter(Boolean)) {
    if (token.startsWith("#")) {
      const normalizedTag = normalizeTagToken(token.slice(1));
      if (normalizedTag) {
        tags.push(normalizedTag);
      } else {
        warnings.push({ line: 0, message: `Ignored malformed tag token "${token}".` });
      }
      continue;
    }

    if (token.startsWith("*")) {
      const separatorIndex = token.indexOf("-", 1);
      if (separatorIndex <= 1 || separatorIndex === token.length - 1) {
        warnings.push({ line: 0, message: `Ignored malformed metadata token "${token}".` });
        continue;
      }

      metadataTokens.push({
        field: normalizeMetadataField(token.slice(1, separatorIndex)),
        value: token.slice(separatorIndex + 1),
      });
      continue;
    }

    titleParts.push(token);
  }

  return {
    metadataTokens,
    tags: Array.from(new Set(tags)),
    title: titleParts.join(" ").trim(),
    warnings,
  };
}

function createImportedSubtaskId(line: number) {
  return `import-step-${line}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTagToken(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return normalized || null;
}

function normalizeMetadataField(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function normalizeOptionValue(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function applyParentMetadataToken(
  task: ImportedTaskDraft,
  field: string,
  rawValue: string,
  todayDateKey: string,
) {
  const value = rawValue.trim();

  if (field === "due" || field === "date") {
    const parsed = parseDueDateValue(value, todayDateKey);
    if (!parsed) {
      return { warning: `Could not parse due value "${rawValue}".` };
    }
    task.dueOn = parsed;
    return {};
  }

  if (field === "time" || field === "due_time") {
    const parsed = parseDueTimeValue(value);
    if (!parsed) {
      return { warning: `Could not parse due time "${rawValue}".` };
    }
    task.dueTime = parsed;
    return {};
  }

  if (field === "repeat" || field === "repeats") {
    const parsed = parseRepeatValue(value);
    if (!parsed) {
      return { warning: `Could not parse repeat value "${rawValue}".` };
    }
    task.repeatFrequency = parsed;
    return {};
  }

  if (field === "status") {
    const parsed = parseTaskStatusValue(value);
    if (!parsed) {
      return { warning: `Could not parse status value "${rawValue}".` };
    }
    task.status = parsed;
    return {};
  }

  if (field === "energy") {
    const parsed = parseEnergyValue(value);
    if (!parsed) {
      return { warning: `Could not parse energy value "${rawValue}".` };
    }
    task.energy = parsed;
    return {};
  }

  if (field === "priority") {
    const parsed = parsePriorityValue(value);
    if (!parsed) {
      return { warning: `Could not parse priority value "${rawValue}".` };
    }
    if (parsed.kind === "priority") {
      task.priority = parsed.value;
      return {};
    }
    if (parsed.kind === "flag") {
      if (parsed.value === "urgent") task.isUrgent = true;
      if (parsed.value === "important") task.isImportant = true;
      return {};
    }
    return { warning: `Priority value "${rawValue}" is not supported by the current import path.` };
  }

  if (field === "estimate" || field === "est") {
    const parsed = parseDurationMinutesValue(value);
    if (parsed === null) {
      return { warning: `Could not parse estimate value "${rawValue}".` };
    }
    task.estimatedMinutes = parsed;
    return {};
  }

  if (field === "actual") {
    const parsed = parseDurationMinutesValue(value);
    if (parsed === null) {
      return { warning: `Could not parse actual value "${rawValue}".` };
    }
    task.actualSeconds = parsed * 60;
    return {};
  }

  if (field === "list") {
    return { warning: `List metadata "${rawValue}" was skipped because task lists are not stored on the task row itself.` };
  }

  return { warning: `Unknown metadata field "${field}" was skipped.` };
}

function applyStepMetadataToken(
  subtask: ImportedTaskSubtask,
  field: string,
  rawValue: string,
  todayDateKey: string,
) {
  const value = rawValue.trim();

  if (field === "due" || field === "date") {
    const parsed = parseDueDateValue(value, todayDateKey);
    if (!parsed) {
      return { warning: `Could not parse step due value "${rawValue}".` };
    }
    subtask.dueOn = parsed;
    return {};
  }

  if (field === "time" || field === "due_time") {
    const parsed = parseDueTimeValue(value);
    if (!parsed) {
      return { warning: `Could not parse step due time "${rawValue}".` };
    }
    subtask.dueTime = parsed;
    return {};
  }

  if (field === "repeat" || field === "repeats") {
    const parsed = parseRepeatValue(value);
    if (!parsed) {
      return { warning: `Could not parse step repeat value "${rawValue}".` };
    }
    subtask.repeatFrequency = parsed;
    return {};
  }

  if (field === "status") {
    const parsed = parseTaskStatusValue(value);
    if (!parsed) {
      return { warning: `Could not parse step status value "${rawValue}".` };
    }
    subtask.status = parsed;
    return {};
  }

  if (field === "estimate" || field === "est") {
    const parsed = parseDurationMinutesValue(value);
    if (parsed === null) {
      return { warning: `Could not parse step estimate value "${rawValue}".` };
    }
    subtask.estimatedMinutes = parsed;
    return {};
  }

  if (field === "actual") {
    const parsed = parseDurationMinutesValue(value);
    if (parsed === null) {
      return { warning: `Could not parse step actual value "${rawValue}".` };
    }
    subtask.actualSeconds = parsed * 60;
    return {};
  }

  if (field === "energy") {
    const parsed = parseEnergyValue(value);
    if (!parsed) {
      return { warning: `Could not parse step energy value "${rawValue}".` };
    }
    subtask.energy = parsed;
    return {};
  }

  if (field === "priority") {
    const parsed = parsePriorityValue(value);
    if (!parsed) {
      return { warning: `Could not parse step priority value "${rawValue}".` };
    }
    if (parsed.kind === "priority") {
      subtask.priority = parsed.value;
      return {};
    }
    if (parsed.kind === "flag") {
      if (parsed.value === "urgent") subtask.isUrgent = true;
      if (parsed.value === "important") subtask.isImportant = true;
      return {};
    }
    return { warning: `Step priority value "${rawValue}" is not supported by the current import path.` };
  }

  if (field === "list") {
    return { warning: `Step list metadata "${rawValue}" was skipped because task lists are not stored on the task row itself.` };
  }

  return { warning: `Unknown step metadata field "${field}" was skipped.` };
}

function parseDueDateValue(value: string, todayDateKey: string) {
  const normalized = normalizeOptionValue(value);
  if (normalized === "today") {
    return todayDateKey;
  }
  if (normalized === "tomorrow") {
    return shiftDateKey(todayDateKey, 1);
  }

  const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return buildValidatedDateKey(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return buildValidatedDateKey(Number(slashMatch[3]), Number(slashMatch[1]), Number(slashMatch[2]));
  }

  return null;
}

function buildValidatedDateKey(year: number, month: number, day: number) {
  const candidate = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    candidate.getFullYear() !== year
    || candidate.getMonth() !== month - 1
    || candidate.getDate() !== day
  ) {
    return null;
  }
  return formatDateKey(candidate);
}

function parseDueTimeValue(value: string) {
  const normalized = value.trim().toLowerCase();
  const twentyFourHourMatch = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHourMatch) {
    const hours = Number(twentyFourHourMatch[1]);
    const minutes = Number(twentyFourHourMatch[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
    return null;
  }

  const twelveHourMatch = normalized.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (!twelveHourMatch) {
    return null;
  }

  const rawHours = Number(twelveHourMatch[1]);
  const minutes = Number(twelveHourMatch[2] ?? "0");
  if (rawHours < 1 || rawHours > 12 || minutes < 0 || minutes > 59) {
    return null;
  }

  const suffix = twelveHourMatch[3];
  const normalizedHours = suffix === "pm"
    ? rawHours % 12 + 12
    : rawHours % 12;
  return `${String(normalizedHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function parseRepeatValue(value: string) {
  const normalized = normalizeOptionValue(value);
  if (
    normalized === "none"
    || normalized === "daily"
    || normalized === "weekly"
    || normalized === "monthly"
    || normalized === "daily_until_complete"
  ) {
    return normalized as TaskRepeatFrequency;
  }
  return null;
}

function parseTaskStatusValue(value: string) {
  const normalized = normalizeOptionValue(value);
  const aliased = normalizeStatusAlias(normalized);
  if (aliased === "pending" || aliased === "in_progress" || aliased === "done" || aliased === "missed" || aliased === "did_my_best" || aliased === "upcoming" || aliased === "not_due" || aliased === "delayed" || aliased === "archived" || aliased === "trashed") {
    return aliased as TaskStatus;
  }
  return null;
}

function normalizeStatusAlias(value: string) {
  if (value === "inprogress") return "in_progress";
  if (value === "didbest" || value === "did_mybest" || value === "didmybest") return "did_my_best";
  if (value === "notdue") return "not_due";
  return value;
}

function parseEnergyValue(value: string) {
  const normalized = normalizeOptionValue(value);
  if (normalized === "none" || normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized as TaskEnergy;
  }
  return null;
}

function parsePriorityValue(value: string) {
  const normalized = normalizeOptionValue(value);
  if (normalized === "low" || normalized === "normal" || normalized === "high") {
    return { kind: "priority" as const, value: normalized as TaskPriority };
  }
  if (normalized === "urgent" || normalized === "important") {
    return { kind: "flag" as const, value: normalized };
  }
  if (normalized === "focus") {
    return { kind: "unsupported" as const, value: normalized };
  }
  return null;
}

function parseDurationMinutesValue(value: string) {
  const normalized = value.trim().toLowerCase();
  if (/^\d+$/.test(normalized)) {
    const minutes = Number(normalized);
    return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
  }

  const match = normalized.match(/^(?:(\d+)h)?(?:(\d+)m)?$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1] ?? "0");
  const minutes = Number(match[2] ?? "0");
  const total = hours * 60 + minutes;
  return total > 0 ? total : null;
}
