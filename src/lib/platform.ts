"use client";

import { Capacitor } from "@capacitor/core";
import { useSyncExternalStore } from "react";

export function getNativeIosPlatformSnapshot() {
  return typeof window !== "undefined" && Capacitor.getPlatform() === "ios";
}

export function getWebPlatformSnapshot() {
  return false;
}

function subscribeToPlatformChanges() {
  return () => {};
}

export function useNativeIosPlatform() {
  return useSyncExternalStore(subscribeToPlatformChanges, getNativeIosPlatformSnapshot, getWebPlatformSnapshot);
}
