"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, type SubmitEvent, useState } from "react";

import { refreshAfterAccountDeleted } from "@/app/actions";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  authClient,
  authErrorMessage,
  usernameProblem,
} from "@/lib/auth-client";

import { FormAlert, PasswordField, SubmitButton, TextField } from "../auth/fields";
import { UsernameField } from "../auth/username-field";

/** A titled settings panel. */
export function SettingsCard({
  title,
  description,
  danger = false,
  children,
}: {
  title: string;
  description?: ReactNode;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`flex flex-col gap-4 rounded-2xl border bg-surface p-5 sm:p-6 ${
        danger ? "border-accent-text/50" : "border-border"
      }`}
    >
      <header>
        <h2 className={`text-lg font-bold ${danger ? "text-accent-text" : ""}`}>{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** Changes the username (their profile address moves with it). */
export function UsernameSettings({ current }: { current: string }) {
  const router = useRouter();
  const [username, setUsername] = useState(current);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const unchanged = username === current;

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (unchanged) return;
    const problem = usernameProblem(username);
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    const { error: failure } = await authClient.updateUser({
      username,
      displayUsername: username,
    });
    setPending(false);
    if (failure) {
      setError(authErrorMessage(failure));
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
      <UsernameField
        current={current}
        value={username}
        onChange={(value) => {
          setUsername(value);
          setError(null);
          setSaved(false);
        }}
        error={error}
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-40">
          <SubmitButton pending={pending} pendingLabel="Saving…">
            Save username
          </SubmitButton>
        </div>
        <p role="status" className="text-sm font-semibold text-muted">
          {saved ? "Saved. Your profile is now at /u/" + username.toLowerCase() : ""}
        </p>
      </div>
    </form>
  );
}

/** Change the password (members who have one); everyone else can add one by email. */
export function PasswordSettings({ hasPassword }: { hasPassword: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<{
    current?: string;
    next?: string;
    confirm?: string;
    form?: string;
  }>({});
  const [done, setDone] = useState(false);

  if (!hasPassword) {
    return (
      <p className="text-sm">
        You sign in with Google, so there&apos;s no password to change here. Want to sign in with
        your email too?{" "}
        <Link href="/forgot-password" className="font-semibold text-link hover:underline">
          Set a password by email
        </Link>
        .
      </p>
    );
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: typeof errors = {};
    if (!current) found.current = "Enter your current password.";
    if (next.length < PASSWORD_MIN) found.next = `Use at least ${String(PASSWORD_MIN)} characters.`;
    else if (next === current) found.next = "Choose a password you haven't been using.";
    if (confirm !== next) found.confirm = "The two passwords don't match.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      // Anyone who knew the old password is signed out; this device stays signed in.
      revokeOtherSessions: true,
    });
    setPending(false);
    if (error) {
      const message = authErrorMessage(error);
      if (error.code === "INVALID_PASSWORD") setErrors({ current: message });
      else if (error.code?.startsWith("PASSWORD")) setErrors({ next: message });
      else setErrors({ form: message });
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setDone(true);
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
      {errors.form && <FormAlert tone="error">{errors.form}</FormAlert>}
      {done && (
        <FormAlert tone="info">Password changed. Every other device has been signed out.</FormAlert>
      )}
      <PasswordField
        label="Current password"
        autoComplete="current-password"
        value={current}
        onChange={(event) => {
          setCurrent(event.target.value);
          setErrors({});
          setDone(false);
        }}
        error={errors.current}
      />
      <PasswordField
        label="New password"
        autoComplete="new-password"
        maxLength={PASSWORD_MAX}
        value={next}
        onChange={(event) => {
          setNext(event.target.value);
          setErrors({});
          setDone(false);
        }}
        hint={`At least ${String(PASSWORD_MIN)} characters.`}
        error={errors.next}
      />
      <PasswordField
        label="Confirm new password"
        autoComplete="new-password"
        value={confirm}
        onChange={(event) => {
          setConfirm(event.target.value);
          setErrors({});
          setDone(false);
        }}
        error={errors.confirm}
      />
      <div className="w-48">
        <SubmitButton pending={pending} pendingLabel="Changing…">
          Change password
        </SubmitButton>
      </div>
    </form>
  );
}

/** Signs out every other browser and device. */
export function SessionSettings() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  async function signOutOthers() {
    setPending(true);
    setMessage(null);
    const { error } = await authClient.revokeOtherSessions();
    setPending(false);
    setMessage(
      error
        ? { tone: "error", text: authErrorMessage(error) }
        : { tone: "info", text: "Done. You're now only signed in here." },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => void signOutOthers()}
        disabled={pending}
        className="self-start rounded-full border border-border px-5 py-2.5 font-semibold hover:bg-surface-2 disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Signing out…" : "Sign out of all other devices"}
      </button>
      {message && <FormAlert tone={message.tone}>{message.text}</FormAlert>}
    </div>
  );
}

/**
 * Deletes the account after the member types their username (and their password, if
 * they have one). The API refuses without the password, too.
 */
export function DeleteAccount({
  username,
  hasPassword,
}: {
  username: string;
  hasPassword: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = typed.trim().toLowerCase() === username.toLowerCase();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        className="self-start rounded-full border border-accent-text/60 px-5 py-2.5 font-semibold text-accent-text hover:bg-accent-soft"
      >
        Delete my account…
      </button>
    );
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed || (hasPassword && !password)) return;
    setPending(true);
    setError(null);
    const { error: failure } = await authClient.deleteUser(hasPassword ? { password } : {});
    if (failure) {
      setPending(false);
      setError(authErrorMessage(failure));
      return;
    }
    await refreshAfterAccountDeleted(username);
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
      <FormAlert tone="error">
        This deletes your account, reviews, likes and lists for good. It can&apos;t be undone.
      </FormAlert>
      <TextField
        label={`Type your username (${username}) to confirm`}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={typed}
        onChange={(event) => {
          setTyped(event.target.value);
        }}
      />
      {hasPassword && (
        <PasswordField
          label="Your password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
        />
      )}
      {error && <FormAlert tone="error">{error}</FormAlert>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending || !confirmed || (hasPassword && !password)}
          className="btn-comic rounded-full bg-accent px-5 py-2.5 font-semibold text-accent-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Delete my account forever"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTyped("");
            setPassword("");
            setError(null);
          }}
          className="rounded-full border border-border px-5 py-2.5 font-semibold hover:bg-surface-2"
        >
          Keep my account
        </button>
      </div>
    </form>
  );
}
