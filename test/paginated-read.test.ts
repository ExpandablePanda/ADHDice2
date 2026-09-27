import test from "node:test";
import assert from "node:assert/strict";

import { fetchAllPagedRows } from "../src/lib/paginated-read.ts";

function rows(count: number) {
  return Array.from({ length: count }, (_, index) => index);
}

for (const count of [0, 1, 999, 1000, 1001, 1999, 2000, 2001]) {
  test(`paged reads preserve ${count} rows and probe exactly-full pages`, async () => {
    const source = rows(count);
    const ranges: Array<[number, number]> = [];
    const result = await fetchAllPagedRows((from, to) => {
      ranges.push([from, to]);
      return Promise.resolve({ data: source.slice(from, to + 1), error: null });
    });

    assert.deepEqual(result, { data: source, error: null });
    assert.deepEqual(ranges, Array.from({ length: Math.ceil((count + 1) / 1000) }, (_, page) => [page * 1000, page * 1000 + 999]));
    assert.deepEqual(result.data, [...new Set(result.data ?? [])]);
  });
}

test("first-page failure returns no partial rows", async () => {
  const result = await fetchAllPagedRows(() => Promise.resolve({ data: null, error: { message: "first page" } }));
  assert.deepEqual(result, { data: null, error: { message: "first page" } });
});

test("later-page failure returns no partial rows", async () => {
  const result = await fetchAllPagedRows((from) => Promise.resolve(
    from === 0
      ? { data: rows(1000), error: null }
      : { data: null, error: { message: "later page" } },
  ));
  assert.deepEqual(result, { data: null, error: { message: "later page" } });
});

test("page diagnostics remain bounded to the pages actually requested", async () => {
  const pages: Array<{ from: number; to: number; rowCount: number }> = [];
  await fetchAllPagedRows(
    (from, to) => Promise.resolve({ data: rows(1001).slice(from, to + 1), error: null }),
    1000,
    (page) => pages.push(page),
  );
  assert.deepEqual(pages, [
    { from: 0, to: 999, rowCount: 1000 },
    { from: 1000, to: 1999, rowCount: 1 },
  ]);
});
