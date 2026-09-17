import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getStyleLabRole,
  getStyleLabTargetPart,
  isStyleLabPropertyAllowed,
  isStyleLabValueAllowed,
  normalizeStyleLabTargetPart,
} from "@/components/style-lab/style-lab-registry";
import {
  buildStyleLabCss,
  canUseStyleLab,
  getStyleLabDesignSpec,
  isStyleLabExplicitlyEnabled,
  getStyleLabPropertyTargetSelector,
  normalizeStyleLabPanelPosition,
  normalizeStyleLabOverrides,
  readStyleLabPanelPosition,
  readStyleLabOverrides,
  resetStyleLabRole,
  setStyleLabOverride,
  STYLE_LAB_PANEL_POSITION_STORAGE_KEY,
  writeStyleLabPanelPosition,
  writeStyleLabOverrides,
  type StyleLabStorage,
} from "@/components/style-lab/style-lab-runtime";

class MemoryStorage implements StyleLabStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("registry exposes constrained capabilities for representative roles", () => {
  const panelTitle = getStyleLabRole("ui.panel.title");
  const panelSurface = getStyleLabRole("ui.panel.surface");

  assert.ok(panelTitle);
  assert.ok(panelSurface);
  assert.equal(panelTitle.component, "AdhdPanel");
  assert.ok(panelTitle.capabilities.includes("fontSize"));
  assert.ok(panelTitle.capabilities.includes("textColor"));
  assert.ok(!panelTitle.capabilities.includes("paddingX"));
  assert.ok(panelSurface.capabilities.includes("paddingX"));
  assert.ok(isStyleLabPropertyAllowed("ui.panel.title", "lineHeight"));
  assert.ok(!isStyleLabPropertyAllowed("ui.panel.title", "gap"));
  assert.ok(isStyleLabValueAllowed("textColor", "Secondary"));
  assert.ok(!isStyleLabValueAllowed("textColor", "#ff00ff"));

  const sectionTitle = getStyleLabRole("ui.section.title");
  assert.ok(sectionTitle);
  assert.equal(sectionTitle.component, "Shared section typography");
  assert.equal(getStyleLabTargetPart("ui.chip", "typography"), "label");
  assert.equal(getStyleLabTargetPart("ui.chip", "sizing"), "self");
  assert.equal(normalizeStyleLabTargetPart("unrestricted-descendant"), "self");
});

test("override updates accept only registered role properties and values", () => {
  const initial = {};
  const withFontSize = setStyleLabOverride(initial, "ui.panel.title", "fontSize", "13px");
  const withRejectedProperty = setStyleLabOverride(withFontSize, "ui.panel.title", "margin", "1rem");
  const withRejectedValue = setStyleLabOverride(withRejectedProperty, "ui.panel.title", "fontSize", "37px");

  assert.deepEqual(withFontSize, { "ui.panel.title": { fontSize: "13px" } });
  assert.deepEqual(withRejectedProperty, withFontSize);
  assert.deepEqual(withRejectedValue, withFontSize);
});

test("persistence normalization drops unknown roles, properties, and values", () => {
  const storage = new MemoryStorage();
  storage.setItem("adhdice-style-lab:overrides", JSON.stringify({
    "ui.panel.title": { fontSize: "14px", margin: "2rem", textColor: "#123456" },
    "ui.not-registered": { fontSize: "13px" },
  }));

  assert.deepEqual(readStyleLabOverrides(storage), { "ui.panel.title": { fontSize: "14px" } });
  assert.deepEqual(normalizeStyleLabOverrides(null), {});
  assert.deepEqual(writeStyleLabOverrides(storage, { "ui.panel.title": { fontWeight: "600" } }), {
    "ui.panel.title": { fontWeight: "600" },
  });
});

test("reset role and reset all persistence clear only Style Lab drafts", () => {
  const storage = new MemoryStorage();
  const overrides = {
    "ui.panel.title": { fontSize: "13px" },
    "ui.card.surface": { paddingX: "1rem" },
  } as const;
  const resetRole = resetStyleLabRole(overrides, "ui.panel.title");

  assert.deepEqual(resetRole, { "ui.card.surface": { paddingX: "1rem" } });
  writeStyleLabOverrides(storage, resetRole);
  assert.deepEqual(readStyleLabOverrides(storage), resetRole);
  writeStyleLabOverrides(storage, {});
  assert.equal(storage.getItem("adhdice-style-lab:overrides"), null);
});

test("runtime CSS targets the semantic role and design specs include only overrides", () => {
  const overrides = {
    "ui.panel.title": { fontSize: "13px", fontWeight: "600", textColor: "Secondary", lineHeight: "1.4" },
  } as const;
  const css = buildStyleLabCss(overrides);
  const spec = getStyleLabDesignSpec("ui.panel.title", overrides);

  assert.match(css, /data-style-role="ui\.panel\.title"/);
  assert.match(css, /font-size: 13px !important/);
  assert.match(css, /color: var\(--text-secondary\) !important/);
  assert.doesNotMatch(css, /margin|border-radius|box-shadow/);
  assert.match(spec, /Role: ui\.panel\.title/);
  assert.match(spec, /Component: AdhdPanel/);
  assert.match(spec, /- Font size: 13px/);
  assert.match(spec, /- Text color: Secondary/);
  assert.doesNotMatch(spec, /Padding|Margin|Letter spacing/);
  assert.match(spec, /No source files were modified\./);
});

test("role property targeting routes Chip typography to its explicit label part", () => {
  const overrides = {
    "ui.chip": { fontSize: "18px", fontWeight: "700", textColor: "Accent", lineHeight: "1.4", letterSpacing: "0.02em", textAlign: "center" },
    "ui.icon-button": { width: "8rem" },
  } as const;
  const css = buildStyleLabCss(overrides);

  assert.equal(getStyleLabPropertyTargetSelector("ui.chip", "fontSize"), '[data-style-role="ui.chip"]:not([data-style-lab-ui] [data-style-role]) [data-style-part="label"]');
  assert.match(css, /data-style-role="ui\.chip"[^\{]*data-style-part="label"/);
  assert.match(css, /font-size: 18px !important/);
  assert.match(css, /font-weight: 700 !important/);
  assert.match(css, /color: var\(--accent\) !important/);
  assert.match(css, /text-align: center !important/);
  assert.match(css, /data-style-role="ui\.icon-button"[^\{]*\{/);
  assert.doesNotMatch(css, /data-style-role="ui\.icon-button"[^\{]*data-style-part/);
});

test("Chip render paths expose one explicit visible label target", () => {
  const chipSource = readFileSync(new URL("../src/components/ui-system/adhd-chip.tsx", import.meta.url), "utf8");
  const primitiveSource = readFileSync(new URL("../src/components/ui/task-table-primitives.tsx", import.meta.url), "utf8");

  assert.match(chipSource, /data-style-part="label"/);
  assert.match(chipSource, /stylePart="label"/);
  assert.match(primitiveSource, /data-style-part=\{stylePart\}/);
});

test("Style Lab panel positions clamp, normalize invalid values, and use their own storage key", () => {
  const storage = new MemoryStorage();
  assert.deepEqual(normalizeStyleLabPanelPosition({ left: 2000, top: -50 }, 1200, 800, 400, 300), { left: 784, top: 16 });
  assert.deepEqual(normalizeStyleLabPanelPosition({ left: "bad", top: null }, 1200, 800, 400, 300), { left: 784, top: 16 });
  assert.deepEqual(normalizeStyleLabPanelPosition({ left: 2000, top: 700 }, 500, 300, 600, 400), { left: 16, top: 16 });
  assert.deepEqual(writeStyleLabPanelPosition(storage, { left: 120, top: 240 }), { left: 120, top: 240 });
  assert.equal(storage.getItem(STYLE_LAB_PANEL_POSITION_STORAGE_KEY), JSON.stringify({ left: 120, top: 240 }));
  assert.deepEqual(readStyleLabPanelPosition(storage), { left: 120, top: 240 });
  assert.equal(writeStyleLabPanelPosition(storage, { left: Number.NaN, top: 2 }), null);
});

test("Style Lab requires development mode and explicit browser enablement", () => {
  assert.equal(canUseStyleLab("development", true), true);
  assert.equal(canUseStyleLab("development", false), false);
  assert.equal(canUseStyleLab("production", true), false);
  assert.equal(isStyleLabExplicitlyEnabled({ __ADHDICE_STYLE_LAB_ENABLED__: true }), true);
  assert.equal(isStyleLabExplicitlyEnabled({ localStorage: new MemoryStorage() }), false);
});

test("production mounting is global while inspection listeners stay behind both gates", () => {
  const layoutSource = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  const rootSource = readFileSync(new URL("../src/components/style-lab/style-lab-dev-root.tsx", import.meta.url), "utf8");
  const panelSource = readFileSync(new URL("../src/components/ui-system/adhd-panel.tsx", import.meta.url), "utf8");
  const activitySource = readFileSync(new URL("../src/components/activity-line-chart-card.tsx", import.meta.url), "utf8");

  assert.match(layoutSource, /<StyleLabDevRoot \/>/);
  assert.match(rootSource, /if \(process\.env\.NODE_ENV !== "development"\) return;/);
  assert.match(rootSource, /if \(!enabled \|\| !inspectionActive\) return;/);
  assert.match(rootSource, /document\.addEventListener\("click", handleClick, true\)/);
  assert.match(panelSource, /data-style-role="ui\.panel\.surface"/);
  assert.match(activitySource, /data-style-role="ui\.section\.title"/);
  assert.match(activitySource, /data-style-role="ui\.section\.subtitle"/);
});
