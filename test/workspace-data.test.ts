import assert from "node:assert/strict";
import test from "node:test";

import { fetchAllPagedRows } from "../src/hooks/useWorkspaceData.ts";

test("fetchAllPagedRows accumulates full pages until the first short page", async () => {
  const pageSize = 1000;
  const ranges: Array<[number, number]> = [];
  const pages = [
    Array.from({ length: pageSize }, (_, index) => `row-${index}`),
    Array.from({ length: pageSize }, (_, index) => `row-${pageSize + index}`),
    ["row-2000", "row-2001"],
  ];

  const result = await fetchAllPagedRows<string>(async (from, to) => {
    ranges.push([from, to]);
    return { data: pages[ranges.length - 1] ?? [], error: null };
  }, pageSize);

  assert.equal(result.error, null);
  assert.equal(result.data?.length, 2002);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.equal(result.data?.at(0), "row-0");
  assert.equal(result.data?.at(-1), "row-2001");
});

test("fetchAllPagedRows stops on fetch errors without returning partial rows", async () => {
  const result = await fetchAllPagedRows<string>(async (from) => {
    if (from === 0) {
      return { data: Array.from({ length: 1000 }, (_, index) => `row-${index}`), error: null };
    }

    return { data: null, error: { message: "Supabase said no" } };
  });

  assert.equal(result.data, null);
  assert.equal(result.error?.message, "Supabase said no");
});
