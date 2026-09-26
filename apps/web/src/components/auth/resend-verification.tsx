"use client";

import { useEffect, useState } from "react";

import { authClient, authErrorMessage } from "@/lib/auth-client";

const COOLDOWN_SECONDS = 30;

/** "Send it again", with a short cooldown so it can't be used to flood an inbox. */
export function ResendVerification({ email, callbackURL }: { email: string; callbackURL: string }) {
  const [wait, setWait] = useState(COOLDOWN_SECONDS);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => {
      setWait((w) => w - 1);
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [wait]);

  async function resend() {
    setPending(true);
    setMessage(null);
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL });
    setPending(false);
    setMessage(error ? authErrorMessage(error) : "Sent! Check your inbox (and the spam folder).");
    setWait(COOLDOWN_SECONDS);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-sm text-muted">Didn&apos;t get it?</p>
      <button
        type="button"
        onClick={() => void resend()}
        disabled={pending || wait > 0}
        className="rounded-full border border-border px-5 py-2 text-sm font-semibold hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sending…" : wait > 0 ? `Send again in ${String(wait)}s` : "Send it again"}
      </button>
      <p role="status" className="min-h-5 text-sm text-muted">
        {message}
      </p>
    </div>
  );
}
