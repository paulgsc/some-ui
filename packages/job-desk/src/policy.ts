/**
 * What the daily jobs routine looks for, as data: how many picks each track
 * gets, where, what it searches, and what it never picks. `ROUTINE.md`
 * describes the run around it, and `digestFindings` holds a digest to it.
 *
 * The owner set these on 2026-10-17.
 */

export const TRACKS = ["software", "adjacent"] as const
export type Track = (typeof TRACKS)[number]

/** The adjacent track's role families, each a résumé composition to come. */
export const ADJACENT_FAMILIES = ["data", "qa", "solutions"] as const
export type AdjacentFamily = (typeof ADJACENT_FAMILIES)[number]

/** The most picks one digest may hold per track. */
export const PICKS_PER_DAY: Readonly<Record<Track, number>> = {
  software: 3,
  adjacent: 2,
}

/** Indeed `location` values the routine searches, in this order. */
export const LOCATIONS: ReadonlyArray<string> = [
  "remote",
  "Berkeley, CA",
  "San Francisco, CA",
  "Oakland, CA",
]

/** A posting older than this, on the digest's day, is set aside as stale. */
export const MAX_POSTING_AGE_DAYS = 30

/** Indeed `search` terms per track, and per family on the adjacent track. */
export const QUERIES: {
  readonly software: ReadonlyArray<string>
  readonly adjacent: Readonly<Record<AdjacentFamily, ReadonlyArray<string>>>
} = {
  software: [
    "software engineer",
    "backend engineer",
    "full stack engineer",
    "platform engineer",
    "TypeScript engineer",
    "Rust engineer",
  ],
  adjacent: {
    data: [
      "data analyst SQL Python",
      "analytics engineer",
      "business intelligence engineer",
    ],
    qa: ["QA automation engineer", "SDET", "test automation engineer"],
    solutions: ["solutions engineer integrations", "internal tools engineer"],
  },
}

/**
 * Titles the routine never picks, whatever the description says: support,
 * implementation, sales and other customer-facing or phone work. The routine
 * also reads each description for customer calls, quotas and escalations,
 * which a title can hide; this list is the backstop a digest is checked
 * against.
 */
export const EXCLUDED_TITLE =
  /\b(support|help ?desk|call cent(?:er|re)|customer|client success|account (?:executive|manager)|sales|implementation|onboarding specialist)\b/i
