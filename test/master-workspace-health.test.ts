import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const healthPageSource = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
const healthLibrarySource = readFileSync(new URL("../src/components/task-app/health-library-panel.tsx", import.meta.url), "utf8");
const journalFormSource = readFileSync(new URL("../src/components/task-app/journal-check-in-form.tsx", import.meta.url), "utf8");
const journalEventCaptureSource = readFileSync(new URL("../src/components/task-app/journal-event-capture.tsx", import.meta.url), "utf8");
const tabBarSource = readFileSync(new URL("../src/components/task-app/master-workspace-tab-bar.tsx", import.meta.url), "utf8");
const controllerHookSource = readFileSync(new URL("../src/hooks/useMasterWorkspaceController.ts", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("../src/lib/master-workspace-state.ts", import.meta.url), "utf8");

test("legacy Health preference remains the gate-off authority with one preference subscription", () => {
  assert.equal((taskAppSource.match(/useSyncExternalStore\(subscribeToHealthTabPreference/g) ?? []).length, 1);
  assert.match(taskAppSource, /masterWorkspace\.isEnabled && activePage === "Health"[\s\S]*?legacyHealthTabPreference/);
  assert.match(taskAppSource, /if \(isMasterTabsFeatureEnabled\) selectMasterHealthSection\(tab\);\s*else persistHealthTabPreference\(tab\)/);
  assert.match(taskAppSource, /activeTab=\{activeHealthTab\}/);
  assert.doesNotMatch(healthPageSource, /subscribeToHealthTabPreference|readHealthTabPreference|useSyncExternalStore/);
  assert.match(healthPageSource, /onClick=\{\(\) => onSelectTab\(tab\)\}/);
});

test("Fitness hooks follow the selected master Health section without duplicate hooks", () => {
  assert.match(taskAppSource, /activePage === "Health" && activeHealthTab === "Fitness"/);
  assert.equal((taskAppSource.match(/useFitnessGoals\(/g) ?? []).length, 1);
  assert.equal((taskAppSource.match(/useFitnessPlans\(/g) ?? []).length, 1);
  assert.equal((taskAppSource.match(/useFitnessSessionDetails\(/g) ?? []).length, 1);
  assert.match(taskAppSource, /<TaskHealthPage\s+activeTab=\{activeHealthTab\}[\s\S]*?onSelectTab=\{handleHealthTabSelection\}/);
});

test("Food and Journal editor owners report draft safety before Health tab activation", () => {
  assert.match(healthPageSource, /onDraftSafetyChange\("Food", isUnsafe\)/);
  assert.match(healthPageSource, /onDraftSafetyChange\("Journal", isUnsafe\)/);
  assert.match(healthLibrarySource, /const hasUnsafeDraft = Boolean\([\s\S]*?foodImportText[\s\S]*?recipeDraft[\s\S]*?mealDraft/);
  assert.match(healthLibrarySource, /onDraftSafetyChange\(hasUnsafeDraft\)/);
  assert.match(journalFormSource, /const hasUnsafeDraft = isSaving \|\| isDraftUnsafe \|\| isEventCaptureDraftUnsafe/);
  assert.match(journalFormSource, /onDraftSafetyChange\(hasUnsafeDraft\)/);
  assert.match(journalFormSource, /onDraftSafetyChange=\{setIsEventCaptureDraftUnsafe\}/);
  assert.match(journalEventCaptureSource, /onDraftSafetyChange\(Boolean\(tagOverlay\)\)/);
  assert.match(controllerHookSource, /isHealthMasterTabTransitionBlocked\(/);
  assert.match(controllerHookSource, /targetTab\.destination\.page !== activePage/);
});

test("Navigator deep destinations update the focused tab and restore shell or Settings requests", () => {
  assert.match(taskAppSource, /masterWorkspaceController\.updateFocusedDestination\(action\)\) return/);
  assert.match(controllerHookSource, /destination\.kind === "page-shell" \? destination\.healthTab : undefined/);
  assert.match(controllerHookSource, /isHealthSectionTransitionBlocked\(targetHealthSection\)/);
  assert.match(taskAppSource, /destination\.kind === "page-shell" \? destination : null/);
  assert.match(taskAppSource, /destination\.kind === "settings-section" \? destination\.section : null/);
  assert.match(stateSource, /export type MasterTabDestination = NavigatorSearchAction/);
  assert.match(stateSource, /case "tasks-surface"/);
  assert.match(stateSource, /case "tasks-view"/);
  assert.match(stateSource, /case "settings-section"/);
  assert.match(stateSource, /case "page-shell"/);
  assert.match(tabBarSource, /if \(destination\.kind === "health-tab"\) return `Health · \$\{destination\.tab\}`/);
  assert.match(tabBarSource, /if \(destination\.kind === "tasks-surface"\)/);
  assert.match(tabBarSource, /if \(destination\.kind === "tasks-view"\)/);
  assert.match(tabBarSource, /if \(destination\.kind === "settings-section"\)/);
  assert.match(tabBarSource, /if \(destination\.kind === "page-shell"\)/);
});
