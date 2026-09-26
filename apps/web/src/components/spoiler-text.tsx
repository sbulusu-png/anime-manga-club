"use client";

import { useState } from "react";

/** Review text that stays blurred until the reader chooses to see spoilers. */
export function SpoilerText({ text, spoiler }: { text: string; spoiler: boolean }) {
  const [revealed, setRevealed] = useState(!spoiler);

  if (revealed) {
    return <p className="line-clamp-5 whitespace-pre-line text-sm leading-relaxed">{text}</p>;
  }

  return (
    <div className="relative">
      <p aria-hidden="true" className="line-clamp-4 select-none text-sm leading-relaxed blur-sm">
        {text}
      </p>
      <button
        type="button"
        onClick={() => {
          setRevealed(true);
        }}
        className="absolute inset-0 m-auto h-fit w-fit rounded-full bg-ink px-4 py-2 text-xs font-bold text-bg shadow-card"
      >
        Contains spoilers · Show
      </button>
    </div>
  );
}
