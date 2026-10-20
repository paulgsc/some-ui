/**
 * What the daily jobs routine looks for, as data: how many picks each track
 * gets, where, what it searches, and what it never picks. `ROUTINE.md`
 * describes the run around it, and `digestFindings` holds a digest to it.
 *
 * The owner set these on 2026-10-17.
 */

export const TRACKS = ["software", "adjacent"] as const
export type Track = (typeof TRACKS)[number]

/** The adjacent track's role families, each a résumé composition of its own. */
export const ADJACENT_FAMILIES = ["data", "qa", "solutions"] as const
export type AdjacentFamily = (typeof ADJACENT_FAMILIES)[number]

/** The most picks one digest may hold per track. */
export const PICKS_PER_DAY: Readonly<Record<Track, number>> = {
  software: 3,
  adjacent: 2,
}

/**
 * The most picks each track may hold open at once, earlier digests' included
 * (`openPicks`). A run adds only what fits under it, so the next picks wait
 * until I have decided and shared the last ones: applying should take
 * effort, and a full queue says so.
 */
export const MAX_OPEN_PICKS: Readonly<Record<Track, number>> = {
  ...PICKS_PER_DAY,
}

/** The first day a digest must record its queue. */
export const QUEUE_FROM = "2026-10-19"

/** The places the routine searches, in this order (ROUTINE.md §3). */
export const LOCATIONS: ReadonlyArray<string> = [
  "remote",
  "Berkeley, CA",
  "San Francisco, CA",
  "Oakland, CA",
]

/**
 * The fit at which the run agrees with a scout it scored but didn't pick:
 * worth applying to, even though the day's picks ranked higher.
 */
export const SCOUT_AGREE_FIT = 0.5

/**
 * The most résumé PRs one digest may link. A run opens one only while none it
 * opened earlier is still open, so I review one change at a time.
 */
export const PATCH_PRS_PER_RUN = 1

/** The most set-aside postings a digest lists, those closest to a pick first. */
export const MAX_SET_ASIDE = 40

/**
 * The longest drafts a kit carries, in words (ROUTINE.md §7).
 */
export const MAX_COVER_LETTER_WORDS = 250
export const MAX_ANSWER_WORDS = 150

/**
 * Terms no draft may use: `FORBIDDEN_TERMS` in `@some-ui/resume`'s
 * `scripts/check-claims.mjs`, which neither repository's evidence supports.
 * A test holds this copy to that list.
 */
export const FORBIDDEN_TERMS: ReadonlyArray<string> = [
  "Entity Framework",
  "Kubernetes",
  "Spring Boot",
  "MongoDB",
  "Terraform",
  ".NET",
  "Azure",
  "SLA",
  "SLO",
  "on-call",
  "uptime",
  "high-volume",
]

/** A posting older than this, on the digest's day, is set aside as stale. */
export const MAX_POSTING_AGE_DAYS = 30

/** Search terms per track, and per family on the adjacent track. */
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
