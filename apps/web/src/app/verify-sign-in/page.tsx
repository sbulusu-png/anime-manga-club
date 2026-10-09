import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { SignInCodeForm } from "@/components/auth/sign-in-code-form";
import { safeNext, signInHref } from "@/lib/safe-next";
import type { SearchParams } from "@/lib/search-params";
import { getCurrentUser, getSignInCodeStatus } from "@/lib/server-api";

export const metadata: Metadata = { title: "Enter your code", robots: { index: false } };

/** Every sign-in (password or Google) ends here, until the emailed code is entered. */
export default async function VerifySignInPage({ searchParams }: { searchParams: SearchParams }) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next as Route);
  const status = await getSignInCodeStatus();
  if (!status) redirect(signInHref(next));

  return (
    <AuthCard
      title="Check your email"
      description={
        status.sent ? (
          <>
            We sent a 6-digit code to <strong className="text-ink">{status.email}</strong>. Enter it
            to finish signing in. It works for 10 minutes.
          </>
        ) : (
          <>
            To finish signing in, we&apos;ll email a 6-digit code to{" "}
            <strong className="text-ink">{status.email}</strong>.
          </>
        )
      }
    >
      <SignInCodeForm next={next} initial={status} />
    </AuthCard>
  );
}
