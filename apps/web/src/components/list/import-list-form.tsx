"use client";

import Link from "next/link";
import { type SubmitEvent, useState } from "react";

import { refreshAfterListImport } from "@/app/actions";
import { FormAlert, SubmitButton, TextField } from "@/components/auth/fields";
import { apiSend } from "@/lib/api-client";
import type { ImportSummary } from "@/lib/types";

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** Imports the member's AniList anime and manga lists by AniList username. */
export function ImportListForm({ username }: { username: string }) {
  const [anilistName, setAnilistName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = anilistName.trim();
    if (!/^[A-Za-z0-9]{2,20}$/.test(name)) {
      setError("Enter your AniList username: 2 to 20 letters and numbers.");
      return;
    }
    setPending(true);
    setError(null);
    setSummary(null);
    const result = await apiSend<ImportSummary>("POST", "/api/list/import", {
      source: "anilist",
      username: name,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSummary(result.data);
    void refreshAfterListImport();
  }

  const total = summary ? summary.imported.anime + summary.imported.manga : 0;

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-5" noValidate>
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      {summary ? (
        <FormAlert tone="info">
          {total === 0 ? (
            "Nothing to import: that list has no watching, completed, paused or dropped titles."
          ) : (
            <>
              Imported {plural(summary.imported.anime, "anime", "anime")} and{" "}
              {plural(summary.imported.manga, "manga", "manga")}. Your suggestions now use them.{" "}
              <Link href="/for-you" className="font-semibold text-link underline">
                See your suggestions
              </Link>{" "}
              or{" "}
              <Link href={`/u/${username}?tab=anime`} className="font-semibold text-link underline">
                your list
              </Link>
              .
            </>
          )}
          {summary.skipped.planning + summary.skipped.adult > 0 ? (
            <span className="mt-1 block text-muted">
              Skipped{" "}
              {[
                summary.skipped.planning > 0
                  ? plural(summary.skipped.planning, "planned title", "planned titles")
                  : null,
                summary.skipped.adult > 0
                  ? plural(summary.skipped.adult, "adult title", "adult titles")
                  : null,
              ]
                .filter(Boolean)
                .join(" and ")}
              .
            </span>
          ) : null}
        </FormAlert>
      ) : null}
      <TextField
        label="AniList username"
        name="anilist-username"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        value={anilistName}
        hint="Your list must be public on AniList. Importing again updates what's here."
        onChange={(event) => {
          setAnilistName(event.target.value);
        }}
      />
      <SubmitButton pending={pending} pendingLabel="Importing… this can take a moment">
        Import my list
      </SubmitButton>
    </form>
  );
}
