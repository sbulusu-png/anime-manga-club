"use client";

import { useId, useState } from "react";

const PREVIEW_CHARS = 600;

/** The synopsis, trimmed to a few lines with "Read more" when it's long. */
export function Synopsis({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const long = text.length > PREVIEW_CHARS;
  const paragraphs = text.split(/\n{2,}|\n/).filter((p) => p.trim());

  return (
    <div className="flex flex-col items-start gap-3">
      <div
        id={id}
        className={`flex flex-col gap-3 leading-relaxed ${
          long && !open
            ? "max-h-44 overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
            : ""
        }`}
      >
        {paragraphs.map((paragraph, index) => (
          // Paragraphs never reorder, so their position is a stable key.
          // eslint-disable-next-line @eslint-react/no-array-index-key
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => {
            setOpen((o) => !o);
          }}
          className="text-sm font-semibold text-link hover:underline"
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
