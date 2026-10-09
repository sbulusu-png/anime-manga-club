import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard, Divider, TEXT_LINK } from "@/components/auth/auth-card";
import { FormAlert } from "@/components/auth/fields";
import { GoogleButton } from "@/components/auth/google-button";
import { SignInForm } from "@/components/auth/sign-in-form";
import { safeNext, verifySignInHref } from "@/lib/safe-next";
import { type SearchParams, param } from "@/lib/search-params";
import { getCurrentUser, isSignInPending } from "@/lib/server-api";

export const metadata: Metadata = { title: "Sign in" };

/** Errors Better Auth sends back here when a Google sign-in doesn't work out. */
function googleError(code: string): string {
  switch (code) {
    case "access_denied":
      return "Google sign-in was cancelled. You can try again, or use your email instead.";
    case "account_not_linked":
      return "That Google account's email already has a club account. Sign in with your password instead.";
    case "EMAIL_NOT_ALLOWED":
      return "That Google account isn't a university one. Use your university Google account.";
    case "banned":
      return "This account has been suspended. Contact a club lead if you think it's a mistake.";
    default:
      return "Google sign-in didn't work. Please try again.";
  }
}

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await getCurrentUser()) redirect(next as Route);
  if (await isSignInPending()) redirect(verifySignInHref(next));
  const error = param(params.error);
  const signUpHref = next === "/" ? "/sign-up" : `/sign-up?next=${encodeURIComponent(next)}`;

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in with your university account to review, like and keep your list."
      footer={
        <>
          New to the club?{" "}
          <Link href={signUpHref as Route} className={TEXT_LINK}>
            Create an account
          </Link>
        </>
      }
    >
      {error && (
        <div className="mb-5">
          <FormAlert tone="error">{googleError(error)}</FormAlert>
        </div>
      )}
      <GoogleButton next={next} label="Continue with Google" />
      <Divider />
      <SignInForm next={next} />
    </AuthCard>
  );
}
