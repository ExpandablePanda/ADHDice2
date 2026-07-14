import assert from "node:assert/strict";
import test from "node:test";
import { createBrowserUuidV4 } from "@/lib/browser-uuid";

test("native randomUUID is preferred", () => {
  assert.equal(createBrowserUuidV4({ randomUUID: () => "native-value" }), "native-value");
});

test("fallback creates lowercase UUID v4 values with RFC variant bits", () => {
  const uuid = createBrowserUuidV4({ getRandomValues: (bytes) => bytes.fill(0) });
  assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(uuid[14], "4");
  assert.ok("89ab".includes(uuid[19]!));
});

test("repeated fallback calls produce distinct IDs", () => {
  let seed = 0;
  const uuid = () => createBrowserUuidV4({ getRandomValues: (bytes) => bytes.fill(++seed) });
  assert.notEqual(uuid(), uuid());
});

test("missing Web Crypto methods returns a controlled error", () => {
  assert.throws(
    () => createBrowserUuidV4({}),
    /Secure UUID generation is unavailable in this browser/,
  );
});
