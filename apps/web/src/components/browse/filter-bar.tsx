"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useEffectEvent, useId, useState, useTransition } from "react";

import {
  ANIME_FORMATS,
  EMPTY_FILTERS,
  type Filters,
  MANGA_FORMATS,
  MAX_YEAR,
  MIN_YEAR,
  SEASONS,
  SORTS,
  STATUSES,
  hasFilters,
  toSearchParams,
} from "@/lib/browse";

const YEARS = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MAX_YEAR - i);

const SELECT =
  "w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-ink focus:border-focus";

const TYPES = [
  { value: null, label: "All" },
  { value: "anime", label: "Anime" },
  { value: "manga", label: "Manga" },
  { value: "manhwa", label: "Manhwa" },
  { value: "manhua", label: "Manhua" },
] as const;

/**
 * Search box and filters. Every change updates the URL (so results can be shared and
 * the back button works); the page re-renders on the server with the new results.
 */
export function FilterBar({ filters, genres }: { filters: Filters; genres: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q);
  // The last search this component put in the URL, and the last one it saw there.
  const [pushedQ, setPushedQ] = useState(filters.q);
  const [seenQ, setSeenQ] = useState(filters.q);
  const [showMore, setShowMore] = useState(
    Boolean(filters.format ?? filters.status ?? filters.season ?? filters.year),
  );
  const moreId = useId();

  // Back/forward or "Clear" changed the search in the URL: show it in the box. (Our own
  // debounced updates are skipped, so a slow response can't undo newer typing.)
  if (filters.q !== seenQ) {
    setSeenQ(filters.q);
    if (filters.q !== pushedQ) {
      setQ(filters.q);
      setPushedQ(filters.q);
    }
  }

  function apply(next: Filters) {
    const query = toSearchParams(next).toString();
    startTransition(() => {
      router.replace(`${pathname}${query ? `?${query}` : ""}` as Route, { scroll: false });
    });
  }

  // Reads the latest filters when it fires, so a genre picked mid-typing isn't lost.
  const search = useEffectEvent((term: string) => {
    if (term === filters.q) return;
    setPushedQ(term);
    apply({ ...filters, q: term });
  });

  // Search as the member types, once they pause.
  useEffect(() => {
    const timer = setTimeout(() => {
      search(q.trim());
    }, 350);
    return () => {
      clearTimeout(timer);
    };
  }, [q]);

  const update = (patch: Partial<Filters>) => {
    apply({ ...filters, q: q.trim(), ...patch });
  };

  const formats =
    filters.type === "anime"
      ? ANIME_FORMATS
      : filters.type
        ? MANGA_FORMATS
        : [...ANIME_FORMATS, ...MANGA_FORMATS];

  return (
    <div className="flex flex-col gap-4">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setPushedQ(q.trim());
          update({});
        }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <label className="relative flex-1">
          <span className="sr-only">Search titles</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            name="q"
            value={q}
            maxLength={100}
            placeholder="Search anime and manga…"
            autoComplete="off"
            onChange={(event) => {
              setQ(event.target.value);
            }}
            className="w-full rounded-full border border-border bg-surface py-3 pl-12 pr-4 text-base text-ink placeholder:text-muted focus:border-focus"
          />
        </label>
        <label className="flex items-center gap-2 text-sm sm:w-56">
          <span className="shrink-0 font-semibold">Sort</span>
          <select
            value={filters.sort}
            onChange={(event) => {
              update({ sort: event.target.value as Filters["sort"] });
            }}
            className={`${SELECT} rounded-full`}
          >
            {SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </select>
        </label>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <fieldset className="flex rounded-full border border-border bg-surface p-1">
          <legend className="sr-only">Type</legend>
          {TYPES.map((type) => {
            const active = filters.type === type.value;
            return (
              <button
                key={type.label}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  // Formats and seasons that don't fit the new type are dropped.
                  update({
                    type: type.value,
                    format: null,
                    season: type.value && type.value !== "anime" ? null : filters.season,
                  });
                }}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                  active ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"
                }`}
              >
                {type.label}
              </button>
            );
          })}
        </fieldset>

        <button
          type="button"
          aria-expanded={showMore}
          aria-controls={moreId}
          onClick={() => {
            setShowMore((open) => !open);
          }}
          className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2"
        >
          More filters
          <span aria-hidden="true"> {showMore ? "▴" : "▾"}</span>
        </button>

        {hasFilters({ ...filters, q: q.trim() }) && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setPushedQ("");
              apply({ ...EMPTY_FILTERS, sort: filters.sort });
            }}
            className="rounded-full px-3 py-2 text-sm font-semibold text-link hover:underline"
          >
            Clear filters
          </button>
        )}

        <p role="status" className="ml-auto text-sm text-muted">
          {pending ? "Updating…" : ""}
        </p>
      </div>

      <div id={moreId} hidden={!showMore} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Select
          label="Format"
          value={filters.format}
          options={formats}
          onChange={(format) => {
            update({ format });
          }}
        />
        <Select
          label="Status"
          value={filters.status}
          options={STATUSES}
          onChange={(status) => {
            update({ status });
          }}
        />
        {(filters.type === null || filters.type === "anime") && (
          <Select
            label="Season"
            value={filters.season}
            options={SEASONS}
            onChange={(season) => {
              update({ season });
            }}
          />
        )}
        <Select
          label="Year"
          value={filters.year ? String(filters.year) : null}
          options={YEARS.map((year) => ({ value: String(year), label: String(year) }))}
          onChange={(year) => {
            update({ year: year ? Number(year) : null });
          }}
        />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Genres</legend>
        <div className="flex flex-wrap gap-2">
          {genres.map((genre) => {
            const active = filters.genres.includes(genre);
            return (
              <Chip
                key={genre}
                active={active}
                onClick={() => {
                  update({
                    genres: active
                      ? filters.genres.filter((g) => g !== genre)
                      : [...filters.genres, genre],
                  });
                }}
              >
                {genre}
              </Chip>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: readonly { value: string; label: string }[];
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold">
      {label}
      <select
        value={value ?? ""}
        onChange={(event) => {
          onChange(event.target.value || null);
        }}
        className={SELECT}
      >
        <option value="">Any</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
        active
          ? "border-accent bg-accent text-accent-ink"
          : "border-border bg-surface text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
