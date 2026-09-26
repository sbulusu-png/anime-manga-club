const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The Monday (YYYY-MM-DD) of the week containing `date`, as seen in `timeZone`. */
export function mondayOf(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const daysSinceMonday = WEEKDAYS.indexOf(get("weekday"));
  const local = Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day")));
  return new Date(local - daysSinceMonday * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** True for a real calendar date (YYYY-MM-DD) that falls on a Monday. */
export function isMonday(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) && date.getUTCDay() === 1
  );
}
