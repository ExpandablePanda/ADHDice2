type MutableRef<T> = { current: T };

type RealtimeChannelLifecycleOptions<TChannel> = {
  channelRef: MutableRef<TChannel | null>;
  channelRemovalPromiseRef: MutableRef<Promise<void> | null>;
  createChannel: () => TChannel;
  subscribe: (channel: TChannel) => void;
  removeChannel: (channel: TChannel) => Promise<unknown>;
};

export function removeOwnedRealtimeChannel<TChannel>({
  channel,
  channelRef,
  channelRemovalPromiseRef,
  removeChannel,
}: {
  channel: TChannel;
  channelRef: MutableRef<TChannel | null>;
  channelRemovalPromiseRef: MutableRef<Promise<void> | null>;
  removeChannel: (channel: TChannel) => Promise<unknown>;
}) {
  if (channelRef.current === channel) {
    channelRef.current = null;
  }

  let removalResult: Promise<unknown>;
  try {
    removalResult = removeChannel(channel);
  } catch {
    removalResult = Promise.resolve();
  }
  const removalPromise = removalResult.then(() => undefined, () => undefined);
  channelRemovalPromiseRef.current = removalPromise;
  return removalPromise;
}

export function startSerializedRealtimeChannel<TChannel>({
  channelRef,
  channelRemovalPromiseRef,
  createChannel,
  subscribe,
  removeChannel,
}: RealtimeChannelLifecycleOptions<TChannel>) {
  let active = true;
  let ownedChannel: TChannel | null = null;
  let cleanedUp = false;
  const previousRemoval = channelRemovalPromiseRef.current ?? Promise.resolve();

  void (async () => {
    await previousRemoval;
    if (!active) return;

    const nextChannel = createChannel();
    if (!active) {
      removeOwnedRealtimeChannel({ channel: nextChannel, channelRef, channelRemovalPromiseRef, removeChannel });
      return;
    }

    ownedChannel = nextChannel;
    channelRef.current = nextChannel;
    subscribe(nextChannel);
    if (channelRemovalPromiseRef.current === previousRemoval) {
      channelRemovalPromiseRef.current = null;
    }
  })();

  return () => {
    if (cleanedUp) return;
    cleanedUp = true;
    active = false;
    if (ownedChannel) {
      removeOwnedRealtimeChannel({ channel: ownedChannel, channelRef, channelRemovalPromiseRef, removeChannel });
    }
  };
}
