/**
 * Every limit a Settings page shows, in the person's terms, one table per
 * concern (paulgsc/some-ui#2121, SM2): what is kept, where it stands, and
 * what happens at the limit. Pure, so a test can hold every line to
 * `CLAUDE.md`'s "State in the person's terms"; `./index` pairs each row with
 * the store it counts and the bound in code it shows.
 */

/**
 * What happens when one more comes at the limit: it isn't kept; the oldest
 * goes; the oldest home already holds goes to make room (and while home holds
 * none, the new one isn't kept); it waits; or it is forgotten after a time.
 */
export type AtLimit =
  | "refused"
  | "oldest-goes"
  | "makes-room"
  | "waits"
  | "forgotten"

export type LimitWords = {
  /** What is kept, as the person knows it. */
  readonly what: string
  /** Where it stands: the count kept now, and the limit, each already formatted. */
  readonly standing: (kept: string, limit: string) => string
  /** Where it stands when nothing is kept, for a limit with no count of its own. */
  readonly nothing?: (limit: string) => string
  /** Those kept out of the count, already formatted (archived word sets). */
  readonly aside?: (n: string) => string
  readonly atLimit: AtLimit
  /** What happens at the limit, said in full. */
  readonly then: string
}

/** The short label beside each limit, by what happens at it. */
export const WHAT_HAPPENS: Readonly<Record<AtLimit, string>> = {
  refused: "Then refused",
  "oldest-goes": "Then the oldest goes",
  "makes-room": "Then the oldest home has makes room",
  waits: "Then it waits",
  forgotten: "Then forgotten",
}

const kept = (count: string, limit: string): string =>
  `${count} of ${limit} kept`
const using = (count: string, limit: string): string =>
  `Using ${count} of ${limit}`

/** What a recording kept until home has it does at its limit. */
const MAKES_ROOM =
  "A new one replaces the oldest that home already has. While home has none of them, the new one isn't kept, and the screen you record on says so."

/** This phone: what it keeps itself (Settings → This phone). */
export const PHONE_LIMITS = {
  storage: {
    what: "Everything on this phone",
    standing: using,
    atLimit: "refused",
    then: "A save past it isn't kept, and the app offers to move the oldest finished session off this phone. A paired phone sends it home first.",
  },
  reflections: {
    what: "Reflections",
    standing: (count, limit) =>
      `${count} kept. Your newest ${limit} always stay`,
    atLimit: "makes-room",
    then: "Your newest are always kept, and an older one stays until home has it. A new one is never turned away for lack of room.",
  },
  reflectionVoice: {
    what: "Room for voice reflections",
    standing: using,
    atLimit: "refused",
    then: "A voice reflection past it isn't kept.",
  },
  sharedMarks: {
    what: "Which reflections you shared",
    standing: (count, limit) => `${count} of ${limit} remembered`,
    atLimit: "oldest-goes",
    then: "When another is shared, the oldest share's note on its card goes. The reflection stays.",
  },
  sceneNotes: {
    what: "Scene notes said aloud",
    standing: kept,
    atLimit: "makes-room",
    then: "A new note replaces the oldest that home already has and the next scene no longer holds. While there is none, the new one isn't kept, and the screen you record on says so. The next scene holds up to five.",
  },
  lensTakes: {
    what: "Grammar lens takes",
    standing: kept,
    atLimit: "makes-room",
    then: MAKES_ROOM,
  },
  lensRecord: {
    what: "Grammar lens answers, line by line",
    standing: kept,
    atLimit: "makes-room",
    then: "A new answer replaces the oldest that home already has. While home has none of them, the new one isn't kept.",
  },
  leetypeTakes: {
    what: "LeetType spoken answers",
    standing: kept,
    atLimit: "makes-room",
    then: MAKES_ROOM,
  },
  leetypeNotes: {
    what: "What each LeetType answer answered",
    standing: kept,
    atLimit: "makes-room",
    then: "A new note replaces the oldest that home already has. While home has none of them, the new one isn't kept.",
  },
  ideaTakes: {
    what: "Answers to questions about an idea",
    standing: kept,
    atLimit: "makes-room",
    then: MAKES_ROOM,
  },
  ideaBundleTakes: {
    what: "A new idea's answers",
    standing: kept,
    atLimit: "makes-room",
    then: `${MAKES_ROOM} Answers waiting to be sent stay on this phone until you send the idea.`,
  },
  ideaRedoTakes: {
    what: "An idea's answers said again",
    standing: kept,
    atLimit: "makes-room",
    then: MAKES_ROOM,
  },
  libraryTakes: {
    what: "Takes with no scene yet",
    standing: kept,
    atLimit: "makes-room",
    then: MAKES_ROOM,
  },
  wordSets: {
    what: "Word sets for reading aloud, in use",
    standing: kept,
    aside: (n) => `${n} archived`,
    atLimit: "refused",
    then: "Adding another isn't kept until you archive one in My data. An archived set stays on this phone and doesn't count.",
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
    then: "Another isn't kept until you remove one. Keeping the same one again replaces it.",
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

/** How it's running: the phone's own record of how things went. */
export const STATUS_LIMITS = {
  failureLog: {
    what: "What went wrong lately",
    standing: kept,
    atLimit: "oldest-goes",
    then: "When another problem is written down, the oldest goes.",
  },
  appEvents: {
    what: "How things went, waiting to tell home",
    standing: (count, limit) => `${count} of ${limit} waiting`,
    atLimit: "refused",
    then: "Past it, a new one isn't kept until home has some of those waiting. None waiting goes before home has it.",
  },
} as const satisfies Readonly<Record<string, LimitWords>>

export const LIMITS_WORDS = {
  title: "Limits",
  lead: "What each part of the app keeps, where it stands now, and what happens at the limit.",
  counting: "Counting…",
  /** What a pull reads again, for its "Couldn't check … just now". */
  pull: "what this phone keeps",
  unread: "Couldn't count this just now.",
  days: (n: number): string => (n === 1 ? "1 day" : `${String(n)} days`),
  /** An age under a day, not "0 days". */
  underADay: "less than a day",
} as const
