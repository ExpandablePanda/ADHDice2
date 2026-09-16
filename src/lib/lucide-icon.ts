import dynamicIconImports from "lucide-react/dynamicIconImports.mjs";
import type { LucideIcon } from "lucide-react";

export type RawLucideIconName = keyof typeof dynamicIconImports;

export const LUCIDE_ICON_NAME_SET = new Set<string>(Object.keys(dynamicIconImports));

export function isLucideIconName(value: unknown): value is RawLucideIconName {
  return typeof value === "string" && LUCIDE_ICON_NAME_SET.has(value);
}

export function loadLucideIcon(name: RawLucideIconName): Promise<LucideIcon> {
  return dynamicIconImports[name]().then((module) => module.default);
}
