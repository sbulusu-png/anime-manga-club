"use client";

import Image from "next/image";
import { type SubmitEvent, useEffect, useId, useState } from "react";

import { refreshClubSuggestions } from "@/app/actions";
import { apiSend } from "@/lib/api-client";
import type { ClubSuggestion, MediaSummary, Page } from "@/lib/types";

import { FormAlert } from "../auth/fields";
import { mediaMeta } from "../media-card";
import { SuggestionCard } from "../suggestion-card";

const NOTE_MAX = 500;
const BUTTON =
  "rounded-full px-4 py-2 text-sm font-semibold disabled:cursor-wait disabled:opacity-60";

/** A club lead's editor for one week: find a title, add it with a note, edit or remove picks. */
export function WeekEditor({ weekStart, items }: { weekStart: string; items: ClubSuggestion[] }) {
  async function changed() {
    // The server action sends back the re-rendered page along with clearing the cache.
    await refreshClubSuggestions();
  }

  return (
    <div className="flex flex-col gap-8">
      <AddSuggestion weekStart={weekStart} taken={items.map((s) => s.media.id)} onAdded={changed} />

      <section aria-labelledby="picked" className="flex flex-col gap-4">
        <h2 id="picked" className="text-xl font-bold">
          Picks ({items.length})
        </h2>
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-muted">
            Nothing yet. Search above to add the first pick.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {items.map((suggestion) => (
              <li key={suggestion.id}>
                <SuggestionCard suggestion={suggestion}>
                  <SuggestionControls suggestion={suggestion} onChanged={changed} />
                </SuggestionCard>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AddSuggestion({
  weekStart,
  taken,
  onAdded,
}: {
  weekStart: string;
  taken: number[];
  onAdded: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ query: string; items: MediaSummary[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<MediaSummary | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchId = useId();
  const noteId = useId();
  const term = query.trim();

  // Search the club's catalog as the lead types.
  useEffect(() => {
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(`/api/media?q=${encodeURIComponent(term)}&limit=8`, { signal: controller.signal })
        .then((res) => (res.ok ? (res.json() as Promise<Page<MediaSummary>>) : null))
        .then((page) => {
          setResults({ query: term, items: page?.items ?? [] });
        })
        .catch(() => {
          // Aborted by newer typing, or offline: the next keystroke tries again.
        })
        .finally(() => {
          setSearching(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  async function searchAniList() {
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/media/discover?q=${encodeURIComponent(term)}`);
      if (!res.ok) throw new Error(String(res.status));
      const { items } = (await res.json()) as { items: MediaSummary[] };
      setResults({ query: term, items });
    } catch {
      setError("AniList didn't answer. Please try again in a moment.");
    } finally {
      setSearching(false);
    }
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!picked) return;
    setPending(true);
    setError(null);
    const result = await apiSend("POST", "/api/club/suggestions", {
      mediaId: picked.id,
      weekStart,
      note: note.trim(),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setPicked(null);
    setNote("");
    setQuery("");
    setResults(null);
    await onAdded();
  }

  const shown = results?.query === term ? results.items : [];

  return (
    <section
      aria-labelledby="add-pick"
      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5"
    >
      <h2 id="add-pick" className="text-xl font-bold">
        Add a pick
      </h2>

      {picked ? (
        <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Cover media={picked} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{picked.title.display}</p>
              <p className="text-xs text-muted">{mediaMeta(picked)}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPicked(null);
              }}
              className={`${BUTTON} border border-border hover:bg-surface-2`}
            >
              Change
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={noteId} className="text-sm font-semibold">
              Note for the club <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea
              id={noteId}
              value={note}
              maxLength={NOTE_MAX}
              rows={3}
              placeholder="Why this one, this week?"
              onChange={(event) => {
                setNote(event.target.value);
              }}
              className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-base text-ink placeholder:text-muted focus:border-focus"
            />
            <p className="text-right text-xs text-muted">
              {note.length} / {NOTE_MAX}
            </p>
          </div>
          {error && <FormAlert tone="error">{error}</FormAlert>}
          <button
            type="submit"
            disabled={pending}
            className={`${BUTTON} self-start bg-accent px-6 py-2.5 text-accent-ink`}
          >
            {pending ? "Adding…" : "Add to the week"}
          </button>
        </form>
      ) : (
        <>
          <label htmlFor={searchId} className="text-sm font-semibold">
            Find a title
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            autoComplete="off"
            placeholder="Search anime and manga…"
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            className="w-full rounded-full border border-border bg-bg px-5 py-3 text-base text-ink placeholder:text-muted focus:border-focus"
          />
          <p role="status" className="min-h-5 text-sm text-muted">
            {searching
              ? "Searching…"
              : term.length >= 2 && results?.query === term
                ? `${String(shown.length)} ${shown.length === 1 ? "match" : "matches"}`
                : ""}
          </p>
          {shown.length > 0 && (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {shown.map((media) => {
                const already = taken.includes(media.id);
                return (
                  <li key={media.id} className="flex items-center gap-3 p-2">
                    <Cover media={media} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{media.title.display}</p>
                      <p className="text-xs text-muted">{mediaMeta(media)}</p>
                    </div>
                    <button
                      type="button"
                      disabled={already}
                      onClick={() => {
                        setPicked(media);
                        setError(null);
                      }}
                      className={`${BUTTON} border border-border hover:bg-surface-2 disabled:cursor-not-allowed`}
                    >
                      {already ? "Already picked" : "Pick"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {term.length >= 2 && results?.query === term && !searching && (
            <button
              type="button"
              onClick={() => void searchAniList()}
              className="self-start text-sm font-semibold text-link hover:underline"
            >
              Not here? Search AniList for &ldquo;{term}&rdquo;
            </button>
          )}
          {error && <FormAlert tone="error">{error}</FormAlert>}
        </>
      )}
    </section>
  );
}

function Cover({ media }: { media: MediaSummary }) {
  return (
    <div
      className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md"
      style={{ backgroundColor: media.coverColor ?? "var(--surface-2)" }}
    >
      {media.coverImageUrl && (
        <Image src={media.coverImageUrl} alt="" fill sizes="40px" className="object-cover" />
      )}
    </div>
  );
}

function SuggestionControls({
  suggestion,
  onChanged,
}: {
  suggestion: ClubSuggestion;
  onChanged: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"idle" | "editing" | "removing">("idle");
  const [note, setNote] = useState(suggestion.note ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteId = useId();

  async function run(request: Promise<{ ok: boolean; message?: string }>) {
    setPending(true);
    setError(null);
    const result = await request;
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Something went wrong.");
      return;
    }
    setMode("idle");
    await onChanged();
  }

  if (mode === "editing") {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            apiSend("PATCH", `/api/club/suggestions/${suggestion.id}`, {
              note: note.trim() || null,
            }),
          );
        }}
        className="flex flex-col gap-2"
      >
        <label htmlFor={noteId} className="sr-only">
          Note for {suggestion.media.title.display}
        </label>
        <textarea
          id={noteId}
          value={note}
          maxLength={NOTE_MAX}
          rows={3}
          onChange={(event) => {
            setNote(event.target.value);
          }}
          className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-focus"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className={`${BUTTON} bg-accent text-accent-ink`}
          >
            {pending ? "Saving…" : "Save note"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("idle");
              setNote(suggestion.note ?? "");
            }}
            className={`${BUTTON} border border-border hover:bg-surface-2`}
          >
            Cancel
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm font-semibold text-accent-text">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <div className="mt-auto flex flex-wrap items-center gap-2">
      {mode === "removing" ? (
        <>
          <span className="text-sm font-semibold">Remove this pick?</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => void run(apiSend("DELETE", `/api/club/suggestions/${suggestion.id}`))}
            className={`${BUTTON} bg-accent text-accent-ink`}
          >
            {pending ? "Removing…" : "Remove"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("idle");
            }}
            className={`${BUTTON} border border-border hover:bg-surface-2`}
          >
            Keep
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              setMode("editing");
            }}
            className={`${BUTTON} border border-border hover:bg-surface-2`}
          >
            Edit note
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("removing");
            }}
            className={`${BUTTON} text-accent-text hover:bg-accent-soft`}
          >
            Remove
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="w-full text-sm font-semibold text-accent-text">
          {error}
        </p>
      )}
    </div>
  );
}
