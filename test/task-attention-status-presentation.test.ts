import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const statusUiSource = readFileSync("src/components/task-app/task-status-ui.tsx", "utf8");
const tableSource = readFileSync("src/components/ui/task-management-table-v2.tsx", "utf8");
const listSource = readFileSync("src/components/task-app/tasks-list-adapter.tsx", "utf8");
const globalStyleSource = readFileSync("src/app/globals.css", "utf8");

test("Attention decorates only the primary current-status presentation", () => {
  assert.match(statusUiSource, /options: \{ attention\?: boolean; className\?: string; emphasizeMissed\?: boolean; glyphClassName\?: string; inverted\?: boolean \}/);
  assert.match(statusUiSource, /data-task-attention-status=\{options\.attention \? "true" : undefined\}/);
  assert.match(tableSource, /renderTableCurrentStatusCircle\(task\.status, Boolean\(task\.attentionReason\)\)/);
  assert.match(tableSource, /renderTableCurrentStatusCircle\(item\.status, Boolean\(attentionReasonByTaskId\[item\.id\]\)\)/);
  assert.match(listSource, /currentStatus=\{displayStatus\}\s+attention=\{Boolean\(taskRow\.attentionReason\)\}/);
  assert.match(statusUiSource, /attention: attention && currentStatus === option\.value/);
  assert.match(statusUiSource, /emphasizeMissed: emphasizeMissed && currentStatus === option\.value/);
  assert.match(statusUiSource, /inverted: currentStatus === option\.value && !attention/);
  assert.doesNotMatch(tableSource, /TaskStatusCircleRail[\s\S]{0,700}attention=/);
});

test("Attention preserves canonical status color and includes one decorative Bell overlay", () => {
  assert.match(statusUiSource, /getTaskStatusCircleClassName\(status, \{ inverted: options\.inverted \}\)/);
  assert.match(statusUiSource, /task-status-circle-attention__status[\s\S]*renderTaskStatusGlyph\(status, size/);
  assert.match(statusUiSource, /task-status-circle-attention__bell[\s\S]*<Bell[^>]*aria-hidden="true"[^>]*fill="currentColor"/);
  assert.match(statusUiSource, /hasStatusEmphasis \? "task-status-circle-emphasis relative"/);
  assert.match(statusUiSource, /options\.attention \? "task-status-circle-attention"/);
  assert.doesNotMatch(statusUiSource, /task-status-circle-attention[\s\S]{0,800}(yellow|warning)/);
});

test("The Attention Bell overlay is decorative and cannot change status-control semantics", () => {
  assert.match(statusUiSource, /<span aria-hidden="true" className="task-status-circle-attention__glyph task-status-circle-attention__bell/);
  assert.match(globalStyleSource, /\.task-status-circle-attention__glyph[\s\S]*pointer-events: none;/);
  assert.match(statusUiSource, /event\.stopPropagation\(\);[\s\S]*onSetStatus\(option\.value, event\)/);
  const bellOverlaySource = statusUiSource.slice(
    statusUiSource.indexOf("task-status-circle-attention__bell"),
    statusUiSource.indexOf("</span>", statusUiSource.indexOf("task-status-circle-attention__bell")),
  );
  assert.doesNotMatch(bellOverlaySource, /onClick/);
});

test("Attention animation has a slow repeating cycle and static reduced-motion fallbacks", () => {
  assert.match(globalStyleSource, /animation: task-status-attention-glow 6s ease-in-out infinite;/);
  assert.match(globalStyleSource, /animation: task-status-attention-status-glyph 6s ease-in-out infinite;/);
  assert.match(globalStyleSource, /animation: task-status-attention-bell-glyph 6s ease-in-out infinite;/);
  assert.doesNotMatch(globalStyleSource, /task-status-attention-(?:glow|status-glyph|bell-glyph) 5s/);
  assert.match(globalStyleSource, /@keyframes task-status-attention-glow/);
  assert.match(globalStyleSource, /@keyframes task-status-attention-status-glyph/);
  assert.match(globalStyleSource, /@keyframes task-status-attention-bell-glyph/);
  assert.match(globalStyleSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.task-status-circle-emphasis,[\s\S]*\.task-status-circle-attention \{[\s\S]*animation: none;[\s\S]*box-shadow: 0 0 0 2px color-mix\(in srgb, var\(--task-status-circle-glow-color, currentColor\)/);
  assert.match(globalStyleSource, /\.task-status-circle-attention__status \{[\s\S]*opacity: 1;/);
  assert.match(globalStyleSource, /\.task-status-circle-attention__bell \{[\s\S]*opacity: 0;/);
});

test("Low Stimulation mode resolves the Attention circle to one static status glyph", () => {
  assert.match(globalStyleSource, /\[data-lowstim\] \.task-status-circle-emphasis,[\s\S]*\[data-lowstim\] \.task-status-circle-attention \{[\s\S]*animation: none !important;[\s\S]*box-shadow: 0 0 0 2px color-mix\(in srgb, var\(--task-status-circle-glow-color, currentColor\)/);
  assert.match(globalStyleSource, /\[data-lowstim\] \.task-status-circle-attention__status \{[\s\S]*opacity: 1 !important;/);
  assert.match(globalStyleSource, /\[data-lowstim\] \.task-status-circle-attention__bell \{[\s\S]*opacity: 0 !important;/);
});

test("Missed current status gets one red presentation glow and keeps its X glyph", () => {
  assert.match(statusUiSource, /const hasMissedEmphasis = options\.emphasizeMissed && status === "missed"/);
  assert.match(statusUiSource, /data-task-status-emphasis=\{hasMissedEmphasis \? "missed" : options\.attention \? "attention" : undefined\}/);
  assert.match(statusUiSource, /hasStatusEmphasis \? "task-status-circle-emphasis relative"/);
  assert.match(statusUiSource, /if \(status === "missed"\)[\s\S]*return <X /);
  assert.match(tableSource, /emphasizeMissed: status === "missed"/);
  assert.match(listSource, /currentStatus=\{displayStatus\}[\s\S]*attention=\{Boolean\(taskRow\.attentionReason\)\}[\s\S]*emphasizeMissed/);
  assert.match(globalStyleSource, /data-task-status-emphasis="missed"[\s\S]*--task-status-circle-glow-color: #d94e67/);
});

test("Missed plus Attention shares one glow container and preserves the Attention glyph contract", () => {
  assert.match(statusUiSource, /const hasStatusEmphasis = Boolean\(options\.attention \|\| hasMissedEmphasis\)/);
  assert.match(statusUiSource, /\{options\.attention \? \([\s\S]*task-status-circle-attention__status[\s\S]*task-status-circle-attention__bell/);
  assert.doesNotMatch(statusUiSource, /hasMissedEmphasis[\s\S]{0,500}task-status-circle-emphasis[\s\S]{0,500}task-status-circle-emphasis/);
});

test("Missed status choices stay static unless the selected current indicator is being rendered", () => {
  assert.match(statusUiSource, /emphasizeMissed: emphasizeMissed && currentStatus === option\.value/);
  assert.match(statusUiSource, /attention: attention && currentStatus === option\.value/);
  assert.match(tableSource, /renderTaskStatusCircle\(status, "sm", \{ inverted: selectedTaskId === task\.id && task\.status === status \}\)/);
});

test("Table and List consume the existing final Attention reason without re-evaluating membership", () => {
  assert.match(tableSource, /Boolean\(task\.attentionReason\)/);
  assert.match(tableSource, /Boolean\(attentionReasonByTaskId\[item\.id\]\)/);
  assert.match(listSource, /attentionReason: rowContext\.taskAttentionReasonByTaskId\[task\.id\]/);
  assert.match(listSource, /Boolean\(taskRow\.attentionReason\)/);
  assert.doesNotMatch(tableSource, /buildTaskAttentionProjection|evaluateTaskListMemberships|resolve.*Attention/);
  assert.doesNotMatch(listSource, /buildTaskAttentionProjection|evaluateTaskListMemberships|resolve.*Attention/);
});
