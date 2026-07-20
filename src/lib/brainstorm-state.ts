import type { BrainstormDefinition, BrainstormQuestion, BrainstormQuestionType } from "@/lib/brainstorm-markdown";
import { createEmptyBrainstormQaState, normalizeBrainstormQaState, type BrainstormQaState } from "@/lib/brainstorm-qa";

export type BrainstormAnswer = {
  other: string;
  selected: string[];
  text: string;
  type: BrainstormQuestionType;
};

export type BrainstormAnswers = Record<string, BrainstormAnswer>;

export type BrainstormPersistedState = {
  answers: BrainstormAnswers;
  clientUpdatedAt: string;
  qaState: BrainstormQaState;
  sourceMarkdown: string;
};

export type BrainstormStateField = "answers" | "qaState" | "sourceMarkdown";
export type BrainstormStateChanges = Partial<Pick<BrainstormPersistedState, BrainstormStateField>>;

export const EMPTY_BRAINSTORM_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export function createEmptyBrainstormState(clientUpdatedAt = EMPTY_BRAINSTORM_TIMESTAMP): BrainstormPersistedState {
  return { answers: {}, clientUpdatedAt, qaState: createEmptyBrainstormQaState(), sourceMarkdown: "" };
}

function normalizeAnswer(value: unknown): BrainstormAnswer | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<BrainstormAnswer>;
  if (candidate.type !== "single" && candidate.type !== "multiple" && candidate.type !== "short-text" && candidate.type !== "long-text") return null;
  const selected = Array.isArray(candidate.selected)
    ? candidate.selected.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
  return {
    other: typeof candidate.other === "string" ? candidate.other : "",
    selected: candidate.type === "single" ? selected.slice(0, 1) : selected,
    text: typeof candidate.text === "string" ? candidate.text : "",
    type: candidate.type,
  };
}

export function normalizeBrainstormAnswers(value: unknown): BrainstormAnswers {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.entries(value).reduce<BrainstormAnswers>((answers, [id, rawAnswer]) => {
    const answer = normalizeAnswer(rawAnswer);
    if (id.trim() && answer) answers[id] = answer;
    return answers;
  }, {});
}

function normalizeTimestamp(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return EMPTY_BRAINSTORM_TIMESTAMP;
  return new Date(value).toISOString();
}

export function normalizeBrainstormState(value: unknown): BrainstormPersistedState {
  if (!value || typeof value !== "object") return createEmptyBrainstormState();
  const candidate = value as Partial<BrainstormPersistedState> & { client_updated_at?: unknown; qa_state?: unknown; source_markdown?: unknown };
  return {
    answers: normalizeBrainstormAnswers(candidate.answers),
    clientUpdatedAt: normalizeTimestamp(candidate.clientUpdatedAt ?? candidate.client_updated_at),
    qaState: normalizeBrainstormQaState(candidate.qaState ?? candidate.qa_state),
    sourceMarkdown: typeof (candidate.sourceMarkdown ?? candidate.source_markdown) === "string"
      ? String(candidate.sourceMarkdown ?? candidate.source_markdown)
      : "",
  };
}

export function createEmptyBrainstormAnswer(question: BrainstormQuestion): BrainstormAnswer {
  return { other: "", selected: [], text: "", type: question.type };
}

export function migrateBrainstormAnswers(definition: BrainstormDefinition, previous: BrainstormAnswers): BrainstormAnswers {
  return definition.questions.reduce<BrainstormAnswers>((answers, question) => {
    const existing = previous[question.id];
    if (!existing || existing.type !== question.type) return answers;
    const selected = (question.type === "single" || question.type === "multiple")
      ? existing.selected.filter((option) => question.options.includes(option))
      : [];
    answers[question.id] = {
      other: question.other ? existing.other : "",
      selected: question.type === "single" ? selected.slice(0, 1) : selected,
      text: question.type === "short-text" || question.type === "long-text" ? existing.text : "",
      type: question.type,
    };
    return answers;
  }, {});
}

export function updateBrainstormState(
  state: BrainstormPersistedState,
  changes: BrainstormStateChanges,
  now = new Date().toISOString(),
): BrainstormPersistedState {
  return normalizeBrainstormState({ ...state, ...changes, clientUpdatedAt: now });
}

export function brainstormStateSignature(state: BrainstormPersistedState, fields: BrainstormStateField[] = ["answers", "qaState", "sourceMarkdown"]) {
  return JSON.stringify(Object.fromEntries(fields.map((field) => [field, state[field]])));
}

export function serializeBrainstormState(state: BrainstormPersistedState) {
  return {
    answers: normalizeBrainstormAnswers(state.answers),
    client_updated_at: normalizeTimestamp(state.clientUpdatedAt),
    qa_state: normalizeBrainstormQaState(state.qaState),
    source_markdown: state.sourceMarkdown,
  };
}

export function serializeBrainstormStateUpdate(state: BrainstormPersistedState, fields: BrainstormStateField[]) {
  const serialized = serializeBrainstormState(state);
  return Object.assign(
    { client_updated_at: serialized.client_updated_at },
    fields.includes("answers") ? { answers: serialized.answers } : {},
    fields.includes("qaState") ? { qa_state: serialized.qa_state } : {},
    fields.includes("sourceMarkdown") ? { source_markdown: serialized.source_markdown } : {},
  );
}

export function isBrainstormQuestionAnswered(question: BrainstormQuestion, answer: BrainstormAnswer | undefined) {
  if (!answer || answer.type !== question.type) return false;
  if (question.type === "single" || question.type === "multiple") {
    return answer.selected.length > 0 || (question.other && answer.other.trim().length > 0);
  }
  return answer.text.trim().length > 0 || (question.other && answer.other.trim().length > 0);
}

export function generateBrainstormSummary(definition: BrainstormDefinition, answers: BrainstormAnswers) {
  const lines = [`# ${definition.title}`, ""];
  definition.questions.forEach((question) => {
    lines.push(`## ${question.title}`, "");
    const answer = answers[question.id];
    const isCompatible = answer?.type === question.type;
    const selected = isCompatible && (question.type === "single" || question.type === "multiple")
      ? answer.selected.filter((option) => question.options.includes(option))
      : [];
    const response = isCompatible && (question.type === "short-text" || question.type === "long-text")
      ? answer.text.trim()
      : "";
    const other = isCompatible && question.other ? answer.other.trim() : "";

    if (question.type === "single" && selected[0]) {
      lines.push(`- Selected: ${selected[0]}`);
    } else if (question.type === "multiple" && selected.length > 0) {
      lines.push("- Selected:");
      selected.forEach((value) => lines.push(`  - ${value}`));
    } else if ((question.type === "short-text" || question.type === "long-text") && response) {
      lines.push(`- Response: ${response}`);
    }

    if (other) lines.push(`- Other / override: ${other}`);
    if (selected.length === 0 && !response && !other) lines.push("- No answer selected");
    lines.push("");
  });
  return lines.join("\n").trimEnd() + "\n";
}
