import type { ReactNode } from "react";

/** The shared frame for sign-in, sign-up and the other account pages. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12 sm:py-16">
      <div className="rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-8">
        <header className="mb-6 text-center">
          <h1 className="font-display text-4xl tracking-wide sm:text-5xl">{title}</h1>
          {description ? <p className="mt-2 text-muted">{description}</p> : null}
        </header>
        {children}
      </div>
      {footer ? <div className="text-center text-sm text-muted">{footer}</div> : null}
    </section>
  );
}

/** "or", between the Google button and the email form. */
export function Divider() {
  return (
    <div className="my-6 flex items-center gap-3 text-sm text-muted" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export const TEXT_LINK = "font-semibold text-link underline-offset-4 hover:underline";
