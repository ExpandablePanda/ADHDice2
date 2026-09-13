import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Attention settings expose locked eligibility and the normal editable rule editor", () => {
  const source = readFileSync("src/components/task-app/task-list-settings-modal.tsx", "utf8");
  const capabilitySource = readFileSync("src/lib/task-lists.ts", "utf8");
  assert.match(source, /getTaskListCapabilities/);
  assert.match(source, /resolveEffectiveTaskListRules/);
  assert.match(source, /capabilities\.canEditRules/);
  assert.match(source, /capabilities\.lockedEligibility/);
  assert.match(capabilitySource, /Does not track missed streaks/);
  assert.match(capabilitySource, /Tasks that track missed streaks use their missed-streak indicator instead\./);
  assert.doesNotMatch(source, /list\.membershipMode !== "system"/);
});
