"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type SubmitEvent, useState } from "react";

import { authClient, authErrorMessage } from "@/lib/auth-client";

import { TEXT_LINK } from "./auth-card";
import { FormAlert, PasswordField, SubmitButton, TextField } from "./fields";

/** Email-or-username and password. Unconfirmed emails get a fresh link automatically. */
export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const id = identifier.trim();
    // With a callbackURL, Better Auth's client loads that page itself after signing in
    // (a full load, so the header redraws). A confirmation link resent to an unconfirmed
    // member also ends up there.
    const { data, error: failure } = id.includes("@")
      ? await authClient.signIn.email({ email: id, password, callbackURL: next })
      : await authClient.signIn.username({ username: id, password, callbackURL: next });

    if (failure) {
      setError(authErrorMessage(failure));
      setPending(false);
      return;
    }
    // Keep the button busy while the browser navigates; only step in if it didn't.
    if (!data.redirect) {
      router.replace(next as Route);
      router.refresh();
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-5" noValidate>
      {error && <FormAlert tone="error">{error}</FormAlert>}
      <TextField
        label="Email or username"
        name="identifier"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        value={identifier}
        onChange={(event) => {
          setIdentifier(event.target.value);
        }}
      />
      <div className="flex flex-col gap-2">
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
        <Link href="/forgot-password" className={`self-end text-sm ${TEXT_LINK}`}>
          Forgot your password?
        </Link>
      </div>
      <SubmitButton pending={pending} pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
