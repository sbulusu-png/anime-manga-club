import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/forgot-password-form";
import { type SearchParams, param } from "@/lib/search-params";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const token = param(params.token);

  // Better Auth sends ?error=INVALID_TOKEN for expired or used links.
  if (!token || param(params.error)) {
    return (
      <AuthCard
        title="Link expired"
        description="This reset link has expired or was already used. Links work for 1 hour and only once."
      >
        <Link
          href="/forgot-password"
          className="btn-comic block rounded-full bg-accent px-6 py-3 text-center font-semibold text-accent-ink"
        >
          Send a new link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="New password" description="Choose a new password for your account.">
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
