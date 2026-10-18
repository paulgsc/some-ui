/**
 * The maturity estimator (#1384, QC2): raw vendor date text in, an estimate
 * out, and the estimate's class against a boundary.
 *
 * Pure. The only clock is the `now` argument, and it is read only for an
 * absolute date; a relative one ("3 years ago") already states an age. The
 * grammar is English (`PARSER`): anything it cannot read with certainty is
 * `unverified`, never guessed (QD3), so a narrower parser holds more cards
 * rather than admitting a wrong one.
 *
 * A relative date names a bucket, not a point, and nothing here proves whether
 * YouTube truncates or rounds: under rounding "1 year ago" can mean six months.
 * The estimate keeps the youngest reading either way, half a unit below the
 * stated count in the shortest calendar length of the unit (a month is 28
 * days, a year 365), so imprecision can only hold a card longer (doctrine §7,
 * "youngest plausible reading").
 */

import { assertNever } from "@some-extension/common"

/** Which grammar produced an estimate. Recorded with every banked date form. */
export const PARSER = "en-v2"

/** The boundary when the owner has not chosen one (#1807): one year. */
export const DEFAULT_BOUNDARY_DAYS = 365

const DAY_MS = 86_400_000

type PresentReason =
  /** Live now, or a viewer count — present by definition. */
  | "live"
  /** A premiere or a scheduled stream: a negative age. */
  | "upcoming"

export type Estimate =
  /** No date, or text the grammar does not recognize (QD3). */
  | { readonly kind: "unverified" }
  /** Positive evidence of coupling to the present. */
  | { readonly kind: "present"; readonly reason: PresentReason }
  /** At least `minDays` old: the youngest reading of the evidence. */
  | { readonly kind: "aged"; readonly minDays: number }

/** Doctrine §5's bands. */
export type MaturityClass = "QM0" | "QM1" | "QM2" | "QM3" | "QM4"

/**
 * Each unit's shortest length in days, so a reading only ever errs younger.
 * The compact units are search's, which shows no long form beside them. "m"
 * is minutes: read as months it would only make the card older, so minutes
 * is the youngest reading either way.
 */
const UNIT_DAYS: ReadonlyMap<string, number> = new Map([
  ["second", 0],
  ["minute", 0],
  ["hour", 0],
  ["day", 1],
  ["week", 7],
  ["month", 28],
  ["year", 365],
  ["s", 0],
  ["m", 0],
  ["h", 0],
  ["d", 1],
  ["w", 7],
  ["mo", 28],
  ["y", 365],
])

/** "3 days ago", or compact, "3d ago". */
const RELATIVE =
  /^(?:(?:streamed|premiered)(?: live)? )?(\d{1,4})(?: (second|minute|hour|day|week|month|year)s?|(s|m|h|d|w|mo|y)) ago$/

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const

const ABSOLUTE =
  /^(?:(?:streamed live on|premiered on|premiered|published on) )?([a-z]{3}) (\d{1,2}), (\d{4})$/

const LIVE =
  /^(?:live|live now|streaming now|premiering now|[\d.,]+[km]? watching(?: now)?)$/

const UPCOMING = /^(?:premieres|scheduled for|upcoming)\b/

/** Collapse YouTube's non-breaking and repeated spaces; compare in lower case. */
function normalize(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toLowerCase()
}

export function estimate(raw: string | null, now: number): Estimate {
  if (raw === null) return { kind: "unverified" }
  const text = normalize(raw)
  if (LIVE.test(text)) return { kind: "present", reason: "live" }
  if (UPCOMING.test(text)) return { kind: "present", reason: "upcoming" }

  const relative = RELATIVE.exec(text)
  if (relative) {
    const [, count, long, short] = relative
    const days = UNIT_DAYS.get(long ?? short ?? "")
    // The regex admits only listed units; the guard is for the type checker.
    if (days === undefined) return { kind: "unverified" }
    return { kind: "aged", minDays: Math.floor((Number(count) - 0.5) * days) }
  }

  const absolute = ABSOLUTE.exec(text)
  if (absolute) return fromCalendarDate(absolute, now)

  return { kind: "unverified" }
}

/**
 * "Jan 5, 2024", in an unknown time zone. The youngest reading puts the
 * upload at the last instant that date exists anywhere: UTC−12, which is
 * twelve hours past the end of that UTC day.
 */
function fromCalendarDate(match: RegExpExecArray, now: number): Estimate {
  const [, mon, day, year] = match
  const month = MONTHS.findIndex((m) => m === mon)
  const d = Number(day)
  const y = Number(year)
  if (month < 0 || !Number.isFinite(now)) return { kind: "unverified" }
  const start = Date.UTC(y, month, d)
  // Reject dates the calendar rolled over ("Feb 31" → Mar 3).
  if (new Date(start).getUTCDate() !== d) return { kind: "unverified" }
  // A plain date after today is a misread or a wrong clock, not a schedule:
  // a scheduled date only ever arrives with a "Premieres" prefix.
  if (start > now) return { kind: "unverified" }
  const latest = start + DAY_MS + 12 * 3_600_000
  return {
    kind: "aged",
    minDays: Math.max(0, Math.floor((now - latest) / DAY_MS)),
  }
}

/** Doctrine §5: one boundary `B`, four bands derived from it. */
export function classify(e: Estimate, boundaryDays: number): MaturityClass {
  // A missing or corrupt boundary fails every comparison below, which would
  // read as QM4: hold instead.
  if (!Number.isFinite(boundaryDays) || boundaryDays <= 0) return "QM0"
  const { kind } = e
  switch (kind) {
    case "unverified": {
      return "QM0"
    }
    case "present": {
      return "QM1"
    }
    case "aged": {
      if (e.minDays < 0.1 * boundaryDays) return "QM1"
      if (e.minDays < boundaryDays) return "QM2"
      if (e.minDays < 3 * boundaryDays) return "QM3"
      return "QM4"
    }
    default: {
      kind satisfies never
      return assertNever(kind)
    }
  }
}
