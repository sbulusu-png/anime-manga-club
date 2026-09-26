/** Postgres unique_violation (23505), whichever driver (pg or PGlite) raised it. */
export function isUniqueViolation(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string } }).cause;
  return (err as { code?: string }).code === "23505" || cause?.code === "23505";
}
