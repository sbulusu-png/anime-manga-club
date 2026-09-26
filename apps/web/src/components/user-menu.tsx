import type { Route } from "next";
import Link from "next/link";

import type { CurrentUser } from "@/lib/server-api";

import { Avatar } from "./review-card";
import { SignOutButton } from "./sign-out-button";

/**
 * The signed-in member's avatar and name (linking to their profile), a settings link
 * and, on wider screens, sign out.
 */
export function UserMenu({ user }: { user: CurrentUser }) {
  const name = user.displayUsername ?? user.username ?? user.name;
  const profile = (user.username ? `/u/${user.username}` : "/welcome") as Route;

  return (
    <div className="flex items-center gap-1">
      <Link
        href={profile}
        className="flex items-center gap-2 rounded-full p-0.5 pr-1 hover:bg-surface-2 lg:pr-3"
      >
        <Avatar name={name} image={user.image} />
        <span className="hidden max-w-32 truncate text-sm font-semibold lg:inline">{name}</span>
        <span className="sr-only lg:hidden">Your profile</span>
      </Link>
      {user.role === "admin" && (
        <Link
          href="/admin"
          className="hidden rounded-full px-3 py-2 text-sm font-semibold text-accent-text hover:bg-accent-soft sm:inline"
        >
          Club lead
        </Link>
      )}
      <Link
        href="/settings"
        className="hidden rounded-full px-3 py-2 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-ink sm:inline"
      >
        Settings
      </Link>
      <SignOutButton className="hidden whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-60 sm:inline" />
    </div>
  );
}
