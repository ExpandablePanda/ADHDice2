import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseBrainstormMarkdown } from "../src/lib/brainstorm-markdown.ts";
import { createEmptyBrainstormAnswer, generateBrainstormSummary, migrateBrainstormAnswers, normalizeBrainstormState, serializeBrainstormState, type BrainstormAnswers } from "../src/lib/brainstorm-state.ts";

const validSource = `# Trip architecture
An optional introduction.\n\nA second paragraph.
## Transport
@type single
@recommended Train
@other true
> This decides how we travel.
- Train
- Car
## Stops
@type multiple
@recommended Museum
@recommended Park
- Museum
- Park
## Nickname
@type short-text
## Notes
@type long-text`;

function definition(source = validSource) {
  const result = parseBrainstormMarkdown(source);
  assert.equal(result.errors.length, 0);
  assert.ok(result.definition);
  return result.definition;
}

test("parses title and introduction paragraphs", () => {
  const parsed = definition();
  assert.equal(parsed.title, "Trip architecture");
  assert.deepEqual(parsed.introduction, ["An optional introduction.", "A second paragraph."]);
});

test("parses single, multiple, short-text, and long-text questions", () => {
  assert.deepEqual(definition().questions.map((question) => question.type), ["single", "multiple", "short-text", "long-text"]);
});

test("parses explanation, multiple recommendations, and Other", () => {
  const parsed = definition();
  assert.equal(parsed.questions[0].explanation, "This decides how we travel.");
  assert.equal(parsed.questions[0].other, true);
  assert.deepEqual(parsed.questions[1].recommended, ["Museum", "Park"]);
});

test("rejects unsupported directives and types with line-aware errors", () => {
  const result = parseBrainstormMarkdown("# Test\n## Choice\n@wat nope\n@type slider\n- One");
  assert.equal(result.definition, null);
  assert.deepEqual(result.errors.map((error) => error.line), [3, 4]);
  assert.match(result.errors[0].message, /Unsupported directive/);
  assert.match(result.errors[1].message, /Unsupported question type/);
});

test("rejects missing options", () => {
  const result = parseBrainstormMarkdown("# Test\n## Choice\n@type single");
  assert.match(result.errors[0].message, /at least one option/);
});

test("rejects invalid recommended options", () => {
  const result = parseBrainstormMarkdown("# Test\n## Google architecture\n@type single\n@recommended Hybrid\n- Direct");
  assert.equal(result.errors[0].line, 4);
  assert.equal(result.errors[0].message, "“@recommended Hybrid” does not match any option in “Google architecture”.");
});

test("question IDs are stable for the same order and normalized title", () => {
  assert.deepEqual(definition().questions.map((question) => question.id), definition(validSource.replace("Transport", "  Transport  ")).questions.map((question) => question.id));
});

test("arbitrary HTML remains inert plain text", () => {
  const parsed = definition("# <script>alert(1)</script>\nIntro <img src=x onerror=alert(1)>\n## <b>Choice</b>\n@type short-text");
  assert.equal(parsed.title, "<script>alert(1)</script>");
  assert.equal(parsed.introduction[0], "Intro <img src=x onerror=alert(1)>");
});

test("unchanged compatible questions preserve answers and deleted questions are removed", () => {
  const parsed = definition();
  const previous: BrainstormAnswers = {
    [parsed.questions[0].id]: { type: "single", selected: ["Train"], text: "", other: "Bike" },
    deleted: { type: "short-text", selected: [], text: "gone", other: "" },
  };
  const migrated = migrateBrainstormAnswers(parsed, previous);
  assert.deepEqual(migrated[parsed.questions[0].id], previous[parsed.questions[0].id]);
  assert.equal(migrated.deleted, undefined);
});

test("deleted options are removed from preserved selections", () => {
  const before = definition("# Test\n## Choice\n@type multiple\n- One\n- Two");
  const after = definition("# Test\n## Choice\n@type multiple\n- One");
  const migrated = migrateBrainstormAnswers(after, { [before.questions[0].id]: { type: "multiple", selected: ["One", "Two"], text: "", other: "" } });
  assert.deepEqual(migrated[after.questions[0].id].selected, ["One"]);
});

test("incompatible question types reset answers", () => {
  const before = definition("# Test\n## Choice\n@type single\n- One");
  const after = definition("# Test\n## Choice\n@type short-text");
  assert.deepEqual(migrateBrainstormAnswers(after, { [before.questions[0].id]: { type: "single", selected: ["One"], text: "", other: "" } }), {});
});

test("recommended options are never auto-selected", () => {
  const question = definition().questions[0];
  assert.deepEqual(createEmptyBrainstormAnswer(question).selected, []);
  assert.deepEqual(migrateBrainstormAnswers(definition(), {})[question.id], undefined);
});

test("summary keeps selected single answers and overrides on separate lines", () => {
  const parsed = definition();
  const summary = generateBrainstormSummary(parsed, {
    [parsed.questions[0].id]: { type: "single", selected: ["Train"], text: "", other: "Bike" },
  });
  assert.match(summary, /- Selected: Train\n- Other \/ override: Bike/);
  assert.doesNotMatch(summary, /Train, Other/);
});

test("summary marks unanswered questions and excludes explanations", () => {
  const summary = generateBrainstormSummary(definition(), {});
  assert.match(summary, /No answer selected/);
  assert.doesNotMatch(summary, /This decides how we travel/);
});

test("state normalization recovers from malformed answers", () => {
  assert.deepEqual(normalizeBrainstormState({ source_markdown: 12, answers: { bad: { type: "wat" } }, client_updated_at: "bad" }), {
    sourceMarkdown: "",
    answers: {},
    clientUpdatedAt: "1970-01-01T00:00:00.000Z",
    qaState: { activeSessionId: null, schemaVersion: 2, sessions: [] },
  });
});

test("serialization persists source, answers, QA state, and client timestamp", () => {
  const serialized = serializeBrainstormState(normalizeBrainstormState({
    sourceMarkdown: "# Test",
    answers: { q: { type: "short-text", selected: [], text: "Answer", other: "" } },
    clientUpdatedAt: "2026-07-13T12:00:00Z",
    generatedSummary: "must not persist",
  }));
  assert.deepEqual(Object.keys(serialized).sort(), ["answers", "client_updated_at", "qa_state", "source_markdown"]);
  assert.equal(serialized.source_markdown, "# Test");
  assert.equal(serialized.answers.q.text, "Answer");
});

test("single questions retain radio options", () => {
  const question = definition().questions[0];
  assert.equal(question.type, "single");
  assert.deepEqual(question.options, ["Train", "Car"]);
});

test("multiple questions retain checkbox options", () => {
  const question = definition().questions[1];
  assert.equal(question.type, "multiple");
  assert.deepEqual(question.options, ["Museum", "Park"]);
});

test("short-text questions do not require options", () => {
  assert.equal(definition().questions[2].type, "short-text");
  assert.deepEqual(definition().questions[2].options, []);
});

test("long-text questions do not require options", () => {
  assert.equal(definition().questions[3].type, "long-text");
  assert.deepEqual(definition().questions[3].options, []);
});

test("explanation block text is normalized", () => {
  assert.equal(definition(validSource.replace("This decides how we travel.", "This   decides   how we travel.")).questions[0].explanation, "This decides how we travel.");
});

test("multiple recommended directives retain their source order", () => {
  assert.deepEqual(definition().questions[1].recommended, ["Museum", "Park"]);
});

test("Other is opt-in per question", () => {
  const parsed = definition();
  assert.equal(parsed.questions[0].other, true);
  assert.equal(parsed.questions[1].other, false);
});

test("missing @type is rejected clearly", () => {
  const result = parseBrainstormMarkdown("# Test\n## Choice\n- One");
  assert.match(result.errors[0].message, /missing a required @type/);
});

test("summary emits a selected single answer", () => {
  const parsed = definition();
  assert.match(generateBrainstormSummary(parsed, { [parsed.questions[0].id]: { type: "single", selected: ["Train"], text: "", other: "" } }), /## Transport\n\n- Selected: Train/);
});

test("summary emits multiple selected answers as nested bullets", () => {
  const parsed = definition();
  assert.match(generateBrainstormSummary(parsed, { [parsed.questions[1].id]: { type: "multiple", selected: ["Museum", "Park"], text: "", other: "" } }), /- Selected:\n  - Museum\n  - Park/);
});

test("summary emits short and long text responses with Response labels", () => {
  const parsed = definition();
  const summary = generateBrainstormSummary(parsed, {
    [parsed.questions[2].id]: { type: "short-text", selected: [], text: "Short response", other: "" },
    [parsed.questions[3].id]: { type: "long-text", selected: [], text: "Long response", other: "" },
  });
  assert.match(summary, /- Response: Short response/);
  assert.match(summary, /- Response: Long response/);
});

test("summary renders an override-only answer clearly", () => {
  const parsed = definition();
  assert.match(generateBrainstormSummary(parsed, { [parsed.questions[0].id]: { type: "single", selected: [], text: "", other: "Bike" } }), /## Transport\n\n- Other \/ override: Bike/);
});

test("workspace Show, Copy, and Download share the generated summary", async () => {
  const source = await readFile(new URL("../src/components/task-app/brainstorm-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /const summary = useMemo\(\(\) => definition \? generateBrainstormSummary\(definition, state\.answers\) : "", \[definition, state\.answers\]\)/);
  assert.match(source, /navigator\.clipboard\.writeText\(summary\)/);
  assert.match(source, /new Blob\(\[summary\]/);
  assert.match(source, /\{showSummary && definition \? <pre[\s\S]*>\{summary\}<\/pre>/);
});

test("Brainstorm icon controls use the compact shared chip spacing treatment", async () => {
  const source = await readFile(new URL("../src/components/task-app/brainstorm-workspace.tsx", import.meta.url), "utf8");
  const wrappers = source.match(/inline-flex min-w-0 items-center gap-1\.5/g) ?? [];
  assert.equal(wrappers.length, 3);
  assert.match(source, /<Sparkles className="shrink-0" size=\{13\} \/> Parse \/ Update Form/);
  assert.match(source, /<Copy className="shrink-0" size=\{13\} \/> Copy Summary/);
  assert.match(source, /<Download className="shrink-0" size=\{13\} \/> Download \.md/);
});

test("Brainstorm question titles render inside shared section shells with accessible answer groups", async () => {
  const source = await readFile(new URL("../src/components/task-app/brainstorm-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /<section className="rounded-\[1\.15rem\] border/);
  assert.match(source, /<h3 className="text-base font-semibold text-\[#342d53\] dark:text-white" id=\{questionTitleId\}>\{question\.title\}<\/h3>/);
  assert.match(source, /<fieldset aria-labelledby=\{questionTitleId\} className="m-0 mt-3 space-y-3 border-0 p-0">/);
  assert.doesNotMatch(source, /<legend/);
});

test("all question types continue through the corrected shared question shell", async () => {
  const source = await readFile(new URL("../src/components/task-app/brainstorm-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /question\.type === "single" \|\| question\.type === "multiple"/);
  assert.match(source, /question\.type === "short-text"/);
  assert.match(source, /<textarea/);
  assert.match(source, /definition\.questions\.map\(\(question\) => <QuestionField/);
});

test("Brainstorm renders Questionnaire and QA Checklist navigation with both workspace panels", async () => {
  const source = await readFile(new URL("../src/components/task-app/brainstorm-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /role="tablist"/);
  assert.match(source, />Questionnaire<\/AdhdChip>/);
  assert.match(source, />QA Checklist<\/AdhdChip>/);
  assert.match(source, /setActiveView\("questionnaire"\)/);
  assert.match(source, /setActiveView\("qa"\)/);
  assert.match(source, /id="brainstorm-questionnaire-panel" role="tabpanel"/);
  assert.match(source, /id="brainstorm-qa-panel" role="tabpanel"><BrainstormQaWorkspace/);
});

test("Brainstorm Clear uses the restored scoped reset callback without clearing QA state", async () => {
  const [workspace, app, hook] = await Promise.all([
    readFile(new URL("../src/components/task-app/brainstorm-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/task-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useBrainstormState.ts", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /resetState: \(scope\?: BrainstormResetScope\) => void/);
  assert.match(workspace, /resetState\("questionnaire"\)/);
  assert.match(app, /resetState=\{brainstormState\.resetState\}/);
  assert.match(hook, /const resetState = useCallback\(\(scope: BrainstormResetScope = "all"\)/);
  assert.match(hook, /updateBrainstormState\(stateRef\.current, \{ answers: \{\}, sourceMarkdown: "" \}/);
  assert.match(hook, /new Set\(scope === "questionnaire" \? \["answers", "sourceMarkdown"\] : \["answers", "qaState", "sourceMarkdown"\]\)/);
});
