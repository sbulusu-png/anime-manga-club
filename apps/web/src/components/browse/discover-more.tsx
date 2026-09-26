"use client";

import { useState } from "react";

import { RESULTS_GRID } from "@/lib/browse";
import type { MediaSummary } from "@/lib/types";

import { MediaCard } from "../media-card";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; items: MediaSummary[] }
  | { status: "error"; message: string };

/**
 * The club's catalog only has titles someone has looked at. This asks AniList for more
 * matches and adds them, so the next search finds them straight away.
 */
export function DiscoverMore({
  q,
  type,
  knownIds,
}: {
  q: string;
  type: "anime" | "manga" | null;
  knownIds: number[];
}) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function discover() {
    setState({ status: "loading" });
    const params = new URLSearchParams({ q });
    if (type) params.set("type", type);
    try {
      const res = await fetch(`/api/media/discover?${params.toString()}`);
      if (res.status === 429) {
        setState({ status: "error", message: "That's a lot of searching! Try again in a minute." });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const { items } = (await res.json()) as { items: MediaSummary[] };
      const known = new Set(knownIds);
      setState({ status: "done", items: items.filter((m) => !known.has(m.id)) });
    } catch {
      setState({
        status: "error",
        message: "AniList didn't answer. Please try again in a moment.",
      });
    }
  }

  if (state.status === "done") {
    return (
      <section aria-labelledby="discover-heading" className="flex flex-col gap-4">
        <h2 id="discover-heading" className="font-display text-3xl tracking-wide">
          More from AniList
        </h2>
        {state.items.length === 0 ? (
          <p role="status" className="text-muted">
            AniList has nothing else matching &ldquo;{q}&rdquo;.
          </p>
        ) : (
          <ul className={RESULTS_GRID}>
            {state.items.map((media) => (
              <li key={media.id} className="card-in">
                <MediaCard media={media} />
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-8 text-center">
      <p className="text-muted">
        Can&apos;t find what you&apos;re looking for? The club&apos;s catalog grows as members
        search.
      </p>
      <button
        type="button"
        onClick={() => void discover()}
        disabled={state.status === "loading"}
        className="rounded-full bg-accent px-6 py-2.5 font-semibold text-accent-ink hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
      >
        {state.status === "loading" ? "Searching AniList…" : `Search AniList for “${q}”`}
      </button>
      <p role="status" className="min-h-5 text-sm font-semibold text-accent-text">
        {state.status === "error" ? state.message : ""}
      </p>
    </div>
  );
}
