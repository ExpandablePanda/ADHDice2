import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { ADHDICE_FOCUS_DEEP_LINK, parseFocusDeepLink, shouldApplyPendingFocusDeepLink } from "../src/lib/focus-deep-link.ts";
import {
  buildFocusWidgetSnapshot,
  focusWidgetSnapshotSignature,
  resolvePrimaryFocusSession,
} from "../src/lib/focus-widget.ts";
import type { ActiveFocusSession, FocusCategory } from "../src/lib/types.ts";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const category: FocusCategory = {
  id: "category-a",
  title: "Deep Work",
  focusType: "Work",
  color: "#6f57f6",
  icon: "Clock",
};

function session(overrides: Partial<ActiveFocusSession> = {}): ActiveFocusSession {
  return {
    accumulatedSeconds: 30,
    categoryId: category.id,
    countdownTargetSeconds: null,
    isRunning: true,
    mode: "countup",
    sessionId: "session-a",
    startTime: Date.parse("2026-10-06T12:00:00.000Z"),
    updatedAt: "2026-10-06T12:01:00.000Z",
    ...overrides,
  };
}

test("adhdice://focus parses to Focus and unknown or malformed URLs are ignored", () => {
  assert.equal(parseFocusDeepLink(ADHDICE_FOCUS_DEEP_LINK), "Focus");
  assert.equal(parseFocusDeepLink("adhdice://tasks"), null);
  assert.equal(parseFocusDeepLink("adhdice://focus?unexpected=1"), null);
  assert.equal(parseFocusDeepLink("not a URL"), null);
});

test("Focus deep link remains pending until authenticated UI restoration is complete", () => {
  assert.equal(shouldApplyPendingFocusDeepLink({
    hasPendingRequest: true,
    isAuthenticated: true,
    isNativeIos: true,
    isRestoringUiState: true,
    isAuthenticatedAppBootReady: false,
  }), false);
  assert.equal(shouldApplyPendingFocusDeepLink({
    hasPendingRequest: true,
    isAuthenticated: true,
    isNativeIos: true,
    isRestoringUiState: false,
    isAuthenticatedAppBootReady: true,
  }), true);
});

test("native Focus route uses existing setActivePage and Capacitor URL APIs", () => {
  const taskApp = read("src/components/task-app.tsx");
  assert.match(taskApp, /App\.getLaunchUrl\(\)/);
  assert.match(taskApp, /App\.addListener\("appUrlOpen"/);
  assert.match(taskApp, /setActivePage\("Focus"\)/);
  assert.match(taskApp, /parseFocusDeepLink/);
});

test("primary Focus resolver prefers running sessions and uses deterministic ordering", () => {
  const paused = session({
    categoryId: "category-c",
    isRunning: false,
    sessionId: "paused-newer",
    startTime: null,
    updatedAt: "2026-10-06T12:05:00.000Z",
  });
  const running = session({
    sessionId: "running-older",
    updatedAt: "2026-10-06T12:01:00.000Z",
  });
  const runningTie = session({
    categoryId: "category-b",
    sessionId: "z-running-tie",
    updatedAt: running.updatedAt,
  });
  const categories = [category, { ...category, id: "category-b", title: "Admin" }, { ...category, id: "category-c", title: "Paused" }];

  const resolved = resolvePrimaryFocusSession({
    [paused.categoryId]: paused,
    [running.categoryId]: running,
    [runningTie.categoryId]: runningTie,
  }, categories);
  assert.equal(resolved?.session.sessionId, "running-older");

  const reversed = resolvePrimaryFocusSession({
    [runningTie.categoryId]: runningTie,
    [running.categoryId]: running,
    [paused.categoryId]: paused,
  }, categories);
  assert.equal(reversed?.session.sessionId, "running-older");
});

test("count-up, countdown, and paused snapshots contain the required timing inputs", () => {
  const countup = buildFocusWidgetSnapshot({ [category.id]: session() }, [category]);
  assert.deepEqual(countup && {
    sessionId: countup.sessionId,
    categoryId: countup.categoryId,
    categoryTitle: countup.categoryTitle,
    mode: countup.mode,
    isRunning: countup.isRunning,
    startedAt: countup.startedAt,
    accumulatedSeconds: countup.accumulatedSeconds,
    countdownTargetSeconds: countup.countdownTargetSeconds,
    updatedAt: countup.updatedAt,
  }, {
    sessionId: "session-a",
    categoryId: "category-a",
    categoryTitle: "Deep Work",
    mode: "countup",
    isRunning: true,
    startedAt: "2026-10-06T12:00:00.000Z",
    accumulatedSeconds: 30,
    countdownTargetSeconds: null,
    updatedAt: "2026-10-06T12:01:00.000Z",
  });

  const countdown = buildFocusWidgetSnapshot({ [category.id]: session({
    mode: "countdown",
    countdownTargetSeconds: 300,
  }) }, [category]);
  assert.equal(countdown?.mode, "countdown");
  assert.equal(countdown?.countdownTargetSeconds, 300);
  assert.equal(countdown?.startedAt, "2026-10-06T12:00:00.000Z");

  const paused = buildFocusWidgetSnapshot({ [category.id]: session({
    accumulatedSeconds: 90,
    isRunning: false,
    startTime: null,
    updatedAt: "2026-10-06T12:02:00.000Z",
  }) }, [category]);
  assert.equal(paused?.isRunning, false);
  assert.equal(paused?.startedAt, null);
  assert.equal(paused?.accumulatedSeconds, 90);
});

test("no active or incomplete session produces the idle/cleared snapshot", () => {
  assert.equal(buildFocusWidgetSnapshot({}, [category]), null);
  assert.equal(buildFocusWidgetSnapshot({ [category.id]: session({ sessionId: undefined }) }, [category]), null);
  assert.equal(focusWidgetSnapshotSignature(null), "idle");
});

test("React widget synchronization is native-only and state-change driven, not a second ticker", () => {
  const taskApp = read("src/components/task-app.tsx");
  const nativeBridge = read("src/lib/focus-widget-native.ts");
  assert.match(nativeBridge, /Capacitor\.getPlatform\(\) === "ios"/);
  assert.match(taskApp, /buildFocusWidgetSnapshot\(activeSessions, focusCategories\)/);
  assert.match(taskApp, /syncFocusWidgetSnapshot\(snapshot\)/);
  assert.match(taskApp, /\[activeSessions, focusCategories, isNativeIosPlatform\]/);
  assert.doesNotMatch(taskApp, /focusWidget.*setInterval|setInterval.*focusWidget/i);
});

test("native bridge clears the shared snapshot and preserves existing native integrations", () => {
  const plugin = read("ios/App/App/ADHDiceFocusWidgetPlugin.swift");
  const sceneDelegate = read("ios/App/App/SceneDelegate.swift");
  const mainEntitlements = read("ios/App/App/App.entitlements");
  const widgetEntitlements = read("ios/App/ADHDiceWidgetsExtension.entitlements");
  const appInfo = read("ios/App/App/Info.plist");
  assert.match(plugin, /UserDefaults\(suiteName: Self\.appGroup\)/);
  assert.match(plugin, /removeObject\(forKey: Self\.storageKey\)/);
  assert.match(plugin, /reloadTimelines\(ofKind: Self\.widgetKind\)/);
  assert.match(sceneDelegate, /registerPluginInstance\(ADHDiceHealthKitPlugin\(\)\)/);
  assert.match(sceneDelegate, /registerPluginInstance\(ADHDiceFocusWidgetPlugin\(\)\)/);
  assert.match(mainEntitlements, /group\.com\.andrewschaffer\.adhdice/);
  assert.match(widgetEntitlements, /group\.com\.andrewschaffer\.adhdice/);
  assert.match(mainEntitlements, /com\.apple\.developer\.healthkit/);
  assert.match(appInfo, /NSMicrophoneUsageDescription/);
});

test("URL scheme and WidgetKit target contracts remain exact", () => {
  const appInfo = read("ios/App/App/Info.plist");
  const project = read("ios/App/App.xcodeproj/project.pbxproj");
  const widget = read("ios/App/ADHDiceWidgets/ADHDiceWidgets.swift");
  assert.match(appInfo, /<string>adhdice<\/string>/);
  assert.match(project, /name = ADHDiceWidgetsExtension;/);
  assert.match(project, /productName = ADHDiceWidgetsExtension;/);
  assert.match(project, /PRODUCT_BUNDLE_IDENTIFIER = com\.andrewschaffer\.adhdice\.ADHDiceWidgets;/);
  assert.match(widget, /\.supportedFamilies\(\[\.accessoryCircular\]\)/);
  assert.match(widget, /adhdice:\/\/focus/);
  assert.match(widget, /Text\(timerInterval:/);
  assert.doesNotMatch(widget, /ActivityKit|Dynamic Island/);
});

test("browser source remains independent of WidgetKit", () => {
  const browserContract = read("src/lib/focus-widget.ts");
  const browserBridge = read("src/lib/focus-widget-native.ts");
  assert.doesNotMatch(browserContract, /WidgetKit|SwiftUI/);
  assert.doesNotMatch(browserBridge, /WidgetKit|SwiftUI/);
  assert.match(browserBridge, /isNativeIosFocusWidgetAvailable/);
});
