import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const headerSource = readFileSync(new URL("../src/components/task-app/tasks-page.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");

test("Trash list exposes a confirmed Empty Trash action through the tombstone delete seam", () => {
  assert.match(headerSource, /selectedBucket === "trash" && trashCount > 0/);
  assert.match(headerSource, /Empty Trash/);
  assert.match(headerSource, /onClick=\{onEmptyTrash\}/);
  assert.match(appSource, /Permanently delete \$\{trashTasks\.length\} \$\{taskLabel\} from Trash\?/);
  assert.match(appSource, /markTaskRowsPermanentlyDeleted\(client, taskIds\)/);
  assert.match(appSource, /No Trash tasks were deleted because they changed before the action completed/);
  assert.match(appSource, /onEmptyTrash: \(\) => \{ void emptyTrash\(\); \}/);
});
