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

const DAY_MS = 86_400_000

function utcOf(day: string): number {
  const date = dateOf(day)
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * The ISO week `day` falls in, as `2026-W46`: the week (Monday to Sunday)
 * that holds its Thursday, numbered in that Thursday's year.
 */
export function isoWeekOf(day: string): string {
  const thursday = addDays(weekOf(day), 3)
  const year = thursday.slice(0, 4)
  const n = Math.floor((utcOf(thursday) - utcOf(`${year}-01-01`)) / DAY_MS / 7)
  return `${year}-W${String(n + 1).padStart(2, "0")}`
}

/** How many ISO weeks `year` has: 52 or 53. */
export function isoWeeksIn(year: number): number {
  return isoWeekOf(`${year}-12-28`).endsWith("W53") ? 53 : 52
}

/**
 * An ISO week (`2026-W46`) as its year and number. Throws a `RangeError`
 * for a week that is not one.
 */
export function parseIsoWeek(week: string): { year: number; week: number } {
  const match = /^(\d{4})-W(\d{2})$/.exec(week)
  const year = Number(match?.[1])
  const n = Number(match?.[2])
  if (match === null || n < 1 || n > isoWeeksIn(year))
    throw new RangeError(`${week} is not an ISO week`)
  return { year, week: n }
}

/** The Monday (`YYYY-MM-DD`) ISO week `week` (`2026-W46`) starts on. */
export function isoWeekMonday(week: string): string {
  const { year, week: n } = parseIsoWeek(week)
  return addDays(weekOf(`${year}-01-04`), (n - 1) * 7)
}

/**
 * The owner's time zone: every routine and deadline that says "the owner's
 * day" or "the owner's clock" reads it here.
 */
export const PACIFIC_TIME_ZONE = "America/Los_Angeles"

const PACIFIC_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: PACIFIC_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

const PACIFIC_CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: PACIFIC_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

/** The Pacific calendar day of `at`, `YYYY-MM-DD`. */
export function pacificDay(at: Date): string {
  return PACIFIC_DAY.format(at)
}

/** Minutes since midnight at `at`, Pacific. */
export function pacificMinutes(at: Date): number {
  const [hour = 0, minute = 0] = PACIFIC_CLOCK.format(at).split(":").map(Number)
  return hour * 60 + minute
}

/**
 * `day` at `hh:mm` on the owner's clock, as an instant with its offset
 * (`2026-11-16T00:00:00-08:00`). Pacific is UTC-8 or UTC-7; the one whose
 * reading comes back unchanged is the offset that day has at that time.
 */
function pacificInstant(day: string, hh: number, mm: number): string {
  const clock = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
  for (const offset of ["-08:00", "-07:00"]) {
    const at = `${day}T${clock}:00${offset}`
    const date = new Date(at)
    if (pacificDay(date) === day && pacificMinutes(date) === hh * 60 + mm) {
      return at
    }
  }
  throw new Error(`${day} ${clock} isn't a time in ${PACIFIC_TIME_ZONE}`)
}

/**
 * The owner's week that holds `now`, as the weekly routines (Rust Rounds,
 * the interview week) open one: its id (`2026-w47`, the ISO week in lower
 * case), its Monday and Sunday, and when it opens (Monday 00:00) and is due
 * (Sunday 23:59) on the owner's clock.
 */
export function weekAround(now: Date): {
  id: string
  monday: string
  sunday: string
  opens: string
  due: string
} {
  const monday = weekOf(pacificDay(now))
  const sunday = addDays(monday, 6)
  return {
    id: isoWeekOf(monday).toLowerCase(),
    monday,
    sunday,
    opens: pacificInstant(monday, 0, 0),
    due: pacificInstant(sunday, 23, 59),
  }
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
