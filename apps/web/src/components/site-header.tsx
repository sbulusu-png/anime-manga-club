import Link from "next/link";

import { getCurrentUser } from "@/lib/server-api";

import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { UsernameNudge } from "./username-nudge";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="relative mx-auto flex h-18 max-w-6xl items-center gap-4 px-4">
        <Link
          href="/"
          className="whitespace-nowrap font-display text-2xl leading-none tracking-wide text-ink [text-shadow:2px_2px_0_var(--accent)] sm:text-3xl"
        >
          Anime Manga Club
        </Link>

        <div className="lg:ml-6">
          <NavLinks />
        </div>

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <UserMenu user={user} />
          ) : (
            <Link
              href="/sign-in"
              className="hidden whitespace-nowrap rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-ink hover:brightness-110 sm:inline-block"
            >
              Sign in
            </Link>
          )}
          <ThemeToggle />
          <MobileNav
            signedIn={Boolean(user)}
            username={user?.username ?? null}
            isAdmin={user?.role === "admin"}
          />
        </div>
      </div>
      {user && !user.username ? <UsernameNudge /> : null}
    </header>
  );
}
