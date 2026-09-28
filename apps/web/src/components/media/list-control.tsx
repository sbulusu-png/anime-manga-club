"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";

import { refreshAfterMemberChange } from "@/app/actions";
import { apiSend } from "@/lib/api-client";
import { statusLabel } from "@/lib/list";
import { signInHref } from "@/lib/safe-next";
import type { ListEntry, ListStatus, Viewer } from "@/lib/types";

/** Shown as a 2x2 grid: Watching and Completed on top, Paused and Dropped below. */
const STATUSES: ListStatus[] = ["current", "completed", "paused", "dropped"];

const STEP_BUTTON =
  "grid size-9 place-items-center rounded-full border border-border text-lg font-bold hover:bg-surface-2 disabled:opacity-40";

/**
 * Puts the title on the member's list and tracks how far they are. Every change saves
 * straight away; pressing the selected status again takes the title off the list.
 */
export function ListControl({
  mediaId,
  type,
  total,
  initial,
  viewer,
}: {
  mediaId: number;
  type: "anime" | "manga";
  total: number | null;
  initial: ListEntry | null;
  viewer: Viewer;
}) {
  const pathname = usePathname();
  const [status, setStatus] = useState<ListStatus | null>(initial?.status ?? null);
  const [progress, setProgress] = useState(initial?.progress ?? 0);
  const [draft, setDraft] = useState(String(initial?.progress ?? 0));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const headingId = useId();
  const progressId = useId();
  const unit = type === "anime" ? "Episodes" : "Chapters";

  if (!viewer?.hasUsername) {
    return (
      <Link
        href={viewer ? "/welcome" : signInHref(pathname)}
        className="block rounded-full border border-border px-4 py-2.5 text-center text-sm font-semibold hover:bg-surface-2"
      >
        {viewer ? "Pick a username to keep a list" : "Sign in to add to your list"}
      </Link>
    );
  }

  function fail(text: string) {
    setMessage({ tone: "error", text });
    setDraft(String(progress));
  }

  async function save(nextStatus: ListStatus | null, nextProgress?: number) {
    setPending(true);
    setMessage(null);
    const path = `/api/list/${String(mediaId)}` as const;

    if (nextStatus === null) {
      const result = await apiSend("DELETE", path);
      setPending(false);
      if (!result.ok) {
        fail(result.message);
        return;
      }
      setStatus(null);
      setProgress(0);
      setDraft("0");
      setMessage({ tone: "ok", text: "Removed from your list" });
      void refreshAfterMemberChange(mediaId);
      return;
    }

    const result = await apiSend<{ item: ListEntry }>("PUT", path, {
      status: nextStatus,
      ...(nextProgress !== undefined && { progress: nextProgress }),
    });
    setPending(false);
    if (!result.ok) {
      fail(result.message);
      return;
    }
    // The API fills in progress when a title is marked completed.
    const { item } = result.data;
    setStatus(item.status);
    setProgress(item.progress);
    setDraft(String(item.progress));
    setMessage({ tone: "ok", text: "Saved" });
    void refreshAfterMemberChange(mediaId);
  }

  function commitProgress(value: number) {
    if (!status) return;
    const clamped = Math.max(0, total === null ? value : Math.min(total, value));
    if (clamped === progress) {
      setDraft(String(progress));
      return;
    }
    // Reaching the last episode or chapter finishes it.
    const nextStatus = total !== null && clamped === total ? "completed" : status;
    void save(nextStatus, clamped);
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <p id={headingId} className="text-sm font-semibold">
        On your list
      </p>
      <div role="group" aria-labelledby={headingId} className="grid grid-cols-2 gap-2">
        {STATUSES.map((s) => {
          const selected = status === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={selected}
              disabled={pending}
              onClick={() => {
                void save(selected ? null : s);
              }}
              className={`rounded-xl border px-2 py-2.5 text-sm font-semibold disabled:cursor-wait ${
                selected
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-border bg-bg text-ink hover:bg-surface-2"
              }`}
            >
              {statusLabel(s, type)}
            </button>
          );
        })}
      </div>
      {status ? (
        <p className="-mt-1 text-xs text-muted">
          Tap {statusLabel(status, type)} again to remove it.
        </p>
      ) : null}

      {status === "current" || status === "paused" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={progressId} className="text-sm font-semibold">
            {unit} {type === "anime" ? "watched" : "read"}
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={`One ${unit === "Episodes" ? "episode" : "chapter"} less`}
              disabled={pending || progress <= 0}
              onClick={() => {
                commitProgress(progress - 1);
              }}
              className={STEP_BUTTON}
            >
              −
            </button>
            <input
              id={progressId}
              type="number"
              inputMode="numeric"
              min={0}
              max={total ?? undefined}
              value={draft}
              disabled={pending}
              onChange={(event) => {
                setDraft(event.target.value);
              }}
              onBlur={() => {
                const value = Number.parseInt(draft, 10);
                commitProgress(Number.isNaN(value) ? progress : value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              className="w-20 rounded-xl border border-border bg-bg px-3 py-2 text-center text-sm text-ink focus:border-focus"
            />
            <button
              type="button"
              aria-label={`One ${unit === "Episodes" ? "episode" : "chapter"} more`}
              disabled={pending || (total !== null && progress >= total)}
              onClick={() => {
                commitProgress(progress + 1);
              }}
              className={STEP_BUTTON}
            >
              +
            </button>
            <span className="whitespace-nowrap text-sm text-muted">of {total ?? "?"}</span>
          </div>
        </div>
      ) : null}

      <p
        role="status"
        className={`min-h-5 text-xs font-semibold ${
          message?.tone === "error" ? "text-accent-text" : "text-muted"
        }`}
      >
        {pending ? "Saving…" : (message?.text ?? "")}
      </p>
    </div>
  );
}
