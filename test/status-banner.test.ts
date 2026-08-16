import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const batchHookSource = readFileSync(new URL("../src/hooks/useTaskBatchEditAction.ts", import.meta.url), "utf8");
const modalSource = readFileSync(new URL("../src/components/modal-shell.tsx", import.meta.url), "utf8");
const bannerSource = appSource.slice(appSource.indexOf("function StatusBanner("), appSource.indexOf("function TopHeader("));

test("StatusBanner portals to document.body on a dedicated layer above ModalShell", () => {
  assert.match(appSource, /import \{ createPortal \} from "react-dom"/);
  assert.match(bannerSource, /typeof document === "undefined"/);
  assert.match(bannerSource, /createPortal\([\s\S]*document\.body/);
  assert.match(bannerSource, /z-\[160\]/);
  assert.match(modalSource, /z-\[140\]/);
  assert.doesNotMatch(bannerSource, /z-\[140\]/);
});

test("StatusBanner preserves live-region roles, safe-area position, and dismiss action", () => {
  assert.match(bannerSource, /aria-live=\{message\.tone === "warn" \? "assertive" : "polite"\}/);
  assert.match(bannerSource, /role=\{message\.tone === "warn" \? "alert" : "status"\}/);
  assert.match(bannerSource, /env\(safe-area-inset-top\)/);
  assert.match(bannerSource, /onClick=\{\(\) => setIsDismissed\(true\)\}/);
  assert.match(bannerSource, />\s*Dismiss\s*</);
});

test("ordinary good-message timeout stays separate from Batch Edit progress", () => {
  assert.match(appSource, /if \(!message \|\| message\.tone !== "good"\)/);
  assert.match(appSource, /}, 3000\);/);
  assert.match(appSource, /batchEditProgress \? <BatchEditProgressBanner/);
  assert.match(batchHookSource, /setBatchEditProgress\(progress\)/);
  assert.doesNotMatch(batchHookSource, /setMessage\(\{ tone: "good"/);
});
