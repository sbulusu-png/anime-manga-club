"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * A member's avatar, or their initial when they have none or it won't load.
 *
 * Photos (Google sign-in) go through the Next.js image optimiser: the server fetches each
 * one once and caches it. Loaded straight from Google, browsers often got "429 Too Many
 * Requests" and showed a broken image.
 */
export function Avatar({
  name,
  image,
  size = 36,
}: {
  name: string;
  image: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (image && !failed) {
    return (
      <Image
        src={image}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full border border-border object-cover"
        onError={() => {
          setFailed(true);
        }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-full bg-accent font-bold text-accent-ink"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
