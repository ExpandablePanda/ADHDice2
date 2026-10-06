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
    onCalls = 0;

    readonly topic: string;

    constructor(topic: string) {
      this.topic = topic;
    }

    on(..._args: unknown[]) {
      void _args;
      if (this.subscribed) throw new Error("cannot add postgres_changes callbacks after subscribe()");
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
        if (channels.get(channel.topic) === channel) channels.delete(channel.topic);
        events.push(`remove:done:${channel.id}`);
      });
    },
    resolveRemoval(channel: MockChannel) {
      pendingRemovals.get(channel)?.resolve();
    },
    events,
    channels,
  };
}

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
  assert.match(homeSource, /adhdice_home_todo_state:\$\{userId\}/);
  assert.match(homeSource, /table: "adhdice_home_todo_state"/);
  assert.match(homeSource, /filter: `user_id=eq\.\$\{userId\}`/);
  assert.match(homeSource, /if \(row\.state\) applyRemote/);
  assert.match(homeSource, /if \(dirtyRef\.current\) void flush\(\);\s*stopRealtimeChannel\(\);/);
  assert.match(homeSource, /schemaVersion: 8/);
  assert.doesNotMatch(homeSource, /removeChannel\(channelRef\.current\)/);

  assert.equal((onTimeSource.match(/createBrowserSupabaseClient\(\)/g) ?? []).length, 2);
  assert.equal((homeSource.match(/createBrowserSupabaseClient\(\)/g) ?? []).length, 2);
});
