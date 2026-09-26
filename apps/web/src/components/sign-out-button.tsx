"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Ends the session, then re-renders the page as a guest. */
export function SignOutButton({ className }: { className: string }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } finally {
      setSigningOut(false);
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={signingOut}
      className={className}
    >
      {signingOut ? "Signing out…" : "Sign out"}
    </button>
  );
}
