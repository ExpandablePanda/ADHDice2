import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isFocusCounterAuthReady } from "@/hooks/useFocus";

const focusSource = readFileSync(new URL("../src/hooks/useFocus.ts", import.meta.url), "utf8");
const userId = "22222222-2222-4222-8222-222222222222";

test("Focus counter sync requires a matching confirmed authenticated user", () => {
  assert.equal(isFocusCounterAuthReady(null, userId), false);
  assert.equal(isFocusCounterAuthReady("33333333-3333-4333-8333-333333333333", userId), false);
  assert.equal(isFocusCounterAuthReady(userId, userId), true);
});

test("Focus counter hydration and Realtime startup are auth-gated and transition-safe", () => {
  const hydrationStart = focusSource.indexOf("const hydrateFocusCounters = useCallback");
  const hydrationEnd = focusSource.indexOf("const applyFocusCounterMutationResult", hydrationStart);
  const hydration = focusSource.slice(hydrationStart, hydrationEnd);
  assert.match(hydration, /if \(!client \|\| !userId \|\| !isFocusCounterAuthReady\(confirmedAuthUserIdRef\.current, userId\)\) return;/);
  assert.match(hydration, /currentUserIdRef\.current !== userId/);
  assert.match(hydration, /!isFocusCounterAuthReady\(confirmedAuthUserIdRef\.current, userId\)/);
  assert.match(hydration, /setMessage\(\{ tone: "warn", text: `Focus counter sync failed:/);

  const counterEffectStart = focusSource.indexOf("useEffect(() => {\n    if (!client || !userId || !isFocusCounterSyncReady) return;");
  const counterEffectEnd = focusSource.indexOf("  }, [authConfirmationVersion, client, hydrateFocusCounters", counterEffectStart);
  const counterEffect = focusSource.slice(counterEffectStart, counterEffectEnd);
  assert.match(counterEffect, /if \(cancelled \|\| currentUserIdRef\.current !== userId \|\| !isFocusCounterAuthReady\(confirmedAuthUserIdRef\.current, userId\)\) return;/);
  assert.match(counterEffect, /\.channel\(`focus-counters:\$\{userId\}`\)/);
  assert.match(counterEffect, /counterRequestGenerationRef\.current \+= 1;/);

  assert.match(focusSource, /subscribeToBrowserAuth\(\(_event, session\)/);
  assert.match(focusSource, /confirmedAuthUserIdRef\.current = nextUserId/);
  assert.match(focusSource, /setAuthConfirmationVersion\(\(current\) => current \+ 1\)/);
});

test("Focus counter mutations remain RPC-only", () => {
  const mutationStart = focusSource.indexOf("async function mutateFocusCounter");
  const mutationEnd = focusSource.indexOf("async function handleCreateFocusCounter", mutationStart);
  const mutation = focusSource.slice(mutationStart, mutationEnd);
  assert.match(mutation, /client\.rpc\("adhdice_mutate_focus_counter"/);
  assert.doesNotMatch(mutation, /\.from\("adhdice_focus_counters"\).*\.(?:insert|update|delete|upsert)/s);
});
