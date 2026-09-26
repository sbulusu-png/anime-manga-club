"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, type SubmitEvent, useId, useState } from "react";

import { refreshAfterMemberChange } from "@/app/actions";
import { apiSend } from "@/lib/api-client";
import { RATINGS, RATING_INFO, type Rating } from "@/lib/rating";
import { signInHref } from "@/lib/safe-next";
import type { Review, Viewer } from "@/lib/types";

import { SpoilerText } from "../spoiler-text";
import { VerdictBadge } from "../verdict-badge";

// Mirrors the API's limits (apps/api/src/routes/reviews.ts).
const BODY_MIN = 10;
const BODY_MAX = 10_000;
const NUMBER = new Intl.NumberFormat("en");

const BUTTON = "rounded-full px-5 py-2.5 font-semibold disabled:cursor-wait disabled:opacity-70";

/**
 * The signed-in member's review of this title: shown when it exists, with Edit and
 * Delete; otherwise (or while editing) a form. Saving refreshes the page, so the club
 * verdict and the reviews list update too.
 */
export function ReviewEditor({
  mediaId,
  mediaTitle,
  initial,
  viewer,
}: {
  mediaId: number;
  mediaTitle: string;
  initial: Review | null;
  viewer: Viewer;
}) {
  const pathname = usePathname();
  const [review, setReview] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!review) return;
    setPending(true);
    setError(null);
    const result = await apiSend("DELETE", `/api/reviews/${review.id}`);
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setReview(null);
    setConfirmingDelete(false);
    // Clearing the cache in a server action also sends back the re-rendered page, so
    // the club verdict and reviews update without a separate router.refresh().
    await refreshAfterMemberChange(mediaId);
  }

  if (!viewer) {
    return (
      <Prompt>
        <Link href={signInHref(pathname)} className="font-semibold text-link hover:underline">
          Sign in
        </Link>{" "}
        to give {mediaTitle} your verdict.
      </Prompt>
    );
  }
  if (!viewer.hasUsername) {
    return (
      <Prompt>
        <Link href="/welcome" className="font-semibold text-link hover:underline">
          Pick a username
        </Link>{" "}
        to start writing reviews.
      </Prompt>
    );
  }

  if (review && !editing) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-muted">You said</p>
          <VerdictBadge rating={review.rating} />
        </div>
        <SpoilerText text={review.body} spoiler={review.hasSpoilers} />
        {confirmingDelete ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold">Delete your review? This can&apos;t be undone.</span>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={pending}
              className={`${BUTTON} bg-accent text-accent-ink`}
            >
              {pending ? "Deleting…" : "Yes, delete it"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(false);
              }}
              className={`${BUTTON} border border-border hover:bg-surface-2`}
            >
              Keep it
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(true);
              }}
              className={`${BUTTON} border border-border hover:bg-surface-2`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingDelete(true);
              }}
              className={`${BUTTON} text-accent-text hover:bg-accent-soft`}
            >
              Delete
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm font-semibold text-accent-text">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <ReviewForm
      key={review?.id ?? "new"}
      mediaId={mediaId}
      existing={review}
      onCancel={
        review
          ? () => {
              setEditing(false);
            }
          : undefined
      }
      onSaved={(saved) => {
        setReview(saved);
        setEditing(false);
        void refreshAfterMemberChange(mediaId);
      }}
    />
  );
}

function Prompt({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-border px-5 py-4 text-muted">
      {children}
    </p>
  );
}

function ReviewForm({
  mediaId,
  existing,
  onCancel,
  onSaved,
}: {
  mediaId: number;
  existing: Review | null;
  onCancel: (() => void) | undefined;
  onSaved: (review: Review) => void;
}) {
  const [rating, setRating] = useState<Rating | null>(existing?.rating ?? null);
  const [body, setBody] = useState(existing?.body ?? "");
  const [spoilers, setSpoilers] = useState(existing?.hasSpoilers ?? false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<{ rating?: string; body?: string; form?: string }>({});
  const bodyId = useId();
  const countId = useId();
  const spoilerId = useId();
  const length = body.trim().length;

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: typeof errors = {};
    if (!rating) found.rating = "Pick a verdict.";
    if (length < BODY_MIN) found.body = `Write at least ${String(BODY_MIN)} characters.`;
    if (length > BODY_MAX) found.body = `Keep it under ${NUMBER.format(BODY_MAX)} characters.`;
    setErrors(found);
    if (Object.keys(found).length > 0 || !rating) return;

    setPending(true);
    const payload = { rating, body, hasSpoilers: spoilers };
    const result = existing
      ? await apiSend<{ item: Review }>("PATCH", `/api/reviews/${existing.id}`, payload)
      : await apiSend<{ item: Review }>("POST", "/api/reviews", { mediaId, ...payload });
    setPending(false);
    if (!result.ok) {
      setErrors({ form: result.message });
      return;
    }
    onSaved(result.data.item);
  }

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      noValidate
      className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5"
    >
      <fieldset aria-describedby={errors.rating ? `${bodyId}-rating-error` : undefined}>
        <legend className="mb-3 font-semibold">How would you rate it?</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {RATINGS.map((value) => {
            const info = RATING_INFO[value];
            const checked = rating === value;
            return (
              <label
                key={value}
                className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 px-3 py-3 text-center has-focus-visible:outline-3 has-focus-visible:outline-focus ${
                  checked
                    ? `${info.soft} ${info.text} border-current`
                    : "border-border hover:bg-surface-2"
                }`}
              >
                <input
                  type="radio"
                  name="rating"
                  value={value}
                  checked={checked}
                  onChange={() => {
                    setRating(value);
                    setErrors((e) => ({ ...e, rating: undefined }));
                  }}
                  className="sr-only"
                />
                <span aria-hidden="true" className="text-2xl">
                  {info.emoji}
                </span>
                <span className="font-bold">{info.label}</span>
                <span className={`text-xs ${checked ? "" : "text-muted"}`}>{info.blurb}</span>
              </label>
            );
          })}
        </div>
        {errors.rating && (
          <p id={`${bodyId}-rating-error`} className="mt-2 text-sm font-semibold text-accent-text">
            {errors.rating}
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={bodyId} className="font-semibold">
          Your review
        </label>
        <textarea
          id={bodyId}
          value={body}
          rows={6}
          maxLength={BODY_MAX}
          aria-invalid={errors.body ? true : undefined}
          aria-describedby={errors.body ? `${countId} ${bodyId}-error` : countId}
          placeholder="What worked for you, and what didn't?"
          onChange={(event) => {
            setBody(event.target.value);
            setErrors((e) => ({ ...e, body: undefined }));
          }}
          className="w-full resize-y rounded-xl border border-border bg-bg px-4 py-3 text-base text-ink placeholder:text-muted focus:border-focus aria-invalid:border-accent-text"
        />
        <p id={countId} className="text-right text-xs text-muted">
          {NUMBER.format(length)} / {NUMBER.format(BODY_MAX)}
        </p>
        {errors.body && (
          <p id={`${bodyId}-error`} className="text-sm font-semibold text-accent-text">
            {errors.body}
          </p>
        )}
      </div>

      <div className="flex items-start gap-3 text-sm">
        <input
          id={spoilerId}
          aria-describedby={`${spoilerId}-hint`}
          type="checkbox"
          checked={spoilers}
          onChange={(event) => {
            setSpoilers(event.target.checked);
          }}
          className="mt-0.5 size-4 accent-accent"
        />
        <div>
          <label htmlFor={spoilerId} className="font-semibold">
            Contains spoilers
          </label>
          <p id={`${spoilerId}-hint`} className="text-muted">
            Your review is blurred until someone chooses to read it.
          </p>
        </div>
      </div>

      {errors.form && (
        <p role="alert" className="text-sm font-semibold text-accent-text">
          {errors.form}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className={`${BUTTON} bg-accent text-accent-ink hover:brightness-110`}
        >
          {pending ? "Saving…" : existing ? "Save changes" : "Post review"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className={`${BUTTON} border border-border hover:bg-surface-2`}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
