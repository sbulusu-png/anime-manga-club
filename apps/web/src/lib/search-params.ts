export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The first value of a query parameter, or null. */
export function param(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first ?? null;
}
