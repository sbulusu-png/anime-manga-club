import type { Metadata, Viewport } from "next";
import { Bangers, Inter } from "next/font/google";
import type { ReactNode } from "react";

import { AnimeBackdrop } from "@/components/anime-backdrop";
import { Providers } from "@/components/providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

import "./globals.css";

const bangers = Bangers({ weight: "400", subsets: ["latin"], variable: "--font-bangers" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

// Every page depends on who's signed in (the header reads the session cookie), so
// they're all rendered per request. Saying so up front stops the build from trying to
// pre-render them, which fired API calls at build time and logged "API unreachable".
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Anime Manga Club", template: "%s · Anime Manga Club" },
  description: "Reviews, suggestions and debates from our anime and manga club.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5ff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0a10" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // next-themes sets the theme class before React hydrates, hence the warning suppression.
    // data-scroll-behavior: Next.js turns our smooth scrolling off while it moves to the
    // top of a new page, so you land at the start of it, not wherever the last page was.
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${bangers.variable} ${inter.variable}`}
    >
      <body className="flex min-h-dvh flex-col bg-bg font-sans text-ink antialiased">
        <AnimeBackdrop />
        <Providers>
          <a href="#main" className="skip-link">
            Skip to content
          </a>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
