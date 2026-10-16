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
 * A relative date names a bucket, not a point, and YouTube truncates: "1 year
 * ago" covers ages from one year up to two. The estimate keeps the youngest
 * reading of the bucket, in the shortest calendar length of its unit (a
 * month is 28 days, a year 365), so imprecision can only hold a card longer
 * (doctrine §7, "youngest plausible reading"). The truncation is an
 * assumption about YouTube's formatter; the diagnostics export (#1396) banks
 * each raw form with its class, which is how the corpus can contradict it.
 */

import { assertNever } from "@some-extension/common"

/** Which grammar produced an estimate. Recorded with every diagnostic class. */
export const PARSER = "en-v1"

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

/** Each unit's shortest length in days, so a reading only ever errs younger. */
const UNIT_DAYS: ReadonlyMap<string, number> = new Map([
  ["second", 0],
  ["minute", 0],
  ["hour", 0],
  ["day", 1],
  ["week", 7],
  ["month", 28],
  ["year", 365],
])

const RELATIVE =
  /^(?:(?:streamed|premiered)(?: live)? )?(\d{1,4}) (second|minute|hour|day|week|month|year)s? ago$/

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
    const [, count, unit = ""] = relative
    const days = UNIT_DAYS.get(unit)
    // The regex admits only listed units; the guard is for the type checker.
    if (days === undefined) return { kind: "unverified" }
    return { kind: "aged", minDays: Number(count) * days }
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
  const latest = start + DAY_MS + 12 * 3_600_000
  // A plain past date within that slack is today's upload, not a scheduled
  // one: a future date only ever arrives with a "Premieres" prefix.
  return {
    kind: "aged",
    minDays: Math.max(0, Math.floor((now - latest) / DAY_MS)),
  }
}

/** Doctrine §5: one boundary `B`, four bands derived from it. */
export function classify(e: Estimate, boundaryDays: number): MaturityClass {
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
