import type { Route } from "next";

export interface NavItem {
  href: Route;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/browse", label: "Browse" },
  { href: "/reviews", label: "Reviews" },
  { href: "/club", label: "Club suggestions" },
  { href: "/for-you", label: "For you" },
];

/** A nav item is active on its own page and any page below it. */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
