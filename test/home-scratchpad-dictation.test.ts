import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getScratchMicrophoneStorageKey, insertScratchDictationText } from "../src/lib/scratch-paper-dictation.ts";

const homeSource = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const scratchPaperSource = readFileSync(new URL("../src/components/task-app/scratch-paper.tsx", import.meta.url), "utf8");
const dictationHookSource = readFileSync(new URL("../src/hooks/useScratchDictation.ts", import.meta.url), "utf8");
const dictationSource = readFileSync(new URL("../src/lib/scratch-paper-dictation.ts", import.meta.url), "utf8");
const transcriptionSource = readFileSync(new URL("../src/lib/scratch-paper-transcription.ts", import.meta.url), "utf8");

const scratchpadComposerSource = homeSource.slice(
  homeSource.indexOf('aria-label="Scratchpad note"'),
  homeSource.indexOf("isCreateOpen && convertingScratchpadItemId"),
);

test("Home Scratchpad exposes shared Dictate control and transcription authority", () => {
  assert.match(scratchpadComposerSource, /<ScratchDictationControl dictation=\{scratchpadDictation\} \/>/);
  assert.match(homeSource, /onTranscribeAudio: onTranscribeScratchAudio/);
  assert.match(taskAppSource, /<TaskHomePage[\s\S]*onTranscribeScratchAudio=\{onTranscribeScratchAudio\}/);
  assert.equal((taskAppSource.match(/const onTranscribeScratchAudio = useCallback/g) ?? []).length, 1);
  assert.equal((transcriptionSource.match(/functions\.invoke<unknown>\("scratch-transcribe"/g) ?? []).length, 1);
});

test("Home Scratchpad captures textarea selection and preserves surrounding text", () => {
  assert.match(homeSource, /const scratchpadRef = useRef<HTMLTextAreaElement \| null>\(null\)/);
  assert.match(homeSource, /getCaretRange: \(\) => \{[\s\S]*selectionStart[\s\S]*selectionEnd/);
  assert.match(homeSource, /ref=\{scratchpadRef\}/);

  const inserted = insertScratchDictationText("before selected after", { end: 15, start: 7 }, "spoken");
  assert.equal(inserted.body, "before spoken after");
  assert.equal(inserted.caretOffset, inserted.body.indexOf(" after"));
});

test("Home dictation marks the draft dirty, restores the caret, and does not save", () => {
  const handlerSource = homeSource.slice(
    homeSource.indexOf("const handleScratchpadDictationBody"),
    homeSource.indexOf("const scratchpadDictation"),
  );
  assert.match(handlerSource, /scratchpadDraftDirtyRef\.current = true/);
  assert.match(handlerSource, /setScratchpadDraft\(nextBody\)/);
  assert.doesNotMatch(handlerSource, /saveScratchpadDraft/);
  assert.match(dictationHookSource, /restoreScratchEditorOffset\(editor, range\.end\)/);
  assert.match(dictationSource, /setSelectionRange\(offset, offset\)/);
});

test("Home tab exit disables and cancels dictation, fencing late transcripts", () => {
  assert.match(homeSource, /enabled: activeHomeTab === "scratchpad"/);
  assert.match(homeSource, /if \(nextTab !== "scratchpad"\) scratchpadDictation\.cancel\(\)/);
  assert.match(dictationHookSource, /if \(!enabled\) controller\.cancel\(\)/);
  assert.match(dictationHookSource, /useEffect\(\(\) => \(\) => controller\.cancel\(\), \[controller\]\)/);
  assert.match(dictationSource, /if \(!this\.isActiveSession\(session\) \|\| this\.options\.getNoteKey\(\) !== session\.noteKey\) return/);
});

test("Home and Notes share the user-scoped microphone preference and Notes keeps Dictate", () => {
  assert.equal(getScratchMicrophoneStorageKey("user-a"), "adhdice-scratch-microphone:user-a");
  assert.match(homeSource, /onTranscribeAudio: onTranscribeScratchAudio,[\s\S]*userId,/);
  assert.match(scratchPaperSource, /onTranscribeAudio,[\s\S]*userId,/);
  assert.equal((scratchPaperSource.match(/<ScratchDictationControl dictation=\{dictation\} \/>/g) ?? []).length, 2);
  assert.equal((homeSource.match(/<ScratchDictationControl dictation=\{scratchpadDictation\} \/>/g) ?? []).length, 1);
});

test("Dictate keeps audio temporary and introduces no Storage persistence path", () => {
  assert.doesNotMatch(transcriptionSource, /\.storage\b|audio-upload|persist/i);
  assert.doesNotMatch(homeSource, /supabase|\.storage\b|audio-upload|saved audio/i);
  assert.match(dictationSource, /let temporaryAudio: Blob \| null = audioBlob/);
  assert.match(dictationSource, /temporaryAudio = null/);
});
