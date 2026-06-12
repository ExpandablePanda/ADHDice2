"use client";

export function formatOptionLabel(value: string) {
  if (value === "archived") {
    return "Archived";
  }

  if (value === "trashed") {
    return "Trash";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
