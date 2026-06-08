"use client";

import type { User } from "@supabase/supabase-js";

import type { createBrowserSupabaseClient } from "@/lib/supabase";

import { RollPageComponent } from "./roll-page";

type RollPageRouteProps = {
  client: NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
  currentUser: User;
  isDark: boolean;
  onSpendPoints: (delta: number, reason: string) => void;
};

export function RollPageRoute(props: RollPageRouteProps) {
  return <RollPageComponent {...props} />;
}
