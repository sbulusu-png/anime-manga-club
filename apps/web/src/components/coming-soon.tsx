import Link from "next/link";

/** A friendly placeholder for pages later build phases fill in. */
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold uppercase tracking-widest text-accent-text">
        Coming soon
      </p>
      <h1 className="font-display text-5xl tracking-wide sm:text-6xl">{title}</h1>
      <p className="text-lg text-muted">{description}</p>
      <Link
        href="/"
        className="mt-4 rounded-full border border-border px-5 py-2 font-semibold hover:bg-surface-2"
      >
        Back home
      </Link>
    </section>
  );
}
