import type { Metadata, Route } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { safeNext, signInHref } from "@/lib/safe-next";
import { type SearchParams, param } from "@/lib/search-params";
import { getCurrentUser } from "@/lib/server-api";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

const BUTTON =
  "block rounded-full bg-accent px-6 py-3 text-center font-semibold text-accent-ink hover:brightness-110";

/** Where the confirmation link lands. Better Auth has already signed the member in. */
export default async function VerifyEmailPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNext(params.next);

  if (param(params.error)) {
    return (
      <AuthCard
        title="Link expired"
        description="This confirmation link has expired or was already used. Sign in and we'll email you a fresh one."
      >
        <Link href={signInHref(next)} className={BUTTON}>
          Sign in
        </Link>
      </AuthCard>
    );
  }

  const user = await getCurrentUser();
  return (
    <AuthCard
      title="You're in!"
      description={
        user
          ? `Your email is confirmed. Welcome to the club, ${user.displayUsername ?? user.name}!`
          : "Your email is confirmed. Sign in to get started."
      }
    >
      <Link href={(user ? next : signInHref(next)) as Route} className={BUTTON}>
        {user ? "Let's go" : "Sign in"}
      </Link>
    </AuthCard>
  );
}
