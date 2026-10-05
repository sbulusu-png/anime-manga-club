"use client";

import { useSyncExternalStore } from "react";

/** False during server rendering and hydration, true once running in the browser. */
export function useHasMounted(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}
