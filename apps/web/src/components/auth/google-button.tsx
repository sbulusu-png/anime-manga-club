"use client";

import { useState } from "react";

import { authClient, authErrorMessage } from "@/lib/auth-client";
import { signInHref, welcomeHref } from "@/lib/safe-next";

import { FormAlert } from "./fields";

/**
 * Sends the member to Google and back. New members land on the welcome page to pick a
 * username; returning members go straight to `next`.
 */
export function GoogleButton({ next, label }: { next: string; label: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueWithGoogle() {
    setPending(true);
    setError(null);
    const { error: failure } = await authClient.signIn.social({
      provider: "google",
      callbackURL: next,
      newUserCallbackURL: welcomeHref(next),
      errorCallbackURL: signInHref(next),
    });
    // On success the browser is already on its way to Google.
    if (failure) {
      setError(authErrorMessage(failure));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => void continueWithGoogle()}
        disabled={pending}
        className="flex w-full items-center justify-center gap-3 rounded-full border border-border bg-bg px-6 py-3 font-semibold hover:bg-surface-2 disabled:cursor-wait disabled:opacity-70"
      >
        <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5">
          <path
            fill="#FFC107"
            d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"
          />
          <path
            fill="#FF3D00"
            d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
          />
          <path
            fill="#4CAF50"
            d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
          />
          <path
            fill="#1976D2"
            d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
          />
        </svg>
        {pending ? "Opening Google…" : label}
      </button>
      {error && <FormAlert tone="error">{error}</FormAlert>}
    </div>
  );
}
