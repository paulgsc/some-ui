/**
 * Every limit a Settings page shows, in the person's terms, one table per
 * concern (paulgsc/some-ui#2121, SM2): what is kept, where it stands, and
 * what happens at the limit. Pure, so a test can hold every line to
 * `CLAUDE.md`'s "State in the person's terms"; `./index` pairs each row with
 * the store it counts and the bound in code it shows.
 */

/** What happens when one more comes at the limit. */
export type AtLimit = "refused" | "oldest-goes" | "waits" | "forgotten"

export type LimitWords = {
  /** What is kept, as the person knows it. */
  readonly what: string
  /** Where it stands: the count kept now, and the limit, each already formatted. */
  readonly standing: (kept: string, limit: string) => string
  /** Where it stands when nothing is kept, for a limit with no count of its own. */
  readonly nothing?: (limit: string) => string
  readonly atLimit: AtLimit
  /** What happens at the limit, said in full. */
  readonly then: string
}

/** The short label beside each limit, by what happens at it. */
export const WHAT_HAPPENS: Readonly<Record<AtLimit, string>> = {
  refused: "Then refused",
  "oldest-goes": "Then the oldest goes",
  waits: "Then it waits",
  forgotten: "Then forgotten",
}

const kept = (count: string, limit: string): string =>
  `${count} of ${limit} kept`
const using = (count: string, limit: string): string =>
  `Using ${count} of ${limit}`

/** This phone: what it keeps itself (Settings → This phone). */
export const PHONE_LIMITS = {
  storage: {
    what: "Everything on this phone",
    standing: using,
    atLimit: "refused",
    then: "A save past it isn't kept, and the app offers to remove a finished session. Clear finished sessions home holds to free up space.",
  },
  wordSets: {
    what: "Word sets for reading aloud",
    standing: kept,
    atLimit: "refused",
    then: "Adding another isn't kept until you remove one.",
  },
  practiceDays: {
    what: "Reading-aloud days, day by day",
    standing: (count, limit) => `${count} of ${limit} days kept`,
    atLimit: "oldest-goes",
    then: "The oldest day leaves the day-by-day list. Your totals still count it.",
  },
  lastDrama: {
    what: "Your last drama",
    standing: (age, limit) => `Played ${age} ago, kept for ${limit}`,
    nothing: (limit) =>
      `None kept now. One is kept for ${limit} after you play it.`,
    atLimit: "forgotten",
    then: "After that it is forgotten, and the next prompt leaves it out.",
  },
  shelfKorean: {
    what: "Korean kept to replay",
    standing: kept,
    atLimit: "refused",
    then: "Keeping another isn't kept until you remove one. Keeping one again replaces it.",
  },
  shelfLeetype: {
    what: "LeetType kept to replay",
    standing: kept,
    atLimit: "refused",
    then: "Keeping another isn't kept until you remove one. Keeping one again replaces it.",
  },
  stops: {
    what: "Sessions you stopped early",
    standing: kept,
    atLimit: "oldest-goes",
    then: "When another is stopped, the oldest goes.",
  },
  sessionPaths: {
    what: "How each session was opened and picked up",
    standing: (count, limit) => `${count} of ${limit} sessions counted`,
    atLimit: "oldest-goes",
    then: "When another session is counted, the oldest one's counts go.",
  },
  sceneNotes: {
    what: "The next scene, said aloud",
    standing: (count, limit) => `${count} of ${limit} notes`,
    atLimit: "refused",
    then: "Another note isn't kept until you let one go.",
  },
  jobDigests: {
    what: "Job digests",
    standing: (count, limit) =>
      `${count} kept. Past ${limit}, the oldest ones go`,
    atLimit: "oldest-goes",
    then: "The oldest digest no pick still needs leaves this phone. Home keeps every one.",
  },
  jobRuns: {
    what: "The morning runs' records",
    standing: kept,
    atLimit: "oldest-goes",
    then: "When home tells of a newer one, the oldest goes from this phone. Home keeps every one.",
  },
  jobVoice: {
    what: "Jobs voice notes",
    standing: using,
    atLimit: "refused",
    then: "A note past it isn't kept. Each one leaves this phone once home has it, which makes room.",
  },
} as const satisfies Readonly<Record<string, LimitWords>>

/** Home: what this phone sends there (Settings → Home). */
export const HOME_LIMITS = {
  voiceWaiting: {
    what: "Voice notes on their way home",
    standing: using,
    atLimit: "waits",
    then: "Past it, a note stays on the screen it was recorded on until there is room for it here.",
  },
} as const satisfies Readonly<Record<string, LimitWords>>

/** How it's running: the phone's own record of what went wrong. */
export const STATUS_LIMITS = {
  failureLog: {
    what: "What went wrong lately",
    standing: kept,
    atLimit: "oldest-goes",
    then: "When another problem is written down, the oldest goes.",
  },
} as const satisfies Readonly<Record<string, LimitWords>>

export const LIMITS_WORDS = {
  title: "Limits",
  lead: "What each part of the app keeps, where it stands now, and what happens at the limit.",
  counting: "Counting…",
  unread: "Couldn't count this just now.",
  days: (n: number): string => (n === 1 ? "1 day" : `${String(n)} days`),
  /** An age under a day, not "0 days". */
  underADay: "less than a day",
} as const
