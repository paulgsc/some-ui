/**
 * Calendar days as `YYYY-MM-DD` strings, always UTC.
 *
 * The snapshot is dated by the day a commit landed in UTC, and every range is
 * counted back from the snapshot's own last day, so nothing here reads a clock
 * or a time zone. Plain strings also sort and compare correctly, and survive
 * the JSON round trip untouched.
 *
 * Imported from Node by `scripts/loc-snapshot.ts` as well as by the bundle,
 * so it uses relative `.ts` imports only and nothing outside the language.
 */

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10)
}

/** `2026-09-27` as "Sep 27". */
export function formatDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}
