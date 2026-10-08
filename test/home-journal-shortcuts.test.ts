import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const homeSource = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const healthPageSource = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
const journalFormSource = readFileSync(new URL("../src/components/task-app/journal-check-in-form.tsx", import.meta.url), "utf8");

test("Home places Journal shortcuts after the six task tabs and outside Finished Today", () => {
  const dashboardSource = homeSource.slice(homeSource.indexOf("function HomeProgressDashboard"), homeSource.indexOf("export function HomePage"));
  const homeViewsSource = homeSource.slice(homeSource.indexOf('aria-label="Home task view"'), homeSource.indexOf('aria-label="Home task view"') + 2600);
  assert.doesNotMatch(dashboardSource, /Start of Day Journal|End of Day Journal|onOpenJournal\("/);
  assert.match(homeViewsSource, /role="tablist"[\s\S]*Scratchpad[\s\S]*<\/div>\s*<nav aria-label="Journal shortcuts"/);
  assert.match(homeViewsSource, /aria-label="Open Start of Day Journal" onClick=\{\(\) => onOpenJournal\("start_of_day"\)\}/);
  assert.match(homeViewsSource, /aria-label="Open End of Day Journal" onClick=\{\(\) => onOpenJournal\("end_of_day"\)\}/);
  assert.equal((homeViewsSource.match(/role="tab"/g) ?? []).length, 6);
  assert.doesNotMatch(homeViewsSource.slice(homeViewsSource.indexOf('<nav aria-label="Journal shortcuts"')), /role="tab"|aria-selected|selected=/);
});

test("Home Journal navigation opens Journal and consumes a one-shot new-entry request", () => {
  assert.match(taskAppSource, /setActivePage\("Health"\);\s+persistHealthTabPreference\("Journal"\)/);
  assert.match(taskAppSource, /journalEntryRequest=\{journalEntryNavigationRequest\}/);
  assert.match(taskAppSource, /current\?\.id === requestId \? null : current/);
  assert.match(healthPageSource, /setJournalWorkspaceMode\("entry"\);\s+startNewJournalEntry\(\)/);
  assert.match(healthPageSource, /journalEntryRequest=\{journalEntryRequest\}/);
});

test("Journal applies the requested type after normal form hydration", () => {
  const hydrationEffect = journalFormSource.indexOf("This effect rehydrates the local editor");
  const requestEffect = journalFormSource.indexOf("setEntryType(journalEntryRequest.entryType)");
  assert.ok(hydrationEffect >= 0);
  assert.ok(requestEffect > hydrationEffect);
  assert.match(journalFormSource, /entryType === "start_of_day" \? <StartOfDayQuestions/);
  assert.match(journalFormSource, /entryType === "end_of_day" \? <EndOfDayQuestions/);
});
