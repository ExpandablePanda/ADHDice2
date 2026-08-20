import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");

test("web keeps the pre-b83134a CommandCenterHeader presentation", () => {
  assert.match(appSource, /import \{ Capacitor \} from "@capacitor\/core"/);
  assert.match(appSource, /Capacitor\.getPlatform\(\) === "ios"/);
  assert.match(appSource, /const hudDateTime = isNativeIosPlatform \? null : formatHudDateTime\(hudNow\);/);
  assert.match(appSource, /<header className=\{isNativeIosPlatform \? "pl-2 pr-0" : "px-3"\}>/);
  assert.match(appSource, /"mx-auto flex w-max items-center gap-2 rounded-\[1\.15rem\] bg-\[var\(--hud-surface\)\] px-2 py-1"/);
  assert.match(appSource, /"shrink-0 flex min-h-11 items-center gap-2 rounded-full bg-\[var\(--hud-surface\)\] px-2\.5 py-1\.5/);
  assert.match(appSource, /"flex min-h-12 items-center gap-1 rounded-full bg-\[var\(--hud-surface\)\] px-2 py-1\.5/);
  assert.match(appSource, /hudDateTime \? <span className="mt-1 block text-left/);
});

test("native iOS keeps the current CommandCenterHeader presentation", () => {
  const commandCenterSource = appSource.slice(appSource.indexOf("function CommandCenterHeader("));
  assert.match(commandCenterSource, /isNativeIosPlatform: boolean/);
  assert.match(commandCenterSource, /"pl-2 pr-0"/);
  assert.match(commandCenterSource, /grid w-max shrink-0 grid-flow-col grid-rows-\[min-content_min-content\]/);
  assert.match(commandCenterSource, /row-span-2 flex min-h-11 shrink-0 flex-col items-center/);
  assert.match(commandCenterSource, /flex min-h-12 flex-col items-center justify-center gap-0/);
  assert.match(commandCenterSource, /<HudCommandCenter[\s\S]*?setHudUiState=\{setHudUiState\}/);
  assert.match(commandCenterSource, /onPauseTaskTimer/);
  assert.match(commandCenterSource, /onStopTaskTimer/);
  assert.match(commandCenterSource, /notificationInboxItems/);
  assert.match(appSource, /<HudLoadingShell isNativeIosPlatform=\{isNativeIosPlatform\} \/>/);
});

test("the obsolete WebsiteHudHeader is no longer a render path", () => {
  assert.doesNotMatch(appSource, /WebsiteHudHeader/);
  assert.doesNotMatch(appSource, /website=/);
  assert.doesNotMatch(appSource, /ThemeToggle/);
});
