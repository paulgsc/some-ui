// dateUtil.ts

/**
 * Formats a given date as a relative time string (e.g., "just now", "5 mins ago", "2 days ago").
 * @param date - The date to format.
 * @returns A human-readable relative time string.
 */
export function formatRelativeTime(date: Date | string | number): string {
  const now = new Date()
  const givenDate = new Date(date)
  const diffInSeconds = Math.floor((now.getTime() - givenDate.getTime()) / 1000)

  if (diffInSeconds < 0) {
    return "in the future"
  }

  const seconds = diffInSeconds
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const years = Math.floor(days / 365)

  if (seconds < 5) {
    return "just now"
  } else if (seconds < 60) {
    return `${seconds} seconds ago`
  } else if (minutes < 60) {
    return `${minutes} minute${minutes > 1 ? "s" : ""} ago`
  } else if (hours < 24) {
    return `${hours} hour${hours > 1 ? "s" : ""} ago`
  } else if (days <= 7) {
    return `${days} day${days > 1 ? "s" : ""} ago`
  } else if (weeks < 52) {
    return `${weeks} week${weeks > 1 ? "s" : ""} ago`
  }
  return `${years} year${years > 1 ? "s" : ""} ago`
}

// Calendar days as `YYYY-MM-DD` strings, for code that counts days rather than
// instants (a log of readings, a window of commits). Local time throughout: a
// day is the one on this machine's calendar, and the arithmetic goes through
// `Date#setDate`, which a daylight-saving change cannot shift.
//
// Moved here from @some-ui/aph, which www's lines-of-code widget needed too,
// and www cannot import an APK-audience workspace. Kept free of imports, so a
// script can load this file straight from source with Node and nothing
// installed (scripts/loc-snapshot.ts does).

/** Local `YYYY-MM-DD` for `date`. */
export function dayOf(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function dateOf(day: string): Date {
  const [y = 1970, m = 1, d = 1] = day.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(day: string, n: number): string {
  const date = dateOf(day)
  date.setDate(date.getDate() + n)
  return dayOf(date)
}

/** "Oct 2" */
export function formatDay(day: string): string {
  return dateOf(day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

/** "Fri" */
export function formatWeekday(day: string): string {
  return dateOf(day).toLocaleDateString("en-US", { weekday: "short" })
}
