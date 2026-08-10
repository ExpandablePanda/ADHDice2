import assert from "node:assert/strict";
import test from "node:test";
import { userIdFromContext } from "../supabase/functions/task-state-command/auth.ts";

const VALID_USER_ID = "123e4567-e89b-12d3-a456-426614174000";

test("authenticated UUID identity passes through unchanged", () => {
  assert.equal(userIdFromContext({ userClaims: { id: VALID_USER_ID } }), VALID_USER_ID);
});

test("missing, empty, whitespace, arbitrary, and malformed IDs fail closed", () => {
  for (const context of [
    {},
    { userClaims: {} },
    { userClaims: { id: "" } },
    { userClaims: { id: "   " } },
    { userClaims: { id: "not-a-user-id" } },
    { userClaims: { id: "123e4567-e89b-12d3-a456-42661417400" } },
    { userClaims: { id: ` ${VALID_USER_ID} ` } },
    { userClaims: { id: 123 } },
  ] as const) {
    assert.equal(userIdFromContext(context), null, JSON.stringify(context));
  }
});

test("raw sub is never accepted without a valid normalized id", () => {
  assert.equal(userIdFromContext({ userClaims: { sub: VALID_USER_ID } }), null);
  assert.equal(userIdFromContext({ userClaims: { id: VALID_USER_ID, sub: "different-sub" } }), VALID_USER_ID);
});
