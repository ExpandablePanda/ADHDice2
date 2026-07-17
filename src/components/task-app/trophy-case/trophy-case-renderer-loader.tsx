"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const TrophyGalleryCanvas = dynamic(() => import("./trophy-case-canvas").then((module) => module.TrophyGalleryCanvas).catch(() => {
  const error = new Error("The live trophy renderer module could not load.");
  error.name = "TrophyDynamicImportError";
  throw error;
}), {
  loading: () => <div className="h-full w-full" aria-label="Preparing trophy collection" role="status" />,
  ssr: false,
});

export type TrophyCaseRendererProps = ComponentProps<typeof TrophyGalleryCanvas>;
export function TrophyCaseRendererLoader(props: TrophyCaseRendererProps) { return <TrophyGalleryCanvas {...props} />; }
