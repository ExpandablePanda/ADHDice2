import type { HealthFoodLibraryItem } from "@/lib/database.types";

export type BatchIntakeMealFoodMatchState =
  | "unique_exact"
  | "multiple_exact"
  | "unique_normalized"
  | "multiple_normalized"
  | "no_exact";

export type BatchIntakeMealFoodCandidate = {
  food: HealthFoodLibraryItem;
  score: number;
  matchKind: "exact" | "normalized" | "brand" | "partial" | "reordered" | "typo" | "browse";
};

export type BatchIntakeMealFoodMatch = {
  candidates: BatchIntakeMealFoodCandidate[];
  selectedFoodId: string | null;
  state: BatchIntakeMealFoodMatchState;
};

const MAX_SUGGESTIONS = 12;

export function normalizeBatchIntakeFoodName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function normalizeFoodNameForMatching(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/%/gu, " percent ")
    .replace(/[’'`]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function getFoodNameTokens(value: string) {
  const normalized = normalizeFoodNameForMatching(value);
  return normalized ? normalized.split(" ") : [];
}

function includesTokens(haystack: readonly string[], needle: readonly string[]) {
  if (!needle.length || needle.length > haystack.length) return false;
  return haystack.some((_, index) => needle.every((token, offset) => haystack[index + offset] === token));
}

function includesTokenPrefixSequence(haystack: readonly string[], needle: readonly string[]) {
  if (!needle.length || needle.length > haystack.length || needle.some((token) => token.length < 3)) return false;
  return haystack.some((token, index) => needle.every((queryToken, offset) => haystack[index + offset]?.startsWith(queryToken)));
}

function removeEmbeddedBrand(foodName: string, brandName: string | null) {
  const nameTokens = getFoodNameTokens(foodName);
  const brandTokens = brandName ? getFoodNameTokens(brandName) : [];
  if (!brandTokens.length || brandTokens.some((token) => !/^\p{L}+$/u.test(token))) return null;
  if (brandTokens.length >= nameTokens.length) return null;
  if (brandTokens.every((token, index) => nameTokens[index] === token)) {
    return nameTokens.slice(brandTokens.length).join(" ");
  }
  const suffixOffset = nameTokens.length - brandTokens.length;
  if (brandTokens.every((token, index) => nameTokens[suffixOffset + index] === token)) {
    return nameTokens.slice(0, suffixOffset).join(" ");
  }
  return null;
}

function getFoodNameForms(food: HealthFoodLibraryItem) {
  const name = normalizeFoodNameForMatching(food.food_name);
  const brand = normalizeFoodNameForMatching(food.brand_name ?? "");
  const embeddedBrandlessName = removeEmbeddedBrand(food.food_name, food.brand_name);
  const forms = new Set([name]);
  if (brand && embeddedBrandlessName) {
    forms.add(embeddedBrandlessName);
    forms.add(normalizeFoodNameForMatching(`${food.brand_name} ${embeddedBrandlessName}`));
  } else if (brand) {
    forms.add(normalizeFoodNameForMatching(`${food.brand_name} ${food.food_name}`));
  }
  return [...forms].filter(Boolean);
}

function editDistanceAtMostOne(left: string, right: string, minimumTokenLength = 5) {
  if (!left || !right || Math.abs(left.length - right.length) > 1) return false;
  if (left === right) return true;
  if (/\d/u.test(left) || /\d/u.test(right)) return false;
  if (Math.min(left.length, right.length) < minimumTokenLength) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  if (leftIndex < left.length || rightIndex < right.length) edits += 1;
  return edits === 1;
}

function includesStrongOrderedTokenSequence(haystack: readonly string[], needle: readonly string[]) {
  if (needle.length < 2 || needle.length > haystack.length) return false;

  const memo = new Map<string, boolean>();
  const canMatchFrom = (savedIndex: number, queryIndex: number, variationUsed: boolean): boolean => {
    if (queryIndex === needle.length) return true;
    if (savedIndex === haystack.length || haystack.length - savedIndex < needle.length - queryIndex) return false;

    const key = `${savedIndex}:${queryIndex}:${variationUsed ? 1 : 0}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    const queryToken = needle[queryIndex];
    const savedToken = haystack[savedIndex];
    let matched = false;
    if (queryToken === savedToken) {
      matched = canMatchFrom(savedIndex + 1, queryIndex + 1, variationUsed);
    } else if (!variationUsed && editDistanceAtMostOne(queryToken, savedToken, 3)) {
      matched = canMatchFrom(savedIndex + 1, queryIndex + 1, true);
    }
    if (!matched) matched = canMatchFrom(savedIndex + 1, queryIndex, variationUsed);

    memo.set(key, matched);
    return matched;
  };

  return canMatchFrom(0, 0, false);
}

function scoreFoodSuggestion(query: string, food: HealthFoodLibraryItem): BatchIntakeMealFoodCandidate | null {
  const queryTokens = getFoodNameTokens(query);
  if (!queryTokens.length) return { food, score: 0, matchKind: "browse" };

  const queryName = normalizeBatchIntakeFoodName(query);
  const queryNormalized = normalizeFoodNameForMatching(query);
  const name = normalizeBatchIntakeFoodName(food.food_name);
  const forms = getFoodNameForms(food);
  const formTokens = forms.map((form) => form.split(" ").filter(Boolean));
  if (name === queryName) return { food, score: 120, matchKind: "exact" };
  if (forms.includes(queryNormalized)) return { food, score: 110, matchKind: "normalized" };

  let best: BatchIntakeMealFoodCandidate | null = null;
  const take = (score: number, matchKind: BatchIntakeMealFoodCandidate["matchKind"]) => {
    if (!best || score > best.score) best = { food, score, matchKind };
  };
  const brandTokens = getFoodNameTokens(food.brand_name ?? "");
  const nameTokens = getFoodNameTokens(food.food_name);
  const brandMatched = queryTokens.some((token) => token.length >= 3 && brandTokens.some((brandToken) => brandToken.startsWith(token)));
  const allQueryTokensInSavedName = queryTokens.every((token) => nameTokens.includes(token));
  const brandQueryTokensMatch = queryTokens.every((token) => (
    nameTokens.includes(token)
    || (token.length >= 3 && brandTokens.some((brandToken) => brandToken.startsWith(token)))
  ));
  if (brandMatched && brandQueryTokensMatch) take(96, "brand");

  for (const candidateTokens of formTokens) {
    if (includesTokens(candidateTokens, queryTokens)
      || includesTokens(queryTokens, candidateTokens)
      || includesTokenPrefixSequence(candidateTokens, queryTokens)
      || includesTokenPrefixSequence(queryTokens, candidateTokens)) {
      const coverage = Math.min(queryTokens.length, candidateTokens.length) / Math.max(queryTokens.length, candidateTokens.length);
      take(75 + Math.round(coverage * 15), "partial");
    }
    if (queryTokens.length > 1 && candidateTokens.length === queryTokens.length) {
      const querySorted = [...queryTokens].sort();
      const candidateSorted = [...candidateTokens].sort();
      if (querySorted.every((token, index) => token === candidateSorted[index])) take(88, "reordered");
    }
    if (queryTokens.length === candidateTokens.length) {
      const typoCount = queryTokens.reduce((count, token, index) => count + (token === candidateTokens[index] ? 0 : 1), 0);
      const hasOneMinorTypo = typoCount === 1 && queryTokens.every((token, index) => (
        token === candidateTokens[index] || editDistanceAtMostOne(token, candidateTokens[index])
      ));
      if (hasOneMinorTypo) take(82, "typo");
    }

  }

  if ((nameTokens.length > queryTokens.length || queryTokens.some((token) => token.length < 5))
    && includesStrongOrderedTokenSequence(nameTokens, queryTokens)) {
    const coverage = queryTokens.length / nameTokens.length;
    take(88 + Math.round(coverage * 7), "partial");
  }

  const hasExactBrandPrefix = brandTokens.length > 0
    && brandTokens.length < queryTokens.length
    && brandTokens.every((token, index) => queryTokens[index] === token);
  if (hasExactBrandPrefix) {
    const foodQueryTokens = queryTokens.slice(brandTokens.length);
    if (includesStrongOrderedTokenSequence(nameTokens, foodQueryTokens)) {
      const coverage = queryTokens.length / (brandTokens.length + nameTokens.length);
      take(88 + Math.round(coverage * 7), "partial");
    }
  }

  // Keep brand fragments as suggestions even when the user has not typed the food name yet.
  if (brandMatched && allQueryTokensInSavedName) take(94, "brand");
  return best;
}

export function getBatchIntakeMealFoodMatch(
  query: string,
  foods: readonly HealthFoodLibraryItem[],
): BatchIntakeMealFoodMatch {
  const uniqueFoods = [...new Map(foods.map((food) => [food.id, food])).values()];
  const exactQuery = normalizeBatchIntakeFoodName(query);
  const normalizedQuery = normalizeFoodNameForMatching(query);
  const exactMatches = exactQuery
    ? uniqueFoods.filter((food) => normalizeBatchIntakeFoodName(food.food_name) === exactQuery)
    : [];
  const normalizedMatches = normalizedQuery
    ? uniqueFoods.filter((food) => getFoodNameForms(food).includes(normalizedQuery))
    : [];
  const exactIds = new Set(exactMatches.map((food) => food.id));
  const normalizedIds = new Set(normalizedMatches.map((food) => food.id));

  let state: BatchIntakeMealFoodMatchState = "no_exact";
  let selectedFoodId: string | null = null;
  if (exactIds.size > 1) {
    state = "multiple_exact";
  } else if (exactIds.size === 1 && normalizedIds.size > 1) {
    state = "multiple_normalized";
  } else if (exactIds.size === 1) {
    state = "unique_exact";
    selectedFoodId = [...exactIds][0] ?? null;
  } else if (normalizedIds.size > 1) {
    state = "multiple_normalized";
  } else if (normalizedIds.size === 1) {
    state = "unique_normalized";
    selectedFoodId = [...normalizedIds][0] ?? null;
  }

  const candidates = uniqueFoods
    .map((food) => scoreFoodSuggestion(query, food))
    .filter((candidate): candidate is BatchIntakeMealFoodCandidate => candidate !== null)
    .sort((left, right) => right.score - left.score
      || left.food.food_name.localeCompare(right.food.food_name)
      || (left.food.brand_name ?? "").localeCompare(right.food.brand_name ?? "")
      || left.food.id.localeCompare(right.food.id))
    .slice(0, MAX_SUGGESTIONS);

  return { candidates, selectedFoodId, state };
}
