/**
 * Every word a record kept on home shows (LA9 to LA11): each lane's mark in
 * the header, its sheet, and the choice to keep sending; and Settings'
 * choice to show the routine's files in Korean (LA12). Pure, and the one
 * place those words live, so they stay in the person's terms (what is kept
 * where, and since when) and never the machinery's: no request, status
 * code, address or state name reaches the screen (`__tests__/words.test.ts`).
 */
import { counted } from "@some-ui/core-utils"

import type { ConsentLog, Scope, Shared } from "./consent-model"
import type { KeptState } from "./kept-model"
import type { LaneCounts, LaneId } from "./lanes"
import type { LastRead } from "./routine-model"

/** One row of a lane's sheet: what one scope is called, and one of it. */
type Row = {
  readonly scope: Scope
  readonly label: string
  readonly one: string
  /** When it is not `one` and an s. */
  readonly many?: string
}

/** One lane's own words; `SHEET` holds the ones every lane shares. */
export type LaneWords = {
  /** The mark's spoken name. */
  readonly markLabel: string
  readonly title: string
  readonly rows: ReadonlyArray<Row>
  /** What waits on this phone, counted, as a sentence's start. */
  readonly waits: (n: number) => string
  /** When a kept lane sends. */
  readonly whileOpen: string
  readonly phoneOnly: string
  /** Not kept, with some of it on home. */
  readonly partly: string
  /** What never leaves, or stays put. */
  readonly footnote: string
  readonly stopQuestion: string
  readonly stopMore: string
  /** Not kept, where the choice is made elsewhere (Practice: Settings' send). */
  readonly startElsewhere: string | null
  /**
   * Not kept, the first press's question, given how much goes: also the
   * words kept with the choice. Null where the choice is made elsewhere.
   */
  readonly offer: ((n: number) => string) | null
  /** `LaneCounts`' `away`, given the changes this phone holds (aph). */
  readonly away: ((n: number) => string) | null
  /** Waiting changes that clash with home's record, so not shown (aph). */
  readonly clash: ((n: number) => string) | null
  /** Kept, before home's record has been read since the app opened (aph). */
  readonly unread: string | null
}

const waits =
  (noun: string) =>
  (n: number): string =>
    `${counted(n, noun)} wait${n === 1 ? "s" : ""}`

export const WORDS: Readonly<Record<LaneId, LaneWords>> = {
  practice: {
    markLabel: "Where Practice is kept",
    title: "Practice and home",
    rows: [
      {
        scope: "sessions",
        label: "Finished sessions",
        one: "session",
      },
      {
        scope: "shelf",
        label: "Kept shelf items",
        one: "kept item",
      },
    ],
    waits: waits("session"),
    whileOpen: "while Practice is open",
    phoneOnly: "Practice is only on this phone. Losing the phone loses it.",
    partly:
      "Some of Practice is on home. New sessions stay on this phone until you send them.",
    footnote: "Reflections never leave this phone.",
    stopQuestion: "Stop sending new sessions and kept items to home?",
    stopMore:
      "This phone tells home you stopped, when it can. What home already has stays there. This phone keeps everything it has. You can choose to keep sending again from any send.",
    startElsewhere: "Send from Settings, and choose there to keep sending.",
    offer: null,
    away: null,
    clash: null,
    unread: null,
  },
  aph: {
    markLabel: "Where aph is kept",
    title: "aph and home",
    rows: [
      {
        scope: "aph",
        label: "Entries and settings",
        one: "entry",
        many: "entries",
      },
    ],
    waits: waits("change"),
    whileOpen: "while aph is open",
    phoneOnly: "aph is only on this phone. Losing the phone loses it.",
    partly:
      "Some of aph is on home. New entries stay on this phone from now on.",
    footnote: "Stopping brings aph back to this phone.",
    stopQuestion: "Stop sending aph to home?",
    stopMore:
      "This phone tells home you stopped, when it can, and asks home for aph's record and keeps it here again, with the changes still waiting; any that clash with home's record are kept aside on this phone. What home has stays there too.",
    startElsewhere: null,
    offer: (n) =>
      `Send ${counted(n, "change")} from this phone to home, and keep sending from now on? This phone then keeps only the settings and what home hasn't confirmed. Changes go while aph is open. Stop any time, and aph comes back to this phone.`,
    away: (n) =>
      `Sending to home is off. Home holds aph; this phone holds only the ${counted(n, "change")} home hadn't confirmed.`,
    clash: (n) =>
      `${counted(n, "change")} waiting here clash with home's record and aren't shown.`,
    unread:
      "Until home answers, this shows only what this phone hasn't sent yet.",
  },
  jobs: {
    markLabel: "Where the Jobs record is kept",
    title: "Jobs and home",
    rows: [
      { scope: "jobs", label: "The record", one: "event", many: "events" },
    ],
    waits: waits("event"),
    whileOpen: "while Jobs is open",
    phoneOnly:
      "The Jobs record is only on this phone. Losing the phone loses it.",
    partly:
      "Some of the Jobs record is on home. New events stay on this phone from now on.",
    footnote: "Voice notes stay on the phone and in Drive.",
    stopQuestion: "Stop sending the Jobs record to home?",
    stopMore:
      "This phone tells home you stopped, when it can. What home already has stays there. This phone keeps its whole record.",
    startElsewhere: null,
    offer: (n) =>
      `Send ${counted(n, "event")} to home, and keep sending from now on? This phone keeps its whole record too. New events go while Jobs is open. Stop any time; what's sent stays on home.`,
    away: null,
    clash: null,
    unread: null,
  },
}

/** The words every lane's sheet shares. */
export const SHEET = {
  sendNow: "Send now",
  stop: "Stop sending...",
  stopTitle: "Stop sending",
  stopYes: "Stop sending",
  stopNo: "Keep sending",
  keep: "Keep sending to home...",
  keepYes: "Keep sending",
  keepNo: "Cancel",
  keepRefused: "This phone couldn't keep that choice. Nothing changed.",
  stopRefused: "This phone couldn't keep that choice, so sending goes on.",
  pairFirst: "Pair this phone with home in Settings to send it there.",
  bringBack: "Bring it back to this phone",
  settings: "Send, free space and pairing: Settings",
} as const

/** The send confirm's box, and the words stored with the choice. */
export const KEEP_SENDING = "Keep sending these to home from now on"
export const KEEP_SENDING_MORE =
  "New finished sessions and kept items go to home while Practice is open, and the mark at the top shows each send. Stop any time; what's sent stays on home."

/** Settings' send with nothing to carry: some left out as home took them, or none at all. */
export const NOTHING_TO_SEND = {
  taken: (host: string): string =>
    `Nothing new to send: ${host} took every kept item as it is now.`,
  none: "Nothing on this phone to send.",
} as const

/** Settings' send, once Practice is kept on home. */
export const KEPT_NOTE =
  "Practice's finished sessions and kept items go to home on their own while Practice is open. To stop, tap the mark at the top of Practice, or Stop sending below."

/** The box was ticked, but this phone could not keep the choice. */
export const KEEP_SENDING_REFUSED =
  "This phone couldn't keep that choice, so this send is once only."

/** What a person agreed to when they ticked the box, as stored with it. */
export const KEEP_SENDING_SAID = `${KEEP_SENDING}. ${KEEP_SENDING_MORE}`

/** Settings' ledger: what this phone shares with home, and every choice. */
export const LEDGER = {
  title: "What this phone shares",
  lead: "What home has, it keeps: stopping never erases it there.",
  names: {
    practice: "Practice",
    aph: "aph",
    jobs: "The Jobs record",
  } satisfies Record<LaneId, string>,
  /** aph comes back to this phone as it stops, which its own screens do. */
  stopInAph:
    "To stop, tap the mark at the top of aph: aph comes back to this phone as it stops.",
  neverTitle: "Never shared",
  never: [
    {
      label: "Lessons, dramas and rounds home publishes",
      text: "Come from home when you ask for them. Nothing goes the other way.",
    },
    {
      label: "Reflections, voice takes and soundbites",
      text: "Never go to home. You can share them yourself, to Drive.",
    },
    {
      label: "What you set in Settings, and your profile",
      text: "Stay on this phone.",
    },
  ],
  historyTitle: "Every choice",
  noHistory: "No choice to keep sending made yet.",
  /** Under a pairing made before the log, a record's own switch may have chosen. */
  noHistoryEarlier: "No choice recorded on this phone yet.",
  /** What to open for each record: its wing's own name. */
  opens: {
    practice: "Practice",
    aph: "aph",
    jobs: "Jobs",
  } satisfies Record<LaneId, string>,
  /** A record whose choice an earlier pairing made, which only its own screens know. */
  unsure: (opens: string): string =>
    `This phone was paired before it kept its choices, so where it is kept shows on ${opens}'s own mark.`,
} as const

const LANE_OF: Readonly<Record<Scope, LaneId>> = {
  sessions: "practice",
  shelf: "practice",
  aph: "aph",
  jobs: "jobs",
}

/** One choice, as the ledger's history says it. */
export type HistoryLine = {
  /** Its place in the log, and the lane: unique, and never reused. */
  readonly key: string
  readonly text: string
}

/** A day the ledger may be read years after. */
export const fullDay = (t: number): string =>
  new Date(t).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })

/**
 * Every choice in `log`, newest first: each lane it named, and whether
 * sending there began or stopped. A choice made under another pairing than
 * `pairing` says so.
 */
export function historyLines(
  log: ConsentLog,
  pairing: string | null,
  day: (t: number) => string = fullDay
): Array<HistoryLine> {
  return [...log].reverse().flatMap((event) => {
    const lanes = [...new Set(event.scopes.map((scope) => LANE_OF[scope]))]
    const elsewhere =
      event.pairing === pairing ? "" : ", under an earlier pairing"
    return lanes.map((lane) => {
      const name = LEDGER.names[lane]
      const what =
        event.kind === "stopped"
          ? `stopped sending to home${elsewhere}. Home keeps what it has.`
          : event.said === null
            ? `kept on home${elsewhere}, as chosen before this phone kept its choices.`
            : `kept on home${elsewhere}.`
      return {
        key: `${event.seq}-${lane}`,
        text: `${day(event.at)} · ${name}: ${what}`,
      }
    })
  })
}

/** The header mark's shape: where a record is kept, at a glance. */
export type Shape = "phone" | "partly" | "kept" | "waiting" | "trouble"

export type LaneFacts = Omit<LaneCounts, "away" | "offered"> & {
  /** The link has read the phone's own record of its pairing. */
  known: boolean
  shared: Shared
  /** What was kept and is stopped now, and since when. */
  stopped: ReadonlyMap<Scope, number>
  run: KeptState
  /** `LaneCounts`' `away`, and how bringing the record back went. */
  away: { readonly waiting: number; readonly back: KeptState } | null
}

export type LaneView = {
  shape: Shape
  /** Beside the mark. */
  word: string
  /** What the sheet says first, and the mark's spoken label. */
  line: string
  rows: Array<{ label: string; text: string }>
  /** Said under the rows. */
  notes: Array<string>
}

const shortDay = (t: number): string =>
  new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" })

function rowText(
  row: Row,
  facts: LaneFacts,
  day: (t: number) => string
): string {
  const held = facts.held[row.scope]
  const there =
    held === undefined ? "" : ` · ${counted(held, row.one, row.many)} there`
  const since = facts.shared.get(row.scope)
  if (since) {
    return `Kept on home since ${since.earlier ? "before " : ""}${day(since.since)}${there}`
  }
  const until = facts.stopped.get(row.scope)
  if (until !== undefined) {
    return `Sent to home until ${day(until)}${there} · new ones stay here`
  }
  if (held !== undefined && held > 0) {
    return `${counted(held, row.one, row.many)} on home · new ones stay here`
  }
  return "Only on this phone"
}

/** How a lane is kept, in `words`, from `facts`. */
export function laneView(
  words: LaneWords,
  facts: LaneFacts,
  day: (t: number) => string = shortDay
): LaneView {
  const rows = words.rows.map((row) => {
    const refused = facts.refused[row.scope] ?? 0
    return {
      label: row.label,
      text:
        rowText(row, facts, day) +
        (refused > 0
          ? ` · ${counted(refused, row.one, row.many)} home didn't take`
          : ""),
    }
  })
  const kept = facts.shared.size > 0
  const notes = [
    ...(kept && facts.hidden > 0 && words.clash
      ? [words.clash(facts.hidden)]
      : []),
    ...(kept &&
    !facts.pulled &&
    words.unread &&
    facts.run.last?.kind !== "synced"
      ? [words.unread]
      : []),
  ]
  const show = (shape: Shape, word: string, line: string): LaneView => ({
    shape,
    word,
    line,
    rows,
    notes,
  })

  if (!facts.known) {
    return show("partly", "Checking", "Checking where this is kept.")
  }
  if (!kept) {
    if (facts.away !== null && words.away !== null) {
      const { back } = facts.away
      const held = words.away(facts.away.waiting)
      if (back.running) {
        return show("waiting", "Bringing back", "Bringing it back from home.")
      }
      if (back.last?.kind === "unreachable") {
        return show("trouble", "On home", `Home didn't answer. ${held}`)
      }
      if (back.last?.kind === "failed" && back.last.why === "busy") {
        return show("trouble", "On home", `Home is busy right now. ${held}`)
      }
      if (back.last?.kind === "forgotten") {
        return show(
          "trouble",
          "Pair again",
          `Home no longer knows this phone. ${held}`
        )
      }
      if (back.last?.kind === "failed") {
        return show(
          "trouble",
          "On home",
          `Something went wrong bringing it back. ${held}`
        )
      }
      return show("partly", "On home", held)
    }
    const some =
      facts.stopped.size > 0 || Object.values(facts.held).some((n) => n > 0)
    return some
      ? show("partly", "Partly on home", words.partly)
      : show("phone", "Phone only", words.phoneOnly)
  }

  const later =
    facts.waiting > 0
      ? ` ${words.waits(facts.waiting)} on this phone and go next time.`
      : ""
  if (facts.run.running) return show("waiting", "Sending", "Sending to home.")

  const last = facts.run.last
  if (last?.kind === "forgotten") {
    return show(
      "trouble",
      "Pair again",
      "Home no longer knows this phone. Pair it again in Settings, then choose to keep sending again."
    )
  }
  if (last?.kind === "unreachable") {
    return show("trouble", "No answer", `Home didn't answer.${later}`)
  }
  if (last?.kind === "failed") {
    if (last.why === "busy") {
      return show("trouble", "Home busy", `Home is busy right now.${later}`)
    }
    if (last.why === "full") {
      return show(
        "trouble",
        "Shelf full",
        "Home's shelf is full, so some kept items didn't fit."
      )
    }
    if (last.why === "refused") {
      return show(
        "trouble",
        "Not all taken",
        "Home didn't take some kept items."
      )
    }
    if (last.why === "fault") {
      return show(
        "trouble",
        "Didn't go",
        `Something on this phone went wrong.${later}`
      )
    }
    return show(
      "trouble",
      "Didn't go",
      `Something went wrong sending to home.${later}`
    )
  }
  if (facts.waiting > 0) {
    return show(
      "waiting",
      `${facts.waiting} waiting`,
      `${words.waits(facts.waiting)} on this phone. They go to home ${words.whileOpen}.`
    )
  }
  return show("kept", "On home", "Kept on home. Up to date.")
}

/**
 * Korean's look at what the reflections routine left on home (LA12):
 * Settings' choice to show it there, and how the last look went.
 */
export const ROUTINE_READS = {
  title: "From the routine",
  off: "Korean on this phone doesn't show the word sets and dramas the routine leaves on home.",
  show: "Show them in Korean...",
  /** The first press's question: also the words kept with the choice. */
  confirm: (host: string): string =>
    `Show the routine's word sets and dramas from ${host} in Korean? While Korean is open, this phone looks at what ${host} holds for you. It sends nothing of yours.`,
  confirmYes: "Show them",
  confirmNo: "Cancel",
  refused: "This phone couldn't keep that choice. Nothing changed.",
  on: (day: string): string => `Shown in Korean since ${day}.`,
  /** How the last look went, given when. */
  last: {
    read: (when: string): string => `Last looked at home ${when}.`,
    busy: (when: string): string =>
      `Home was busy when Korean last looked, ${when}.`,
    unreachable: (when: string): string =>
      `Home didn't answer when Korean last looked, ${when}.`,
    forgotten: (when: string): string =>
      `Home no longer knows this phone (${when}). Pair it again, then choose to show them again.`,
    failed: (when: string): string =>
      `Something went wrong when Korean last looked, ${when}.`,
  } satisfies Record<LastRead["kind"], (when: string) => string>,
  notYet: "Korean looks the next time it opens.",
  stop: "Stop showing...",
  stopQuestion: "Stop showing the routine's word sets and dramas in Korean?",
  stopMore: "What you opened stays on this phone.",
  stopYes: "Stop showing",
  stopNo: "Keep showing",
} as const

/** A moment a look was made: its day and time. */
export const lookedAt = (t: number): string =>
  new Date(t).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })

/** What Settings says of the last look, or that none was made yet. */
export function lastLook(
  last: LastRead | null,
  when: (t: number) => string = lookedAt
): string {
  return last === null
    ? ROUTINE_READS.notYet
    : ROUTINE_READS.last[last.kind](when(last.at))
}
