/**
 * Every word Practice's sharing shows, from what is true (LA11): the mark in
 * the header, its sheet, and the send's choice to keep sending. Pure, and the
 * one place those words live, so they stay in the person's terms (what is
 * kept where, and since when) and never the machinery's: no request, status
 * code, address or state name reaches the screen
 * (`__tests__/practice-words.test.ts`).
 */
import { counted } from "@some-ui/core-utils"

import type { Shared } from "./consent-model"
import type { KeptState } from "./kept-model"

/** The send confirm's box, and the words stored with the choice. */
export const KEEP_SENDING = "Keep sending these to home from now on"
export const KEEP_SENDING_MORE =
  "New finished sessions and kept items go to home while Practice is open, and the mark at the top shows each send. Stop any time; what's sent stays on home."

/** The header mark's sheet. */
export const SHEET = {
  markLabel: "Where Practice is kept",
  title: "Practice and home",
  sessions: "Finished sessions",
  shelf: "Kept shelf items",
  sendNow: "Send now",
  stop: "Stop sending...",
  notKept: "Send from Settings, and choose there to keep sending.",
  reflections: "Reflections never leave this phone.",
  settings: "Send, free space and pairing: Settings",
  stopTitle: "Stop sending",
  stopQuestion: "Stop sending new sessions and kept items to home?",
  stopMore:
    "What home already has stays there. This phone keeps everything it has. You can choose to keep sending again from any send.",
  stopYes: "Stop sending",
  stopNo: "Keep sharing",
} as const

/** Settings' send, once Practice is kept on home. */
export const KEPT_NOTE =
  "Practice's finished sessions and kept items go to home on their own while Practice is open. To stop, tap the mark at the top of Practice."

/** What a person agreed to when they ticked the box, as stored with it. */
export const KEEP_SENDING_SAID = `${KEEP_SENDING}. ${KEEP_SENDING_MORE}`

/** The header mark's shape: where Practice is kept, at a glance. */
export type Shape = "phone" | "partly" | "kept" | "waiting" | "trouble"

export type PracticeFacts = {
  shared: Shared
  /** How many of each this phone knows home holds. */
  held: { readonly sessions: number; readonly shelf: number }
  paired: boolean
  /** Sessions home does not hold as they are now. */
  waiting: number
  run: KeptState
}

export type PracticeView = {
  shape: Shape
  /** Beside the mark. */
  word: string
  /** What the sheet says first, and the mark's spoken label. */
  line: string
  rows: { sessions: string; shelf: string }
}

const shortDay = (t: number): string =>
  new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" })

function rowOf(
  since: { since: number } | undefined,
  held: number,
  noun: string,
  day: (t: number) => string
): string {
  if (since)
    return `Kept on home since ${day(since.since)} · ${counted(held, noun)} there`
  if (held > 0)
    return `${counted(held, noun)} on home, sent once · new ones stay here`
  return "Only on this phone"
}

const waits = (n: number): string =>
  n === 1 ? "1 session waits" : `${n} sessions wait`

/** What `facts` amount to, in words. */
export function practiceView(
  facts: PracticeFacts,
  day: (t: number) => string = shortDay
): PracticeView {
  const rows = {
    sessions: rowOf(
      facts.shared.get("sessions"),
      facts.held.sessions,
      "session",
      day
    ),
    shelf: rowOf(facts.shared.get("shelf"), facts.held.shelf, "kept item", day),
  }
  const show = (shape: Shape, word: string, line: string): PracticeView => ({
    shape,
    word,
    line,
    rows,
  })

  if (facts.shared.size === 0) {
    return facts.held.sessions + facts.held.shelf > 0
      ? show(
          "partly",
          "Partly on home",
          "Some of Practice is on home, sent once. New sessions stay on this phone until you send them."
        )
      : show(
          "phone",
          "Phone only",
          "Practice is only on this phone. Losing the phone loses it."
        )
  }

  const later =
    facts.waiting > 0
      ? ` ${waits(facts.waiting)} on this phone and go next time.`
      : ""
  if (!facts.paired) {
    return show(
      "trouble",
      "Not paired",
      `Kept on home, but this phone isn't paired with it.${later}`
    )
  }
  if (facts.run.running) return show("waiting", "Sending", "Sending to home.")

  const last = facts.run.last
  if (last?.kind === "forgotten") {
    return show(
      "trouble",
      "Pair again",
      "Home no longer knows this phone. Pair it again in Settings."
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
      `${waits(facts.waiting)} on this phone. They go to home while Practice is open.`
    )
  }
  return show("kept", "On home", "Kept on home. Up to date.")
}
