"use client";

export type HealthFoodLookupProvider = "open_food_facts" | "usda";

export type HealthFoodLookupResult = {
  attribution: string;
  barcode: string | null;
  brandName: string | null;
  calories: number;
  carbs: number | null;
  fat: number | null;
  foodName: string;
  protein: number | null;
  provider: HealthFoodLookupProvider;
  providerItemId: string;
  servingLabel: string | null;
};

type OpenFoodFactsProduct = {
  _id?: string;
  brands?: string;
  code?: string;
  generic_name?: string;
  nutriments?: {
    "carbohydrates_serving"?: number | string;
    "carbohydrates_100g"?: number | string;
    "energy-kcal_serving"?: number | string;
    "energy-kcal_100g"?: number | string;
    "fat_serving"?: number | string;
    "fat_100g"?: number | string;
    "proteins_serving"?: number | string;
    "proteins_100g"?: number | string;
  };
  product_name?: string;
  product_quantity?: string;
  quantity?: string;
  serving_quantity?: string | number;
  serving_size?: string;
};

type OpenFoodFactsSearchResponse = {
  products?: OpenFoodFactsProduct[];
};

type OpenFoodFactsBarcodeResponse = {
  product?: OpenFoodFactsProduct;
  status?: number;
};

type UsdaFoodSearchResult = {
  attribution?: string | null;
  barcode?: string | null;
  brandName?: string | null;
  calories?: number | null;
  carbs?: number | null;
  fat?: number | null;
  foodName?: string | null;
  id?: string | number | null;
  protein?: number | null;
  provider?: string | null;
  servingLabel?: string | null;
};

type UsdaFunctionResponse = {
  error?: string;
  results?: UsdaFoodSearchResult[];
};

const OPEN_FOOD_FACTS_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const OPEN_FOOD_FACTS_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product";
const OPEN_FOOD_FACTS_ATTRIBUTION = "Open Food Facts";

export async function lookupOpenFoodFactsByBarcode(barcode: string) {
  const normalizedBarcode = barcode.replace(/\D/g, "");
  if (normalizedBarcode.length < 8) {
    throw new Error("Enter at least 8 digits for a barcode lookup.");
  }

  const response = await fetch(`${OPEN_FOOD_FACTS_PRODUCT_URL}/${normalizedBarcode}.json`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Barcode lookup is unavailable right now.");
  }

  const payload = (await response.json()) as OpenFoodFactsBarcodeResponse;
  if (payload.status !== 1 || !payload.product) {
    return null;
  }

  return normalizeOpenFoodFactsProduct(payload.product);
}

export async function searchHealthFoods(query: string) {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) {
    throw new Error("Enter at least 2 characters to search foods.");
  }

  const usdaResults = await searchUsdaFoods(trimmedQuery).catch(() => []);
  if (usdaResults.length > 0) {
    return usdaResults;
  }

  return searchOpenFoodFactsFoods(trimmedQuery);
}

export async function searchOpenFoodFactsFoods(query: string) {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) {
    throw new Error("Enter at least 2 characters to search foods.");
  }

  const searchUrl = new URL(OPEN_FOOD_FACTS_SEARCH_URL);
  searchUrl.searchParams.set("search_terms", trimmedQuery);
  searchUrl.searchParams.set("search_simple", "1");
  searchUrl.searchParams.set("action", "process");
  searchUrl.searchParams.set("json", "1");
  searchUrl.searchParams.set("page_size", "8");
  searchUrl.searchParams.set("fields", "id,code,product_name,generic_name,brands,serving_size,quantity,product_quantity,nutriments");

  const response = await fetch(searchUrl.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Food search is unavailable right now.");
  }

  const payload = (await response.json()) as OpenFoodFactsSearchResponse;
  return dedupeLookupResults(
    (payload.products ?? [])
      .map((product) => normalizeOpenFoodFactsProduct(product))
      .filter((product): product is HealthFoodLookupResult => product !== null),
  );
}

export async function searchUsdaFoods(query: string) {
  const functionUrl = resolveSupabaseFunctionUrl("health-food-search");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!functionUrl || !anonKey) {
    return [];
  }

  const response = await fetch(functionUrl, {
    body: JSON.stringify({ query }),
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("USDA search is unavailable right now.");
  }

  const payload = (await response.json()) as UsdaFunctionResponse;
  if (payload.error) {
    throw new Error(payload.error);
  }

  return dedupeLookupResults(
    (payload.results ?? [])
      .map((result) => normalizeUsdaFoodResult(result))
      .filter((result): result is HealthFoodLookupResult => result !== null),
  );
}

export function normalizeOpenFoodFactsProduct(product: OpenFoodFactsProduct): HealthFoodLookupResult | null {
  const foodName = firstNonEmpty(product.product_name, product.generic_name);
  const providerItemId = firstNonEmpty(product._id, product.code);
  if (!foodName || !providerItemId) {
    return null;
  }

  const calories = numberOrNull(
    product.nutriments?.["energy-kcal_serving"],
    product.nutriments?.["energy-kcal_100g"],
  );

  return {
    attribution: OPEN_FOOD_FACTS_ATTRIBUTION,
    barcode: firstNonEmpty(product.code) ?? null,
    brandName: firstNonEmpty(product.brands) ?? null,
    calories: calories !== null ? Math.max(0, Math.round(calories)) : 0,
    carbs: clampNutritionValue(numberOrNull(
      product.nutriments?.["carbohydrates_serving"],
      product.nutriments?.["carbohydrates_100g"],
    )),
    fat: clampNutritionValue(numberOrNull(
      product.nutriments?.["fat_serving"],
      product.nutriments?.["fat_100g"],
    )),
    foodName,
    protein: clampNutritionValue(numberOrNull(
      product.nutriments?.["proteins_serving"],
      product.nutriments?.["proteins_100g"],
    )),
    provider: "open_food_facts",
    providerItemId,
    servingLabel: firstNonEmpty(
      product.serving_size,
      typeof product.serving_quantity === "number" || typeof product.serving_quantity === "string"
        ? `${product.serving_quantity}`
        : null,
      product.product_quantity,
      product.quantity,
    ) ?? null,
  };
}

export function normalizeUsdaFoodResult(result: UsdaFoodSearchResult): HealthFoodLookupResult | null {
  const foodName = firstNonEmpty(result.foodName);
  const providerItemId = result.id === null || result.id === undefined ? null : String(result.id);
  if (!foodName || !providerItemId) {
    return null;
  }

  return {
    attribution: firstNonEmpty(result.attribution) ?? "USDA FoodData Central",
    barcode: firstNonEmpty(result.barcode) ?? null,
    brandName: firstNonEmpty(result.brandName) ?? null,
    calories: Math.max(0, Math.round(result.calories ?? 0)),
    carbs: clampNutritionValue(result.carbs ?? null),
    fat: clampNutritionValue(result.fat ?? null),
    foodName,
    protein: clampNutritionValue(result.protein ?? null),
    provider: "usda",
    providerItemId,
    servingLabel: firstNonEmpty(result.servingLabel) ?? null,
  };
}

export function dedupeLookupResults(results: HealthFoodLookupResult[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.provider}:${result.providerItemId}:${result.foodName.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function resolveSupabaseFunctionUrl(functionName: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) {
    return null;
  }
  return `${baseUrl.replace(/\/$/, "")}/functions/v1/${functionName}`;
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function numberOrNull(...values: Array<number | string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function clampNutritionValue(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Number(value.toFixed(1)));
}
