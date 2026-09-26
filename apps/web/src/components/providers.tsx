"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

/** Client-side context for the whole app. Themes follow the OS until a member picks one. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
