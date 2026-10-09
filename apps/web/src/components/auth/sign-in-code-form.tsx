"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { type SubmitEvent, useEffect, useState } from "react";

import { apiSend } from "@/lib/api-client";

import { TEXT_LINK } from "./auth-card";
import { FormAlert, SubmitButton, TextField } from "./fields";

interface Status {
  sent: boolean;
  resendAvailableAt?: string;
  canResend?: boolean;
}

/** Seconds from `now` until `iso`, rounded up, never below zero. */
const secondsUntil = (iso: string | undefined, now: number) =>
  iso ? Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000)) : 0;

/**
 * The second step of signing in: the 6-digit code from the email. Wrong codes say how
 * many tries are left; a new code can be sent after a short wait.
 */
export function SignInCodeForm({ next, initial }: { next: string; initial: Status }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState(initial);
  const [pending, setPending] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The browser's clock, ticking each second; null until hydrated, so the server and the
  // browser draw the same thing first (their clocks would disagree on the countdown).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      setNow(Date.now());
    };
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  const wait = now === null ? null : secondsUntil(status.resendAvailableAt, now);

  async function verify(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const typed = code.replace(/\D/g, "");
    if (typed.length !== 6) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await apiSend("POST", "/api/sign-in-code/verify", { code: typed });
    if (!result.ok) {
      setPending(false);
      setError(result.message);
      return;
    }
    // Keep the button busy while the page changes; refresh redraws the header as signed in.
    router.replace(next as Route);
    router.refresh();
  }

  async function resend() {
    setSending(true);
    setError(null);
    setNotice(null);
    const result = await apiSend<Status>("POST", "/api/sign-in-code/resend");
    setSending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setStatus(result.data);
    setNow(Date.now());
    setCode("");
    setNotice("We've sent a new code. Earlier codes no longer work.");
  }

  async function switchAccount() {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => undefined);
    router.replace("/sign-in");
    router.refresh();
  }

  const canResend = status.canResend !== false;
  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={(event) => void verify(event)} className="flex flex-col gap-5" noValidate>
        {error && <FormAlert tone="error">{error}</FormAlert>}
        {notice && <FormAlert tone="info">{notice}</FormAlert>}
        {status.sent ? (
          <>
            <TextField
              label="Sign-in code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={7}
              placeholder="123456"
              required
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                setError(null);
              }}
            />
            <SubmitButton pending={pending} pendingLabel="Checking…">
              Verify and sign in
            </SubmitButton>
          </>
        ) : null}
      </form>

      <div className="flex flex-col items-center gap-3 text-sm">
        {canResend ? (
          <button
            type="button"
            onClick={() => void resend()}
            disabled={sending || wait !== 0}
            className={
              status.sent
                ? `${TEXT_LINK} disabled:cursor-not-allowed disabled:text-muted disabled:no-underline`
                : "btn-comic w-full rounded-full bg-accent px-6 py-3 text-base font-semibold text-accent-ink disabled:opacity-70"
            }
          >
            {sending
              ? "Sending…"
              : !status.sent
                ? "Email me a code"
                : wait !== null && wait > 0
                  ? `Send a new code in ${String(wait)}s`
                  : "Send a new code"}
          </button>
        ) : (
          <p className="text-muted">No more codes for this sign-in. Sign in again for a new one.</p>
        )}
        <button
          type="button"
          onClick={() => void switchAccount()}
          className="text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          Use a different account
        </button>
      </div>
    </div>
  );
}
