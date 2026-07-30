import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addHudSnapshot,
  addEmptyHudSnapshot,
  createDefaultHudUiState,
  cycleHudSnapshot,
  getHudSortableTarget,
  getHudSortableTargetIndex,
  getHudWorkspaceContentDimensions,
  getHudWorkspaceMinimumHeight,
  getHudWorkspaceViewportWidth,
  normalizeHudUiState,
  resetActiveHudSnapshot,
  reorderHudWorkspaceWidgets,
  saveActiveHudSnapshot,
  updateActiveHudWorkspace,
  updateHudWorkspaceWidgetLayout,
  type HudWorkspaceWidget,
} from "../src/lib/task-hud-layout.ts";

const taskAppSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");

test("collapsed HUD uses clickable text actions without chip primitives", () => {
  const collapsedHud = taskAppSource.match(/if \(isHudCollapsed\) \{([\s\S]*?)\n  \}\n\n  return \(/)?.[1] ?? "";
  assert.doesNotMatch(collapsedHud, />Running</);
  assert.doesNotMatch(collapsedHud, />Paused</);
  assert.doesNotMatch(collapsedHud, /TaskTableChipButton/);
  assert.match(collapsedHud, /collapsedHudTextActionClass/);
  assert.match(collapsedHud, /aria-label=\{`\$\{collapsedHudFocusTimer\.isPaused \? "Resume" : "Pause"\} timer for/);
  assert.match(collapsedHud, /aria-label=\{`\$\{collapsedHudTaskTimer\.pausedAt \? "Resume" : "Pause"\} timer for/);
});

function widget(id: string, x: number, y: number, widthPx = 50, heightPx = 40): HudWorkspaceWidget {
  return {
    heightPx,
    id,
    isVisible: true,
    type: id as HudWorkspaceWidget["type"],
    widthPx,
    x,
    y,
  };
}

test("hud workspace reorder packs visible widgets into the requested sortable order", () => {
  const widgets = [
    widget("dark_mode", 0, 0),
    widget("calm", 58, 0),
    widget("sync_status", 116, 0),
    widget("xp", 174, 0),
  ];

  const reordered = reorderHudWorkspaceWidgets(widgets, "xp", { laneIndex: 0, laneY: 0, slotIndex: 1 });

  assert.deepEqual(reordered.filter((item) => item.isVisible).map((item) => item.id), [
    "dark_mode",
    "xp",
    "calm",
    "sync_status",
  ]);
  assert.deepEqual(reordered.map((item) => [item.id, item.x, item.y]), [
    ["dark_mode", 5, 5],
    ["xp", 63, 5],
    ["calm", 121, 5],
    ["sync_status", 179, 5],
  ]);
});

test("hud workspace reorder keeps lane contents from wrapping by workspace width", () => {
  const widgets = [
    widget("dark_mode", 0, 0, 90),
    widget("calm", 98, 0, 90),
    widget("sync_status", 0, 48, 90),
  ];

  const reordered = reorderHudWorkspaceWidgets(widgets, "sync_status", { laneIndex: 0, laneY: 0, slotIndex: 1 });

  assert.deepEqual(reordered.map((item) => [item.id, item.x, item.y]), [
    ["dark_mode", 5, 5],
    ["sync_status", 103, 5],
    ["calm", 201, 5],
  ]);
});

test("hud lane reorder inserts row two widget into row one without spilling row one widgets down", () => {
  const widgets = [
    widget("dark_mode", 0, 0, 90),
    widget("calm", 98, 0, 90),
    widget("sync_status", 196, 0, 90),
    widget("xp", 0, 48, 90),
    widget("points", 98, 48, 90),
    widget("tokens", 196, 48, 90),
  ];

  const target = getHudSortableTargetIndex(widgets, "xp", { x: 160, y: 20 });
  assert.equal(target, 2);

  const reordered = reorderHudWorkspaceWidgets(widgets, "xp", { laneIndex: 0, laneY: 0, slotIndex: 2 });

  assert.deepEqual(reordered.map((item) => [item.id, item.x, item.y]), [
    ["dark_mode", 5, 5],
    ["calm", 103, 5],
    ["xp", 201, 5],
    ["sync_status", 299, 5],
    ["points", 5, 53],
    ["tokens", 103, 53],
  ]);
});

test("hud lane reorder resolves target lane by y when source lane disappears", () => {
  const widgets = [
    widget("dark_mode", 0, 0, 90),
    widget("calm", 0, 48, 90),
    widget("sync_status", 98, 48, 90),
  ];

  const target = getHudSortableTarget(widgets, "dark_mode", { x: 120, y: 68 });
  const reordered = reorderHudWorkspaceWidgets(widgets, "dark_mode", target);

  assert.deepEqual(reordered.map((item) => [item.id, item.x, item.y]), [
    ["calm", 5, 5],
    ["dark_mode", 103, 5],
    ["sync_status", 201, 5],
  ]);
});

test("hud sortable target index uses row y before row x when dragging down", () => {
  const widgets = [
    widget("dark_mode", 0, 0, 90),
    widget("calm", 98, 0, 90),
    widget("sync_status", 0, 48, 90),
    widget("xp", 98, 48, 90),
  ];

  assert.equal(
    getHudSortableTargetIndex(widgets, "dark_mode", { x: 130, y: 68 }),
    2,
  );
  assert.deepEqual(
    reorderHudWorkspaceWidgets(widgets, "dark_mode", getHudSortableTarget(widgets, "dark_mode", { x: 130, y: 68 }))
      .filter((item) => item.isVisible)
      .map((item) => item.id),
    ["calm", "sync_status", "dark_mode", "xp"],
  );
});

test("hud lane reorder sizes rows by tallest widget and vertically centers shorter lane widgets", () => {
  const widgets = [
    widget("dark_mode", 0, 0, 90, 40),
    widget("calm", 98, 0, 90, 40),
    widget("sync_status", 0, 48, 90, 96),
    widget("xp", 98, 48, 90, 40),
    widget("points", 0, 152, 90, 40),
  ];

  const tallInFirstLane = reorderHudWorkspaceWidgets(widgets, "sync_status", { laneIndex: 0, laneY: 0, slotIndex: 1 });

  assert.deepEqual(tallInFirstLane.map((item) => [item.id, item.x, item.y]), [
    ["dark_mode", 5, 33],
    ["sync_status", 103, 5],
    ["calm", 201, 33],
    ["xp", 5, 109],
    ["points", 5, 157],
  ]);

  const tallBackInSecondLane = reorderHudWorkspaceWidgets(tallInFirstLane, "sync_status", { laneIndex: 1, laneY: 104, slotIndex: 1 });

  assert.deepEqual(tallBackInSecondLane.map((item) => [item.id, item.x, item.y]), [
    ["dark_mode", 5, 5],
    ["calm", 103, 5],
    ["xp", 5, 81],
    ["sync_status", 103, 53],
    ["points", 5, 157],
  ]);
});

test("hud sortable target index uses row y before row x when dragging up", () => {
  const widgets = [
    widget("dark_mode", 0, 0, 90),
    widget("calm", 98, 0, 90),
    widget("sync_status", 0, 48, 90),
    widget("xp", 98, 48, 90),
  ];

  assert.equal(
    getHudSortableTargetIndex(widgets, "xp", { x: 40, y: 20 }),
    0,
  );
  assert.deepEqual(
    reorderHudWorkspaceWidgets(widgets, "xp", getHudSortableTarget(widgets, "xp", { x: 40, y: 20 }))
      .filter((item) => item.isVisible)
      .map((item) => item.id),
    ["xp", "dark_mode", "calm", "sync_status"],
  );
});

test("hud widget resize clamps chip widgets to readable minimums", () => {
  const widgets = [
    widget("calm", 0, 0, 88, 50),
    widget("new_task", 0, 0, 132, 50),
    widget("refocus", 140, 0, 132, 50),
    widget("quick_capture", 280, 0, 132, 50),
  ];

  const resizedCalm = updateHudWorkspaceWidgetLayout(
    widgets,
    { heightPx: 120, widthPx: 880 },
    "calm",
    { heightPx: 12, widthPx: 20 },
  );
  const calm = resizedCalm.find((item) => item.id === "calm");
  assert.equal(calm?.heightPx, 54);
  assert.equal(calm?.widthPx, 104);

  const resizedNewTask = updateHudWorkspaceWidgetLayout(
    widgets,
    { heightPx: 120, widthPx: 880 },
    "new_task",
    { heightPx: 12, widthPx: 20 },
  );
  const newTask = resizedNewTask.find((item) => item.id === "new_task");
  assert.equal(newTask?.heightPx, 44);
  assert.equal(newTask?.widthPx, 112);

  const resizedRefocus = updateHudWorkspaceWidgetLayout(
    widgets,
    { heightPx: 120, widthPx: 880 },
    "refocus",
    { heightPx: 12, widthPx: 20 },
  );
  const refocus = resizedRefocus.find((item) => item.id === "refocus");
  assert.equal(refocus?.heightPx, 44);
  assert.equal(refocus?.widthPx, 112);

  const resizedQuickCapture = updateHudWorkspaceWidgetLayout(
    widgets,
    { heightPx: 120, widthPx: 880 },
    "quick_capture",
    { heightPx: 12, widthPx: 20 },
  );
  const quickCapture = resizedQuickCapture.find((item) => item.id === "quick_capture");
  assert.equal(quickCapture?.heightPx, 44);
  assert.equal(quickCapture?.widthPx, 148);
});

test("hud widget resize clamps focus alarm to content-safe minimums", () => {
  const widgets = [
    widget("focus_alarm", 0, 0, 192, 48),
  ];

  const resizedFocusAlarm = updateHudWorkspaceWidgetLayout(
    widgets,
    { heightPx: 120, widthPx: 880 },
    "focus_alarm",
    { heightPx: 12, widthPx: 20 },
  );
  const focusAlarm = resizedFocusAlarm.find((item) => item.id === "focus_alarm");

  assert.equal(focusAlarm?.heightPx, 56);
  assert.equal(focusAlarm?.widthPx, 224);
});

test("hud widget placement keeps a five pixel sandbox top-left inset", () => {
  const widgets = [widget("dark_mode", 0, 0, 50, 40)];
  const topLeft = updateHudWorkspaceWidgetLayout(widgets, { heightPx: 120, widthPx: 200 }, "dark_mode", { x: 0, y: 0 });

  assert.deepEqual([topLeft[0]?.x, topLeft[0]?.y], [5, 5]);
});

test("hud workspace normalization repairs persisted widgets below usable minimums", () => {
  const normalized = normalizeHudUiState({
    activeHudPageId: "command",
    hudPages: [
      { id: "overview", title: "Overview", widgets: [] },
      { id: "command", title: "Command", widgets: [] },
    ],
    hudUiVersion: 5,
    hudWorkspace: {
      heightPx: 120,
      version: 1,
      widgets: [
        {
          heightPx: 50,
          id: "hud-calm",
          isVisible: true,
          type: "calm",
          widthPx: 88,
          x: 0,
          y: 64,
        },
        {
          heightPx: 10,
          id: "hud-new_task",
          isVisible: true,
          type: "new_task",
          widthPx: 30,
          x: 0,
          y: 0,
        },
        {
          heightPx: 20,
          id: "hud-focus_alarm",
          isVisible: true,
          type: "focus_alarm",
          widthPx: 100,
          x: 296,
          y: 0,
        },
        {
          heightPx: 18,
          id: "hud-quick_capture",
          isVisible: true,
          type: "quick_capture",
          widthPx: 60,
          x: 140,
          y: 0,
        },
      ],
      widthPx: 880,
    },
    isHudCollapsed: false,
    isHudEditMode: true,
    selectedHudWidgetId: "hud-new_task",
  });

  const calm = normalized.hudWorkspace.widgets.find((item) => item.type === "calm");
  const newTask = normalized.hudWorkspace.widgets.find((item) => item.type === "new_task");
  const focusAlarm = normalized.hudWorkspace.widgets.find((item) => item.type === "focus_alarm");
  const quickCapture = normalized.hudWorkspace.widgets.find((item) => item.type === "quick_capture");
  const scratchPaper = normalized.hudWorkspace.widgets.find((item) => item.type === "scratch_paper");

  assert.equal(calm?.heightPx, 54);
  assert.equal(calm?.widthPx, 104);
  assert.equal(normalized.hudWorkspace.isWidthUserSized, false);
  assert.equal(newTask?.heightPx, 44);
  assert.equal(newTask?.widthPx, 112);
  assert.equal(focusAlarm?.heightPx, 56);
  assert.equal(focusAlarm?.widthPx, 224);
  assert.equal(quickCapture?.heightPx, 44);
  assert.equal(quickCapture?.widthPx, 148);
  assert.equal(scratchPaper?.isVisible, true);
  assert.equal(scratchPaper?.heightPx, 200);
  assert.equal(scratchPaper?.widthPx, 360);
});

test("hud workspace content dimensions do not add fake gutter when widgets fit inside the sandbox", () => {
  const widgets = [
    widget("dark_mode", 0, 0, 90, 40),
    widget("calm", 98, 0, 90, 40),
    widget("sync_status", 196, 0, 90, 40),
  ];

  assert.deepEqual(
    getHudWorkspaceContentDimensions(widgets, { heightPx: 120, widthPx: 880 }),
    { heightPx: 120, widthPx: 880 },
  );
});

test("hud workspace content dimensions add reachable gutter after true horizontal or vertical overflow", () => {
  const widgets = [
    widget("dark_mode", 0, 0, 90, 40),
    widget("focus_alarm", 864, 0, 224, 56),
    widget("task_counts", 0, 136, 184, 48),
  ];

  assert.deepEqual(
    getHudWorkspaceContentDimensions(widgets, { heightPx: 120, widthPx: 880 }),
    { heightPx: 213, widthPx: 1117 },
  );
});

test("hud workspace minimum height follows visible widget bounds plus a small gutter", () => {
  const widgets = [
    widget("dark_mode", 0, 0, 90, 40),
    widget("focus_alarm", 0, 48, 224, 56),
    {
      ...widget("tokens", 0, 0, 90, 40),
      isVisible: false,
    },
  ];

  assert.equal(getHudWorkspaceMinimumHeight(widgets), 116);
  assert.equal(getHudWorkspaceMinimumHeight([]), 108);
});

test("hud workspace viewport expands stale default width but preserves intentional width", () => {
  assert.equal(
    getHudWorkspaceViewportWidth(
      { isWidthUserSized: false, widthPx: 880 },
      1078,
    ),
    1078,
  );
  assert.equal(
    getHudWorkspaceViewportWidth(
      { isWidthUserSized: true, widthPx: 720 },
      1078,
    ),
    720,
  );
});

test("hud workspace normalization preserves legacy non-default width as intentional", () => {
  const normalized = normalizeHudUiState({
    hudUiVersion: 5,
    hudWorkspace: {
      heightPx: 120,
      version: 1,
      widgets: [
        {
          heightPx: 54,
          id: "hud-calm",
          isVisible: true,
          type: "calm",
          widthPx: 104,
          x: 0,
          y: 0,
        },
      ],
      widthPx: 720,
    },
  });

  assert.equal(normalized.hudWorkspace.isWidthUserSized, true);
  assert.equal(normalized.hudWorkspace.widthPx, 720);
});

test("createDefaultHudUiState returns a fresh default layout snapshot", () => {
  const first = createDefaultHudUiState();
  const second = createDefaultHudUiState();

  assert.notEqual(first, second);
  assert.notEqual(first.hudWorkspace, second.hudWorkspace);
  assert.notEqual(first.hudSnapshots[0]?.workspace, second.hudSnapshots[0]?.workspace);
  assert.equal(first.activeSnapshotId, 1);
  assert.equal(first.hudWorkspace.isWidthUserSized, false);
  assert.deepEqual(first.hudSnapshots.map((snapshot) => snapshot.id), [1]);
  assert.equal(first.hudWorkspace.widthPx, 880);
  assert.equal(first.hudWorkspace.widgets.find((widget) => widget.type === "scratch_paper")?.isVisible, true);
});

test("legacy single-layout HUD state migrates into snapshot 1", () => {
  const normalized = normalizeHudUiState({
    hudUiVersion: 5,
    hudWorkspace: {
      heightPx: 160,
      isWidthUserSized: true,
      version: 2,
      widgets: [
        {
          heightPx: 54,
          id: "hud-calm",
          isVisible: true,
          type: "calm",
          widthPx: 144,
          x: 24,
          y: 16,
        },
      ],
      widthPx: 720,
    },
  });

  assert.equal(normalized.activeSnapshotId, 1);
  assert.deepEqual(normalized.hudSnapshots.map((snapshot) => snapshot.id), [1]);
  assert.equal(normalized.hudSnapshots[0]?.workspace.widthPx, 720);
  assert.equal(normalized.hudSnapshots[0]?.workspace.isWidthUserSized, true);
  assert.equal(normalized.hudSnapshots[0]?.workspace.widgets.find((widget) => widget.type === "calm")?.widthPx, 144);
  assert.equal(normalized.hudWorkspace.widthPx, 720);
});

test("add snapshot creates the next snapshot and switches active snapshot", () => {
  const state = updateActiveHudWorkspace(createDefaultHudUiState(), (workspace) => ({
    ...workspace,
    widthPx: 944,
  }));

  const next = addHudSnapshot(state);

  assert.equal(next.activeSnapshotId, 2);
  assert.deepEqual(next.hudSnapshots.map((snapshot) => snapshot.id), [1, 2]);
  assert.equal(next.hudWorkspace.widthPx, 944);
  assert.equal(next.hudSnapshots[1]?.workspace.widthPx, 944);
});

test("new empty HUD layout preserves the current snapshot and hides every widget", () => {
  const state = createDefaultHudUiState();
  const originalVisibleTypes = state.hudWorkspace.widgets.filter((widget) => widget.isVisible).map((widget) => widget.type);

  const next = addEmptyHudSnapshot(state);

  assert.equal(next.activeSnapshotId, 2);
  assert.deepEqual(next.hudSnapshots.map((snapshot) => snapshot.id), [1, 2]);
  assert.deepEqual(
    next.hudSnapshots.find((snapshot) => snapshot.id === 1)?.workspace.widgets.filter((widget) => widget.isVisible).map((widget) => widget.type),
    originalVisibleTypes,
  );
  assert.equal(next.hudWorkspace.widgets.every((widget) => !widget.isVisible), true);
  assert.equal(next.hudSnapshots.find((snapshot) => snapshot.id === 2)?.workspace.widgets.every((widget) => !widget.isVisible), true);
  assert.equal(next.selectedHudWidgetId, null);
});

test("save snapshot overwrites the active snapshot layout", () => {
  let state = createDefaultHudUiState();
  state = addHudSnapshot(state);
  state = updateActiveHudWorkspace(state, (workspace) => ({
    ...workspace,
    widthPx: 1008,
  }));
  state = cycleHudSnapshot(state);
  state = cycleHudSnapshot(state);

  const saved = saveActiveHudSnapshot(state);
  const activeSnapshot = saved.hudSnapshots.find((snapshot) => snapshot.id === saved.activeSnapshotId);

  assert.equal(saved.activeSnapshotId, 2);
  assert.equal(saved.hudWorkspace.widthPx, 1008);
  assert.equal(activeSnapshot?.workspace.widthPx, 1008);
});

test("single committed reorder updates only the active snapshot workspace", () => {
  let state = createDefaultHudUiState();
  state = addHudSnapshot(state);
  const snapshotOneBefore = state.hudSnapshots.find((snapshot) => snapshot.id === 1);
  const reorderedWidgets = reorderHudWorkspaceWidgets(
    state.hudWorkspace.widgets,
    "hud-xp",
    { laneIndex: 0, laneY: 0, slotIndex: 1 },
  );

  state = updateActiveHudWorkspace(state, (workspace) => ({
    ...workspace,
    widgets: reorderedWidgets,
  }));

  const activeSnapshot = state.hudSnapshots.find((snapshot) => snapshot.id === state.activeSnapshotId);
  assert.equal(state.activeSnapshotId, 2);
  assert.deepEqual(
    activeSnapshot?.workspace.widgets.filter((item) => item.isVisible).slice(0, 4).map((item) => item.id),
    ["hud-dark_mode", "hud-xp", "hud-calm", "hud-sync_status"],
  );
  assert.deepEqual(
    snapshotOneBefore?.workspace.widgets.filter((item) => item.isVisible).slice(0, 4).map((item) => item.id),
    ["hud-dark_mode", "hud-calm", "hud-sync_status", "hud-xp"],
  );
  assert.deepEqual(
    state.hudSnapshots.find((snapshot) => snapshot.id === 1)?.workspace.widgets.filter((item) => item.isVisible).slice(0, 4).map((item) => item.id),
    snapshotOneBefore?.workspace.widgets.filter((item) => item.isVisible).slice(0, 4).map((item) => item.id),
  );
});

test("snapshot count caps at 5", () => {
  let state = createDefaultHudUiState();

  for (let index = 0; index < 6; index += 1) {
    state = addHudSnapshot(state);
  }

  assert.deepEqual(state.hudSnapshots.map((snapshot) => snapshot.id), [1, 2, 3, 4, 5]);
  assert.equal(state.activeSnapshotId, 5);
});

test("reset affects only the current snapshot", () => {
  let state = createDefaultHudUiState();
  state = updateActiveHudWorkspace(state, (workspace) => ({
    ...workspace,
    widthPx: 960,
  }));
  state = addHudSnapshot(state);
  state = updateActiveHudWorkspace(state, (workspace) => ({
    ...workspace,
    widthPx: 1040,
  }));

  const reset = resetActiveHudSnapshot(state);
  const firstSnapshot = reset.hudSnapshots.find((snapshot) => snapshot.id === 1);
  const secondSnapshot = reset.hudSnapshots.find((snapshot) => snapshot.id === 2);

  assert.equal(reset.activeSnapshotId, 2);
  assert.equal(reset.hudWorkspace.widthPx, 880);
  assert.equal(secondSnapshot?.workspace.widthPx, 880);
  assert.equal(firstSnapshot?.workspace.widthPx, 960);
});
