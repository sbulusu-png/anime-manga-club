import Link from "next/link";
import type { ReactNode } from "react";

import type { ClubSuggestion } from "@/lib/types";

import { MediaCard } from "./media-card";

/** A club lead's pick: the cover, their note and who suggested it. */
export function SuggestionCard({
  suggestion,
  className = "",
  children,
}: {
  suggestion: ClubSuggestion;
  className?: string;
  /** Extra controls (the admin panel's edit and remove buttons). */
  children?: ReactNode;
}) {
  const by = suggestion.suggestedBy;
  return (
    <div
      className={`flex gap-4 rounded-2xl border border-border bg-surface p-4 shadow-card ${className}`}
    >
      <div className="w-24 shrink-0">
        <MediaCard media={suggestion.media} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
        {suggestion.note ? (
          <p className="leading-relaxed">“{suggestion.note}”</p>
        ) : children ? (
          // Only the admin panel mentions a missing note; visitors just see the pick.
          <p className="text-muted">No note yet.</p>
        ) : null}
        {by && (
          <p className="text-muted">
            —{" "}
            <Link href={`/u/${by.username}`} className="font-semibold hover:underline">
              {by.displayUsername ?? by.username}
            </Link>
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
