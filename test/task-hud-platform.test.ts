import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");

test("HUD selects the historical website header outside native iOS", () => {
  assert.match(appSource, /import \{ Capacitor \} from "@capacitor\/core"/);
  assert.match(appSource, /Capacitor\.getPlatform\(\) === "ios"/);
  assert.match(appSource, /if \(!isNativeIosPlatform\) \{[\s\S]*?<WebsiteHudHeader/);
  assert.match(appSource, /function WebsiteHudHeader\([\s\S]*?<ThemeToggle/);
  assert.match(appSource, /<ProgressStat[\s\S]*?label=\{`Lvl \$\{economy\.level\}`\}/);
  assert.match(appSource, /<MiniStat label="Points" value=\{String\(economy\.points\)\}/);
  assert.match(appSource, /<MiniStat label="Tokens" value=\{String\(economy\.tokens\)\}/);
});

test("native iOS keeps the shared command-center HUD renderer", () => {
  const commandCenterSource = appSource.slice(appSource.indexOf("function CommandCenterHeader("));
  assert.match(commandCenterSource, /isNativeIosPlatform: boolean/);
  assert.match(commandCenterSource, /<HudCommandCenter[\s\S]*?setHudUiState=\{setHudUiState\}/);
  assert.match(commandCenterSource, /onPauseTaskTimer/);
  assert.match(commandCenterSource, /onStopTaskTimer/);
  assert.match(commandCenterSource, /notificationInboxItems/);
});
