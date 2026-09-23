import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isFocusAuthReady } from "@/hooks/useFocus";

const focusSource = readFileSync(new URL("../src/hooks/useFocus.ts", import.meta.url), "utf8");
const userId = "22222222-2222-4222-8222-222222222222";

test("Focus sync requires a matching confirmed authenticated user", () => {
  assert.equal(isFocusAuthReady(null, userId), false);
  assert.equal(isFocusAuthReady("33333333-3333-4333-8333-333333333333", userId), false);
  assert.equal(isFocusAuthReady(userId, userId), true);
});

test("Focus counter hydration and Realtime startup are auth-gated and transition-safe", () => {
  const hydrationStart = focusSource.indexOf("const hydrateFocusCounters = useCallback");
  const hydrationEnd = focusSource.indexOf("const applyFocusCounterMutationResult", hydrationStart);
  const hydration = focusSource.slice(hydrationStart, hydrationEnd);
  assert.match(hydration, /if \(!client \|\| !userId \|\| !isFocusAuthReady\(confirmedAuthUserIdRef\.current, userId\)\) return;/);
  assert.match(hydration, /currentUserIdRef\.current !== userId/);
  assert.match(hydration, /!isFocusAuthReady\(confirmedAuthUserIdRef\.current, userId\)/);
  assert.match(hydration, /setMessage\(\{ tone: "warn", text: `Focus counter sync failed:/);

  const counterEffectStart = focusSource.indexOf("useEffect(() => {\n    if (!client || !userId || !isFocusAuthReadyForUser) return;");
  const counterEffectEnd = focusSource.indexOf("  }, [authConfirmationVersion, client, hydrateFocusCounters", counterEffectStart);
  const counterEffect = focusSource.slice(counterEffectStart, counterEffectEnd);
  assert.match(counterEffect, /if \(cancelled \|\| currentUserIdRef\.current !== userId \|\| !isFocusAuthReady\(confirmedAuthUserIdRef\.current, userId\)\) return;/);
  assert.match(counterEffect, /\.channel\(`focus-counters:\$\{userId\}`\)/);
  assert.match(counterEffect, /counterRequestGenerationRef\.current \+= 1;/);

  assert.match(focusSource, /subscribeToBrowserAuth\(\(_event, session\)/);
  assert.match(focusSource, /confirmedAuthUserIdRef\.current = nextUserId/);
  assert.match(focusSource, /setAuthConfirmationVersion\(\(current\) => current \+ 1\)/);
});

test("Focus runtime hydration and Realtime startup share the confirmed-auth gate", () => {
  const hydrationStart = focusSource.indexOf("const hydrateFocusRuntimes = useCallback");
  const hydrationEnd = focusSource.indexOf("const replaceFocusCounterState", hydrationStart);
  const hydration = focusSource.slice(hydrationStart, hydrationEnd);
  assert.match(hydration, /if \(!client \|\| !userId \|\| !isFocusAuthReady\(confirmedAuthUserIdRef\.current, userId\)\) return;/);
  assert.match(hydration, /const hydrationGeneration = \+\+runtimeHydrationGenerationRef\.current/);
  assert.match(hydration, /const isCurrentRuntimeHydration = \(\) =>/);
  assert.match(hydration, /!isCurrentRuntimeHydration\(\)/);
  assert.match(hydration, /Focus timer sync failed:/);
  assert.match(hydration, /if \(!isCurrentRuntimeHydration\(\)\) return;/);

  const runtimeEffectStart = focusSource.indexOf("useEffect(() => {\n    if (!client || !userId || !isFocusAuthReadyForUser) {", hydrationStart);
  const runtimeEffectEnd = focusSource.indexOf("  }, [applyRuntimeRow, authConfirmationVersion", runtimeEffectStart);
  const runtimeEffect = focusSource.slice(runtimeEffectStart, runtimeEffectEnd);
  assert.match(runtimeEffect, /if \(!client \|\| !userId \|\| !isFocusAuthReadyForUser\) \{/);
  assert.match(runtimeEffect, /if \(!active \|\| currentUserIdRef\.current !== userId \|\| !isFocusAuthReady\(confirmedAuthUserIdRef\.current, userId\)\) return;/);
  assert.match(runtimeEffect, /\.channel\(`focus-runtime:\$\{userId\}`\)/);
  assert.match(runtimeEffect, /runtimeRequestGenerationRef\.current \+= 1;/);
  assert.match(runtimeEffect, /runtimeHydrationGenerationRef\.current \+= 1;/);
  assert.match(runtimeEffect, /removeRealtimeChannel\(channel\)/);
});

test("Focus counter mutations remain RPC-only", () => {
  const mutationStart = focusSource.indexOf("async function mutateFocusCounter");
  const mutationEnd = focusSource.indexOf("async function handleCreateFocusCounter", mutationStart);
  const mutation = focusSource.slice(mutationStart, mutationEnd);
  assert.match(mutation, /client\.rpc\("adhdice_mutate_focus_counter"/);
  assert.doesNotMatch(mutation, /\.from\("adhdice_focus_counters"\).*\.(?:insert|update|delete|upsert)/s);
});
