import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { loadInvalidatedRecordEvents, type RecordsClient } from "../src/lib/record-repository.ts";

type PageResponse = { data: unknown[] | null; error: { message: string } | null };
type Request = {
  filters: Array<{ kind: "eq" | "in"; column: string; value: unknown }>;
  orders: Array<{ column: string; ascending: boolean }>;
  range: [number, number] | null;
  table: string;
};

function createClient(initialPlan: PageResponse[]) {
  let plan = initialPlan;
  let responseIndex = 0;
  const requests: Request[] = [];

  const client = {
    from(table: string) {
      const request: Request = { filters: [], orders: [], range: null, table };
      requests.push(request);
      let response: PageResponse = { data: [], error: null };
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          request.filters.push({ column, kind: "eq", value });
          return builder;
        },
        in: (column: string, value: unknown) => {
          request.filters.push({ column, kind: "in", value });
          return builder;
        },
        order: (column: string, options: { ascending: boolean }) => {
          request.orders.push({ column, ascending: options.ascending });
          return builder;
        },
        range: (from: number, to: number) => {
          request.range = [from, to];
          response = plan[responseIndex++] ?? { data: [], error: null };
          return builder;
        },
        then: (resolve: (value: PageResponse) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(response).then(resolve, reject),
      };
      return builder;
    },
  } as unknown as RecordsClient;

  return {
    client,
    requests,
    setPlan(nextPlan: PageResponse[]) {
      plan = nextPlan;
      responseIndex = 0;
      requests.length = 0;
    },
  };
}

function rows(count: number, prefix = "event") {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}` }));
}

function successfulPage(data: unknown[]): PageResponse {
  return { data, error: null };
}

test("one invalidated-event page under the limit returns normally", async () => {
  const fake = createClient([successfulPage(rows(3))]);

  const result = await loadInvalidatedRecordEvents(fake.client, "owner-1");

  assert.equal(result.length, 3);
  assert.deepEqual(fake.requests.map((request) => request.range), [[0, 999]]);
});

test("an exactly full invalidated-event page causes another request", async () => {
  const fake = createClient([successfulPage(rows(1000)), successfulPage(rows(2, "next"))]);

  const result = await loadInvalidatedRecordEvents(fake.client, "owner-1");

  assert.equal(result.length, 1002);
  assert.deepEqual(fake.requests.map((request) => request.range), [[0, 999], [1000, 1999]]);
});

test("multiple full pages concatenate completely before the final short page", async () => {
  const fake = createClient([
    successfulPage(rows(1000, "first")),
    successfulPage(rows(1000, "second")),
    successfulPage(rows(284, "third")),
  ]);

  const result = await loadInvalidatedRecordEvents(fake.client, "owner-1");

  assert.equal(result.length, 2284);
  assert.equal(result[0]?.id, "first-0");
  assert.equal(result.at(-1)?.id, "third-283");
  assert.deepEqual(fake.requests.map((request) => request.range), [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("a final short page terminates pagination", async () => {
  const fake = createClient([successfulPage(rows(1000)), successfulPage(rows(1, "last"))]);

  await loadInvalidatedRecordEvents(fake.client, "owner-1");

  assert.equal(fake.requests.length, 2);
});

test("every invalidated-event page keeps the owner, rules, validity, and ordering contract", async () => {
  const fake = createClient([successfulPage(rows(1000)), successfulPage(rows(1, "last"))]);

  await loadInvalidatedRecordEvents(fake.client, "owner-1");

  for (const request of fake.requests) {
    assert.equal(request.table, "adhdice_record_events");
    assert.deepEqual(request.filters, [
      { column: "user_id", kind: "eq", value: "owner-1" },
      { column: "rules_version", kind: "eq", value: "records-v1" },
      { column: "validity_state", kind: "in", value: ["invalid", "superseded"] },
    ]);
    assert.deepEqual(request.orders, [
      { column: "credited_date", ascending: false },
      { column: "created_at", ascending: false },
    ]);
  }
});

test("a later-page failure returns no partial set and a retry can load it completely", async () => {
  const fake = createClient([
    successfulPage(rows(1000, "partial")),
    { data: null, error: { message: "later page failed" } },
  ]);

  await assert.rejects(() => loadInvalidatedRecordEvents(fake.client, "owner-1"), /later page failed/);

  fake.setPlan([successfulPage(rows(1000, "retry-first")), successfulPage(rows(2, "retry-last"))]);
  const result = await loadInvalidatedRecordEvents(fake.client, "owner-1");

  assert.equal(result.length, 1002);
  assert.equal(result[0]?.id, "retry-first-0");
  assert.equal(result.at(-1)?.id, "retry-last-1");
  assert.equal(new Set(result.map((event) => event.id)).size, result.length);
});

test("lazy invalidated loading remains failure-safe, retryable, owner/session fenced, and single-flight", () => {
  const hook = readFileSync(new URL("../src/hooks/useRecords.ts", import.meta.url), "utf8");
  const loaderStart = hook.indexOf("const loadInvalidatedEvents");
  const loaderEnd = hook.indexOf("\n\n  useEffect(() => {", loaderStart);
  const loader = hook.slice(loaderStart, loaderEnd);
  const success = loader.slice(loader.indexOf(".then("), loader.indexOf(".catch("));
  const failure = loader.slice(loader.indexOf(".catch("), loader.indexOf(".finally("));

  assert.match(loader, /invalidatedEventsRequestRef\.current\?\.key === sessionKey/);
  assert.match(loader, /latestOwnerRef\.current !== userId \|\| latestSessionKeyRef\.current !== sessionKey/);
  assert.match(loader, /invalidatedEventsLoadedKeyRef\.current = sessionKey/);
  assert.match(success, /invalidatedEventsLoaded: true/);
  assert.doesNotMatch(failure, /invalidatedEventsLoaded(?:KeyRef\.current = sessionKey|: true)/);
  assert.match(loader, /invalidatedEventsRequestRef\.current\?\.promise === request/);
  assert.match(loader, /invalidatedEventsRequestRef\.current = null/);
});

test("normal Records opening stays valid-only and does not invoke the lazy invalidated loader", () => {
  const repository = readFileSync(new URL("../src/lib/record-repository.ts", import.meta.url), "utf8");
  const hook = readFileSync(new URL("../src/hooks/useRecords.ts", import.meta.url), "utf8");
  const persistedLoader = repository.slice(repository.indexOf("export async function loadPersistedRecords"), repository.indexOf("export async function loadRecordsSourceState"));
  const normalOpenBranch = hook.slice(hook.indexOf("if (durableIsFresh)"), hook.indexOf("decision = sourceStateAvailable"));

  assert.match(persistedLoader, /loadRecordEvents\(client, userId\)/);
  assert.doesNotMatch(persistedLoader, /loadInvalidatedRecordEvents/);
  assert.match(normalOpenBranch, /loadPersistedRecords\(client, userId\)/);
  assert.doesNotMatch(normalOpenBranch, /loadInvalidatedRecordEvents/);
});
