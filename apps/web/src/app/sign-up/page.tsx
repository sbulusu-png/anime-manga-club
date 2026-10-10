import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard, Divider, TEXT_LINK } from "@/components/auth/auth-card";
import { GoogleButton } from "@/components/auth/google-button";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { safeNext, signInHref } from "@/lib/safe-next";
import type { SearchParams } from "@/lib/search-params";
import { getCurrentUser } from "@/lib/server-api";

export const metadata: Metadata = { title: "Join the club" };

export default async function SignUpPage({ searchParams }: { searchParams: SearchParams }) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next as Route);

  return (
    <AuthCard
      title="Join the club"
      description="For students and staff: rate what you watch and read, and get suggestions picked for you."
      footer={
        <>
          Already a member?{" "}
          <Link href={signInHref(next)} className={TEXT_LINK}>
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm
        next={next}
        intro={
          <>
            <GoogleButton next={next} label="Sign up with Google" />
            <Divider />
          </>
        }
      />
    </AuthCard>
  );
}
