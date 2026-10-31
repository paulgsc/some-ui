/**
 * Every word a record this phone drains to home shows (LA14, LA15): each
 * lane's mark in the header, its sheet, and Settings' readout of what is
 * kept where and what waits; the clear of finished sessions home holds
 * (`./clear`); and Korean's look at the routine's files. Pure, and the one
 * place those words live, so they stay in the person's terms (what is kept
 * where, and what waits) and never the machinery's: no request, status
 * code, address or state name reaches the screen (`__tests__/words.test.ts`).
 */
import { assertNever, counted } from "@some-ui/core-utils"

import { OFFLINE_SET_WORDS } from "@/lib/session-reflection/policy"
import type { How, Where } from "@/lib/sharing-marks"
import type { Unsendable } from "@/lib/voice-home/model"
import { NO_ROOM } from "@/lib/voice-home/model"

import type { ClearEnd } from "./clear"
import type { KeptState } from "./kept-model"
import type { LaneCounts, LaneId, LaneKind } from "./lanes"
import type { LastRead } from "./routine-model"

/** One row of a lane's sheet: what one kind is called, and one of it. */
type Row = {
  readonly kind: LaneKind
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
  /** Not paired, with nothing of it on home. */
  readonly phoneOnly: string
  /** Not paired, with some of it on home. */
  readonly partly: string
  /** What never leaves, or stays put. */
  readonly footnote: string
  /** Waiting changes that clash with home's record, so not shown (aph). */
  readonly clash: ((n: number) => string) | null
  /** Paired, before home's record has been read since the app opened (aph). */
  readonly unread: string | null
}

const waits =
  (noun: string, many?: string) =>
  (n: number): string =>
    `${counted(n, noun, many)} wait${n === 1 ? "s" : ""}`

const PAIR = "Pair this phone with home in Settings to keep a copy there."

export const WORDS: Readonly<Record<LaneId, LaneWords>> = {
  practice: {
    markLabel: "Where Practice is kept",
    title: "Practice and home",
    rows: [
      {
        kind: "sessions",
        label: "Finished sessions",
        one: "session",
      },
      {
        kind: "shelf",
        label: "Kept shelf items",
        one: "kept item",
      },
      {
        kind: "reflections",
        label: "Written reflections",
        one: "written reflection",
      },
    ],
    waits: waits("session or reflection", "sessions and reflections"),
    phoneOnly: `Practice is only on this phone. ${PAIR}`,
    partly:
      "Some of Practice is on home. New sessions stay on this phone until it is paired again.",
    footnote: `Finished sessions, kept items, LeetType sessions, Studio sittings and written reflections go to home while the app is open. A finished session leaves this phone only when you clear it in Settings, once home has it. ${OFFLINE_SET_WORDS} Your answers to the three quick questions stay on this phone.`,
    clash: null,
    unread: null,
  },
  aph: {
    markLabel: "Where aph is kept",
    title: "aph and home",
    rows: [
      {
        kind: "aph",
        label: "Entries and settings",
        one: "entry",
        many: "entries",
      },
    ],
    waits: waits("change"),
    phoneOnly: `aph is only on this phone. ${PAIR}`,
    partly:
      "Home holds aph; this phone holds what home hadn't confirmed, until it is paired again.",
    footnote:
      "Home keeps every revision. This phone keeps the settings and what home hasn't confirmed, and sends while aph is open.",
    clash: (n) =>
      `${counted(n, "change")} waiting here clash with home's record and aren't shown.`,
    unread:
      "Until home answers, this shows only what this phone hasn't sent yet.",
  },
  jobs: {
    markLabel: "Where the Jobs record is kept",
    title: "Jobs and home",
    rows: [{ kind: "jobs", label: "The record", one: "event", many: "events" }],
    waits: waits("event"),
    phoneOnly: `The Jobs record is only on this phone. ${PAIR}`,
    partly:
      "Some of the Jobs record is on home. New events stay on this phone until it is paired again.",
    footnote:
      "This phone keeps its whole record. Its voice notes go to home too, and its decisions and scouts go to the morning run through home.",
    clash: null,
    unread: null,
  },
  voice: {
    markLabel: "Where voice notes are kept",
    title: "Voice notes and home",
    rows: [
      {
        kind: "voice",
        label: "Spoken reflections, Jobs, game and scene notes, Studio takes",
        one: "voice note",
      },
    ],
    waits: waits("voice note"),
    phoneOnly: `Voice notes are only on this phone, and in Drive when you share them. ${PAIR}`,
    partly:
      "Some voice notes are on home. New ones stay on this phone until it is paired again.",
    footnote:
      "Home keeps every recording and turns it into text for the morning routines. This phone keeps a note until home has it, even after you let it go here. Read-aloud takes stay on this phone.",
    clash: null,
    unread: null,
  },
}

/** The words every lane's sheet shares. */
export const SHEET = {
  sendNow: "Send now",
  pairFirst: PAIR,
  settings: "Pairing, what waits and clearing space: Settings",
} as const

/** What Settings says of the voice notes this phone holds and can't send home, if any (LA14). */
export function unsentLines({ gone }: Unsendable): Array<string> {
  if (gone <= 0) return []
  const one = gone === 1
  return [
    `${counted(gone, "voice note")} ${one ? "isn't" : "aren't"} on this phone any more, so ${one ? "it" : "they"} can't go to home.`,
  ]
}

/** Settings' Home server block, once paired: what goes, and when. */
export const HOME_BLOCK = {
  lead: "Everything this phone keeps goes to home on its own while the app is open: finished sessions, kept items, LeetType sessions, Studio sittings, written reflections, the Jobs record, voice notes, and aph while it is open. Nothing leaves this phone until home has read it back.",
} as const

/** Settings' readout of what this phone keeps on home, and what waits. */
export const KEPT_ON_HOME = {
  title: "What this phone keeps on home",
  lead: "What home has, it keeps.",
  names: {
    practice: "Practice",
    aph: "aph",
    jobs: "The Jobs record",
    voice: "Voice notes",
  } satisfies Record<LaneId, string>,
  neverTitle: "Never sent",
  never: [
    {
      label: "Lessons and dramas home publishes",
      text: "Come from home when you ask for them. Nothing goes the other way.",
    },
    {
      label: "Read-aloud takes",
      text: "Never go to home. You can share them yourself, to Drive.",
    },
    {
      label: "Your answers to the three quick questions after a session",
      text: "Stay on this phone.",
    },
    {
      label: "What you set in Settings, and your profile",
      text: "Stay on this phone.",
    },
  ],
  /** What to open for each record: its wing's own name. */
  opens: {
    practice: "Practice",
    aph: "aph",
    jobs: "Jobs",
    voice: "Settings",
  } satisfies Record<LaneId, string>,
} as const

const sessions = (n: number): string => counted(n, "finished session")

/** Settings' clear of finished sessions home holds (`./clear`). */
export const CLEAR = {
  button: "Clear finished sessions home holds...",
  /** The first press's question, given how many would be asked about and the host. */
  question: (n: number, host: string): string =>
    `Clear ${sessions(n)} from this phone? Each is asked about first, and only one ${host} holds exactly as this phone does leaves. The rest stay.`,
  yes: "Clear them",
  no: "Keep them",
  nothing: "No finished session to clear.",
  /** How a clear ended, given the host. */
  ended: (end: ClearEnd, host: string): string => {
    switch (end.kind) {
      case "cleared": {
        const left =
          end.freed === 0
            ? "Nothing left this phone"
            : `Cleared ${sessions(end.freed)} from this phone`
        return end.kept === 0
          ? `${left}.`
          : `${left}. ${counted(end.kept, "stays", "stay")} here: ${host} doesn't hold ${end.kept === 1 ? "it" : "them"} as ${end.kept === 1 ? "it is" : "they are"} yet.`
      }
      case "nothing": {
        return CLEAR.nothing
      }
      case "unreachable": {
        return `Couldn't reach ${host}. Are you on the home network? Nothing left this phone.`
      }
      case "forgotten": {
        return `${host} no longer knows this phone: unpair, then pair again. Nothing left this phone.`
      }
      case "busy": {
        return "Home is busy right now. Try again in a minute; nothing left this phone."
      }
      case "stopped": {
        return "Stopped. Nothing left this phone."
      }
      case "not-cleared": {
        return "Home holds them, but this phone couldn't clear them. Try again."
      }
      default: {
        return assertNever(end)
      }
    }
  },
} as const

export type LaneFacts = LaneCounts & {
  /** The link has read the phone's own record of its pairing. */
  known: boolean
  /** The phone is paired with home, so the lane drains. */
  paired: boolean
  run: KeptState
}

export type LaneView = {
  where: Where
  /** How the last exchange went; null when there is none to tell. */
  how: How | null
  /** Beside the mark. */
  word: string
  /** What the sheet says first, and the mark's spoken label. */
  line: string
  rows: Array<{ label: string; text: string }>
  /** Said under the rows. */
  notes: Array<string>
}

function rowText(row: Row, facts: LaneFacts): string {
  const held = facts.held[row.kind]
  if (facts.paired) {
    return held === undefined
      ? "Kept on home"
      : held > 0
        ? `${counted(held, row.one, row.many)} on home`
        : "Nothing on home yet"
  }
  if (held !== undefined && held > 0) {
    return `${counted(held, row.one, row.many)} on home · new ones stay here`
  }
  return "Only on this phone"
}

/** How a lane is kept, in `words`, from `facts`. */
export function laneView(words: LaneWords, facts: LaneFacts): LaneView {
  const rows = words.rows.map((row) => {
    const refused = facts.refused[row.kind] ?? 0
    return {
      label: row.label,
      text:
        rowText(row, facts) +
        (refused > 0
          ? ` · ${counted(refused, row.one, row.many)} home didn't take`
          : ""),
    }
  })
  const notes = [
    ...(facts.paired && facts.hidden > 0 && words.clash
      ? [words.clash(facts.hidden)]
      : []),
    ...(facts.paired &&
    !facts.pulled &&
    words.unread &&
    facts.run.last?.kind !== "synced"
      ? [words.unread]
      : []),
  ]
  const show = (
    where: Where,
    how: How | null,
    word: string,
    line: string
  ): LaneView => ({
    where,
    how,
    word,
    line,
    rows,
    notes,
  })

  if (!facts.known) {
    return show("checking", null, "Checking", "Checking where this is kept.")
  }
  if (!facts.paired) {
    const some = Object.values(facts.held).some((n) => n > 0)
    return some
      ? show("partly", null, "Partly on home", words.partly)
      : show("phone", null, "Phone only", words.phoneOnly)
  }

  const later =
    facts.waiting > 0
      ? ` ${words.waits(facts.waiting)} on this phone and go${facts.waiting === 1 ? "es" : ""} next time.`
      : ""
  if (facts.run.running) {
    return show("kept", "sending", "Sending", "Sending to home.")
  }

  const last = facts.run.last
  if (last?.kind === "forgotten") {
    return show(
      "kept",
      "forgotten",
      "Pair again",
      "Home no longer knows this phone. Pair it again in Settings."
    )
  }
  if (last?.kind === "unreachable") {
    return show("kept", "no-answer", "No answer", `Home didn't answer.${later}`)
  }
  if (last?.kind === "unpaired") {
    return show(
      "kept",
      "unpaired",
      "Not paired",
      `This phone isn't paired with home now. Pair it in Settings.${later}`
    )
  }
  if (last?.kind === "failed") {
    if (last.why === "busy") {
      return show(
        "kept",
        "busy",
        "Home busy",
        `Home is busy right now.${later}`
      )
    }
    if (last.why === "full") {
      return show(
        "kept",
        "full",
        "Shelf full",
        "Home's shelf is full, so some kept items didn't fit."
      )
    }
    if (last.why === NO_ROOM) {
      return show(
        "kept",
        "no-room",
        "No room",
        `This phone has no room left for copies home doesn't have yet.${later}`
      )
    }
    if (last.why === "refused") {
      return show(
        "kept",
        "refused",
        "Not all taken",
        "Home didn't take some of it."
      )
    }
    if (last.why === "fault") {
      return show(
        "kept",
        "fault",
        "Didn't go",
        `Something on this phone went wrong.${later}`
      )
    }
    return show(
      "kept",
      "failed",
      "Didn't go",
      `Something went wrong sending to home.${later}`
    )
  }
  if (facts.waiting > 0) {
    return show(
      "kept",
      "waiting",
      `${facts.waiting} waiting`,
      `${words.waits(facts.waiting)} on this phone. ${facts.waiting === 1 ? "It goes" : "They go"} to home while the app is open.`
    )
  }
  if (last === null) {
    return show("kept", null, "Kept on home", "Kept on home.")
  }
  return show("kept", "current", "On home", "Kept on home. Up to date.")
}

/**
 * Korean's look at what the reflections routine left on home: Settings'
 * readout of it, and how the last look went.
 */
export const ROUTINE_LOOK = {
  title: "From the routine",
  lead: "Korean lists the word sets and dramas the routine leaves on home, and tells home which you open, by name, so the routine keeps three ready.",
  /** How the last look went, given when. */
  last: {
    read: (when: string): string => `Last looked at home ${when}.`,
    busy: (when: string): string =>
      `Home was busy when Korean last looked, ${when}.`,
    unreachable: (when: string): string =>
      `Home didn't answer when Korean last looked, ${when}.`,
    forgotten: (when: string): string =>
      `Home no longer knows this phone (${when}). Pair it again.`,
    failed: (when: string): string =>
      `Something went wrong when Korean last looked, ${when}.`,
  } satisfies Record<LastRead["kind"], (when: string) => string>,
  notYet: "Korean looks the next time its list opens on this phone.",
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
    ? ROUTINE_LOOK.notYet
    : ROUTINE_LOOK.last[last.kind](when(last.at))
}
