"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { NAV_ITEMS, isActive } from "./nav-items";
import { SignOutButton } from "./sign-out-button";

/** The menu button and panel for narrow screens. Closes on Escape and after navigating. */
export function MobileNav({
  signedIn,
  username,
  isAdmin,
}: {
  signedIn: boolean;
  username: string | null;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Tie "open" to the page it was opened on, so navigating closes it without an effect.
  const open = openOn === pathname;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenOn(null);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpenOn(open ? null : pathname);
        }}
        className="grid size-11 place-items-center rounded-full border border-border text-ink hover:bg-surface-2"
      >
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>

      <nav
        id={panelId}
        aria-label="Main"
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-border bg-surface px-4 pb-6 pt-2 shadow-card"
      >
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-xl px-4 py-3 text-base font-semibold ${
                    active ? "bg-accent text-accent-ink" : "text-ink hover:bg-surface-2"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li className="mt-2 border-t border-border pt-3">
            {signedIn ? (
              <div className="flex flex-col gap-1">
                {username && (
                  <Link
                    href={`/u/${username}`}
                    className="block rounded-xl px-4 py-3 font-semibold text-ink hover:bg-surface-2"
                  >
                    Your profile
                  </Link>
                )}
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="block rounded-xl px-4 py-3 font-semibold text-accent-text hover:bg-surface-2"
                  >
                    Club lead panel
                  </Link>
                )}
                <Link
                  href="/settings"
                  className="block rounded-xl px-4 py-3 font-semibold text-ink hover:bg-surface-2"
                >
                  Settings
                </Link>
                <SignOutButton className="block w-full rounded-xl px-4 py-3 text-left font-semibold text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-60" />
              </div>
            ) : (
              <Link
                href="/sign-in"
                className="block rounded-xl bg-accent px-4 py-3 text-center font-semibold text-accent-ink"
              >
                Sign in
              </Link>
            )}
          </li>
        </ul>
      </nav>
    </div>
  );
}
