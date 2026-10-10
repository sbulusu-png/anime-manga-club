"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { refreshAfterClubVerdict } from "@/app/actions";
import { apiSend } from "@/lib/api-client";
import { RATINGS, RATING_INFO, type Rating } from "@/lib/rating";

import { FormAlert } from "../auth/fields";
import { VerdictDot } from "../verdict-badge";

/** For club leads: give the club verdict on a title, change it, or take it back. */
export function ClubVerdictEditor({
  mediaId,
  current,
}: {
  mediaId: number;
  current: Rating | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Rating | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(verdict: Rating | null) {
    setPending(verdict ?? "remove");
    setError(null);
    const path = `/api/media/${String(mediaId)}/club-verdict` as const;
    const result = verdict
      ? await apiSend("PUT", path, { verdict })
      : await apiSend("DELETE", path);
    if (!result.ok) {
      setPending(null);
      setError(result.message);
      return;
    }
    await refreshAfterClubVerdict(mediaId);
    router.refresh();
    setPending(null);
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <p className="text-sm font-semibold">
        {current ? "Change the club verdict" : "Give the club verdict"}
        <span className="font-normal text-muted"> (club leads only)</span>
      </p>
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      <div className="grid grid-cols-2 gap-2">
        {RATINGS.map((value) => {
          const info = RATING_INFO[value];
          const active = current === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              disabled={pending !== null}
              onClick={() => void save(value)}
              className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-bold disabled:cursor-wait disabled:opacity-70 ${
                active
                  ? `${info.soft} ${info.text} border-current`
                  : "border-border hover:bg-surface-2"
              }`}
            >
              <VerdictDot rating={value} className="size-3.5" />
              {pending === value ? "Saving…" : info.label}
            </button>
          );
        })}
      </div>
      {current ? (
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => void save(null)}
          className="self-start text-sm font-semibold text-muted underline-offset-4 hover:text-ink hover:underline disabled:cursor-wait"
        >
          {pending === "remove" ? "Removing…" : "Remove the club verdict"}
        </button>
      ) : null}
    </div>
  );
}
