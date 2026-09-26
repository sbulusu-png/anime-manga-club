"use client";

/** Shown when a page crashes; the header and footer stay usable. */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="font-display text-5xl tracking-wide">Something went wrong</h1>
      <p className="text-muted">
        Sorry about that. Try again, and if it keeps happening, tell a club lead.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-full bg-accent px-6 py-3 font-semibold text-accent-ink"
      >
        Try again
      </button>
    </section>
  );
}
