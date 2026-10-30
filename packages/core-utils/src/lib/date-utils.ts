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
// Kept free of imports, so a script can load this file from source with Node
// and nothing installed (scripts/loc-snapshot.ts does).

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

/** The Monday on or before `day`. */
export function weekOf(day: string): string {
  return addDays(day, -((dateOf(day).getDay() + 6) % 7))
}

/** "Oct 2026", for a `YYYY-MM` month. */
export function formatMonth(month: string): string {
  return dateOf(`${month}-01`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  })
}

/** "Oct 2" */
export function formatDay(day: string): string {
  return dateOf(day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

/** "Fri" */
/**
 * The day an instant fell on, as a person says it beside `today` (a local
 * day key): "today", "yesterday", or "Oct 5", with the year once it is not
 * this one.
 */
export function dayWords(iso: string, today: string): string {
  const day = dayOf(new Date(iso))
  if (day === today) return "today"
  if (day === addDays(today, -1)) return "yesterday"
  const year = day.slice(0, 4)
  return year === today.slice(0, 4)
    ? formatDay(day)
    : `${formatDay(day)}, ${year}`
}

export function formatWeekday(day: string): string {
  return dateOf(day).toLocaleDateString("en-US", { weekday: "short" })
}

/** A length as `m:ss`, the way a recording's clock reads. */
export function formatTimecode(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}
