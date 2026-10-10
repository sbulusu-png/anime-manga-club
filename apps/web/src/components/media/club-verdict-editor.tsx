"use client";

import { useRouter } from "next/navigation";
import { type SubmitEvent, useId, useState, useTransition } from "react";

import { refreshAfterClubVerdict } from "@/app/actions";
import { apiSend } from "@/lib/api-client";
import { RATINGS, RATING_INFO, type Rating } from "@/lib/rating";

import { FormAlert } from "../auth/fields";
import { VerdictDot } from "../verdict-badge";

const NOTE_MAX = 1000;

/**
 * For club leads: give the club verdict on a title with a note saying why, change it,
 * or take it back.
 */
export function ClubVerdictEditor({
  mediaId,
  current,
  currentNote,
}: {
  mediaId: number;
  current: Rating | null;
  currentNote: string | null;
}) {
  const router = useRouter();
  const noteId = useId();
  const [choice, setChoice] = useState<Rating | null>(current);
  const [note, setNote] = useState(currentNote ?? "");
  // The action running (or that ran last), so the busy label says the right thing.
  const [action, setAction] = useState<"save" | "remove">("save");
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Busy until the refreshed verdict is on the page, not just until the API answers.
  const [refreshing, startRefresh] = useTransition();
  const busy = requesting || refreshing;

  const path = `/api/media/${String(mediaId)}/club-verdict` as const;
  const unchanged = choice === current && note.trim() === (currentNote ?? "");

  function start(next: "save" | "remove") {
    setAction(next);
    setRequesting(true);
    setError(null);
    setSaved(false);
  }

  async function finish(result: Awaited<ReturnType<typeof apiSend>>) {
    if (!result.ok) {
      setRequesting(false);
      setError(result.message);
      return false;
    }
    await refreshAfterClubVerdict(mediaId);
    startRefresh(() => {
      router.refresh();
    });
    setRequesting(false);
    return true;
  }

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!choice) {
      setError("Pick a verdict first.");
      return;
    }
    start("save");
    if (await finish(await apiSend("PUT", path, { verdict: choice, note }))) setSaved(true);
  }

  async function remove() {
    start("remove");
    if (await finish(await apiSend("DELETE", path))) {
      setChoice(null);
      setNote("");
    }
  }

  return (
    <form
      onSubmit={(event) => void save(event)}
      noValidate
      className="flex flex-col gap-3 border-t border-border pt-3"
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">
          {current ? "Change the club verdict" : "Give the club verdict"}
          <span className="font-normal text-muted"> (club leads only)</span>
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {RATINGS.map((value) => {
            const info = RATING_INFO[value];
            const checked = choice === value;
            return (
              <label
                key={value}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-bold has-focus-visible:outline-3 has-focus-visible:outline-focus ${
                  checked
                    ? `${info.soft} ${info.text} border-current`
                    : "border-border hover:bg-surface-2"
                }`}
              >
                <input
                  type="radio"
                  name={`club-verdict-${String(mediaId)}`}
                  value={value}
                  checked={checked}
                  onChange={() => {
                    setChoice(value);
                    setError(null);
                    setSaved(false);
                  }}
                  className="sr-only"
                />
                <VerdictDot rating={value} className="size-3.5" />
                {info.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={noteId} className="text-sm font-semibold">
          Why this verdict? <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id={noteId}
          value={note}
          rows={3}
          maxLength={NOTE_MAX}
          aria-describedby={`${noteId}-count`}
          placeholder="Tell the club what made you pick it."
          onChange={(event) => {
            setNote(event.target.value);
            setSaved(false);
          }}
          className="w-full resize-y rounded-xl border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-focus"
        />
        <p id={`${noteId}-count`} className="text-right text-xs text-muted">
          {note.length} / {NOTE_MAX}
        </p>
      </div>

      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      {saved && !busy ? <FormAlert tone="info">Saved. The club can see it now.</FormAlert> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || !choice || unchanged}
          className="btn-comic rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy && action === "save" ? "Saving…" : current ? "Save changes" : "Give this verdict"}
        </button>
        {current ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="text-sm font-semibold text-muted underline-offset-4 hover:text-ink hover:underline disabled:cursor-wait"
          >
            {busy && action === "remove" ? "Removing…" : "Remove the club verdict"}
          </button>
        ) : null}
      </div>
    </form>
  );
}
