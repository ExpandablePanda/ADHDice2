import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getMasterWorkspaceTransitionBlockReason } from "../src/lib/master-workspace-controller.ts";

const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const healthPageSource = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
const healthLibrarySource = readFileSync(new URL("../src/components/task-app/health-library-panel.tsx", import.meta.url), "utf8");
const waterPanelSource = readFileSync(new URL("../src/components/task-app/health-water-panel.tsx", import.meta.url), "utf8");
const fitnessTabSource = readFileSync(new URL("../src/components/task-app/health-fitness-tab.tsx", import.meta.url), "utf8");
const fitnessGoalsSource = readFileSync(new URL("../src/components/task-app/health-fitness-goals-panel.tsx", import.meta.url), "utf8");
const fitnessPlansSource = readFileSync(new URL("../src/components/task-app/health-fitness-plans-panel.tsx", import.meta.url), "utf8");
const notesPageSource = readFileSync(new URL("../src/components/task-app/notes-page.tsx", import.meta.url), "utf8");
const noteEditorSource = readFileSync(new URL("../src/components/task-app/note-editor.tsx", import.meta.url), "utf8");
const scratchPaperSource = readFileSync(new URL("../src/components/task-app/scratch-paper.tsx", import.meta.url), "utf8");
const fitnessExerciseLibrarySource = readFileSync(new URL("../src/components/task-app/health-fitness-exercise-library.tsx", import.meta.url), "utf8");
const activeFitnessWorkoutHookSource = readFileSync(new URL("../src/hooks/useActiveFitnessWorkout.ts", import.meta.url), "utf8");
const activeFitnessWorkoutPanelSource = readFileSync(new URL("../src/components/task-app/health-active-workout.tsx", import.meta.url), "utf8");
const journalFormSource = readFileSync(new URL("../src/components/task-app/journal-check-in-form.tsx", import.meta.url), "utf8");
const journalEventCaptureSource = readFileSync(new URL("../src/components/task-app/journal-event-capture.tsx", import.meta.url), "utf8");
const tabBarSource = readFileSync(new URL("../src/components/task-app/master-workspace-tab-bar.tsx", import.meta.url), "utf8");
const controllerHookSource = readFileSync(new URL("../src/hooks/useMasterWorkspaceController.ts", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("../src/lib/master-workspace-state.ts", import.meta.url), "utf8");

test("legacy Health preference remains the gate-off authority with one preference subscription", () => {
  assert.equal((taskAppSource.match(/useSyncExternalStore\(subscribeToHealthTabPreference/g) ?? []).length, 1);
  assert.match(taskAppSource, /masterWorkspace\.isEnabled && activePage === "Health"[\s\S]*?legacyHealthTabPreference/);
  assert.match(taskAppSource, /if \(isMasterTabsFeatureEnabled\) \{[\s\S]*?selectMasterHealthSection\(tab\)[\s\S]*?else persistHealthTabPreference\(tab\)/);
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
  assert.match(healthPageSource, /reportSectionDraftSafety\("Food", "health-page-food", hasUnsafeFoodDraft\)/);
  assert.match(healthPageSource, /reportSectionDraftSafety\("Journal", "health-page-journal", hasUnsafeJournalLocalDraft\)/);
  assert.match(healthLibrarySource, /const hasUnsafeDraft = Boolean\([\s\S]*?foodImportText[\s\S]*?recipeDraft[\s\S]*?mealDraft/);
  assert.match(healthLibrarySource, /onDraftSafetyChange\(hasUnsafeDraft\)/);
  assert.match(journalFormSource, /const isDraftDirty = Boolean\(sharedSession\?\.dirty \|\| sharedLinkedEventSession\?\.dirty\)[\s\S]*?!areHealthJournalDraftsEqual\(currentDraft, draftBaseline\)/);
  assert.match(journalFormSource, /const hasUnsafeDraft = isSaving \|\| isEventCaptureDraftUnsafe \|\| \(!sharedSessionEnabled && isDraftDirty\)/);
  assert.match(journalFormSource, /sessionStore\.ensureSession\(sessionDraftId, sessionCanonicalRecordId, initialDraft\)/);
  assert.doesNotMatch(healthPageSource, /journalOccurrences\.length > 0/);
  assert.match(healthPageSource, /journalOccurrenceEditorOpen/);
  assert.match(journalFormSource, /onDraftSafetyChange\(hasUnsafeDraft\)/);
  assert.match(journalFormSource, /onDraftSafetyChange=\{setIsEventCaptureDraftUnsafe\}/);
  assert.match(journalEventCaptureSource, /onDraftSafetyChange\(Boolean\(tagOverlay\) \|\| isCreatingSignal\)/);
  assert.match(journalFormSource, /Discard Draft/);
  assert.match(journalFormSource, /sessionStore\.attachView\(sessionDraftId, sessionViewId\)/);
  assert.match(journalFormSource, /const linkedEventSessionDraftId = sharedSessionEnabled[\s\S]*?`journal-entry:\$\{sharedBaseDraft\.eventDraft\.id\}`/);
  assert.match(journalFormSource, /sessionStore\.updateDraft\(linkedEventSessionDraftId, \(current\) => \(\{[\s\S]*?eventDraft: update\(current\.eventDraft\)/);
  assert.match(journalFormSource, /sessionStore\.saveFailed\(sessionDraftId, saveRevision, error\)/);
  assert.match(journalFormSource, /sessionStore\.saveSucceeded\(sessionDraftId, saveRevision, savedDraft\)/);
  assert.match(journalFormSource, /sessionStore\.saveSucceeded\(canonicalDraftId, linkedEventSaveRevision, savedEventDraft\)/);
  assert.match(controllerHookSource, /isHealthMasterTabTransitionBlocked\(/);
  assert.match(controllerHookSource, /targetTab\.destination\.page !== activeMasterPage/);
  assert.match(controllerHookSource, /isTabTransitionBlocked\(targetTab\)/);
  assert.match(controllerHookSource, /return !isTabTransitionBlocked\(nextTab\)/);
});

test("retained Journal drafts navigate without a false saved-occurrence guard", () => {
  const journalGuardStart = healthPageSource.indexOf("const hasUnsafeJournalLocalDraft = Boolean(");
  const journalGuardEnd = healthPageSource.indexOf(");", journalGuardStart);
  const journalGuard = healthPageSource.slice(journalGuardStart, journalGuardEnd);
  assert.doesNotMatch(journalGuard, /journalOccurrences\.length/);
  assert.match(journalGuard, /journalOccurrenceEditorOpen/);
  assert.match(journalFormSource, /const hasUnsafeDraft = isSaving \|\| isEventCaptureDraftUnsafe \|\| \(!sharedSessionEnabled && isDraftDirty\)/);
  assert.match(taskAppSource, /journalSessionStore=\{masterWorkspace\.isEnabled \? journalDraftSessionStore : null\}/);
  assert.match(taskAppSource, /protectUnsavedJournalDrafts/);
  assert.match(taskAppSource, /beforeunload/);
  assert.equal(getMasterWorkspaceTransitionBlockReason("Health", "Journal", false, { Journal: false }, false), null);
});

test("Water reports through the existing Health draft-safety seam", () => {
  assert.match(healthPageSource, /reportSectionDraftSafety\("Water", "water-panel", isUnsafe\)/);
  assert.match(healthPageSource, /<HealthWaterPanel[\s\S]*?onDraftSafetyChange=\{reportWaterDraftSafety\}/);
  assert.match(waterPanelSource, /onDraftSafetyChange\(isDraftUnsafe\)/);
  assert.match(taskAppSource, /healthDraftSafetyBySection,/);
  assert.match(taskAppSource, /onDraftSafetyChange=\{updateHealthDraftSafety\}/);
  assert.match(controllerHookSource, /Boolean\(healthDraftSafetyBySection\[currentHealthSection\]\)/);
});

test("Fitness reports section exit safety from every editor and active workout", () => {
  assert.match(healthPageSource, /reportSectionDraftSafety\("Fitness", "fitness-tab", isUnsafe\)/);
  assert.match(healthPageSource, /<HealthFitnessTab[\s\S]*?onDraftSafetyChange=\{reportFitnessDraftSafety\}/);
  assert.match(fitnessTabSource, /isFormOpen[\s\S]*?hasUnsafeSettingsDraft[\s\S]*?hasUnsafeGoalsDraft[\s\S]*?hasUnsafePlansDraft[\s\S]*?hasUnsafeExerciseLibraryDraft[\s\S]*?!activeWorkout\.isHydrated[\s\S]*?activeWorkout\.runtime/);
  assert.match(fitnessTabSource, /onDraftSafetyChange\(isFitnessDraftUnsafe\)[\s\S]*?return \(\) => onDraftSafetyChange\(false\)/);
  assert.match(fitnessTabSource, /isSavingWorkout[\s\S]*?setIsSavingWorkout\(true\)[\s\S]*?setIsSavingWorkout\(false\)/);
  assert.match(fitnessTabSource, /fieldset className="contents" disabled=\{isSavingWorkout\}/);
  assert.match(fitnessTabSource, /saveWorkoutImportAlias[\s\S]*?setIsSavingWorkoutAlias\(true\)[\s\S]*?finally[\s\S]*?setIsSavingWorkoutAlias\(false\)/);
  assert.match(fitnessTabSource, /<HealthFitnessGoalsPanel[\s\S]*?onDraftSafetyChange=\{reportGoalsDraftSafety\}/);
  assert.match(fitnessTabSource, /<HealthFitnessPlansPanel[\s\S]*?onDraftSafetyChange=\{reportPlansDraftSafety\}/);
  assert.match(fitnessTabSource, /<HealthFitnessExerciseLibrary[\s\S]*?onDraftSafetyChange=\{reportExerciseLibraryDraftSafety\}/);
  assert.match(fitnessGoalsSource, /Boolean\(editor \|\| isSaving \|\| unsafeLevelEditorGoalIds\.size > 0\)/);
  assert.match(fitnessGoalsSource, /setUnsafeLevelEditorGoalIds\(\(current\) => \{/);
  assert.match(fitnessGoalsSource, /reportLevelDraftSafety\(isLevelDraftUnsafe\)[\s\S]*?return \(\) => reportLevelDraftSafety\(false\)/);
  assert.match(fitnessPlansSource, /Boolean\(editor \|\| isSaving\)/);
  assert.match(fitnessPlansSource, /onDraftSafetyChange\(isDraftUnsafe\)[\s\S]*?return \(\) => onDraftSafetyChange\(false\)/);
  assert.match(fitnessExerciseLibrarySource, /Boolean\(nameDraft \|\| editingId \|\| isSaving\)/);
  assert.match(fitnessExerciseLibrarySource, /onDraftSafetyChange\(isDraftUnsafe\)[\s\S]*?return \(\) => onDraftSafetyChange\(false\)/);
  assert.match(fitnessTabSource, /aria-hidden=\{!isSettingsOpen\}[\s\S]*?style=\{\{ display: isSettingsOpen \? "grid" : "none" \}\}/);
  assert.match(fitnessGoalsSource, /open=\{isPanelOpen \|\| isDraftUnsafe\}/);
  assert.match(fitnessPlansSource, /open=\{isPanelOpen \|\| isDraftUnsafe\}/);
  assert.match(activeFitnessWorkoutHookSource, /readActiveFitnessWorkout\(window\.localStorage, userId\)/);
  assert.match(activeFitnessWorkoutHookSource, /writeActiveFitnessWorkout\(window\.localStorage, userId, runtime\)/);
  assert.match(activeFitnessWorkoutHookSource, /isHydrated: hydratedUserId === userId/);
  assert.match(activeFitnessWorkoutPanelSource, />Discard Workout</);
  assert.match(activeFitnessWorkoutPanelSource, />\{controller\.isFinishing \? "Saving…" : controller\.runtime\?\.canonicalWorkoutId \? "Retry Finish Workout" : "Finish Workout"\}</);
  assert.match(activeFitnessWorkoutPanelSource, /fieldset className="contents" disabled=\{controller\.isFinishing\}/);
});

test("Fitness save success or explicit Cancel clears a draft while failures keep its editor", () => {
  assert.match(fitnessTabSource, /if \(!bundleSave\.ok\) \{[\s\S]*?return;[\s\S]*?resetForm\(\);/);
  assert.match(fitnessTabSource, /if \(await saveWorkoutTitleOptions\(result\.value\)\) \{[\s\S]*?setSavedTitleDraft\(""\)/);
  assert.match(fitnessTabSource, /onClick=\{resetForm\} type="button">Cancel/);
  assert.match(fitnessGoalsSource, /if \(!saved\) \{[\s\S]*?return;[\s\S]*?setEditor\(null\)/);
  assert.match(fitnessGoalsSource, /if \(!saved\) \{[\s\S]*?return;[\s\S]*?setLevelEditor\(null\)/);
  assert.match(fitnessGoalsSource, /function closeEditor\(\) \{[\s\S]*?if \(isSaving\) return;[\s\S]*?setEditor\(null\)/);
  assert.match(fitnessPlansSource, /if \(!saved\) \{[\s\S]*?return;[\s\S]*?setEditor\(null\)/);
  assert.match(fitnessPlansSource, /onClick=\{\(\) => setEditor\(null\)\} type="button">Cancel<\/AdhdChip>/);
});

test("Navigator deep destinations update the focused tab and restore shell or Settings requests", () => {
  assert.match(taskAppSource, /masterWorkspaceController\.updateFocusedDestination\(action\)\) \{/);
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

test("cross-page Master Tabs activate immediately and protect Tasks snapshots from stale route sync", () => {
  assert.match(controllerHookSource, /const activeMasterPage = activeTab\.destination\.page/);
  assert.match(controllerHookSource, /const withScroll = snapshotTabScrollPosition\(workspace, currentPanel\.id, activeTab\.id\)[\s\S]*?activateMasterTabWithTaskWorkspace\(withScroll, currentPanel\.id, tabId, taskWorkspaceTabsState\)/);
  assert.match(controllerHookSource, /setActivePage\(targetTab\.destination\.page\)/);
  assert.match(controllerHookSource, /const pendingRouteRef = useRef/);
  assert.match(controllerHookSource, /const lastLegacyRoutePageRef = useRef\(activePage\)/);
  assert.match(controllerHookSource, /activeTab\.destination\.page === pendingRoute\.to && activePage === pendingRoute\.from/);
  assert.match(controllerHookSource, /const next = createMasterTab\([\s\S]*?, true\)/);
  assert.match(controllerHookSource, /setActivePage\(nextTab\.destination\.page\)/);
  assert.match(taskAppSource, /onNavigate=\{requestPageNavigation\}/);
  assert.match(taskAppSource, /onNavigateSearchTarget=\{handleNavigatorSearchTarget\}/);
  assert.match(controllerHookSource, /process\.env\.NEXT_PUBLIC_ADHDICE_MASTER_TABS/);
  assert.match(taskAppSource, /const syncRenderedPage = \(page: AppPage\) => \{[\s\S]*?if \(hasExperimentalDestination\) \{[\s\S]*?setActivePage\(page\)/);
  assert.match(taskAppSource, /openTaskFromExternalNavigation\(action\.taskId, hasExperimentalDestination\)/);
});

test("Notes and Scratch Paper pending edits are reported without one editor clearing another", () => {
  assert.match(taskAppSource, /hasUnsafeNotesDraft,/);
  assert.match(taskAppSource, /onDraftSafetyChange=\{setHasUnsafeNotesDraft\}/);
  assert.match(notesPageSource, /unsafeDraftSourcesRef = useRef\(new Set<string>\(\)\)/);
  assert.match(notesPageSource, /reportDraftSafety\("quick-capture", true\)/);
  assert.match(notesPageSource, /const reportNoteEditorDraftSafety = useCallback\(\(isUnsafe: boolean\) => \{\s*reportDraftSafety\("note-editor", isUnsafe\);\s*\}, \[reportDraftSafety\]\)/);
  assert.match(notesPageSource, /onDraftSafetyChange=\{reportNoteEditorDraftSafety\}/);
  assert.match(notesPageSource, /if \(error \|\| !data\)[\s\S]*?return false/);
  assert.match(notesPageSource, /onDraftSafetyChange=\{reportDraftSafety\}/);
  assert.match(noteEditorSource, /disabled=\{isSaving\}/);
  assert.match(scratchPaperSource, /onDraftSafetyChange\?\.\("scratch-current", isSaving \|\| isDirty\)/);
  assert.match(scratchPaperSource, /onDraftSafetyChange\?\.\(`scratch-card:\$\{note\.id\}`, isDraftUnsafe\)/);
  assert.match(scratchPaperSource, /unsafeCardIds\.has\(note\.id\)/);
  assert.match(scratchPaperSource, /if \(saved\) \{[\s\S]*?setDraftBaseline\(cardDraft\);\s*setIsEditing\(false\)/);
  assert.match(scratchPaperSource, /function discardDraft\(\)[\s\S]*?setLinkedTaskIds\(\[\.\.\.draftBaseline\.linkedTaskIds\]\)/);
});

test("uncovered Health editors report section safety and preserve parallel child guards", () => {
  assert.match(healthPageSource, /draftSafetySourcesRef = useRef\(new Map<string, \{ isUnsafe: boolean; section: HealthTab \}>\(\)\)/);
  assert.match(healthPageSource, /some\(\(entry\) => entry\.section === section && entry\.isUnsafe\)/);
  assert.match(healthPageSource, /reportSectionDraftSafety\("Weight", "weight-entry", hasUnsafeWeightDraft\)/);
  assert.match(healthPageSource, /reportSectionDraftSafety\("Sleep", "sleep-entry", hasUnsafeSleepDraft\)/);
  assert.match(healthPageSource, /reportSectionDraftSafety\("Settings", "health-settings", hasUnsafeHealthSettingsDraft\)/);
  assert.match(healthPageSource, /reportSectionDraftSafety\("Insights", "health-import", hasUnsafeHealthImportDraft\)/);
  assert.match(healthPageSource, /if \(isSavingImport\) return;[\s\S]*?function handleAppleFilePicked/);
  assert.match(healthPageSource, /disabled=\{isSavingImport\}[\s\S]*?type="file"/);
  assert.match(healthPageSource, /if \(!importPreview \|\| isSavingImport\) \{/);
  assert.match(healthPageSource, /isSavingSleepEdit[\s\S]*?const saved = await onUpdateSleepSession[\s\S]*?if \(!saved\) return/);
  assert.match(healthPageSource, /importPreview \|\| isParsingImport \|\| isSavingImport/);
  assert.match(healthPageSource, /JournalQuestionSettings onDraftSafetyChange=\{reportJournalQuestionDraftSafety\}/);
});
