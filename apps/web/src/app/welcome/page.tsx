import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { ChooseUsernameForm } from "@/components/auth/choose-username-form";
import { USERNAME_MAX } from "@/lib/auth-client";
import { safeNext, welcomeHref } from "@/lib/safe-next";
import type { SearchParams } from "@/lib/search-params";
import { requireSignedIn } from "@/lib/server-api";

export const metadata: Metadata = { title: "Pick a username", robots: { index: false } };

/** "Chaitanya B." becomes "chaitanya_b.", a starting point the member can change. */
function suggestUsername(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_.\s]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .slice(0, USERNAME_MAX);
  return base.length >= 3 ? base : "";
}

export default async function WelcomePage({ searchParams }: { searchParams: SearchParams }) {
  const next = safeNext((await searchParams).next);
  const user = await requireSignedIn(welcomeHref(next));
  if (user.username) redirect(next as Route);

  return (
    <AuthCard
      title="One last step"
      description={`Welcome, ${user.name}! Pick the username the club will know you by.`}
    >
      <ChooseUsernameForm next={next} suggestion={suggestUsername(user.name)} />
    </AuthCard>
  );
}
