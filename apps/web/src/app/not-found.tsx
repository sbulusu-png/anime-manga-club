import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="font-display text-8xl tracking-wide text-accent-text">404</p>
      <h1 className="text-2xl font-bold">This page went on a filler arc</h1>
      <p className="text-muted">We couldn&apos;t find what you were looking for.</p>
      <Link
        href="/"
        className="btn-comic mt-2 rounded-full bg-accent px-6 py-3 font-semibold text-accent-ink"
      >
        Back home
      </Link>
    </section>
  );
}
