import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard, TEXT_LINK } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Forgot your password?" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot it?"
      description="Enter your email and we'll send you a link to choose a new password."
      footer={
        <>
          <p>
            Remembered it?{" "}
            <Link href="/sign-in" className={TEXT_LINK}>
              Back to sign in
            </Link>
          </p>
          <p className="mt-2">Joined with Google? Just use &ldquo;Continue with Google&rdquo;.</p>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
