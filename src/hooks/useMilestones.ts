"use client";

import { useEffect, useMemo, useState } from "react";

export type MilestoneRecord = {
  collectedAt: string | null;
  createdAt: string;
  icon: string;
  id: string;
  note: string;
  title: string;
};

const MILESTONES_STORAGE_KEY = "adhdice-milestones";
const DEFAULT_MILESTONE_ICONS = ["*", "!", "+", "#"];

function storageKey(userId: string) {
  return `${MILESTONES_STORAGE_KEY}:${userId}`;
}

function emptyMilestones() {
  return [] as MilestoneRecord[];
}

function normalizeMilestone(value: Partial<MilestoneRecord>): MilestoneRecord | null {
  if (typeof value.id !== "string" || typeof value.title !== "string" || value.title.trim().length === 0) {
    return null;
  }

  return {
    collectedAt: typeof value.collectedAt === "string" ? value.collectedAt : null,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    icon: typeof value.icon === "string" && value.icon.trim().length > 0 ? value.icon.trim().slice(0, 2) : "*",
    id: value.id,
    note: typeof value.note === "string" ? value.note : "",
    title: value.title.trim(),
  };
}

function readStoredMilestones(userId: string) {
  if (typeof window === "undefined") {
    return emptyMilestones();
  }

  const rawValue = window.localStorage.getItem(storageKey(userId));
  if (!rawValue) {
    return emptyMilestones();
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      window.localStorage.removeItem(storageKey(userId));
      return emptyMilestones();
    }
    return parsed.flatMap((entry) => {
      const normalized = normalizeMilestone(entry as Partial<MilestoneRecord>);
      return normalized ? [normalized] : [];
    });
  } catch {
    window.localStorage.removeItem(storageKey(userId));
    return emptyMilestones();
  }
}

function persistMilestones(userId: string, milestones: MilestoneRecord[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(storageKey(userId), JSON.stringify(milestones));
}

export function useMilestones(userId: string | null) {
  const currentUserId = userId ?? "local";
  const [milestones, setMilestones] = useState<MilestoneRecord[]>(() => readStoredMilestones(currentUserId));

  useEffect(() => {
    setMilestones(readStoredMilestones(currentUserId));
  }, [currentUserId]);

  const sortedMilestones = useMemo(
    () => [...milestones].sort((left, right) => {
      if (Boolean(left.collectedAt) !== Boolean(right.collectedAt)) {
        return left.collectedAt ? 1 : -1;
      }
      return right.createdAt.localeCompare(left.createdAt);
    }),
    [milestones],
  );

  function commit(nextMilestones: MilestoneRecord[]) {
    setMilestones(nextMilestones);
    persistMilestones(currentUserId, nextMilestones);
  }

  function createMilestone(draft: { icon?: string; note?: string; title: string }) {
    const title = draft.title.trim();
    if (!title) {
      return false;
    }
    const createdAt = new Date().toISOString();
    const nextMilestone: MilestoneRecord = {
      collectedAt: null,
      createdAt,
      icon: draft.icon?.trim().slice(0, 2) || (DEFAULT_MILESTONE_ICONS[milestones.length % DEFAULT_MILESTONE_ICONS.length] ?? "*"),
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${createdAt}-${Math.random().toString(36).slice(2)}`,
      note: draft.note?.trim() ?? "",
      title,
    };
    commit([nextMilestone, ...milestones]);
    return true;
  }

  function toggleCollected(id: string) {
    const now = new Date().toISOString();
    commit(milestones.map((milestone) => (
      milestone.id === id
        ? { ...milestone, collectedAt: milestone.collectedAt ? null : now }
        : milestone
    )));
  }

  return {
    createMilestone,
    milestones: sortedMilestones,
    storageMode: "local" as const,
    toggleCollected,
  };
}
