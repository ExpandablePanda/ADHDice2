import {
  getStyleLabBackgroundColorCssValue,
  getStyleLabBuilderFontOption,
  getStyleLabTextColorCssValue,
  STYLE_LAB_BUILDER_BORDER_OPTIONS,
  STYLE_LAB_BUILDER_RADIUS_OPTIONS,
  STYLE_LAB_BUILDER_SHADOW_OPTIONS,
} from "./style-lab-registry";
import {
  getStyleLabBuilderChildren,
  getStyleLabBuilderNode,
  type StyleLabBuilderContainerNode,
  type StyleLabBuilderDraft,
  type StyleLabBuilderNode,
  type StyleLabBuilderTextStyles,
} from "./style-lab-builder-model";

function quote(value: string): string {
  return JSON.stringify(value);
}

function titleCase(value: string): string {
  return value.replace(/(^|[-_])([a-z])/g, (_, prefix: string, character: string) => `${prefix}${character.toUpperCase()}`);
}

function canvasLabel(canvasWidth: StyleLabBuilderDraft["canvasWidth"]): string {
  return canvasWidth === "fit" ? "Fit" : `${canvasWidth}px`;
}

function nodeLabel(node: StyleLabBuilderNode): string {
  if (node.type === "container") return "Container";
  if (node.type === "text") return "Text";
  if (node.type === "chip") return "Chip";
  if (node.type === "icon-button") return "Icon Button";
  return "Divider";
}

function nodeGridColumnSpan(draft: StyleLabBuilderDraft, node: StyleLabBuilderNode): number | null {
  const parent = node.parentId ? getStyleLabBuilderNode(draft, node.parentId) : null;
  return parent?.type === "container" && parent.styles.layout === "grid" ? node.placement.gridColumnSpan : null;
}

function textStyleSpec(styles: StyleLabBuilderTextStyles, indent: string): string[] {
  return [
    `${indent}- Font family: ${getStyleLabBuilderFontOption(styles.fontFamily).label}`,
    `${indent}- Font size: ${styles.fontSize}`,
    `${indent}- Font weight: ${styles.fontWeight}`,
    `${indent}- Text color: ${styles.textColor}`,
    `${indent}- Line height: ${styles.lineHeight}`,
    `${indent}- Letter spacing: ${styles.letterSpacing}`,
    `${indent}- Alignment: ${titleCase(styles.textAlign)}`,
  ];
}

function nodeSpecLines(draft: StyleLabBuilderDraft, node: StyleLabBuilderNode, depth: number): string[] {
  const indent = "  ".repeat(depth);
  const propertyIndent = "  ".repeat(depth + 1);
  const gridSpan = nodeGridColumnSpan(draft, node);
  const lines = [`${indent}${depth === 0 ? "Root Container" : nodeLabel(node)}`, ...(gridSpan ? [`${propertyIndent}- Column span: ${gridSpan}`] : [])];
  if (node.type === "container") {
    lines.push(
      `${propertyIndent}- Layout: ${titleCase(node.styles.layout)}`,
      ...(node.styles.layout === "grid" ? [`${propertyIndent}- Grid columns: ${node.styles.gridColumns}`] : []),
      `${propertyIndent}- Align items: ${titleCase(node.styles.alignItems)}`,
      `${propertyIndent}- Justify content: ${titleCase(node.styles.justifyContent)}`,
      `${propertyIndent}- Width: ${node.styles.width}`,
      `${propertyIndent}- Height: ${node.styles.height}`,
      `${propertyIndent}- Min width: ${node.styles.minWidth}`,
      `${propertyIndent}- Max width: ${node.styles.maxWidth}`,
      `${propertyIndent}- Padding X: ${node.styles.paddingX}`,
      `${propertyIndent}- Padding Y: ${node.styles.paddingY}`,
      `${propertyIndent}- Gap: ${node.styles.gap}`,
      `${propertyIndent}- Background: ${node.styles.backgroundColor}`,
      `${propertyIndent}- Radius: ${titleCase(node.styles.radius)}`,
      `${propertyIndent}- Border: ${titleCase(node.styles.border)}`,
      `${propertyIndent}- Shadow: ${titleCase(node.styles.shadow)}`,
    );
  } else if (node.type === "text") {
    lines.push(`${propertyIndent}- Text: ${node.text}`, ...textStyleSpec(node.styles, propertyIndent));
  } else if (node.type === "chip") {
    lines.push(
      `${propertyIndent}- Text: ${node.text}`,
      `${propertyIndent}- Tone: ${node.styles.tone}`,
      `${propertyIndent}- Selected: ${node.styles.selected ? "On" : "Off"}`,
      `${propertyIndent}- Icon: ${node.styles.iconName ?? "None"}`,
      ...textStyleSpec(node.styles, propertyIndent),
    );
  } else if (node.type === "icon-button") {
    lines.push(
      `${propertyIndent}- Accessibility label: ${node.ariaLabel}`,
      `${propertyIndent}- Icon: ${node.styles.iconName}`,
      `${propertyIndent}- Size: ${node.styles.size}`,
      `${propertyIndent}- Tone: ${node.styles.tone}`,
    );
  } else {
    lines.push(
      `${propertyIndent}- Orientation: ${titleCase(node.styles.orientation)}`,
      `${propertyIndent}- Color: ${node.styles.color}`,
      `${propertyIndent}- Width: ${node.styles.width}`,
    );
  }
  for (const child of getStyleLabBuilderChildren(draft, node.id)) lines.push(...nodeSpecLines(draft, child, depth + 1));
  return lines;
}

export function buildStyleLabModuleSpec(draft: StyleLabBuilderDraft): string {
  const normalizedRoot = getStyleLabBuilderNode(draft, "root");
  const lines = [
    "ADHDice Style Lab Module Spec",
    "",
    `Module: ${draft.moduleName}`,
    `Canvas: ${canvasLabel(draft.canvasWidth)}`,
    "",
    "Structure:",
    ...(normalizedRoot ? nodeSpecLines(draft, normalizedRoot, 0) : ["Root Container"]),
    "",
    "Implementation note:",
    "- Builder reference only.",
    "- No source files were modified.",
    "- Preserve hierarchy, element order, approved values, and ADHDice primitives.",
  ];
  return lines.join("\n");
}

function cssValueForRadius(value: StyleLabBuilderContainerNode["styles"]["radius"]): string {
  return STYLE_LAB_BUILDER_RADIUS_OPTIONS.find((option) => option.value === value)?.cssValue ?? "0";
}

function cssValueForBorder(value: StyleLabBuilderContainerNode["styles"]["border"]): string {
  return STYLE_LAB_BUILDER_BORDER_OPTIONS.find((option) => option.value === value)?.cssValue ?? "none";
}

function cssValueForShadow(value: StyleLabBuilderContainerNode["styles"]["shadow"]): string {
  return STYLE_LAB_BUILDER_SHADOW_OPTIONS.find((option) => option.value === value)?.cssValue ?? "none";
}

function flexAlignValue(value: string): string {
  return value === "start" ? "flex-start" : value === "end" ? "flex-end" : value;
}

function styleObject(entries: Array<[string, string | number]>): string[] {
  return entries.map(([key, value]) => `    ${key}: ${typeof value === "number" ? value : quote(value)},`);
}

function textStyleObject(styles: StyleLabBuilderTextStyles, additionalEntries: Array<[string, string | number]> = []): string[] {
  return styleObject([
    ["fontFamily", getStyleLabBuilderFontOption(styles.fontFamily).cssFamily],
    ["fontSize", styles.fontSize],
    ["fontWeight", styles.fontWeight],
    ["color", getStyleLabTextColorCssValue(styles.textColor)],
    ["lineHeight", styles.lineHeight],
    ["letterSpacing", styles.letterSpacing],
    ["textAlign", styles.textAlign],
    ...additionalEntries,
  ]);
}

function containerStyleObject(node: StyleLabBuilderContainerNode, additionalEntries: Array<[string, string | number]> = []): string[] {
  const { styles } = node;
  const layoutEntries: Array<[string, string | number]> = styles.layout === "grid"
    ? [["display", "grid"], ["gridTemplateColumns", `repeat(${styles.gridColumns}, minmax(0, 1fr))`]]
    : [["display", "flex"], ["flexDirection", styles.layout]];
  return styleObject([
    ...layoutEntries,
    ["gap", styles.gap],
    ["paddingLeft", styles.paddingX],
    ["paddingRight", styles.paddingX],
    ["paddingTop", styles.paddingY],
    ["paddingBottom", styles.paddingY],
    ["alignItems", flexAlignValue(styles.alignItems)],
    ["justifyContent", styles.justifyContent],
    ["width", styles.width],
    ["height", styles.height],
    ["minWidth", styles.minWidth],
    ["maxWidth", styles.maxWidth],
    ["background", getStyleLabBackgroundColorCssValue(styles.backgroundColor)],
    ["borderRadius", cssValueForRadius(styles.radius)],
    ["border", cssValueForBorder(styles.border)],
    ["boxShadow", cssValueForShadow(styles.shadow)],
    ...additionalEntries,
  ]);
}

function referenceIcon(iconName: string): string {
  return `<TaskTypeIcon aria-hidden="true" className="h-4 w-4" iconKey=${quote(iconName)} />`;
}

function referenceNodeLines(draft: StyleLabBuilderDraft, node: StyleLabBuilderNode, depth: number): string[] {
  const indent = "  ".repeat(depth);
  const childIndent = "  ".repeat(depth + 1);
  const gridSpan = nodeGridColumnSpan(draft, node);
  const gridEntries = gridSpan ? [["gridColumn", `span ${gridSpan}`] as [string, string]] : [];
  if (node.type === "container") {
    const lines = [`${indent}<div`, `${indent}  style={{`, ...containerStyleObject(node, gridEntries).map((line) => `${indent}${line}`), `${indent}  }}`, `${indent}>`];
    for (const child of getStyleLabBuilderChildren(draft, node.id)) lines.push(...referenceNodeLines(draft, child, depth + 1));
    lines.push(`${indent}</div>`);
    return lines;
  }
  if (node.type === "text") {
    return [
      `${indent}<span`,
      `${indent}  style={{`,
      ...textStyleObject(node.styles, gridEntries).map((line) => `${indent}${line}`),
      `${indent}  }}`,
      `${indent}>`,
      `${childIndent}{${quote(node.text)}}`,
      `${indent}</span>`,
    ];
  }
  if (node.type === "chip") {
    const iconProp = node.styles.iconName ? ` icon={${referenceIcon(node.styles.iconName)}}` : "";
    return [
      `${indent}<AdhdChip`,
      `${indent}  selected={${node.styles.selected}}`,
      `${indent}  tone=${quote(node.styles.tone)}`,
      `${indent}  type="button"`,
      `${indent}  style={{`,
      ...textStyleObject(node.styles, gridEntries).map((line) => `${indent}${line}`),
      `${indent}  }}`,
      `${indent}${iconProp}`,
      `${indent}>`,
      `${childIndent}{${quote(node.text)}}`,
      `${indent}</AdhdChip>`,
    ];
  }
  if (node.type === "icon-button") {
    return [
      `${indent}<AdhdIconButton`,
      `${indent}  aria-label=${quote(node.ariaLabel)}`,
      `${indent}  size=${quote(node.styles.size)}`,
      `${indent}  tone=${quote(node.styles.tone)}`,
      `${indent}  type="button"`,
      ...(gridEntries.length > 0 ? [`${indent}  style={{`, ...styleObject(gridEntries).map((line) => `${indent}${line}`), `${indent}  }}`] : []),
      `${indent}>`,
      `${childIndent}${referenceIcon(node.styles.iconName)}`,
      `${indent}</AdhdIconButton>`,
    ];
  }
  return [
    `${indent}<div`,
    `${indent}  aria-orientation=${quote(node.styles.orientation)}`,
    `${indent}  role="separator"`,
    `${indent}  style={{`,
      ...styleObject([
        ["width", node.styles.width],
        ["height", node.styles.orientation === "horizontal" ? "1px" : "100%"],
        ["background", getStyleLabTextColorCssValue(node.styles.color)],
        ...gridEntries,
      ]).map((line) => `${indent}${line}`),
    `${indent}  }}`,
    `${indent}/>`,
  ];
}

export function buildStyleLabReferenceCode(draft: StyleLabBuilderDraft): string {
  const root = getStyleLabBuilderNode(draft, "root");
  return [
    "// ADHDice Style Lab reference only.",
    "// Translate through production design-system conventions when implementing.",
    "// No source files were modified.",
    `// Module: ${draft.moduleName} · Canvas: ${canvasLabel(draft.canvasWidth)}`,
    "",
    ...(root ? referenceNodeLines(draft, root, 0) : ["<div />"]),
  ].join("\n");
}
