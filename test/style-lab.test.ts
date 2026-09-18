import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getStyleLabBackgroundColorCssValue,
  getStyleLabRole,
  getStyleLabTargetPart,
  isStyleLabIconName,
  isStyleLabPropertyAllowed,
  isStyleLabValueAllowed,
  normalizeStyleLabTargetPart,
  STYLE_LAB_BACKGROUND_COLORS,
  STYLE_LAB_ICON_OPTIONS,
} from "@/components/style-lab/style-lab-registry";
import {
  buildStyleLabCss,
  canUseStyleLab,
  clearStyleLabInstanceOverride,
  clearStyleLabPreviewIcon,
  getStyleLabDesignSpec,
  getStyleLabAvailablePanelHeight,
  getStyleLabIconTarget,
  getStyleLabPreviewTextTarget,
  isStyleLabPreviewTextEligible,
  isStyleLabExplicitlyEnabled,
  getStyleLabPropertyTargetSelector,
  normalizeStyleLabPanelPosition,
  normalizeStyleLabOverrides,
  readStyleLabPanelPosition,
  readStyleLabOverrides,
  resetStyleLabInstance,
  resetStyleLabInstances,
  resetStyleLabRole,
  restoreStyleLabPreviewText,
  setStyleLabOverride,
  setStyleLabInstanceOverride,
  setStyleLabPreviewIcon,
  setStyleLabPreviewText,
  setStyleLabPreviewTextOnElement,
  STYLE_LAB_INSTANCE_ATTRIBUTE,
  STYLE_LAB_PANEL_POSITION_STORAGE_KEY,
  writeStyleLabPanelPosition,
  writeStyleLabEnablement,
  writeStyleLabOverrides,
  type StyleLabInstanceOverrides,
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
  assert.ok(panelSurface.capabilities.includes("backgroundColor"));
  assert.deepEqual(STYLE_LAB_BACKGROUND_COLORS, ["Surface", "Subtle", "Accent", "Success", "Warning", "Danger", "Transparent"]);
  assert.equal(getStyleLabBackgroundColorCssValue("Danger"), "var(--danger-soft)");
  assert.equal(getStyleLabBackgroundColorCssValue("Transparent"), "transparent");
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

  for (const roleId of ["tasks.rail.surface", "tasks.rail.chip", "tasks.filter.surface", "tasks.filter.chip", "hud.workspace.surface", "hud.widget.surface"]) {
    assert.ok(getStyleLabRole(roleId));
  }
  assert.ok(isStyleLabPropertyAllowed("tasks.filter.chip", "backgroundColor"));
  assert.ok(isStyleLabPropertyAllowed("hud.widget.surface", "backgroundColor"));
  assert.ok(!isStyleLabPropertyAllowed("hud.widget.label", "backgroundColor"));
  assert.ok(isStyleLabValueAllowed("backgroundColor", "Accent"));
  assert.ok(!isStyleLabValueAllowed("backgroundColor", "#ff00ff"));
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

test("background overrides use semantic tokens and remain separate by scope", () => {
  const instanceId = "style-lab-background-instance";
  const css = buildStyleLabCss(
    { "ui.card.surface": { backgroundColor: "Danger" } },
    {
      [instanceId]: {
        originalText: "Card",
        overrides: { backgroundColor: "Accent" },
        previewText: "",
        previewTextEligible: false,
        roleId: "ui.card.surface",
      },
    },
  );

  assert.match(css, /background-color: var\(--danger-soft\) !important/);
  assert.match(css, /background-color: var\(--accent-soft\) !important/);
  assert.match(css, /data-style-lab-instance="style-lab-background-instance"/);
  assert.equal(getStyleLabPropertyTargetSelector("ui.card.surface", "backgroundColor"), '[data-style-role="ui.card.surface"]:not([data-style-lab-ui] [data-style-role])');
});

test("enablement persistence keeps Style Lab development-only and launcher-controlled", () => {
  const storage = new MemoryStorage();

  assert.equal(writeStyleLabEnablement(storage, true), true);
  assert.equal(storage.getItem("adhdice-style-lab:enabled"), "true");
  assert.equal(isStyleLabExplicitlyEnabled({ localStorage: storage }), true);
  assert.equal(writeStyleLabEnablement(storage, false), false);
  assert.equal(storage.getItem("adhdice-style-lab:enabled"), null);
  assert.equal(isStyleLabExplicitlyEnabled({ localStorage: storage }), false);
  assert.equal(canUseStyleLab("production", true), false);
});

test("instance scope generates temporary selectors without changing role-wide selectors", () => {
  const instanceId = "style-lab-instance-1";
  const instances: StyleLabInstanceOverrides = {
    [instanceId]: {
      originalText: "New Task",
      overrides: { fontSize: "18px" },
      previewText: "",
      previewTextEligible: true,
      roleId: "ui.chip",
    },
  };
  const css = buildStyleLabCss({ "ui.chip": { fontSize: "14px" } }, instances);

  assert.equal(STYLE_LAB_INSTANCE_ATTRIBUTE, "data-style-lab-instance");
  assert.equal(getStyleLabPropertyTargetSelector("ui.chip", "fontSize", instanceId), '[data-style-role="ui.chip"][data-style-lab-instance="style-lab-instance-1"]:not([data-style-lab-ui] [data-style-role]) [data-style-part="label"]');
  assert.match(css, /data-style-role="ui\.chip"[^}]*font-size: 14px/);
  assert.match(css, /data-style-lab-instance="style-lab-instance-1"[^}]*font-size: 18px/);
});

test("instance reset clears only the selected preview while Reset All clears all instance state", () => {
  const initial: StyleLabInstanceOverrides = {
    one: { originalText: "New Task", overrides: { fontSize: "18px" }, previewText: "Add Task", previewTextEligible: true, roleId: "ui.chip" },
    two: { originalText: "Save", overrides: { fontWeight: "700" }, previewText: "", previewTextEligible: true, roleId: "ui.chip" },
  };
  const withClearedProperty = clearStyleLabInstanceOverride(initial, "one", "fontSize");
  const withOverride = setStyleLabInstanceOverride(withClearedProperty, "one", "ui.chip", "fontWeight", "600");
  const withPreview = setStyleLabPreviewText(withOverride, "one", "Add this task");

  assert.deepEqual(resetStyleLabInstance(withPreview, "one"), { two: initial.two });
  assert.deepEqual(resetStyleLabInstances(), {});
});

test("preview text is limited to safe direct text and restores the original content", () => {
  const safeElement = {
    children: [],
    closest: () => null,
    isContentEditable: false,
    querySelector: () => null,
    tagName: "P",
    textContent: "New Task",
  } as unknown as HTMLElement;
  const inputElement = { ...safeElement, tagName: "INPUT" } as unknown as HTMLElement;
  const complexElement = { ...safeElement, children: [{}] } as unknown as HTMLElement;

  assert.equal(isStyleLabPreviewTextEligible(safeElement), true);
  assert.equal(getStyleLabPreviewTextTarget(safeElement), safeElement);
  assert.equal(setStyleLabPreviewTextOnElement(safeElement, "Add Task"), true);
  assert.equal(safeElement.textContent, "Add Task");
  assert.equal(setStyleLabPreviewTextOnElement(inputElement, "Add Task"), false);
  assert.equal(setStyleLabPreviewTextOnElement(complexElement, "Add Task"), false);
  assert.equal(setStyleLabPreviewTextOnElement(safeElement, ""), true);
  assert.equal(safeElement.textContent, "");
  assert.equal(restoreStyleLabPreviewText(safeElement, "New Task"), true);
  assert.equal(safeElement.textContent, "New Task");
});

test("instance design specs identify scope and original text", () => {
  const spec = getStyleLabDesignSpec("ui.chip", {}, {
    instance: {
      originalText: "New Task",
      overrides: { fontSize: "14px", fontWeight: "600" },
      previewText: "Add Task",
      previewTextEligible: true,
      roleId: "ui.chip",
    },
    scope: "instance",
  });
  const unchangedSpec = getStyleLabDesignSpec("ui.chip", {}, {
    instance: {
      originalText: "New Task",
      overrides: {},
      previewText: "New Task",
      previewTextEligible: true,
      roleId: "ui.chip",
    },
    scope: "instance",
  });

  assert.match(spec, /Role: ui\.chip/);
  assert.match(spec, /Component: AdhdChip/);
  assert.match(spec, /Scope: this instance/);
  assert.match(spec, /Original text: New Task/);
  assert.match(spec, /Preview text: Add Task/);
  assert.doesNotMatch(unchangedSpec, /Preview text:/);
  assert.match(spec, /- Font size: 14px/);
  assert.doesNotMatch(spec, /Scope: semantic role/);
});

test("Chip icon previews are curated, instance-scoped, resettable, and exported safely", () => {
  const initial: StyleLabInstanceOverrides = {
    one: {
      iconPreviewEligible: true,
      originalIconName: null,
      originalText: "New Task",
      overrides: {},
      previewText: "",
      previewTextEligible: true,
      roleId: "ui.chip",
    },
  };
  const withPreview = setStyleLabPreviewIcon(initial, "one", "star");
  const cleared = clearStyleLabPreviewIcon(withPreview, "one");
  const spec = getStyleLabDesignSpec("ui.chip", {}, { instance: withPreview.one, scope: "instance" });

  assert.ok(STYLE_LAB_ICON_OPTIONS.length > 10);
  assert.ok(isStyleLabIconName("star"));
  assert.deepEqual(setStyleLabPreviewIcon(initial, "one", "not-a-real-icon"), initial);
  assert.equal(getStyleLabIconTarget(null), null);
  assert.equal(withPreview.one.previewIconName, "star");
  assert.equal(cleared.one.previewIconName, undefined);
  assert.match(spec, /Original icon: unknown/);
  assert.match(spec, /Preview icon: star/);
});

test("Chip preview text supports plain, icon, trailing chevron, count, and icon-text-count cases", () => {
  const textPart = {
    children: [],
    closest: () => null,
    isContentEditable: false,
    tagName: "SPAN",
    textContent: "Columns",
  } as unknown as HTMLElement;
  const iconPart = { kind: "chevron" };
  const countPart = { kind: "count" };
  const compoundChip = {
    children: [textPart, iconPart, countPart],
    closest: () => null,
    isContentEditable: false,
    querySelector: () => null,
    querySelectorAll: (selector: string) => selector === '[data-style-text-part="label"]' ? [textPart] : [],
    tagName: "SPAN",
    textContent: "Columns2",
  } as unknown as HTMLElement;

  assert.equal(isStyleLabPreviewTextEligible(compoundChip), true);
  assert.equal(getStyleLabPreviewTextTarget(compoundChip), textPart);
  assert.equal(setStyleLabPreviewTextOnElement(compoundChip, "Visible columns"), true);
  assert.equal(textPart.textContent, "Visible columns");
  assert.deepEqual(compoundChip.children, [textPart, iconPart, countPart]);
});

test("icon preview requires one explicit icon slot and rejects ambiguous multi-icon hosts", () => {
  const firstIcon = { dispatchEvent: () => true } as unknown as HTMLElement;
  const secondIcon = { dispatchEvent: () => true } as unknown as HTMLElement;
  const oneIconHost = { querySelectorAll: () => [firstIcon] } as unknown as HTMLElement;
  const twoIconHost = { querySelectorAll: () => [firstIcon, secondIcon] } as unknown as HTMLElement;

  assert.equal(getStyleLabIconTarget(oneIconHost), firstIcon);
  assert.equal(getStyleLabIconTarget(twoIconHost), null);
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
  const iconSlotSource = readFileSync(new URL("../src/components/style-lab/style-lab-icon-slot.tsx", import.meta.url), "utf8");

  assert.match(chipSource, /data-style-part="label"/);
  assert.match(chipSource, /stylePart="label"/);
  assert.match(chipSource, /data-style-part="icon"/);
  assert.match(chipSource, /StyleLabTextPart/);
  assert.match(chipSource, /STYLE_LAB_ICON_PREVIEW_EVENT/);
  assert.match(chipSource, /<TaskTypeIcon/);
  assert.match(primitiveSource, /data-style-part=\{stylePart\}/);
  assert.match(primitiveSource, /StyleLabIconPreviewSlot/);
  assert.match(primitiveSource, /styleTextPart/);
  assert.match(iconSlotSource, /data-style-part="icon"/);
  assert.match(iconSlotSource, /STYLE_LAB_ICON_PREVIEW_EVENT/);
});

test("Tasks, HUD, and shared launchers expose deliberate Style Lab seams", () => {
  const railSource = readFileSync(new URL("../src/components/task-app/tasks-page.tsx", import.meta.url), "utf8");
  const filterSource = readFileSync(new URL("../src/components/task-app/task-filter-rows.tsx", import.meta.url), "utf8");
  const hudSource = readFileSync(new URL("../src/components/task-app/hud-command-center.tsx", import.meta.url), "utf8");
  const settingsSource = readFileSync(new URL("../src/components/task-app/settings-page.tsx", import.meta.url), "utf8");
  const testWorkspaceSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const launcherSource = readFileSync(new URL("../src/components/style-lab/style-lab-launcher.tsx", import.meta.url), "utf8");

  assert.match(railSource, /data-style-role="tasks\.rail\.surface"/);
  assert.match(railSource, /data-style-role="tasks\.rail\.chip"/);
  assert.match(railSource, /StyleLabIconPreviewSlot/);
  assert.match(railSource, /data-style-text-part="label"/);
  assert.match(filterSource, /data-style-role="tasks\.filter\.surface"/);
  assert.match(filterSource, /styleRole="tasks\.filter\.chip"/);
  assert.match(hudSource, /data-style-role="hud\.workspace\.surface"/);
  assert.match(hudSource, /data-style-role="hud\.widget\.surface"/);
  assert.match(hudSource, /styleRole="hud\.widget\.chip"/);
  assert.match(settingsSource, /<StyleLabLauncher \/>/);
  assert.match(testWorkspaceSource, /<StyleLabLauncher \/>/);
  assert.match(testWorkspaceSource, /hud\.collapsed\.surface/);
  assert.match(testWorkspaceSource, /hud\.brand\.logo/);
  assert.match(testWorkspaceSource, /hud\.version/);
  assert.match(testWorkspaceSource, /hud\.datetime/);
  assert.match(testWorkspaceSource, /hud\.collapsed\.chip/);
  assert.match(testWorkspaceSource, /hud\.collapsed\.timer/);
  assert.match(testWorkspaceSource, /styleIconName="wifi"/);
  assert.match(testWorkspaceSource, /styleIconName=\{collapsedHudFocusTimer\.isPaused \? "circle-play" : "circle-pause"\}/);
  assert.match(launcherSource, /process\.env\.NODE_ENV !== "development"/);
  assert.match(launcherSource, /requestStyleLabEnablement/);
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
  assert.equal(getStyleLabAvailablePanelHeight(800, 16), 768);
  assert.equal(getStyleLabAvailablePanelHeight(800, 240), 544);
});

test("Style Lab enablement remains development-only", () => {
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
  const panelStyleSource = readFileSync(new URL("../src/components/style-lab/style-lab-panel.tsx", import.meta.url), "utf8");

  assert.match(layoutSource, /<StyleLabDevRoot \/>/);
  assert.match(rootSource, /if \(process\.env\.NODE_ENV !== "development"\) return null;/);
  assert.doesNotMatch(rootSource, /Open Style Lab/);
  assert.match(rootSource, /if \(!enabled\) return null;/);
  assert.match(rootSource, /writeStyleLabEnablement/);
  assert.match(rootSource, /if \(!enabled \|\| !inspectionActive\) return;/);
  assert.match(rootSource, /document\.addEventListener\("click", handleClick, true\)/);
  assert.match(rootSource, /STYLE_LAB_INSTANCE_ATTRIBUTE/);
  assert.match(rootSource, /restoreStyleLabPreviewText/);
  assert.match(rootSource, /setInstanceOverrides\(resetStyleLabInstances\(\)\)/);
  assert.match(panelStyleSource, /All matching/);
  assert.match(panelStyleSource, /This one/);
  assert.match(panelStyleSource, /Preview text/);
  assert.match(panelStyleSource, /getStyleLabAvailablePanelHeight/);
  assert.match(panelStyleSource, /overflow-y-auto overscroll-contain/);
  assert.match(panelStyleSource, /sticky top-0/);
  assert.match(panelStyleSource, /Disable/);
  assert.match(panelSource, /data-style-role="ui\.panel\.surface"/);
  assert.match(activitySource, /data-style-role="ui\.section\.title"/);
  assert.match(activitySource, /data-style-role="ui\.section\.subtitle"/);
});
