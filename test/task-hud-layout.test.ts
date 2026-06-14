import test from "node:test";
import assert from "node:assert/strict";
import { getHudSortableTarget, getHudSortableTargetIndex, getHudWorkspaceContentDimensions, getHudWorkspaceViewportWidth, normalizeHudUiState, reorderHudWorkspaceWidgets, updateHudWorkspaceWidgetLayout, type HudWorkspaceWidget } from "../src/lib/task-hud-layout.ts";

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
    ["dark_mode", 0, 0],
    ["xp", 58, 0],
    ["calm", 116, 0],
    ["sync_status", 174, 0],
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
    ["dark_mode", 0, 0],
    ["sync_status", 98, 0],
    ["calm", 196, 0],
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
    ["dark_mode", 0, 0],
    ["calm", 98, 0],
    ["xp", 196, 0],
    ["sync_status", 294, 0],
    ["points", 0, 48],
    ["tokens", 98, 48],
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
    ["calm", 0, 0],
    ["dark_mode", 98, 0],
    ["sync_status", 196, 0],
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
    ["dark_mode", 0, 28],
    ["sync_status", 98, 0],
    ["calm", 196, 28],
    ["xp", 0, 104],
    ["points", 0, 152],
  ]);

  const tallBackInSecondLane = reorderHudWorkspaceWidgets(tallInFirstLane, "sync_status", { laneIndex: 1, laneY: 104, slotIndex: 1 });

  assert.deepEqual(tallBackInSecondLane.map((item) => [item.id, item.x, item.y]), [
    ["dark_mode", 0, 0],
    ["calm", 98, 0],
    ["xp", 0, 76],
    ["sync_status", 98, 48],
    ["points", 0, 152],
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

  assert.equal(calm?.heightPx, 54);
  assert.equal(calm?.widthPx, 104);
  assert.equal(normalized.hudWorkspace.isWidthUserSized, false);
  assert.equal(newTask?.heightPx, 44);
  assert.equal(newTask?.widthPx, 112);
  assert.equal(focusAlarm?.heightPx, 56);
  assert.equal(focusAlarm?.widthPx, 224);
  assert.equal(quickCapture?.heightPx, 44);
  assert.equal(quickCapture?.widthPx, 148);
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
    { heightPx: 208, widthPx: 1112 },
  );
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
