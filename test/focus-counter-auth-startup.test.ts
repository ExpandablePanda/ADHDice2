import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const focusSource = readFileSync(new URL("../src/hooks/useFocus.ts", import.meta.url), "utf8");

test("Focus sync requires a matching confirmed authenticated user", () => {
  assert.match(focusSource, /export function isFocusAuthReady\(confirmedUserId: string \| null, userId: string \| null\)/);
  assert.match(focusSource, /confirmedUserId && userId && confirmedUserId === userId/);
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
  const counterEffectEnd = focusSource.indexOf("  }, [client, hydrateFocusCounters", counterEffectStart);
  const counterEffect = focusSource.slice(counterEffectStart, counterEffectEnd);
  assert.match(counterEffect, /if \(cancelled \|\| currentUserIdRef\.current !== userId \|\| !isFocusAuthReady\(confirmedAuthUserIdRef\.current, userId\)\) return;/);
  assert.match(counterEffect, /\.channel\(`focus-counters:\$\{userId\}`\)/);
  assert.match(counterEffect, /counterRequestGenerationRef\.current \+= 1;/);
  assert.match(counterEffect, /hasEstablishedSubscription/);
  assert.match(counterEffect, /status !== "SUBSCRIBED"/);
  assert.doesNotMatch(counterEffect, /TIMED_OUT|CHANNEL_ERROR|CLOSED/);
  const counterBeforeChannel = counterEffect.slice(0, counterEffect.indexOf(".channel(`focus-counters"));
  assert.doesNotMatch(counterBeforeChannel, /hydrateFocusCounters\(\)/);
  const counterSubscribeStart = counterEffect.indexOf(".subscribe((status)");
  const counterSubscribe = counterEffect.slice(counterSubscribeStart, counterEffect.indexOf("counterChannelRef.current", counterSubscribeStart));
  assert.equal((counterSubscribe.match(/void hydrateFocusCounters\(\)/g) ?? []).length, 1);

  assert.match(focusSource, /subscribeToBrowserAuth\(\(_event, session\)/);
  assert.match(focusSource, /confirmedAuthUserIdRef\.current = nextUserId/);
  assert.match(focusSource, /if \(previousUserId !== nextUserId\) \{[\s\S]*counterRequestGenerationRef\.current \+= 1;[\s\S]*runtimeHydrationGenerationRef\.current \+= 1;/);
  assert.doesNotMatch(focusSource, /authConfirmationVersion/);
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
  const runtimeEffectEnd = focusSource.indexOf("  }, [applyRuntimeRow, client", runtimeEffectStart);
  const runtimeEffect = focusSource.slice(runtimeEffectStart, runtimeEffectEnd);
  assert.match(runtimeEffect, /if \(!client \|\| !userId \|\| !isFocusAuthReadyForUser\) \{/);
  assert.match(runtimeEffect, /if \(!active \|\| currentUserIdRef\.current !== userId \|\| !isFocusAuthReady\(confirmedAuthUserIdRef\.current, userId\)\) return;/);
  assert.match(runtimeEffect, /\.channel\(`focus-runtime:\$\{userId\}`\)/);
  assert.match(runtimeEffect, /runtimeRequestGenerationRef\.current \+= 1;/);
  assert.match(focusSource, /runtimeHydrationGenerationRef\.current \+= 1;/);
  assert.match(runtimeEffect, /removeRealtimeChannel\(channel\)/);
  assert.match(runtimeEffect, /hasEstablishedSubscription/);
  assert.match(runtimeEffect, /status !== "SUBSCRIBED"/);
  assert.doesNotMatch(runtimeEffect, /TIMED_OUT|CHANNEL_ERROR|CLOSED/);
  const runtimeBeforeChannel = runtimeEffect.slice(0, runtimeEffect.indexOf(".channel(`focus-runtime"));
  assert.doesNotMatch(runtimeBeforeChannel, /hydrateFocusRuntimes\(\)/);
  const runtimeSubscribeStart = runtimeEffect.indexOf(".subscribe((status)");
  const runtimeSubscribe = runtimeEffect.slice(runtimeSubscribeStart, runtimeEffect.indexOf("runtimeChannelRef.current", runtimeSubscribeStart));
  assert.equal((runtimeSubscribe.match(/void hydrateFocusRuntimes\(\)/g) ?? []).length, 1);
});

test("Focus startup hydration is single-flight per authenticated owner and reconnect-safe", () => {
  assert.match(focusSource, /runtimeHydrationInFlightRef/);
  assert.match(focusSource, /counterHydrationInFlightRef/);
  assert.match(focusSource, /inFlight\?\.client === client && inFlight\.userId === userId/);
  assert.match(focusSource, /if \(inFlight\?\.client === client && inFlight\.userId === userId\) return inFlight\.promise;/);
  assert.match(focusSource, /status !== "SUBSCRIBED"/);
});

test("Focus counter mutations remain RPC-only", () => {
  const mutationStart = focusSource.indexOf("async function mutateFocusCounter");
  const mutationEnd = focusSource.indexOf("async function handleCreateFocusCounter", mutationStart);
  const mutation = focusSource.slice(mutationStart, mutationEnd);
  assert.match(mutation, /client\.rpc\("adhdice_mutate_focus_counter"/);
  assert.doesNotMatch(mutation, /\.from\("adhdice_focus_counters"\).*\.(?:insert|update|delete|upsert)/s);
});
