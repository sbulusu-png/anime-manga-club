"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Reminds members who joined with Google to pick a username (except on that page). */
export function UsernameNudge() {
  const pathname = usePathname();
  if (pathname === "/welcome") return null;

  return (
    <p className="border-t border-border bg-accent-soft px-4 py-2 text-center text-sm">
      Almost there! Pick a username so the club knows who you are.{" "}
      <Link href="/welcome" className="font-semibold text-link underline underline-offset-4">
        Choose one
      </Link>
    </p>
  );
}
