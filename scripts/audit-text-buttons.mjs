import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOTS = ["src/app", "src/components"];
const APPROVED_PATTERNS = [
  "CHIP_BASE",
  "CHIP_BUTTON_CLASS",
  "inlineAccordionButtonClass()",
  "ui-chip-button-base",
  "ui-pill-button-light",
  "ui-pill-button-strong-light",
  "ui-pill-button-danger-light",
];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (fullPath.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function collectVisibleText(children, sourceFile) {
  const parts = [];

  for (const child of children) {
    if (ts.isJsxText(child)) {
      parts.push(child.getText(sourceFile));
      continue;
    }

    if (ts.isJsxExpression(child)) {
      const expression = child.expression;
      if (!expression) {
        continue;
      }
      if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
        parts.push(expression.text);
      }
      continue;
    }

    if (ts.isJsxElement(child)) {
      const tagName = child.openingElement.tagName.getText(sourceFile);
      if (tagName === "button") {
        continue;
      }
      parts.push(collectVisibleText(child.children, sourceFile));
      continue;
    }

    if (ts.isJsxSelfClosingElement(child)) {
      continue;
    }

    if (ts.isJsxFragment(child)) {
      parts.push(collectVisibleText(child.children, sourceFile));
    }
  }

  return normalizeText(parts.join(" "));
}

function visit(node, sourceFile, findings) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(sourceFile) === "button") {
    const openingTag = node.openingElement.getText(sourceFile);
    const visibleText = collectVisibleText(node.children, sourceFile);

    if (/[A-Za-z]/.test(visibleText) && !APPROVED_PATTERNS.some((pattern) => openingTag.includes(pattern))) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      findings.push(`${sourceFile.fileName}:${line + 1} -> ${visibleText.slice(0, 80)}`);
    }
  }

  ts.forEachChild(node, (child) => visit(child, sourceFile, findings));
}

const findings = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const source = readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    visit(sourceFile, sourceFile, findings);
  }
}

if (findings.length > 0) {
  console.error("Text-labeled <button> elements found outside approved chip patterns:\n");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("No disallowed text-labeled <button> elements found.");
