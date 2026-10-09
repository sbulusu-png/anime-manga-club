"use client";

import Image from "next/image";
import Link from "next/link";
import { type SubmitEvent, useId, useState } from "react";

import { refreshAfterListImport } from "@/app/actions";
import { FormAlert, SubmitButton } from "@/components/auth/fields";
import { apiSend } from "@/lib/api-client";
import { statusLabel } from "@/lib/list";
import type { ListStatus, MediaSummary } from "@/lib/types";

const STATUSES: ListStatus[] = ["completed", "current", "paused", "dropped"];
const MAX_LINES = 50;
const KIND: Record<MediaSummary["kind"], string> = {
  anime: "Anime",
  manga: "Manga",
  manhwa: "Manhwa",
  manhua: "Manhua",
};

interface Match {
  query: string;
  matches: MediaSummary[];
}

const describe = (m: MediaSummary) =>
  `${m.title.display} (${KIND[m.kind]}${m.year ? `, ${String(m.year)}` : ""})`;

/**
 * Add titles by typing them, one per line, in English or Japanese. Matches are shown
 * for checking (pick another or skip a line) before anything is saved.
 */
export function TypeListForm() {
  const textId = useId();
  const statusId = useId();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<ListStatus>("completed");
  const [results, setResults] = useState<Match[] | null>(null);
  // The chosen title for each line (by query), or null to skip it.
  const [chosen, setChosen] = useState<Record<string, number | null>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  async function find(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lines.length === 0) {
      setError("Type at least one title, one per line.");
      return;
    }
    if (lines.length > MAX_LINES) {
      setError(`That's ${String(lines.length)} lines: add up to ${String(MAX_LINES)} at a time.`);
      return;
    }
    setPending(true);
    setError(null);
    const result = await apiSend<{ results: Match[] }>("POST", "/api/list/match", {
      titles: lines,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setResults(result.data.results);
    setChosen(
      Object.fromEntries(result.data.results.map((r) => [r.query, r.matches[0]?.id ?? null])),
    );
  }

  // Unique: "Attack on Titan" and "Shingeki no Kyojin" are the same title.
  const picks = [...new Set(Object.values(chosen).filter((id): id is number => id !== null))];

  async function add() {
    setPending(true);
    setError(null);
    const result = await apiSend<{ saved: number }>("POST", "/api/list/bulk", {
      items: picks.map((mediaId) => ({ mediaId, status })),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSaved(result.data.saved);
    void refreshAfterListImport();
  }

  function startOver() {
    setResults(null);
    setChosen({});
    setSaved(null);
    setError(null);
  }

  if (saved !== null) {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert tone="info">
          Added {saved} {saved === 1 ? "title" : "titles"} to your list. Your suggestions now use
          them.{" "}
          <Link href="/for-you" className="font-semibold text-link underline">
            See your suggestions
          </Link>
        </FormAlert>
        <button
          type="button"
          onClick={() => {
            setText("");
            startOver();
          }}
          className="self-start rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2"
        >
          Add more
        </button>
      </div>
    );
  }

  if (results) {
    return (
      <div className="flex flex-col gap-4">
        {error ? <FormAlert tone="error">{error}</FormAlert> : null}
        <p className="text-sm text-muted">
          Check the matches: pick another version if one&apos;s wrong, or skip a line.
        </p>
        <ul className="flex flex-col gap-3">
          {results.map((r, i) => {
            const pick = r.matches.find((m) => m.id === chosen[r.query]);
            const selectId = `${statusId}-line-${String(i)}`;
            return (
              <li key={r.query} className="flex items-center gap-3">
                <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md bg-surface-2">
                  {pick?.coverImageUrl ? (
                    <Image
                      src={pick.coverImageUrl}
                      alt=""
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {r.matches.length === 0 ? (
                    <>
                      <p className="truncate text-xs text-muted">
                        You typed &ldquo;{r.query}&rdquo;
                      </p>
                      <p className="text-sm font-semibold text-accent-text">No match found</p>
                    </>
                  ) : (
                    <>
                      <label htmlFor={selectId} className="truncate text-xs text-muted">
                        You typed &ldquo;{r.query}&rdquo;
                      </label>
                      <select
                        id={selectId}
                        value={chosen[r.query] ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          setChosen((c) => ({ ...c, [r.query]: value ? Number(value) : null }));
                        }}
                        className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-focus"
                      >
                        {r.matches.map((m) => (
                          <option key={m.id} value={m.id}>
                            {describe(m)}
                          </option>
                        ))}
                        <option value="">Skip this one</option>
                      </select>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || picks.length === 0}
            onClick={() => void add()}
            className="btn-comic rounded-full bg-accent px-6 py-3 font-semibold text-accent-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending
              ? "Adding…"
              : `Add ${String(picks.length)} ${picks.length === 1 ? "title" : "titles"} as ${statusLabel(status, "anime").toLowerCase()}`}
          </button>
          <button
            type="button"
            onClick={startOver}
            className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2"
          >
            Edit the list
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void find(event)} className="flex flex-col gap-4" noValidate>
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={textId} className="text-sm font-semibold">
          Your titles, one per line
        </label>
        <textarea
          id={textId}
          value={text}
          rows={7}
          onChange={(event) => {
            setText(event.target.value);
          }}
          placeholder={"Attack on Titan\nShingeki no Kyojin works too\nSolo Leveling\nFrieren"}
          className="w-full resize-y rounded-xl border border-border bg-bg px-4 py-3 text-base text-ink placeholder:text-muted focus:border-focus"
        />
        <p className="text-xs text-muted">
          English or Japanese names, anime or manga. Up to {MAX_LINES} at a time
          {lines.length > 0 ? ` (${String(lines.length)} so far)` : ""}.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={statusId} className="text-sm font-semibold">
          Add them as
        </label>
        <select
          id={statusId}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as ListStatus);
          }}
          className="w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-ink focus:border-focus sm:w-56"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s, "anime")}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton pending={pending} pendingLabel="Finding your titles…">
        Find titles
      </SubmitButton>
    </form>
  );
}
