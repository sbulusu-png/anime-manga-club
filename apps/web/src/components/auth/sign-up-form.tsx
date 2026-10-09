"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, type SubmitEvent, useState } from "react";

import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  authClient,
  authErrorMessage,
  usernameProblem,
} from "@/lib/auth-client";
import { verifySignInHref } from "@/lib/safe-next";

import { FormAlert, PasswordField, SubmitButton, TextField } from "./fields";
import { ResendVerification } from "./resend-verification";
import { UsernameField } from "./username-field";

type Errors = Partial<Record<"username" | "email" | "password" | "form", string>>;

/**
 * Username, email and password; then "check your inbox" until the email is confirmed.
 * `intro` (the Google button) is shown above the form but not after it's sent.
 */
export function SignUpForm({ next, intro }: { next: string; intro?: ReactNode }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [sentTo, setSentTo] = useState<string | null>(null);

  const callbackURL = `/verify-email?next=${encodeURIComponent(next)}`;

  function validate(): Errors {
    const found: Errors = {};
    const usernameError = usernameProblem(username);
    if (usernameError) found.username = usernameError;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      found.email = "Enter an email address like name@example.com.";
    }
    if (password.length < PASSWORD_MIN) {
      found.password = `Use at least ${String(PASSWORD_MIN)} characters.`;
    }
    return found;
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    const { data, error } = await authClient.signUp.email({
      email: email.trim(),
      password,
      username,
      displayUsername: username,
      // Better Auth needs a name; the username is how members appear anyway.
      name: username,
      callbackURL,
    });
    setPending(false);

    if (error) {
      const message = authErrorMessage(error);
      if (error.code?.startsWith("USERNAME") || error.code === "INVALID_USERNAME") {
        setErrors({ username: message });
      } else if (error.code === "EMAIL_NOT_ALLOWED") {
        setErrors({ email: message });
      } else if (error.code?.startsWith("PASSWORD")) {
        setErrors({ password: message });
      } else {
        setErrors({ form: message });
      }
      return;
    }

    // Without email confirmation (local development), the member is signed in and only
    // needs the code we emailed.
    if (data.token) {
      router.replace(verifySignInHref(next));
      router.refresh();
      return;
    }
    setSentTo(email.trim());
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p className="text-5xl" aria-hidden="true">
          📬
        </p>
        <h2 className="text-xl font-bold">Check your inbox</h2>
        <p className="text-muted">
          We sent a confirmation link to <strong className="text-ink">{sentTo}</strong>. Open it to
          finish creating your account. The link works for 24 hours.
        </p>
        <ResendVerification email={sentTo} callbackURL={callbackURL} />
      </div>
    );
  }

  return (
    <>
      {intro}
      <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-5" noValidate>
        {errors.form && <FormAlert tone="error">{errors.form}</FormAlert>}
        <UsernameField
          value={username}
          onChange={(value) => {
            setUsername(value);
            setErrors((e) => ({ ...e, username: undefined }));
          }}
          error={errors.username}
        />
        <TextField
          label="University email"
          hint="Use your university email address."
          placeholder="you@university.edu"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setErrors((e) => ({ ...e, email: undefined }));
          }}
          error={errors.email}
        />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setErrors((e) => ({ ...e, password: undefined }));
          }}
          hint={`At least ${String(PASSWORD_MIN)} characters. A short phrase is easy to remember and hard to guess.`}
          error={errors.password}
        />
        <SubmitButton pending={pending} pendingLabel="Creating your account…">
          Create account
        </SubmitButton>
      </form>
    </>
  );
}
