"use client";

import { useEffect, useState } from "react";

import { USERNAME_MAX, authClient, usernameProblem } from "@/lib/auth-client";

import { TextField } from "./fields";

type Availability = { username: string; available: boolean } | null;

/**
 * A username input that checks, as the member types, whether the name is valid and
 * free. The server checks again on submit, so this is only a convenience.
 */
export function UsernameField({
  value,
  onChange,
  error,
  current,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string | null | undefined;
  /** The member's own username (in settings), which is never "taken". */
  current?: string;
}) {
  const isCurrent = value.toLowerCase() === current?.toLowerCase();
  const [checked, setChecked] = useState<Availability>(null);
  // "Too short" isn't worth saying while someone is still typing; bad characters are.
  const [blurred, setBlurred] = useState(false);
  const problem = value ? usernameProblem(value) : null;
  const showProblem = problem && (blurred || !/^[a-zA-Z0-9_.]*$/.test(value)) ? problem : null;

  useEffect(() => {
    if (!value || isCurrent || usernameProblem(value)) return;
    const controller = new AbortController();
    // Wait until typing pauses, so each keystroke doesn't cost a request.
    const timer = setTimeout(() => {
      void authClient
        .isUsernameAvailable({ username: value }, { signal: controller.signal })
        .then(({ data }) => {
          if (data) setChecked({ username: value, available: data.available });
        })
        .catch(() => {
          // Aborted or offline: say nothing, the submit will check anyway.
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, isCurrent]);

  // Only trust a result for exactly what's in the box now.
  const result = isCurrent ? null : checked?.username === value ? checked.available : null;
  const taken = result === false ? "That username is taken. Try another one." : null;

  return (
    <TextField
      label="Username"
      name="username"
      autoComplete="username"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      required
      maxLength={USERNAME_MAX}
      value={value}
      onChange={(event) => {
        onChange(event.target.value.trim());
      }}
      onBlur={() => {
        setBlurred(true);
      }}
      hint={
        isCurrent ? (
          "This is your username now."
        ) : result === true && !error ? (
          <span className="font-semibold text-ink">
            <span aria-hidden="true">✓ </span>@{value.toLowerCase()} is free
          </span>
        ) : (
          "3–20 letters, numbers, dots or underscores. It's how the club sees you."
        )
      }
      error={error ?? showProblem ?? taken}
    />
  );
}
