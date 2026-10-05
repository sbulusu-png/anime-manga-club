"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type SubmitEvent, useState } from "react";

import { PASSWORD_MIN, authClient, authErrorMessage } from "@/lib/auth-client";

import { FormAlert, PasswordField, SubmitButton, TextField } from "./fields";

/**
 * Asks for a reset link. The reply is the same whether or not the email belongs to a
 * member, so this page can't be used to find out who's in the club.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Enter an email address like name@example.com.");
      return;
    }
    setPending(true);
    setError(null);
    const { error: failure } = await authClient.requestPasswordReset({
      email: address,
      redirectTo: "/reset-password",
    });
    setPending(false);
    if (failure) {
      setError(authErrorMessage(failure));
      return;
    }
    setSentTo(address);
  }

  if (sentTo) {
    return (
      <div role="status" className="flex flex-col gap-3 text-center">
        <p className="text-5xl" aria-hidden="true">
          🔑
        </p>
        <h2 className="text-xl font-bold">Check your inbox</h2>
        <p className="text-muted">
          If <strong className="text-ink">{sentTo}</strong> belongs to a member, a link to choose a
          new password is on its way. It works for 1 hour.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-5" noValidate>
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          setError(null);
        }}
        error={error}
      />
      <SubmitButton pending={pending} pendingLabel="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  );
}

/** Choose a new password, using the token from the emailed link. */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [done, setDone] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < PASSWORD_MIN) {
      setErrors({ password: `Use at least ${String(PASSWORD_MIN)} characters.` });
      return;
    }
    if (password !== confirm) {
      setErrors({ confirm: "The two passwords don't match." });
      return;
    }
    setPending(true);
    setErrors({});
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setPending(false);
    if (error) {
      const message = authErrorMessage(error);
      setErrors(error.code?.startsWith("PASSWORD") ? { password: message } : { form: message });
      return;
    }
    setDone(true);
    // Every session was revoked, including this browser's: redraw the header signed out.
    router.refresh();
  }

  if (done) {
    return (
      <div role="status" className="flex flex-col gap-3 text-center">
        <p className="text-5xl" aria-hidden="true">
          ✅
        </p>
        <h2 className="text-xl font-bold">Password changed</h2>
        <p className="text-muted">
          For your safety we&apos;ve signed you out on every device. Sign in with your new password.
        </p>
        <Link
          href="/sign-in"
          className="btn-comic mx-auto mt-2 rounded-full bg-accent px-6 py-3 font-semibold text-accent-ink"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-5" noValidate>
      {errors.form && <FormAlert tone="error">{errors.form}</FormAlert>}
      <PasswordField
        label="New password"
        name="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
          setErrors({});
        }}
        hint={`At least ${String(PASSWORD_MIN)} characters.`}
        error={errors.password}
      />
      <PasswordField
        label="Confirm new password"
        name="confirm"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(event) => {
          setConfirm(event.target.value);
          setErrors({});
        }}
        error={errors.confirm}
      />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save new password
      </SubmitButton>
    </form>
  );
}
