import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  removeOwnedRealtimeChannel,
  startSerializedRealtimeChannel,
} from "../src/lib/realtime-channel-lifecycle.ts";

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

async function settleMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function createMockRealtimeClient() {
  const channels = new Map<string, MockChannel>();
  const pendingRemovals = new Map<MockChannel, Deferred>();
  const events: string[] = [];
  let nextId = 0;

  class MockChannel {
    readonly id = ++nextId;
    subscribed = false;
    removed = false;
    onCalls = 0;

    readonly topic: string;

    constructor(topic: string) {
      this.topic = topic;
    }

    on(type: string, ..._args: unknown[]) {
      void _args;
      if (this.subscribed && !this.removed) {
        throw new Error(`cannot add \`${type}\` callbacks for ${this.topic} after \`subscribe()\`.`);
      }
      this.onCalls += 1;
      events.push(`on:${this.id}`);
      return this;
    }

    subscribe() {
      if (this.subscribed) throw new Error("cannot subscribe twice");
      this.subscribed = true;
      events.push(`subscribe:${this.id}`);
      return this;
    }
  }

  return {
    channel(topic: string) {
      const existing = channels.get(topic);
      if (existing) return existing;
      const channel = new MockChannel(topic);
      channels.set(topic, channel);
      events.push(`create:${channel.id}`);
      return channel;
    },
    removeChannel(channel: MockChannel) {
      events.push(`remove:start:${channel.id}`);
      const removal = deferred();
      pendingRemovals.set(channel, removal);
      return removal.promise.then(() => {
        channel.removed = true;
        if (channels.get(channel.topic) === channel) channels.delete(channel.topic);
        events.push(`remove:done:${channel.id}`);
      });
    },
    resolveRemoval(channel: MockChannel) {
      pendingRemovals.get(channel)?.resolve();
    },
    events,
    channels,
    activeSubscriptionCount() {
      return [...channels.values()].filter((channel) => channel.subscribed && !channel.removed).length;
    },
  };
}

test("Realtime registry mock reproduces the SDK same-topic subscribe collision", () => {
  const client = createMockRealtimeClient();
  const topic = "realtime:adhdice_home_todo_state:user-1";
  const firstChannel = client.channel(topic);
  firstChannel.on("postgres_changes", {}, () => {}).subscribe();

  const reusedChannel = client.channel(topic);
  assert.equal(reusedChannel, firstChannel);
  assert.throws(
    () => reusedChannel.on("postgres_changes", {}, () => {}),
    /cannot add `postgres_changes` callbacks for realtime:adhdice_home_todo_state:user-1 after `subscribe\(\)`\./,
  );
});

test("serialized lifecycle creates, configures, and subscribes only after prior removal", async () => {
  const client = createMockRealtimeClient();
  const channelRef = { current: null as MockChannel | null };
  const channelRemovalPromiseRef = { current: null as Promise<void> | null };
  const remove = (channel: MockChannel) => client.removeChannel(channel);
  const stopFirst = startSerializedRealtimeChannel({
    channelRef,
    channelRemovalPromiseRef,
    createChannel: () => client.channel("realtime:adhdice_on_time_plans:user-1"),
    subscribe: (channel) => channel.on("postgres_changes", {}, () => {}).subscribe(),
    removeChannel: remove,
  });

  await settleMicrotasks();
  const firstChannel = channelRef.current;
  assert.ok(firstChannel);
  assert.deepEqual(client.events, [`create:${firstChannel.id}`, `on:${firstChannel.id}`, `subscribe:${firstChannel.id}`]);

  stopFirst();
  assert.equal(channelRef.current, null);
  assert.deepEqual(client.events, [
    `create:${firstChannel.id}`,
    `on:${firstChannel.id}`,
    `subscribe:${firstChannel.id}`,
    `remove:start:${firstChannel.id}`,
  ]);

  const stopReplacement = startSerializedRealtimeChannel({
    channelRef,
    channelRemovalPromiseRef,
    createChannel: () => client.channel("realtime:adhdice_on_time_plans:user-1"),
    subscribe: (channel) => channel.on("postgres_changes", {}, () => {}).subscribe(),
    removeChannel: remove,
  });
  await settleMicrotasks();
  assert.deepEqual(client.events, [
    `create:${firstChannel.id}`,
    `on:${firstChannel.id}`,
    `subscribe:${firstChannel.id}`,
    `remove:start:${firstChannel.id}`,
  ]);

  client.resolveRemoval(firstChannel);
  await settleMicrotasks();
  const replacementChannel = channelRef.current;
  assert.ok(replacementChannel);
  assert.notEqual(replacementChannel, firstChannel);
  assert.deepEqual(client.events, [
    `create:${firstChannel.id}`,
    `on:${firstChannel.id}`,
    `subscribe:${firstChannel.id}`,
    `remove:start:${firstChannel.id}`,
    `remove:done:${firstChannel.id}`,
    `create:${replacementChannel.id}`,
    `on:${replacementChannel.id}`,
    `subscribe:${replacementChannel.id}`,
  ]);

  stopReplacement();
  client.resolveRemoval(replacementChannel);
  await settleMicrotasks();
  assert.equal(client.channels.size, 0);
});

test("canceled replacement never subscribes after removal and stale cleanup preserves a newer channel", async () => {
  const client = createMockRealtimeClient();
  const channelRef = { current: null as MockChannel | null };
  const channelRemovalPromiseRef = { current: null as Promise<void> | null };
  const remove = (channel: MockChannel) => client.removeChannel(channel);
  const stopFirst = startSerializedRealtimeChannel({
    channelRef,
    channelRemovalPromiseRef,
    createChannel: () => client.channel("realtime:adhdice_home_todo_state:user-1"),
    subscribe: (channel) => channel.on("postgres_changes", {}, () => {}).subscribe(),
    removeChannel: remove,
  });
  await settleMicrotasks();
  const firstChannel = channelRef.current;
  assert.ok(firstChannel);
  stopFirst();

  const stopCanceledReplacement = startSerializedRealtimeChannel({
    channelRef,
    channelRemovalPromiseRef,
    createChannel: () => client.channel("realtime:adhdice_home_todo_state:user-1"),
    subscribe: (channel) => channel.on("postgres_changes", {}, () => {}).subscribe(),
    removeChannel: remove,
  });
  stopCanceledReplacement();
  client.resolveRemoval(firstChannel);
  await settleMicrotasks();
  assert.deepEqual(client.events, [
    `create:${firstChannel.id}`,
    `on:${firstChannel.id}`,
    `subscribe:${firstChannel.id}`,
    `remove:start:${firstChannel.id}`,
    `remove:done:${firstChannel.id}`,
  ]);

  const newerChannel = { id: "newer" };
  channelRef.current = newerChannel as unknown as MockChannel;
  const staleRemoval = removeOwnedRealtimeChannel({
    channel: firstChannel,
    channelRef,
    channelRemovalPromiseRef,
    removeChannel: remove,
  });
  assert.equal(channelRef.current, newerChannel);
  client.resolveRemoval(firstChannel);
  await staleRemoval;
  assert.equal(channelRef.current, newerChannel);
});

test("rapid mount and unmount cycles leave one or zero topic channels without reuse-after-subscribe", async () => {
  const client = createMockRealtimeClient();
  const channelRef = { current: null as MockChannel | null };
  const channelRemovalPromiseRef = { current: null as Promise<void> | null };
  const remove = (channel: MockChannel) => client.removeChannel(channel);

  for (let index = 0; index < 8; index += 1) {
    const stop = startSerializedRealtimeChannel({
      channelRef,
      channelRemovalPromiseRef,
      createChannel: () => client.channel("realtime:adhdice_on_time_plans:user-1"),
      subscribe: (channel) => channel.on("postgres_changes", {}, () => {}).subscribe(),
      removeChannel: remove,
    });
    await settleMicrotasks();
    const current = channelRef.current;
    assert.ok(current);
    stop();
    client.resolveRemoval(current);
    await settleMicrotasks();
    assert.ok(client.channels.size <= 1);
  }

  assert.equal(client.events.filter((event) => event.startsWith("on:")).length, 8);
  assert.equal(client.events.filter((event) => event.startsWith("subscribe:")).length, 8);
  assert.equal(client.channels.size, 0);
});

test("unique Home channel identities prevent registry reuse across remount, split close, and auth changes", async () => {
  const client = createMockRealtimeClient();
  const channelRef = { current: null as MockChannel | null };
  const channelRemovalPromiseRef = { current: null as Promise<void> | null };
  const remove = (channel: MockChannel) => client.removeChannel(channel);
  let channelIdentity = 0;

  const startHomeOwner = (userId: string) => startSerializedRealtimeChannel({
    channelRef,
    channelRemovalPromiseRef,
    createChannel: () => client.channel(`realtime:adhdice_home_todo_state:${userId}:owner-${++channelIdentity}`),
    subscribe: (channel) => channel.on("postgres_changes", { filter: `user_id=eq.${userId}` }, () => {}).subscribe(),
    removeChannel: remove,
  });

  const stopWindowOneHome = startHomeOwner("user-1");
  await settleMicrotasks();
  const firstChannel = channelRef.current;
  assert.ok(firstChannel);
  assert.equal(client.activeSubscriptionCount(), 1);

  // Strict Mode replay / rapid Home -> Tasks -> Home / Split Right -> Close Split all
  // exercise the same single-owner effect cleanup and setup path.
  stopWindowOneHome();
  const stopReplayedHome = startHomeOwner("user-1");
  await settleMicrotasks();
  assert.equal(channelRef.current, null);
  assert.equal(client.activeSubscriptionCount(), 1);
  client.resolveRemoval(firstChannel);
  await settleMicrotasks();
  const replayedChannel = channelRef.current;
  assert.ok(replayedChannel);
  assert.notEqual(replayedChannel, firstChannel);
  assert.equal(client.activeSubscriptionCount(), 1);

  stopReplayedHome();
  const stopNextUserHome = startHomeOwner("user-2");
  await settleMicrotasks();
  assert.equal(channelRef.current, null);
  client.resolveRemoval(replayedChannel);
  await settleMicrotasks();
  const nextUserChannel = channelRef.current;
  assert.ok(nextUserChannel);
  assert.match(nextUserChannel.topic, /user-2:owner-/);
  assert.equal(client.activeSubscriptionCount(), 1);

  stopNextUserHome();
  client.resolveRemoval(nextUserChannel);
  await settleMicrotasks();
  assert.equal(client.activeSubscriptionCount(), 0);
});

test("Home owner source wiring gives both panels one state writer and live context", () => {
  const app = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
  const homeSource = readFileSync(new URL("../src/components/task-app/home-page.tsx", import.meta.url), "utf8");
  const providerSource = readFileSync(new URL("../src/components/task-app/home-todo-state-provider.tsx", import.meta.url), "utf8");
  const hookSource = readFileSync(new URL("../src/hooks/useHomeTodoState.ts", import.meta.url), "utf8");

  assert.equal((app.match(/<HomeTodoStateProvider\b/g) ?? []).length, 1);
  assert.match(app, /<HomeTodoStateProvider userId=\{isMasterPanelPageActive\("Home"\) \? currentUserId : null\}>[\s\S]*splitPanels\.leftTab\.destination\.page[\s\S]*splitPanels\.rightTab\.destination\.page/);
  assert.equal((providerSource.match(/useHomeTodoState\(userId\)/g) ?? []).length, 1);
  assert.match(providerSource, /HomeTodoStateContext\.Provider value=\{controller\}/);
  assert.match(homeSource, /useHomeTodoStateController\(\)/);
  assert.match(hookSource, /createChannel: \(\) => client\.channel\(`adhdice_home_todo_state:\$\{userId\}:\$\{createBrowserUuidV4\(\)\}`\)/);
  assert.match(hookSource, /ownerGenerationRef\.current !== ownerGeneration/);
  assert.match(hookSource, /table: "adhdice_home_todo_state"/);
  assert.match(hookSource, /if \(dirtyRef\.current\) void flush\(ownerGeneration\);/);
});

test("On-Time and Home hooks retain fixed topics, filters, handlers, flush, and status behavior", () => {
  const onTimeSource = readFileSync(new URL("../src/hooks/useOnTimePlan.ts", import.meta.url), "utf8");
  const homeSource = readFileSync(new URL("../src/hooks/useHomeTodoState.ts", import.meta.url), "utf8");
  const lifecycleSource = readFileSync(new URL("../src/lib/realtime-channel-lifecycle.ts", import.meta.url), "utf8");

  assert.match(lifecycleSource, /await previousRemoval;[\s\S]*if \(!active\) return;[\s\S]*const nextChannel = createChannel\(\);/);
  assert.match(onTimeSource, /startSerializedRealtimeChannel/);
  assert.match(onTimeSource, /adhdice_on_time_plans:\$\{userId\}/);
  assert.match(onTimeSource, /table: "adhdice_on_time_plans"/);
  assert.match(onTimeSource, /filter: `user_id=eq\.\$\{userId\}`/);
  assert.match(onTimeSource, /if \(row\.plan_state\) applyRemote/);
  assert.match(onTimeSource, /status === "CHANNEL_ERROR" \|\| status === "TIMED_OUT"/);
  assert.match(onTimeSource, /if \(dirtyRef\.current\) void flush\(\);\s*stopRealtimeChannel\(\);/);
  assert.doesNotMatch(onTimeSource, /removeChannel\(channelRef\.current\)/);

  assert.match(homeSource, /startSerializedRealtimeChannel/);
  assert.match(homeSource, /adhdice_home_todo_state:\$\{userId\}:\$\{createBrowserUuidV4\(\)\}/);
  assert.match(homeSource, /table: "adhdice_home_todo_state"/);
  assert.match(homeSource, /filter: `user_id=eq\.\$\{userId\}`/);
  assert.match(homeSource, /if \(row\.state\) applyRemote/);
  assert.match(homeSource, /if \(dirtyRef\.current\) void flush\(ownerGeneration\);\s*ownerGenerationRef\.current \+= 1;\s*stopRealtimeChannel\(\);/);
  assert.match(homeSource, /schemaVersion: 8/);
  assert.doesNotMatch(homeSource, /removeChannel\(channelRef\.current\)/);

  assert.equal((onTimeSource.match(/createBrowserSupabaseClient\(\)/g) ?? []).length, 2);
  assert.equal((homeSource.match(/createBrowserSupabaseClient\(\)/g) ?? []).length, 2);
});
