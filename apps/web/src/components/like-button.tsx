"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { signInHref } from "@/lib/safe-next";
import type { Viewer } from "@/lib/types";

const likes = (n: number) => (n === 1 ? "1 like" : `${String(n)} likes`);

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <path d="M12 20s-7-4.4-9.2-8.6C1.2 8.3 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.2 1.8-2 3.3-3.2 5.4-3.2 3.6 0 5.4 3.8 3.8 6.9C19 15.6 12 20 12 20z" />
    </svg>
  );
}

/**
 * Likes a review. Updates straight away and undoes itself if the server says no.
 * Guests get a sign-in link instead, and authors just see the count (the API doesn't
 * let members like their own reviews).
 */
export function LikeButton({
  reviewId,
  authorId,
  initialLiked,
  initialCount,
  viewer,
}: {
  reviewId: string;
  authorId: string;
  initialLiked: boolean;
  initialCount: number;
  viewer: Viewer;
}) {
  const pathname = usePathname();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!viewer?.hasUsername) {
    return (
      <Link
        href={viewer ? "/welcome" : signInHref(pathname)}
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-2 hover:text-ink"
      >
        <Heart filled={false} />
        {likes(count)}
        <span className="sr-only"> (sign in to like)</span>
      </Link>
    );
  }

  if (viewer.id === authorId) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-muted">
        <Heart filled={count > 0} />
        {likes(count)}
      </span>
    );
  }

  async function toggle() {
    const next = !liked;
    setPending(true);
    setError(null);
    setLiked(next);
    setCount((c) => c + (next ? 1 : -1));
    try {
      const res = await fetch(`/api/reviews/${reviewId}/like`, {
        method: next ? "PUT" : "DELETE",
        // The count updates before the server answers; keepalive lets the request finish
        // even if the member moves on straight away.
        keepalive: true,
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { liked: boolean; likeCount: number };
      setLiked(body.liked);
      setCount(body.likeCount);
    } catch {
      setLiked(!next);
      setCount((c) => c + (next ? -1 : 1));
      setError("Couldn't save that. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        aria-pressed={liked}
        disabled={pending}
        onClick={() => void toggle()}
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold hover:bg-surface-2 ${
          liked ? "text-accent-text" : "text-muted hover:text-ink"
        }`}
      >
        <Heart filled={liked} />
        {likes(count)}
        <span className="sr-only">{liked ? " (you liked this)" : " (like this review)"}</span>
      </button>
      <span role="status" className="text-xs text-accent-text">
        {error}
      </span>
    </span>
  );
}
