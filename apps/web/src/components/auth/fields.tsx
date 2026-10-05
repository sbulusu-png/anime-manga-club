"use client";

import { type InputHTMLAttributes, type ReactNode, useId, useState } from "react";

const INPUT =
  "w-full rounded-xl border border-border bg-bg px-4 py-3 text-base text-ink placeholder:text-muted/70 focus:border-focus focus:outline-2 focus:outline-offset-0 focus:outline-focus aria-invalid:border-accent-text";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className" | "children">;

/**
 * A labelled input. The hint and error are linked with aria-describedby, and the error
 * also sets aria-invalid, so screen readers announce both with the field.
 */
export function TextField({
  label,
  hint,
  error,
  trailing,
  ...input
}: InputProps & {
  label: string;
  hint?: ReactNode;
  error?: string | null | undefined;
  /** A control drawn inside the input's right edge, e.g. "Show password". */
  trailing?: ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={trailing ? `${INPUT} pr-20` : INPUT}
          {...input}
        />
        {trailing ? (
          <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error && (
        <p id={errorId} className="text-sm font-semibold text-accent-text">
          {error}
        </p>
      )}
    </div>
  );
}

/** A password input with a "Show" toggle, so members can check what they typed. */
export function PasswordField(
  props: Omit<InputProps, "type"> & {
    label: string;
    hint?: ReactNode;
    error?: string | null | undefined;
  },
) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        <button
          type="button"
          onClick={() => {
            setVisible((v) => !v);
          }}
          aria-pressed={visible}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-ink"
        >
          {visible ? "Hide" : "Show"}
          <span className="sr-only"> password</span>
        </button>
      }
    />
  );
}

/** A form-level message. Errors interrupt screen readers; notices wait their turn. */
export function FormAlert({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "rounded-xl border border-accent-text/40 bg-accent-soft px-4 py-3 text-sm font-semibold text-ink"
          : "rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-ink"
      }
    >
      {children}
    </div>
  );
}

/** The main submit button, which says what it's doing while the request runs. */
export function SubmitButton({
  pending,
  children,
  pendingLabel,
}: {
  pending: boolean;
  children: ReactNode;
  pendingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="btn-comic w-full rounded-full bg-accent px-6 py-3 font-semibold text-accent-ink disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
