import {
  getStyleLabBuilderLibraryEntry,
  STYLE_LAB_BUILDER_LIBRARY,
  type StyleLabBuilderLibraryCategory,
  type StyleLabBuilderLibraryCoverageStatus,
} from "./style-lab-builder-library";

export type StyleLabUiInventoryCandidate = {
  category: Exclude<StyleLabBuilderLibraryCategory, "All">;
  coverageStatus: StyleLabBuilderLibraryCoverageStatus;
  libraryEntryIds: readonly string[];
  reason?: string;
  sourceComponent: string;
  sourcePath: string;
};

function candidate(value: StyleLabUiInventoryCandidate): StyleLabUiInventoryCandidate {
  return value;
}

/**
 * Deterministic source inventory for the current visual surface. This is an
 * explicit coverage ledger, not an instruction to mount production feature
 * components inside Builder.
 */
export const STYLE_LAB_UI_INVENTORY: readonly StyleLabUiInventoryCandidate[] = [
  candidate({ category: "Cards", coverageStatus: "ready", libraryEntryIds: ["primitive.card"], sourceComponent: "AdhdCard", sourcePath: "src/components/ui-system/adhd-card.tsx" }),
  candidate({ category: "Chips", coverageStatus: "ready", libraryEntryIds: ["primitive.chip.default"], sourceComponent: "AdhdChip", sourcePath: "src/components/ui-system/adhd-chip.tsx" }),
  candidate({ category: "Menus", coverageStatus: "ready", libraryEntryIds: ["primitive.dropdown-panel"], sourceComponent: "AdhdDropdownPanel", sourcePath: "src/components/ui-system/adhd-dropdown-panel.tsx" }),
  candidate({ category: "Inputs", coverageStatus: "ready", libraryEntryIds: ["primitive.dropdown-select"], sourceComponent: "AdhdDropdownSelect", sourcePath: "src/components/ui-system/adhd-dropdown-select.tsx" }),
  candidate({ category: "Buttons", coverageStatus: "ready", libraryEntryIds: ["primitive.icon-button.default"], sourceComponent: "AdhdIconButton", sourcePath: "src/components/ui-system/adhd-icon-button.tsx" }),
  candidate({ category: "Headers", coverageStatus: "ready", libraryEntryIds: ["header.entity"], sourceComponent: "EditableEntityHeaderTitle", sourcePath: "src/components/ui-system/editable-entity-header-title.tsx" }),
  candidate({ category: "Panels", coverageStatus: "ready", libraryEntryIds: ["primitive.panel"], sourceComponent: "AdhdPanel", sourcePath: "src/components/ui-system/adhd-panel.tsx" }),
  candidate({ category: "Shells", coverageStatus: "ready", libraryEntryIds: ["shell.body-card"], sourceComponent: "ReorderablePageShells", sourcePath: "src/components/ui-system/reorderable-page-shells.tsx" }),

  candidate({ category: "Task UI", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Status controls own task-state transitions; add a static Builder adapter for the visual control only.", sourceComponent: "TaskStatusSelect / TaskStatusUi", sourcePath: "src/components/task-app/task-status-select.tsx" }),
  candidate({ category: "Task UI", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Attention menu behavior and task mutations remain production-owned; extract a visual menu adapter later.", sourceComponent: "TaskAttentionChip", sourcePath: "src/components/task-app/task-attention-chip.tsx" }),
  candidate({ category: "Rows", coverageStatus: "ready", libraryEntryIds: ["pattern.task-row"], sourceComponent: "TasksDenseList", sourcePath: "src/components/ui/tasks-dense-list.tsx" }),
  candidate({ category: "Menus", coverageStatus: "ready", libraryEntryIds: ["pattern.context-menu"], sourceComponent: "TaskContentFolderContextMenu", sourcePath: "src/components/task-app/task-content-folder-context-menu.tsx" }),
  candidate({ category: "Task UI", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Timer display has live timing state; create a static timer visual adapter without runtime callbacks.", sourceComponent: "TaskTimerDisplay", sourcePath: "src/components/task-app/task-timer-display.tsx" }),
  candidate({ category: "Task UI", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Calendar presentation is a larger interactive module; keep it inventoried for a later visual extraction.", sourceComponent: "TaskCalendarView", sourcePath: "src/components/task-app/task-calendar-view.tsx" }),
  candidate({ category: "Inputs", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Editor fields are a composite form surface; extract safe field visuals without task persistence.", sourceComponent: "TaskEditorFields", sourcePath: "src/components/task-app/task-editor-fields.tsx" }),
  candidate({ category: "Buttons", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Hierarchy control is a stateful structural action; its visual button can be adapted separately.", sourceComponent: "TaskHierarchyChevronButton", sourcePath: "src/components/task-app/task-hierarchy-chevron-button.tsx" }),
  candidate({ category: "Task UI", coverageStatus: "ready", libraryEntryIds: ["module.task-detail-hero"], sourceComponent: "TestIosTaskDetail", sourcePath: "src/components/task-app/test-ios-task-detail.tsx" }),
  candidate({ category: "Task UI", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Secondary views combine domain routing and multiple visual states; defer a static representative module.", sourceComponent: "TaskSecondaryViews", sourcePath: "src/components/task-app/task-secondary-views.tsx" }),
  candidate({ category: "Task UI", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "View adapters coordinate production data and visual variants; inventory only until a safe visual boundary is chosen.", sourceComponent: "TaskViewAdapters", sourcePath: "src/components/task-app/task-view-adapters.tsx" }),

  candidate({ category: "HUD", coverageStatus: "ready", libraryEntryIds: ["module.hud-workspace"], sourceComponent: "HudCommandCenter", sourcePath: "src/components/task-app/hud-command-center.tsx" }),
  candidate({ category: "HUD", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Focus alarm owns timing and notification behavior; add only a static widget adapter later.", sourceComponent: "FocusAlarmWidget", sourcePath: "src/components/task-app/focus-alarm-widget.tsx" }),
  candidate({ category: "HUD", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Active timer tray is live workspace state and needs a visual-only extraction.", sourceComponent: "TaskActiveTimersTray", sourcePath: "src/components/task-app/task-active-timers-tray.tsx" }),

  candidate({ category: "Journal", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Check-in inputs and journal persistence stay outside Builder; extract a safe form visual later.", sourceComponent: "JournalCheckInForm", sourcePath: "src/components/task-app/journal-check-in-form.tsx" }),
  candidate({ category: "Journal", coverageStatus: "ready", libraryEntryIds: ["module.journal-entry-summary"], sourceComponent: "JournalEntrySummary", sourcePath: "src/components/task-app/journal-entry-summary.tsx" }),
  candidate({ category: "Journal", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Event capture owns journal writes; inventory it separately from the summary adapter.", sourceComponent: "JournalEventCapture", sourcePath: "src/components/task-app/journal-event-capture.tsx" }),
  candidate({ category: "Journal", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Question settings is a persisted configuration surface; defer a static settings panel adapter.", sourceComponent: "JournalQuestionSettings", sourcePath: "src/components/task-app/journal-question-settings.tsx" }),

  candidate({ category: "Health", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Collapsible behavior and health data remain production-owned; extract the shell as a Builder pattern later.", sourceComponent: "HealthCollapsiblePanel", sourcePath: "src/components/task-app/health-collapsible-panel.tsx" }),
  candidate({ category: "Health", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Health dropdown includes domain selection behavior; defer visual-only menu extraction.", sourceComponent: "HealthDropdown", sourcePath: "src/components/task-app/health-dropdown.tsx" }),
  candidate({ category: "Health", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Active Workout is live timing and persistence state; do not mount it in Builder.", sourceComponent: "HealthActiveWorkout", sourcePath: "src/components/task-app/health-active-workout.tsx" }),
  candidate({ category: "Health", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Fitness goals own health persistence and nested editors; defer a visual-only goal panel.", sourceComponent: "HealthFitnessGoalsPanel", sourcePath: "src/components/task-app/health-fitness-goals-panel.tsx" }),
  candidate({ category: "Health", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Fitness plans include persistence and reorder behavior; defer a static planning module.", sourceComponent: "HealthFitnessPlansPanel", sourcePath: "src/components/task-app/health-fitness-plans-panel.tsx" }),
  candidate({ category: "Health", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Exercise library owns health records and save actions; defer a visual extraction.", sourceComponent: "HealthLibraryPanel", sourcePath: "src/components/task-app/health-library-panel.tsx" }),
  candidate({ category: "Health", coverageStatus: "ready", libraryEntryIds: ["module.health-panel"], sourceComponent: "HealthWaterPanel", sourcePath: "src/components/task-app/health-water-panel.tsx" }),
  candidate({ category: "Health", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Chart shells are data visualizations with live datasets; add a static chart frame adapter later.", sourceComponent: "HealthCalorieLineChart", sourcePath: "src/components/task-app/health-calorie-line-chart.tsx" }),
  candidate({ category: "Health", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Chart shells are data visualizations with live datasets; add a static chart frame adapter later.", sourceComponent: "HealthSleepLineChart", sourcePath: "src/components/task-app/health-sleep-line-chart.tsx" }),
  candidate({ category: "Health", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Chart shells are data visualizations with live datasets; add a static chart frame adapter later.", sourceComponent: "HealthWaterLineChart", sourcePath: "src/components/task-app/health-water-line-chart.tsx" }),

  candidate({ category: "Planning", coverageStatus: "ready", libraryEntryIds: ["module.planning-panel"], sourceComponent: "DailyPlanningPanel", sourcePath: "src/components/task-app/daily-planning-panel.tsx" }),
  candidate({ category: "Planning", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "On-Time Planner owns drag and scheduling state; defer a static representative module.", sourceComponent: "OnTimePlannerWorkspace", sourcePath: "src/components/task-app/on-time-planner-workspace.tsx" }),
  candidate({ category: "Planning", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Focus Planner owns task selection and alarm behavior; defer visual extraction.", sourceComponent: "FocusPlannerModal", sourcePath: "src/components/task-app/focus-planner-modal.tsx" }),
  candidate({ category: "Planning", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Brainstorm workspace owns domain interactions; inventory the visual module for a later adapter.", sourceComponent: "BrainstormWorkspace", sourcePath: "src/components/task-app/brainstorm-workspace.tsx" }),
  candidate({ category: "Planning", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Brainstorm QA owns review state; inventory the visual module for a later adapter.", sourceComponent: "BrainstormQaWorkspace", sourcePath: "src/components/task-app/brainstorm-qa-workspace.tsx" }),

  candidate({ category: "Navigation", coverageStatus: "ready", libraryEntryIds: ["navigation.bottom-dock"], sourceComponent: "BottomDock", sourcePath: "src/components/task-app/bottom-dock.tsx" }),
  candidate({ category: "Navigation", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Task surface switch is local navigation state; adapt its segmented visual without route behavior later.", sourceComponent: "TasksSurfaceSwitch", sourcePath: "src/components/task-app/tasks-surface-switch.tsx" }),
  candidate({ category: "Navigation", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Inline navigator owns search and routing behavior; defer a visual-only navigator pattern.", sourceComponent: "NavigatorSearchInline", sourcePath: "src/components/task-app/navigator-search-inline.tsx" }),

  candidate({ category: "Modules", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Scratch Paper has editable local content; add a safe visual shell adapter without content persistence later.", sourceComponent: "ScratchPaper", sourcePath: "src/components/task-app/scratch-paper.tsx" }),
  candidate({ category: "Modules", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "PATHS workspace includes graph interaction and domain state; inventory it for a future node/workspace adapter.", sourceComponent: "PathsWorkspace", sourcePath: "src/components/task-app/paths-workspace.tsx" }),
  candidate({ category: "Modules", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Records tab combines persistence and reconciliation; defer a static records panel adapter.", sourceComponent: "RecordsTab", sourcePath: "src/components/task-app/records-tab.tsx" }),
  candidate({ category: "Modules", coverageStatus: "unsupported-for-builder", libraryEntryIds: [], reason: "Trophy canvas rendering is generated/runtime visual output rather than a safe Builder-node tree.", sourceComponent: "TrophyCaseCanvas", sourcePath: "src/components/task-app/trophy-case/trophy-case-canvas.tsx" }),
  candidate({ category: "Modules", coverageStatus: "adapter-needed", libraryEntryIds: [], reason: "Achievements combine domain state and celebration flows; defer a representative trophy-card adapter.", sourceComponent: "AchievementsPage", sourcePath: "src/components/task-app/achievements-page.tsx" }),
];

export type StyleLabUiInventoryValidation = {
  duplicateSourcePaths: string[];
  invalidLibraryEntryLinks: string[];
  missingReasons: string[];
  unclassified: string[];
};

export function validateStyleLabUiInventory(inventory: readonly StyleLabUiInventoryCandidate[] = STYLE_LAB_UI_INVENTORY): StyleLabUiInventoryValidation {
  const sourcePathCounts = new Map<string, number>();
  for (const item of inventory) sourcePathCounts.set(item.sourcePath, (sourcePathCounts.get(item.sourcePath) ?? 0) + 1);
  const duplicateSourcePaths = [...sourcePathCounts.entries()].filter(([, count]) => count > 1).map(([sourcePath]) => sourcePath);
  const invalidLibraryEntryLinks = inventory.flatMap((item) => item.libraryEntryIds.filter((id) => !getStyleLabBuilderLibraryEntry(id)).map((id) => `${item.sourcePath}:${id}`));
  const missingReasons = inventory.filter((item) => item.coverageStatus !== "ready" && !item.reason?.trim()).map((item) => item.sourcePath);
  const validStatuses: readonly StyleLabBuilderLibraryCoverageStatus[] = ["ready", "adapter-needed", "intentionally-nonvisual", "unsupported-for-builder"];
  const unclassified = inventory.filter((item) => !validStatuses.includes(item.coverageStatus)).map((item) => item.sourcePath);
  return { duplicateSourcePaths, invalidLibraryEntryLinks, missingReasons, unclassified };
}

export function getStyleLabUiInventoryCounts(inventory: readonly StyleLabUiInventoryCandidate[] = STYLE_LAB_UI_INVENTORY) {
  return inventory.reduce<Record<string, number>>((counts, item) => {
    const key = `${item.category}:${item.coverageStatus}`;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

export const STYLE_LAB_UI_INVENTORY_LIBRARY_SIZE = STYLE_LAB_BUILDER_LIBRARY.length;
