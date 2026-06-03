const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type UsdaFood = {
  brandName?: string;
  description?: string;
  fdcId?: number;
  foodNutrients?: Array<{
    nutrientName?: string;
    unitName?: string;
    value?: number;
  }>;
  gtinUpc?: string;
  householdServingFullText?: string;
  servingSize?: number;
  servingSizeUnit?: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("USDA_FOODDATA_API_KEY");
    if (!apiKey) {
      return json({ error: "USDA FoodData Central key is not configured." }, 500);
    }

    const { query } = await request.json();
    if (typeof query !== "string" || query.trim().length < 2) {
      return json({ error: "Query must be at least 2 characters." }, 400);
    }

    const response = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}`, {
      body: JSON.stringify({
        dataType: ["Branded", "Foundation", "FNDDS", "SR Legacy"],
        pageNumber: 1,
        pageSize: 8,
        query: query.trim(),
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      const detail = await response.text();
      return json({ error: `USDA search failed: ${detail || response.statusText}` }, 502);
    }

    const payload = await response.json();
    const foods = Array.isArray(payload?.foods) ? payload.foods as UsdaFood[] : [];
    const results = foods.map((food) => normalizeUsdaFood(food)).filter(Boolean);

    return json({ results }, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected USDA search error." }, 500);
  }
});

function normalizeUsdaFood(food: UsdaFood) {
  if (!food.description || !food.fdcId) {
    return null;
  }

  return {
    attribution: "USDA FoodData Central",
    barcode: food.gtinUpc?.trim() || null,
    brandName: food.brandName?.trim() || null,
    calories: roundOrZero(readNutrient(food.foodNutrients, "Energy", "KCAL")),
    carbs: roundOrNull(readNutrient(food.foodNutrients, "Carbohydrate, by difference")),
    fat: roundOrNull(readNutrient(food.foodNutrients, "Total lipid (fat)")),
    foodName: food.description.trim(),
    id: String(food.fdcId),
    protein: roundOrNull(readNutrient(food.foodNutrients, "Protein")),
    provider: "usda",
    servingLabel: buildServingLabel(food),
  };
}

function readNutrient(
  nutrients: UsdaFood["foodNutrients"],
  nutrientName: string,
  unitName?: string,
) {
  const entry = nutrients?.find((item) =>
    item.nutrientName === nutrientName && (!unitName || item.unitName === unitName)
  );
  return typeof entry?.value === "number" && Number.isFinite(entry.value) ? entry.value : null;
}

function buildServingLabel(food: UsdaFood) {
  if (food.householdServingFullText?.trim()) {
    return food.householdServingFullText.trim();
  }
  if (typeof food.servingSize === "number" && Number.isFinite(food.servingSize) && food.servingSizeUnit?.trim()) {
    return `${food.servingSize} ${food.servingSizeUnit.trim()}`;
  }
  return null;
}

function roundOrNull(value: number | null) {
  if (value === null) {
    return null;
  }
  return Math.max(0, Number(value.toFixed(1)));
}

function roundOrZero(value: number | null) {
  if (value === null) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    status,
  });
}
