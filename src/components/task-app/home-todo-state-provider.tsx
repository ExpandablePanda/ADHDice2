"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useHomeTodoState } from "@/hooks/useHomeTodoState";

type HomeTodoStateController = ReturnType<typeof useHomeTodoState>;

const HomeTodoStateContext = createContext<HomeTodoStateController | null>(null);

export function HomeTodoStateProvider({
  children,
  userId,
}: {
  children: ReactNode;
  userId: string | null;
}) {
  const controller = useHomeTodoState(userId);

  return (
    <HomeTodoStateContext.Provider value={controller}>
      {children}
    </HomeTodoStateContext.Provider>
  );
}

export function useHomeTodoStateController() {
  const controller = useContext(HomeTodoStateContext);
  if (!controller) {
    throw new Error("Home Todo state must be read inside HomeTodoStateProvider.");
  }
  return controller;
}
