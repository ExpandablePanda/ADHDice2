import type { BrainstormDefinition, BrainstormQuestion, BrainstormQuestionType } from "@/lib/brainstorm-markdown";
import { createEmptyBrainstormQaState, normalizeBrainstormQaState, type BrainstormQaState } from "@/lib/brainstorm-qa";

export type BrainstormAnswer = {
  other: string;
  selected: string[];
  text: string;
  type: BrainstormQuestionType;
};

export type BrainstormAnswers = Record<string, BrainstormAnswer>;

export type BrainstormQuestionnaireSession = {
  answers: BrainstormAnswers;
  createdAt: string;
  id: string;
  sourceMarkdown: string;
  title: string;
  updatedAt: string;
};

export type BrainstormQuestionnaireState = {
  activeSessionId: string | null;
  schemaVersion: 1;
  sessions: BrainstormQuestionnaireSession[];
};

export type BrainstormPersistedState = {
  answers: BrainstormAnswers;
  clientUpdatedAt: string;
  qaState: BrainstormQaState;
  questionnaireState: BrainstormQuestionnaireState;
  sourceMarkdown: string;
};

export type BrainstormStateField = "answers" | "qaState" | "questionnaireState" | "sourceMarkdown";
export type BrainstormStateChanges = Partial<Pick<BrainstormPersistedState, BrainstormStateField>>;

export const EMPTY_BRAINSTORM_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export function createEmptyBrainstormState(clientUpdatedAt = EMPTY_BRAINSTORM_TIMESTAMP): BrainstormPersistedState {
  return { answers: {}, clientUpdatedAt, qaState: createEmptyBrainstormQaState(), questionnaireState: createEmptyBrainstormQuestionnaireState(), sourceMarkdown: "" };
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

function defaultQuestionnaireId() {
  return globalThis.crypto?.randomUUID?.() ?? `questionnaire-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeQuestionnaireSession(value: unknown): BrainstormQuestionnaireSession | null {
  if (!value || typeof value !== "object") return null;
  const session = value as Partial<BrainstormQuestionnaireSession>;
  const id = typeof session.id === "string" ? session.id.trim() : "";
  if (!id) return null;
  const createdAt = normalizeTimestamp(session.createdAt);
  return {
    answers: normalizeBrainstormAnswers(session.answers),
    createdAt,
    id,
    sourceMarkdown: typeof session.sourceMarkdown === "string" ? session.sourceMarkdown : "",
    title: typeof session.title === "string" ? session.title : "",
    updatedAt: normalizeTimestamp(session.updatedAt ?? createdAt),
  };
}

export function createEmptyBrainstormQuestionnaireState(): BrainstormQuestionnaireState {
  return { activeSessionId: null, schemaVersion: 1, sessions: [] };
}

export function createBrainstormQuestionnaireSession(options: Partial<Pick<BrainstormQuestionnaireSession, "answers" | "sourceMarkdown" | "title">> = {}, now = new Date(), id = defaultQuestionnaireId()): BrainstormQuestionnaireSession {
  const timestamp = now.toISOString();
  return { answers: normalizeBrainstormAnswers(options.answers), createdAt: timestamp, id, sourceMarkdown: options.sourceMarkdown ?? "", title: options.title ?? "New Questionnaire", updatedAt: timestamp };
}

export function normalizeBrainstormQuestionnaireState(value: unknown, legacy: Pick<BrainstormPersistedState, "answers" | "sourceMarkdown">): BrainstormQuestionnaireState {
  const candidate = value && typeof value === "object" ? value as Partial<BrainstormQuestionnaireState> : null;
  const sessions = Array.isArray(candidate?.sessions)
    ? candidate.sessions.map(normalizeQuestionnaireSession).filter((session): session is BrainstormQuestionnaireSession => Boolean(session))
    : [];
  if (sessions.length === 0 && (legacy.sourceMarkdown || Object.keys(legacy.answers).length)) {
    const legacySession = createBrainstormQuestionnaireSession({ answers: legacy.answers, sourceMarkdown: legacy.sourceMarkdown, title: "Questionnaire" }, new Date(EMPTY_BRAINSTORM_TIMESTAMP), "legacy-questionnaire");
    sessions.push(legacySession);
  }
  const requestedId = typeof candidate?.activeSessionId === "string" ? candidate.activeSessionId : null;
  return { activeSessionId: sessions.some((session) => session.id === requestedId) ? requestedId : sessions[0]?.id ?? null, schemaVersion: 1, sessions };
}

export function updateBrainstormQuestionnaireSession(session: BrainstormQuestionnaireSession, changes: Partial<Pick<BrainstormQuestionnaireSession, "answers" | "sourceMarkdown" | "title">>, now = new Date()): BrainstormQuestionnaireSession {
  return { ...session, ...changes, answers: "answers" in changes ? normalizeBrainstormAnswers(changes.answers) : session.answers, updatedAt: now.toISOString() };
}

export function duplicateBrainstormQuestionnaireSession(session: BrainstormQuestionnaireSession, now = new Date(), id = defaultQuestionnaireId()): BrainstormQuestionnaireSession {
  return createBrainstormQuestionnaireSession({ answers: session.answers, sourceMarkdown: session.sourceMarkdown, title: `${session.title || "Questionnaire"} Copy` }, now, id);
}

export function deleteBrainstormQuestionnaireSession(state: BrainstormQuestionnaireState, sessionId: string): BrainstormQuestionnaireState {
  const index = state.sessions.findIndex((session) => session.id === sessionId);
  if (index < 0) return state;
  const sessions = state.sessions.filter((session) => session.id !== sessionId);
  return { ...state, activeSessionId: state.activeSessionId === sessionId ? sessions[Math.min(index, sessions.length - 1)]?.id ?? null : state.activeSessionId, sessions };
}

export function normalizeBrainstormState(value: unknown): BrainstormPersistedState {
  if (!value || typeof value !== "object") return createEmptyBrainstormState();
  const candidate = value as Partial<BrainstormPersistedState> & { client_updated_at?: unknown; qa_state?: unknown; source_markdown?: unknown };
  const answers = normalizeBrainstormAnswers(candidate.answers);
  const sourceMarkdown = typeof (candidate.sourceMarkdown ?? candidate.source_markdown) === "string"
    ? String(candidate.sourceMarkdown ?? candidate.source_markdown)
    : "";
  const rawQaState = candidate.qaState ?? candidate.qa_state;
  const questionnaireState = normalizeBrainstormQuestionnaireState(
    candidate.questionnaireState ?? (rawQaState && typeof rawQaState === "object" ? (rawQaState as { questionnaireState?: unknown }).questionnaireState : undefined),
    { answers, sourceMarkdown },
  );
  const activeQuestionnaire = questionnaireState.sessions.find((session) => session.id === questionnaireState.activeSessionId);
  return {
    answers: activeQuestionnaire?.answers ?? answers,
    clientUpdatedAt: normalizeTimestamp(candidate.clientUpdatedAt ?? candidate.client_updated_at),
    qaState: normalizeBrainstormQaState(rawQaState),
    questionnaireState,
    sourceMarkdown: activeQuestionnaire?.sourceMarkdown ?? sourceMarkdown,
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

export function brainstormStateSignature(state: BrainstormPersistedState, fields: BrainstormStateField[] = ["answers", "qaState", "questionnaireState", "sourceMarkdown"]) {
  return JSON.stringify(Object.fromEntries(fields.map((field) => [field, state[field]])));
}

export function serializeBrainstormState(state: BrainstormPersistedState) {
  return {
    answers: normalizeBrainstormAnswers(state.answers),
    client_updated_at: normalizeTimestamp(state.clientUpdatedAt),
    qa_state: { ...normalizeBrainstormQaState(state.qaState), questionnaireState: normalizeBrainstormQuestionnaireState(state.questionnaireState, state) },
    source_markdown: state.sourceMarkdown,
  };
}

export function serializeBrainstormStateUpdate(state: BrainstormPersistedState, fields: BrainstormStateField[]) {
  const serialized = serializeBrainstormState(state);
  return Object.assign(
    { client_updated_at: serialized.client_updated_at },
    fields.includes("answers") ? { answers: serialized.answers } : {},
    fields.includes("qaState") || fields.includes("questionnaireState") ? { qa_state: serialized.qa_state } : {},
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
