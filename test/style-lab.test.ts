import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getStyleLabRole,
  isStyleLabPropertyAllowed,
  isStyleLabValueAllowed,
} from "@/components/style-lab/style-lab-registry";
import {
  buildStyleLabCss,
  canUseStyleLab,
  getStyleLabDesignSpec,
  isStyleLabExplicitlyEnabled,
  normalizeStyleLabOverrides,
  readStyleLabOverrides,
  resetStyleLabRole,
  setStyleLabOverride,
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

  assert.match(layoutSource, /<StyleLabDevRoot \/>/);
  assert.match(rootSource, /if \(process\.env\.NODE_ENV !== "development"\) return;/);
  assert.match(rootSource, /if \(!enabled \|\| !inspectionActive\) return;/);
  assert.match(rootSource, /document\.addEventListener\("click", handleClick, true\)/);
  assert.match(panelSource, /data-style-role="ui\.panel\.surface"/);
});
