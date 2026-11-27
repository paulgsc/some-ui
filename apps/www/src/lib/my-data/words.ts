/**
 * Everything My data says (MY-DATA MD2, #2476), in the person's terms: what
 * is kept where, and since when, never the machinery (CLAUDE.md, "State in
 * the person's terms"). Pure; `./__tests__/words.test.ts` holds it to that.
 */
import { assertNever, counted, formatSize, listed } from "@some-ui/core-utils"

import type { Feed } from "@/lib/call-videos/model"
import { FEED_WORDS } from "@/lib/call-videos/words"
import { lengthOf } from "@/lib/format"

import type { DeletableKind, Receipt, ReceiptsReading } from "./deleting"
import type { Heard, HomeReading, Of, Where } from "./model"
import { isKind } from "./model"
import type { RecordHeld, RecordKind, RecordReading } from "./record"

/** Each kind of recording, as the person knows it. */
export const KIND_NAMES: Readonly<Record<Of, string>> = {
  studio: "Studio takes and idea answers",
  reflection: "Spoken reflections",
  game: "Recordings from a game",
  leetype: "LeetType answers",
  lens: "Grammar lens takes",
  scene: "Scene notes",
  soundbite: "Soundbites",
  jobs: "Jobs notes",
  "rust-round": "Rust Rounds notes",
  interview: "Interview takes",
  hunch: "Things you said to the shop",
}

/** Where a recording is kept. */
export const WHERE_WORDS: Readonly<Record<Where, string>> = {
  home: "On home",
  aside: "Set aside, on home",
  going: "Going home",
  phone: "Only on this phone",
  unknown: "Not known yet",
}

/**
 * What you keep for good: your record over time, with no delete anywhere
 * (the owner's rule on #2474: we never delete work), each with how many
 * home keeps (`./record`, MD2b).
 */
export const KEPT_FOR_GOOD: Readonly<Record<RecordKind, string>> = {
  sessions: "Study sessions",
  reflections: "Written reflections",
  ideas: "Ideas",
  practice: "Practice results",
  korean: "Korean record",
  jobs: "The Jobs record",
  self: "Self entries",
  leetype: "LeetType sessions",
  "rust-rounds": "Rust Rounds",
  "rust-weeks": "Rust Rounds weeks you sent",
  "rust-round-log": "What you did on the Rust Rounds cards",
  "scene-asks": "Asks for the next scene",
  "studio-log": "Studio's log",
}

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
})
const shortDay = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
})
const clock = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
})

/** `12 Sep 2026`. */
export const onDay = (at: string): string => day.format(new Date(at))

/** A week on the chart, by its Monday: `14 Sep`. */
export const weekOf = (monday: string): string =>
  shortDay.format(new Date(`${monday}T12:00:00Z`))

/** One megabyte as the charts count it, the same as `formatSize`'s. */
export const MB = 1024 * 1024

export const MY_DATA = {
  tiles: {
    home: "kept on home",
    phone: "not on home yet",
    recordings: "recordings",
  },
  /** A tile whose number home hasn't given. */
  unknown: "–",
  space: {
    title: "Space by kind of recording",
    sub: "MB, on home and this phone",
  },
  growth: {
    title: "How it grows on home",
    sub: "MB kept on home, week by week",
    /** What the chart can't show, said under it. */
    phone:
      "This phone keeps no history of its own room, so only home's is drawn.",
    empty: "Nothing has reached home yet.",
  },
  where: {
    title: "Where your recordings are",
  },
  table: { show: "Show as a table", hide: "Hide the tables" },
  tableCaptions: {
    kinds: "Recordings by kind",
    growth: "How it grows on home (MB)",
    where: "Where your recordings are",
  },
  tableHeads: {
    kind: "Kind",
    count: "How many",
    mb: "MB",
    week: "Week of",
    home: "On home",
    where: "Where",
  },
  recordings: "Recordings",
  none: "No recordings yet.",
  /** Before this phone's recordings are counted. */
  phoneReading: "Counting what's on this phone…",
  /** What a drag down reads again, for its "Couldn't check … just now". */
  pullWhat: "what home keeps",
  keptTitle: "Kept for good",
  kept: "Kept for good. These are your record over time, so there's no delete for them.",
  /** A kind of the record home keeps none of. */
  keptNone: "None on home yet",
  /** A kind's list. */
  kind: {
    back: "My data",
    unknown: "There's no such kind of recording.",
    empty: "None of these yet.",
    play: (when: string): string => `Play the recording of ${when}`,
    stop: (when: string): string => `Stop the recording of ${when}`,
    /** While its audio is read, here or from home (MD8). */
    fetching: (when: string): string => `Getting the recording of ${when}`,
    /** A row home holds and gives no audio back for. */
    noPlay: "Its audio stays on home.",
    /** Said over the list when a Play's audio didn't come. */
    missed: "Couldn't play that recording just now. Try again in a moment.",
    newest: (shown: number, total: number): string =>
      `Showing the newest ${shown} of ${total}.`,
  },
} as const

/** A kind's line: `214 · since 12 Sep 2026`, and where it is when not home. */
export function kindLine(
  notes: number,
  since: string,
  phoneOnly: boolean
): string {
  const where = phoneOnly ? " · not on home yet" : ""
  return `${notes} · since ${onDay(since)}${where}`
}

/** A kind of the record's line: `214 on home · since 12 Sep 2026`, or none. */
export function keptLine(held: RecordHeld | undefined): string {
  return held === undefined
    ? MY_DATA.keptNone
    : `${held.count} on home · since ${onDay(held.since)}`
}

/**
 * What the "Kept for good" list says about home's count when home answered
 * the recordings' read but not the record's, or null. When home didn't
 * answer at all, `homeLine` has said so above.
 */
export function keptNote(record: RecordReading | undefined): string | null {
  if (record === undefined) return null
  switch (record.kind) {
    case "read": {
      return null
    }
    case "older": {
      return "Home can't say how many of these it keeps until it runs a newer version."
    }
    case "unreachable": {
      return "Home didn't say how many of these it keeps. Drag down to try again."
    }
    default: {
      return assertNever(record)
    }
  }
}

/** The kind page's lead: `214 kept · 72.0 MB · since 12 Sep 2026`. */
export function kindLead(
  notes: number,
  bytes: number,
  since: string | null
): string {
  const kept = `${notes} kept · ${formatSize(bytes)}`
  return since === null ? kept : `${kept} · since ${onDay(since)}`
}

/**
 * When a recording was made, and how long it is once home heard it, in a
 * kind's list (MD8): `Recorded 1 Nov at 21:12 · 42 s long` (C230).
 */
export function itemLine(at: string, durationMs: number | null): string {
  const when = new Date(at)
  const recorded = `Recorded ${shortDay.format(when)} at ${clock.format(when)}`
  return durationMs === null
    ? recorded
    : `${recorded} · ${lengthOf(durationMs)} long`
}

/** Where a recording is, and its room: `On home · 288.0 KB`. */
export function itemWhere(where: Where, bytes: number): string {
  return `${WHERE_WORDS[where]} · ${formatSize(bytes)}`
}

/**
 * A recording whose audio home let go when its week closed (IW14, #3183): a
 * week of mock interview keeps each question's first and newest take, and
 * the words of all. What stays, and where it still plays, in place of where
 * it is kept and its room.
 */
export function itemWent(
  at: string,
  playsHere: boolean,
  setAside: boolean
): string {
  return [
    `Its recording went when its week closed, on ${onDay(at)}. What home heard in it stays.`,
    ...(setAside ? ["You'd set it aside."] : []),
    ...(playsHere ? ["It still plays from this phone."] : []),
  ].join(" ")
}

/**
 * What home heard in a recording home holds (MD8): its first words, in
 * quotes, or that it heard none, or not yet. Null for one only on this
 * phone, which home hasn't had to hear.
 */
export function heardLine(heard: Heard, where: Where): string | null {
  switch (heard.kind) {
    case "words": {
      return heard.cut ? `“${heard.text}…”` : `“${heard.text}”`
    }
    case "silent": {
      return "Home heard no words in it."
    }
    case "notYet": {
      return where === "home" || where === "aside"
        ? "Home hasn't heard it yet."
        : null
    }
    case "unsaid": {
      return null
    }
    default: {
      return assertNever(heard)
    }
  }
}

/** One recording's name, for a screen reader: `1 Nov 2026, 21:12`. */
export function itemName(at: string): string {
  return `${onDay(at)}, ${clock.format(new Date(at))}`
}

/** The page that hands each store in. */
const STORE_PAGES = { studio: "Studio", soundbite: "Soundbites" } as const

/**
 * Which of this phone's recordings aren't counted yet, and why: a page
 * hands its recordings in when it opens.
 */
export function unreadLine(
  unread: ReadonlyArray<"studio" | "soundbite">
): string | null {
  const pages = unread.map((store) => STORE_PAGES[store])
  if (pages.length === 0) return null
  const named = pages.join(" and ")
  return `${named} ${pages.length === 1 ? "hasn't" : "haven't"} been opened since the app started, so ${pages.length === 1 ? "its" : "their"} recordings on this phone aren't counted yet.`
}

/** How many there are, said for the "where" chart's name. */
export const recordingsCount = (n: number): string => counted(n, "recording")

/**
 * What the page says about home's side when it has no numbers from home,
 * or null when it has them.
 */
export function homeLine(home: HomeReading["kind"]): string | null {
  switch (home) {
    case "read": {
      return null
    }
    case "reading": {
      return "Asking home what it keeps…"
    }
    case "unpaired": {
      return "This phone isn't paired with home, so only what isn't on home yet is counted. Pair on Home."
    }
    case "unreachable": {
      return "Home didn't answer, so only what isn't on home yet is counted. Drag down to try again."
    }
    case "busy": {
      return "This phone was busy with home just then, so only what isn't on home yet is counted. Drag down to try again in a moment."
    }
    case "older": {
      return "Home can't say what it keeps until it runs a newer version, so only what isn't on home yet is counted."
    }
    default: {
      return assertNever(home)
    }
  }
}

/** Each kind My data can delete, one and many, as the sheet names it. */
export const DELETABLE_NAMES: Readonly<
  Record<DeletableKind, { readonly one: string; readonly many: string }>
> = {
  studio: { one: "Studio recording", many: "Studio recordings" },
  reflection: { one: "spoken reflection", many: "spoken reflections" },
  game: { one: "recording from a game", many: "recordings from games" },
  leetype: { one: "LeetType answer", many: "LeetType answers" },
  lens: { one: "grammar lens take", many: "grammar lens takes" },
  scene: { one: "scene note", many: "scene notes" },
  soundbite: { one: "soundbite", many: "soundbites" },
  jobs: { one: "Jobs note", many: "Jobs notes" },
  "rust-round": { one: "Rust Rounds note", many: "Rust Rounds notes" },
  interview: { one: "interview take", many: "interview takes" },
  hunch: { one: "thing said to the shop", many: "things said to the shop" },
}

/**
 * What stays on this phone of each kind once home deleted its recording
 * (HEARD4), one and many: where it was said, as its own page keeps it
 * (`lib/home-link/voice-copy`'s `letGoDeleted` says what each lets go).
 */
const STAYS_HERE: Readonly<
  Record<DeletableKind, { readonly one: string; readonly many: string }>
> = {
  studio: {
    one: "Its place in Studio: the shot it was taken for, or the idea it answered, which says it was deleted",
    many: "Each one's place in Studio: the shot it was taken for, or the idea it answered, which says it was deleted",
  },
  reflection: {
    one: "The reflection, in its session, which says its recording was deleted",
    many: "Each reflection, in its session, which says its recording was deleted",
  },
  game: {
    one: "The game and the moment it was about",
    many: "Each one's game and the moment it was about",
  },
  leetype: {
    one: "Its place in LeetType: the session and screen it answered",
    many: "Each one's place in LeetType: the session and screen it answered",
  },
  lens: {
    one: "Its place in the grammar lens: the line it was taken on",
    many: "Each one's place in the grammar lens: the line it was taken on",
  },
  scene: {
    one: "The scene it was said for",
    many: "The scenes they were said for",
  },
  soundbite: {
    one: "The soundbite in your list, which says its recording was deleted",
    many: "Each soundbite in your list, which says its recording was deleted",
  },
  jobs: {
    one: "The Jobs record it was said for",
    many: "The Jobs record they were said for",
  },
  "rust-round": {
    one: "Its place in Rust Rounds: the card or week ticket it was said on",
    many: "Each one's place in Rust Rounds: the card or week ticket it was said on",
  },
  interview: {
    one: "Its place in the interview week: the question or card it answered",
    many: "Each one's place in the interview week: the question or card it answered",
  },
  hunch: {
    one: "Its words, if home hadn't yet looked them up, kept on this phone",
    many: "Their words, where home hadn't yet looked them up, kept on this phone",
  },
}

/**
 * Whether home's receipt is a week's middle take's (IW14): its recording
 * alone went when the week closed, and the note stays, which the owner's
 * own delete never keeps (paulgsc/server `delete::let_go_audio`).
 */
export const wentAtClose = (receipt: Pick<Receipt, "stayed">): boolean =>
  receipt.stayed.includes("note")

/** What went or stayed with a deleted recording, as home's receipt names it. */
const RECEIPT_PARTS: Readonly<Record<string, string>> = {
  recording: "the recording",
  // A week of mock interview's middle take, whose recording alone went (IW14).
  note: "its place in your record",
  words: "home's words for it",
  "set-aside mark": "its Let go mark",
  "mailbox copy": "a copy of its words in the Jobs mailbox",
  "drive copy": "its copy in Drive",
  idea: "the idea it answered",
  // Its moves along Studio's conveyor (CONVEYOR1, paulgsc/server#839).
  "conveyor history": "each move it made along the conveyor",
  // Home's verdict on it, which outlives the recording (HEARD1, C436).
  verdict: "whether home could make it out",
  // What the owner chose on Needs your attention, which outlives it too
  // (HEARD3, server#912).
  reconciliation:
    "what you chose to do with it after home couldn't hear it well",
  // A game note's moment: its scenario, screen and time (server#912).
  "game bite": "the game moment it was about",
}

/** A receipt's list of what went or stayed, as a sentence: `the recording and home's words for it`. */
export function receiptParts(parts: ReadonlyArray<string>): string {
  if (parts.length === 0) return "Nothing else"
  const said = listed(
    parts.map((part) => RECEIPT_PARTS[part] ?? "something else")
  )
  return said.charAt(0).toUpperCase() + said.slice(1)
}

/** What kind a receipt's recording was. */
export function receiptKind(of: string): string {
  if (!isKind(of)) return "Recording"
  const name = DELETABLE_NAMES[of].one
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** "Delete…" and the sheet that asks once (MD3, #2477). */
export const DELETING = {
  /** A row's "Delete…", and its name for a screen reader. */
  row: "Delete…",
  rowName: (when: string): string => `Delete the recording of ${when}…`,
  /** Which recording a row's mark of what uses it is on (INUSE). */
  markOf: (when: string): string => `the recording of ${when}`,
  select: "Select",
  cancel: "Cancel",
  selectName: (when: string): string => `Select the recording of ${when}`,
  deleteSelected: (n: number): string =>
    n === 0 ? "Delete…" : `Delete ${String(n)}…`,
  /** When a kind's store isn't handed in, so its copies can't be let go. */
  waitsOn: (store: keyof typeof STORE_PAGES): string =>
    `${STORE_PAGES[store]} hasn't been opened since the app started, so its recordings on this phone aren't counted yet, and none of its recordings can be deleted here until it is.`,
  title: (of: DeletableKind, n: number): string =>
    n === 1
      ? `Delete this ${DELETABLE_NAMES[of].one} for good?`
      : `Delete ${String(n)} ${DELETABLE_NAMES[of].many} for good?`,
  goesTitle: "Goes for good",
  staysTitle: "Stays",
  /**
   * What goes, the videos that play it included (paulgsc/server
   * docs/identity.md's essay-render exception, rule (d); server#1055): a
   * cards essay, or a Rust Rounds or interview week's essay, that plays a
   * deleted take is withdrawn for good, its video on home with it. Home has
   * no YouTube access, so a copy uploaded there stays (the owner, 2026-11-21).
   */
  goes: (n: number): ReadonlyArray<string> =>
    n === 1
      ? [
          "The recording, on home and on this phone",
          "Home's words for it",
          "Any essay video on home that plays it, a cards essay's included. Home won't make that essay again. A copy you uploaded to YouTube is yours to take down.",
        ]
      : [
          "The recordings, on home and on this phone",
          "Home's words for them",
          "Any essay video on home that plays one of them, a cards essay's included. Home won't make that essay again. A copy you uploaded to YouTube is yours to take down.",
        ],
  stays: (of: DeletableKind, n: number): ReadonlyArray<string> =>
    n === 1
      ? [
          STAYS_HERE[of].one,
          "Whether home could make it out",
          "Any copy of its words already in the Jobs mailbox",
          "Its copy in your Drive, if it has one. This app can't reach Drive: delete it there if you want it gone.",
          "A receipt: what kind it was, when it was recorded, how big it was, and when it was deleted. Never what you said.",
        ]
      : [
          STAYS_HERE[of].many,
          "Whether home could make each out",
          "Any copy of their words already in the Jobs mailbox",
          "Their copies in your Drive, if they have any. This app can't reach Drive: delete them there if you want them gone.",
          "A receipt for each: what kind it was, when it was recorded, how big it was, and when it was deleted. Never what you said.",
        ],
  keep: (n: number): string => (n === 1 ? "Keep it" : "Keep them"),
  confirm: (n: number): string =>
    n === 1 ? "Delete for good" : `Delete ${String(n)} for good`,
  deleting: "Deleting…",
  done: "Done",
  tryAgain: "Try again",
  allReceipts: "All receipts",
  /** The title once home answered. */
  gone: (n: number): string =>
    n === 1 ? "Deleted for good" : `${String(n)} deleted for good`,
  nothing: "Nothing was deleted",
  letting: "Letting this phone's copy go…",
  letFailed:
    "Home deleted it for good, and this phone couldn't let its own copy go just now.",
  kept: (n: number, of: number): string =>
    of === 1
      ? "Home keeps this one, so nothing was deleted, on home or on this phone."
      : `Home keeps ${String(n)} of them, so ${n === 1 ? "it wasn't" : "they weren't"} deleted.`,
  notHeld: (n: number, of: number): string =>
    of === 1
      ? "Home doesn't have this one any more, so there was nothing there to delete. This phone kept its copy."
      : `Home didn't have ${String(n)} of them any more, so there was nothing there to delete.`,
  forgotten:
    "Home no longer knows this phone, so nothing more was deleted. Pair again on Home.",
  unanswered: (n: number, of: number): string =>
    of === 1
      ? "Home didn't answer, so it is still kept, on home and on this phone, as before. Try again when this phone can reach home."
      : `Home didn't answer for ${String(n)} of them, so ${n === 1 ? "it is" : "they are"} still kept, on home and on this phone.`,
  unpaired:
    "This phone isn't paired with home, so nothing home keeps can be deleted from here. Pair on Home.",
  busy: "This phone was busy with home just then, so nothing was deleted. Try again in a moment.",
  unreachable: (n: number): string =>
    `Home couldn't be reached from here, so ${n === 1 ? "it is" : "they are"} still kept, on home and on this phone, as before. Try again when this phone can reach home.`,
  receipt: {
    title: "Receipt",
    what: "What",
    recorded: "Recorded",
    size: "Size",
    deleted: "Deleted",
    went: "Went",
    stayed: "Stayed",
    kept: "This receipt is kept for good on home. It never holds what you said.",
  },
} as const

/** My data's Deleted page: the receipts. */
export const RECEIPTS = {
  /** The overview's way in. */
  row: "Deleted",
  rowLine: "What went, and when",
  title: "Deleted",
  lead: "Each recording home no longer keeps, and when: one you deleted, or a middle take of an interview week, whose words stay.",
  empty: "Nothing has been deleted.",
  /** What a drag down reads again. */
  pullWhat: "what home deleted",
  line: (kind: string, recorded: string): string =>
    `${kind}, recorded ${recorded}`,
  deletedLine: (at: string): string => `Deleted ${at}`,
  /** A week of mock interview's middle take, its recording gone when the week closed (IW14). */
  closedLine: (at: string): string => `Went when its week closed, ${at}`,
  wentLine: (went: string): string => `Went: ${went}`,
  stayedLine: (stayed: string): string => `Stayed: ${stayed}`,
} as const

/** What the Deleted page says when it has no receipts from home, or null. */
export function receiptsLine(home: ReceiptsReading["kind"]): string | null {
  switch (home) {
    case "read": {
      return null
    }
    case "reading": {
      return "Asking home what was deleted…"
    }
    case "unpaired": {
      return "This phone isn't paired with home, so it can't say what was deleted. Pair on Home."
    }
    case "unreachable": {
      return "Home didn't answer. Drag down to try again."
    }
    case "busy": {
      return "This phone was busy with home just then. Drag down to try again in a moment."
    }
    case "older": {
      return "Home can't list what was deleted until it runs a newer version."
    }
    default: {
      return assertNever(home)
    }
  }
}

/**
 * My data's page for each feed's videos (ST38, #2661; FEED4): an episode's
 * video, a week of the call, of Playoff Delta, of Rust Rounds or of the
 * engagement report, and then the rest of its
 * folder are let go of home once its YouTube link is saved, each asked once,
 * "Keep it" first. Each feed's own words (its heading, an episode's label,
 * "still making") are `FEED_WORDS`', as Studio says them.
 */
export const CALL_DELETING = {
  /** The overview's way in. */
  row: "The videos home makes",
  rowLine: "Let home's copy go once a video is on YouTube",
  title: "The videos home makes",
  lead: "Home keeps each video, the weekly call's, Playoff Delta's, each Rust Rounds essay's and each engagement report's, until it's on YouTube. Once its link is saved in Studio, let home's copy go: the video first, then the rest.",
  /** An episode, named with its feed, as the sheet says it. */
  episode: (feed: Feed, key: string): string => {
    const { heading, week } = FEED_WORDS[feed]
    const named = week(key)
    return named === null ? heading : `${heading}, ${named}`
  },
  pair: "Pair this phone with home",
  noLink: "Save its YouTube link in Studio first.",
  allGone: "Home's copy went. It lives on YouTube.",
  video: (size: string): string => `Delete the video (${size})…`,
  rest: (size: string): string => `Delete the rest (${size})…`,
  asks: {
    video: "Delete this video?",
    rest: "Delete the rest of it?",
  },
  goes: {
    video: (size: string): string => `The video home keeps of it, ${size}.`,
    /** A report holds no takes: its voice-over is home's speaker's. */
    rest: (size: string, feed: Feed): string =>
      feed === "report"
        ? `Its stills, voice-over and cut list, ${size}.`
        : `Its takes, stills and cut list, ${size}.`,
  },
  /** A report has no words of its own: the week's counts are what stay. */
  stays: (feed: Feed): string =>
    feed === "report"
      ? "The week's counts, its YouTube link, and a receipt of this delete."
      : "Its words, its YouTube link, and a receipt of this delete.",
  gone: (at: string): string => `Deleted ${at}. A receipt stays with it.`,
  kept: "Home kept it. A video goes only once its link is saved, and the rest only after the video.",
  notHeld: "Home doesn't hold this one.",
  forgotten: "This phone isn't paired with home now, so nothing was deleted.",
  unanswered: "Home didn't answer, so nothing was deleted.",
} as const

/**
 * My data's Korean word sets page (MD7, #2496): each read-aloud word set
 * kept on this phone, from a routine scene or a picked file, and Archive or
 * Bring back. An
 * archived set is kept whole; only the owner archives one (C232).
 */
export const WORD_SETS = {
  /** The overview's way in. */
  row: "Korean word sets",
  rowLine: "Archive the sets you're done reading aloud",
  title: "Korean word sets",
  lead: "Each word set on this phone for reading aloud, from the routine's scenes or a file you picked. Archiving one takes it out of Read aloud and Ready for you and frees its place. It stays on this phone, and so do your counts on its sentences and each word's pace. Bring it back any time.",
  /** What a drag down reads again. */
  pullWhat: "this phone's word sets",
  reading: "Reading this phone's word sets…",
  unread:
    "This phone's word sets couldn't be read just now. Drag down to try again.",
  none: "No word sets on this phone yet. Opening a scene from the routine, or picking a word set file, adds one.",
  inUse: (n: number, limit: number): string =>
    `In use · ${String(n)} of ${String(limit)}`,
  noneInUse: "None in use. Bring one back to read it aloud again.",
  archivedTitle: "Archived",
  added: (at: string): string => `Added ${onDay(at)}`,
  opened: (at: string | null): string =>
    at === null ? "Not opened yet" : `First opened ${onDay(at)}`,
  archivedOn: (at: string): string => `Archived ${onDay(at)}`,
  sentences: (n: number): string => counted(n, "sentence"),
  /** The hint on a set first opened 30 or more days ago; the phone keeps only the first open. */
  longAgo:
    "First opened a month or more ago. Archive it if you're done with it.",
  archive: "Archive",
  archiveName: (title: string): string => `Archive ${title}`,
  bringBack: "Bring back",
  bringBackName: (title: string): string => `Bring back ${title}`,
  /** Under "Archived" when every place in use is taken. */
  full: (limit: number): string =>
    `All ${String(limit)} places are in use. Archive a set to bring one back.`,
  said: {
    archived: (title: string): string =>
      `Archived "${title}". It's kept on this phone, out of Read aloud.`,
    broughtBack: (title: string): string => `"${title}" is back in Read aloud.`,
    notKept: "This phone couldn't keep that just now, so nothing changed.",
    noRoom: (limit: number): string =>
      `All ${String(limit)} places are in use, so it stays archived. Archive another set first.`,
  },
} as const
