export const BRAINSTORM_QUESTION_TYPES = ["single", "multiple", "short-text", "long-text"] as const;

export type BrainstormQuestionType = (typeof BRAINSTORM_QUESTION_TYPES)[number];

export type BrainstormQuestion = {
  explanation: string;
  id: string;
  options: string[];
  other: boolean;
  recommended: string[];
  title: string;
  type: BrainstormQuestionType;
};

export type BrainstormDefinition = {
  introduction: string[];
  questions: BrainstormQuestion[];
  title: string;
};

export type BrainstormParserError = {
  line: number;
  message: string;
};

export type BrainstormParseResult =
  | { definition: BrainstormDefinition; errors: [] }
  | { definition: null; errors: BrainstormParserError[] };

type QuestionDraft = {
  explanationLines: string[];
  headingLine: number;
  options: Array<{ line: number; value: string }>;
  other: boolean;
  recommended: Array<{ line: number; value: string }>;
  title: string;
  type: { line: number; value: string } | null;
};

function normalizeInlineWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function stableQuestionId(index: number, title: string) {
  const slug = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return `q-${index + 1}-${slug || "question"}`;
}

function pushParagraph(paragraphs: string[], pending: string[]) {
  const paragraph = normalizeInlineWhitespace(pending.join(" "));
  if (paragraph) paragraphs.push(paragraph);
  pending.length = 0;
}

export function parseBrainstormMarkdown(source: string): BrainstormParseResult {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const errors: BrainstormParserError[] = [];
  const introduction: string[] = [];
  const introPending: string[] = [];
  const drafts: QuestionDraft[] = [];
  let title = "";
  let titleSeen = false;
  let current: QuestionDraft | null = null;

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (!current) pushParagraph(introduction, introPending);
      return;
    }

    if (/^#\s+/.test(trimmed)) {
      if (titleSeen || drafts.length > 0 || current) {
        errors.push({ line: lineNumber, message: "Use exactly one form title beginning with ‘#’, before all questions." });
        return;
      }
      title = normalizeInlineWhitespace(trimmed.replace(/^#\s+/, ""));
      titleSeen = true;
      if (!title) errors.push({ line: lineNumber, message: "The form title cannot be empty." });
      return;
    }

    if (/^##\s+/.test(trimmed)) {
      if (!titleSeen) errors.push({ line: lineNumber, message: "Add a form title beginning with ‘#’ before the first question." });
      pushParagraph(introduction, introPending);
      current = {
        explanationLines: [],
        headingLine: lineNumber,
        options: [],
        other: false,
        recommended: [],
        title: normalizeInlineWhitespace(trimmed.replace(/^##\s+/, "")),
        type: null,
      };
      drafts.push(current);
      if (!current.title) errors.push({ line: lineNumber, message: "The question title cannot be empty." });
      return;
    }

    if (/^#{3,}\s*/.test(trimmed)) {
      errors.push({ line: lineNumber, message: "Only ‘#’ form titles and ‘##’ question titles are supported." });
      return;
    }

    if (!titleSeen) {
      errors.push({ line: lineNumber, message: "The first content must be a form title beginning with ‘#’." });
      return;
    }

    if (!current) {
      introPending.push(trimmed);
      return;
    }

    if (trimmed.startsWith("@")) {
      const match = /^@(\S+)(?:\s+(.*))?$/.exec(trimmed);
      const directive = match?.[1] ?? "";
      const value = normalizeInlineWhitespace(match?.[2] ?? "");
      if (directive === "type") {
        if (current.type) errors.push({ line: lineNumber, message: `“${current.title}” has more than one @type directive.` });
        else current.type = { line: lineNumber, value };
      } else if (directive === "recommended") {
        if (!value) errors.push({ line: lineNumber, message: "@recommended must name an exact option." });
        else current.recommended.push({ line: lineNumber, value });
      } else if (directive === "other") {
        if (value !== "true") errors.push({ line: lineNumber, message: "@other only supports the value true." });
        else current.other = true;
      } else {
        errors.push({ line: lineNumber, message: `Unsupported directive “@${directive}”. Use @type, @recommended, or @other true.` });
      }
      return;
    }

    if (trimmed.startsWith(">")) {
      const explanation = normalizeInlineWhitespace(trimmed.replace(/^>\s?/, ""));
      if (explanation) current.explanationLines.push(explanation);
      return;
    }

    if (trimmed.startsWith("-")) {
      const option = normalizeInlineWhitespace(trimmed.replace(/^-\s?/, ""));
      if (!option) errors.push({ line: lineNumber, message: `“${current.title}” contains an empty option.` });
      else current.options.push({ line: lineNumber, value: option });
      return;
    }

    errors.push({ line: lineNumber, message: `Unsupported content in “${current.title}”. Use directives, explanation lines beginning with ‘>’, or options beginning with ‘-’.` });
  });

  pushParagraph(introduction, introPending);
  if (!titleSeen && source.trim().length === 0) errors.push({ line: 1, message: "Paste Markdown beginning with a ‘# Form Title’." });
  if (titleSeen && drafts.length === 0) errors.push({ line: 1, message: "Add at least one question beginning with ‘##’." });

  const ids = new Set<string>();
  const questions = drafts.map<BrainstormQuestion>((draft, index) => {
    const id = stableQuestionId(index, draft.title);
    if (ids.has(id)) errors.push({ line: draft.headingLine, message: `“${draft.title}” creates a duplicate question ID. Rename the question.` });
    ids.add(id);
    const typeValue = draft.type?.value;
    if (!draft.type) errors.push({ line: draft.headingLine, message: `“${draft.title}” is missing a required @type directive.` });
    else if (!BRAINSTORM_QUESTION_TYPES.includes(typeValue as BrainstormQuestionType)) {
      errors.push({ line: draft.type.line, message: `Unsupported question type “${typeValue}”. Use single, multiple, short-text, or long-text.` });
    }
    const type = BRAINSTORM_QUESTION_TYPES.includes(typeValue as BrainstormQuestionType)
      ? typeValue as BrainstormQuestionType
      : "short-text";
    const options = draft.options.map((entry) => entry.value);
    if ((type === "single" || type === "multiple") && options.length === 0) {
      errors.push({ line: draft.headingLine, message: `“${draft.title}” needs at least one option beginning with ‘-’.` });
    }
    if (new Set(options).size !== options.length) {
      errors.push({ line: draft.headingLine, message: `“${draft.title}” contains duplicate options.` });
    }
    for (const recommended of draft.recommended) {
      if (!options.includes(recommended.value)) {
        errors.push({ line: recommended.line, message: `“@recommended ${recommended.value}” does not match any option in “${draft.title}”.` });
      }
    }
    return {
      explanation: normalizeInlineWhitespace(draft.explanationLines.join(" ")),
      id,
      options,
      other: draft.other,
      recommended: draft.recommended.map((entry) => entry.value),
      title: draft.title,
      type,
    };
  });

  return errors.length > 0
    ? { definition: null, errors }
    : { definition: { introduction, questions, title }, errors: [] };
}
