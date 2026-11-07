/**
 * Everything My data says (MY-DATA MD2, #2476), in the person's terms: what
 * is kept where, and since when, never the machinery (CLAUDE.md, "State in
 * the person's terms"). Pure; `./__tests__/words.test.ts` holds it to that.
 */
import { assertNever, counted, formatSize, listed } from "@some-ui/core-utils"

import type { DeletableKind, ReceiptsReading } from "./deleting"
import { isDeletableKind } from "./deleting"
import type { HomeReading, Of, Where } from "./model"
import { isKind } from "./model"
import type { RecordHeld, RecordKind, RecordReading } from "./record"

/** Each kind of recording, as the person knows it. */
export const KIND_NAMES: Readonly<Record<Of, string>> = {
  studio: "Studio takes and idea answers",
  reflection: "Spoken reflections",
  game: "Game bites",
  leetype: "LeetType answers",
  lens: "Grammar lens takes",
  scene: "Scene notes",
  soundbite: "Soundbites",
  jobs: "Jobs notes",
  "rust-round": "Rust Rounds notes",
}

/** Where a recording is kept. */
export const WHERE_WORDS: Readonly<Record<Where, string>> = {
  home: "On home",
  aside: "Set aside, on home",
  going: "Going home",
  phone: "Only on this phone",
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

/** One recording's line in a kind's list: `1 Nov · 21:12 · 288.0 KB`. */
export function itemLine(at: string, bytes: number): string {
  const when = new Date(at)
  return `${shortDay.format(when)} · ${clock.format(when)} · ${formatSize(bytes)}`
}

/** One recording's name, for a screen reader: `1 Nov 2026, 21:12`. */
export function itemName(at: string): string {
  return `${onDay(at)}, ${clock.format(new Date(at))}`
}

/**
 * Which of this phone's recordings aren't counted yet, and why: a page
 * hands its recordings in when it opens.
 */
export function unreadLine(
  unread: ReadonlyArray<"studio" | "soundbite">
): string | null {
  const pages = unread.map((store) =>
    store === "studio" ? "Studio" : "Soundbites"
  )
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
}

/** What went or stayed with a deleted recording, as home's receipt names it. */
const RECEIPT_PARTS: Readonly<Record<string, string>> = {
  recording: "the recording",
  words: "home's words for it",
  "set-aside mark": "its Let go mark",
  "mailbox copy": "a copy of its words in the Jobs mailbox",
  "drive copy": "its copy in Drive",
  idea: "the idea it answered",
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
  return isKind(of) && isDeletableKind(of)
    ? DELETABLE_NAMES[of].one
    : "Recording"
}

/** "Delete…" and the sheet that asks once (MD3, #2477). */
export const DELETING = {
  /** A row's "Delete…", and its name for a screen reader. */
  row: "Delete…",
  rowName: (when: string): string => `Delete the recording of ${when}…`,
  select: "Select",
  cancel: "Cancel",
  selectName: (when: string): string => `Select the recording of ${when}`,
  deleteSelected: (n: number): string =>
    n === 0 ? "Delete…" : `Delete ${String(n)}…`,
  /** When a kind's store isn't handed in, so its copies can't be let go. */
  waitsOnStudio:
    "Studio hasn't been opened since the app started, so its takes can't be deleted here yet.",
  title: (of: DeletableKind, n: number): string =>
    n === 1
      ? `Delete this ${DELETABLE_NAMES[of].one} for good?`
      : `Delete ${String(n)} ${DELETABLE_NAMES[of].many} for good?`,
  goesTitle: "Goes for good",
  staysTitle: "Stays",
  goes: (n: number): ReadonlyArray<string> =>
    n === 1
      ? ["The recording, on home and on this phone", "Home's words for it"]
      : ["The recordings, on home and on this phone", "Home's words for them"],
  stays: (n: number): ReadonlyArray<string> =>
    n === 1
      ? [
          "Its place in Studio: the shot it was taken for, or the idea it answered, which says it was deleted",
          "Any copy of its words already in the Jobs mailbox",
          "Its copy in your Drive, if it has one. This app can't reach Drive: delete it there if you want it gone.",
          "A receipt: what kind it was, when it was recorded, how big it was, and when it was deleted. Never what you said.",
        ]
      : [
          "Each one's place in Studio: the shot it was taken for, or the idea it answered, which says it was deleted",
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
  back: "My data",
  lead: "Each recording you deleted, and when. None of them holds what you said.",
  empty: "Nothing has been deleted.",
  /** What a drag down reads again. */
  pullWhat: "what home deleted",
  line: (kind: string, recorded: string): string =>
    `${kind}, recorded ${recorded}`,
  deletedLine: (at: string): string => `Deleted ${at}`,
  wentLine: (went: string): string => `Went: ${went}`,
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
    case "older": {
      return "Home can't list what was deleted until it runs a newer version."
    }
    default: {
      return assertNever(home)
    }
  }
}

/**
 * My data's page for the weekly call's videos (ST38, #2661): a week's video
 * and then the rest of its folder are let go of home once the week's
 * YouTube link is saved, each asked once, "Keep it" first.
 */
export const CALL_DELETING = {
  /** The overview's way in. */
  row: "The weekly call's videos",
  rowLine: "Let home's copy go once a week is on YouTube",
  title: "The weekly call's videos",
  back: "My data",
  lead: "Home keeps each week's video until it's on YouTube. Once its link is saved in Studio, let home's copy go: the video first, then the rest.",
  week: (from: string, to: string): string => `${from} to ${to}`,
  noLink: "Save its YouTube link in Studio first.",
  waiting: "Home is still making this week's video.",
  allGone: "Home's copy went. It lives on YouTube.",
  video: (size: string): string => `Delete the video (${size})…`,
  rest: (size: string): string => `Delete the rest (${size})…`,
  asks: {
    video: "Delete this week's video?",
    rest: "Delete the rest of this week?",
  },
  goes: {
    video: (size: string): string =>
      `The video home keeps of the week, ${size}.`,
    rest: (size: string): string => `Its takes, stills and cut list, ${size}.`,
  },
  stays: "The week's words, its YouTube link, and a receipt of this delete.",
  keep: "Keep it",
  confirm: "Delete for good",
  deleting: "Deleting…",
  done: "Done",
  gone: (at: string): string => `Deleted ${at}. A receipt stays with the week.`,
  kept: "Home kept it. A week's video goes only once its link is saved, and the rest only after the video.",
  notHeld: "Home doesn't hold this week.",
  forgotten: "This phone isn't paired with home now, so nothing was deleted.",
  away: "Home didn't answer, so nothing was deleted.",
  tryAgain: "Try again",
} as const
