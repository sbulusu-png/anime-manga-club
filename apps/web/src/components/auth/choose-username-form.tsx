"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { type SubmitEvent, useState } from "react";

import { authClient, authErrorMessage, usernameProblem } from "@/lib/auth-client";

import { SubmitButton } from "./fields";
import { UsernameField } from "./username-field";

/** The last step for members who joined with Google: picking how the club sees them. */
export function ChooseUsernameForm({ next, suggestion }: { next: string; suggestion: string }) {
  const router = useRouter();
  const [username, setUsername] = useState(suggestion);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
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
    if (failure) {
      setError(authErrorMessage(failure));
      setPending(false);
      return;
    }
    router.replace(next as Route);
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-5" noValidate>
      <UsernameField
        value={username}
        onChange={(value) => {
          setUsername(value);
          setError(null);
        }}
        error={error}
      />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        Continue
      </SubmitButton>
    </form>
  );
}
