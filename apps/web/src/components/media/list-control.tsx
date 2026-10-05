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

/**
 * Puts the title on the member's list. Every change saves straight away; pressing the
 * selected status again takes the title off the list.
 */
export function ListControl({
  mediaId,
  type,
  initial,
  viewer,
}: {
  mediaId: number;
  type: "anime" | "manga";
  initial: ListEntry | null;
  viewer: Viewer;
}) {
  const pathname = usePathname();
  const [status, setStatus] = useState<ListStatus | null>(initial?.status ?? null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const headingId = useId();

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

  async function save(next: ListStatus | null) {
    setPending(true);
    setMessage(null);
    const path = `/api/list/${String(mediaId)}` as const;
    const result =
      next === null
        ? await apiSend("DELETE", path)
        : await apiSend<{ item: ListEntry }>("PUT", path, { status: next });
    setPending(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    setStatus(next);
    setMessage({ tone: "ok", text: next === null ? "Removed from your list" : "Saved" });
    void refreshAfterMemberChange(mediaId);
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <Link
        href="/import"
        className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-center text-sm font-semibold text-link hover:bg-surface-2"
      >
        <span aria-hidden="true">+</span> Import your anime list
      </Link>
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
      <p
        role="status"
        className={`min-h-5 text-xs font-semibold ${
          message?.tone === "error" ? "text-accent-text" : "text-muted"
        }`}
      >
        {pending
          ? "Saving…"
          : (message?.text ??
            (status ? `Tap ${statusLabel(status, type)} again to remove it.` : ""))}
      </p>
    </div>
  );
}
