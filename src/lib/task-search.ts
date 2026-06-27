"use client";

export const DUPLICATE_TITLE_SEARCH_OPERATORS = ["duplicate:title", "has:duplicate-title"] as const;
export const HIGHLIGHT_SEARCH_PREFIX = "highlight:";

export type ParsedTaskSearchInput = {
  cleanedQuery: string;
  duplicateTitleMode: boolean;
  highlightMode: boolean;
};

export function parseTaskSearchInput(rawSearch: string, duplicateTitleMode: boolean): ParsedTaskSearchInput {
  const trimmedSearch = rawSearch.trim();
  const normalizedHighlightlessSearch = trimmedSearch.toLowerCase().startsWith(HIGHLIGHT_SEARCH_PREFIX)
    ? trimmedSearch.slice(HIGHLIGHT_SEARCH_PREFIX.length).trim()
    : trimmedSearch;

  const tokens = normalizedHighlightlessSearch
    .split(/\s+/)
    .filter(Boolean);

  let nextDuplicateTitleMode = duplicateTitleMode;
  const remainingTokens = tokens.filter((token) => {
    const normalizedToken = token.toLowerCase();
    if (DUPLICATE_TITLE_SEARCH_OPERATORS.includes(normalizedToken as (typeof DUPLICATE_TITLE_SEARCH_OPERATORS)[number])) {
      nextDuplicateTitleMode = true;
      return false;
    }

    return true;
  });

  return {
    cleanedQuery: remainingTokens.join(" ").trim().toLowerCase(),
    duplicateTitleMode: nextDuplicateTitleMode,
    highlightMode: false,
  };
}

export function normalizeTitleForDuplicateDetection(title: string) {
  const withoutLeadingEmoji = title
    .normalize("NFKC")
    .replace(/^[\s\u2705\u2714\u2713\u2611\uFE0F\p{Extended_Pictographic}]+/gu, "");
  const collapsedWhitespace = withoutLeadingEmoji
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  const withoutPunctuation = collapsedWhitespace
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return withoutPunctuation;
}
