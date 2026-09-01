import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HEALTH_TABS, type HealthTab } from "../src/lib/health-utils.ts";
import { persistHealthTabPreference, readHealthTabPreference } from "../src/lib/health-tab-preference.ts";

const pageSource = readFileSync(new URL("../src/components/task-app/health-page.tsx", import.meta.url), "utf8");
const healthTabPreferenceSource = readFileSync(new URL("../src/lib/health-tab-preference.ts", import.meta.url), "utf8");

test("Health Settings is the final tab and preserves the prior order", () => {
  const settingsTab: HealthTab = "Settings";
  assert.equal(settingsTab, "Settings");
  assert.deepEqual(HEALTH_TABS, ["Today", "Food", "Water", "Fitness", "Journal", "Weight", "Sleep", "Insights", "Awards", "Settings"]);
});

test("Health Settings renders one accessible tabpanel through the existing conditional path", () => {
  assert.match(pageSource, /\{activeTab === "Settings" \? \(\s*<div aria-labelledby="health-tab-settings" className="mt-6" id=\{getHealthTabPanelId\("Settings"\)\} role="tabpanel">[\s\S]*?<\/div>\s*\) : null\}/);
  assert.equal((pageSource.match(/subtitle="Health settings"/g) ?? []).length, 1);
  assert.equal((pageSource.match(/id=\{getHealthTabPanelId\("Settings"\)\}/g) ?? []).length, 1);

  for (const tab of ["Today", "Food", "Water", "Fitness", "Journal", "Weight", "Sleep", "Insights", "Awards"]) {
    const tabStart = pageSource.indexOf(`activeTab === "${tab}"`);
    const nextTabStart = pageSource.indexOf("activeTab ===", tabStart + 1);
    const tabSource = pageSource.slice(tabStart, nextTabStart === -1 ? pageSource.length : nextTabStart);
    assert.doesNotMatch(tabSource, /subtitle="Health settings"/);
  }
});

test("Health Settings keeps every existing field and the profile save authority", () => {
  const settingsStart = pageSource.indexOf('activeTab === "Settings"');
  const settingsSource = pageSource.slice(settingsStart, pageSource.indexOf("\n      ) : null}", settingsStart) + "\n      ) : null}".length);

  for (const label of ["Weight unit", "Calorie goal", "Protein goal (g)", "Carbs goal (g)", "Fat goal (g)", "Move goal (kcal)", "Move goal (min)", "Sleep goal"]) {
    assert.ok(settingsSource.includes(`label="${label}`), `missing existing Health Settings field: ${label}`);
  }
  assert.match(settingsSource, /label=\{`Target weight \(\$\{profileDraft\.preferred_weight_unit/);
  assert.match(settingsSource, /handleWeightUnitChange/);
  assert.match(settingsSource, /handleSleepGoalHoursChange/);
  assert.match(settingsSource, /handleSleepGoalMinutesChange/);
  assert.match(settingsSource, /onClick=\{\(\) => \{ void handleSaveProfile\(\); \}\}/);
  assert.match(pageSource, /const \[profileDraft, setProfileDraft\] = useState<HealthProfileUpdate>\(\{\}\)/);
  assert.equal((pageSource.match(/const \[profileDraft, setProfileDraft\]/g) ?? []).length, 1);
  assert.match(pageSource, /async function handleSaveProfile\(\)[\s\S]*?await saveProfile\(\{[\s\S]*?calorie_goal: parseNullableInteger\(profileDraft\.calorie_goal\)[\s\S]*?sleep_goal_minutes: parseNullableInteger\(profileDraft\.sleep_goal_minutes\)[\s\S]*?target_weight_kg:/);
  assert.doesNotMatch(settingsSource, /localStorage|adhdice_health_/);
});

test("Settings round-trips through the existing Health tab preference", () => {
  const stored = new Map<string, string>();
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener: () => undefined,
      localStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
      },
      removeEventListener: () => undefined,
    },
  });

  try {
    persistHealthTabPreference("Settings");
    assert.equal(readHealthTabPreference(), "Settings");
    assert.match(healthTabPreferenceSource, /return HEALTH_TABS\.includes\(stored as HealthTab\) \? stored as HealthTab : "Today"/);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});
