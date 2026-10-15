import assert from "node:assert/strict";
import test from "node:test";
import { clampNavigationBubblePosition } from "@/lib/navigation-dock-layout";

test("navigation bubble coordinates stay inside the owning panel bounds", () => {
  assert.deepEqual(clampNavigationBubblePosition(900, 800, 360, 640), { x: 296, y: 576 });
  assert.deepEqual(clampNavigationBubblePosition(-40, -30, 360, 640), { x: 12, y: 12 });
});

test("navigation bubble clamp uses panel dimensions rather than viewport dimensions", () => {
  const leftPanel = clampNavigationBubblePosition(400, 300, 420, 700);
  const rightPanel = clampNavigationBubblePosition(400, 300, 420, 700);

  assert.deepEqual(leftPanel, { x: 356, y: 300 });
  assert.deepEqual(rightPanel, { x: 356, y: 300 });
  assert.ok(leftPanel.x + 64 <= 420);
  assert.ok(leftPanel.y + 64 <= 700);
});
