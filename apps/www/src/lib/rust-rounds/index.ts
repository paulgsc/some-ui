/**
 * Rust Rounds' ports on the phone (`@some-ui/rust-rounds`, #2235): its kept
 * records in this device's storage, its voice notes on a takes desk of their
 * own (`lib/takes-desk`), the clipboard, the clock and the page. Nothing here
 * reaches the network: every card plays from what is on the phone.
 * Phone-only (`build.paths.ts`).
 *
 * The voice notes are taken on the take pattern (`patternDesk`), each named
 * by id in the log; a Redo's earlier note and one set aside stay too. Each
 * goes home as a voice note said for `rust-round` (RR6, #2237), through the
 * voice lane (`lib/home-link/voice-copy`), named as `homeRef` says
 * (`rustRoundRef`); Let go owes home its set-aside mark. Once home holds a
 * note, its audio leaves this phone and the note stays listed
 * (`audioLeaves`), which makes room; it plays from home after
 * (`lib/home-link/voice-audio`), as a refine card's earlier note does. The
 * desk has no count of its own: only the device's measured room
 * (`withRoom`) refuses a note, which the session then says, never letting
 * one go before home holds it.
 */
import { engage } from "@some-ui/engagement"
import type {
  NotesPort,
  RoundsStore,
  RustRoundsPorts,
  RustWeekPorts,
  WeeksStore,
} from "@some-ui/rust-rounds"
import {
  currentWeek,
  homeRef,
  keptRounds,
  keptWeeks,
  WEEK_TAKES_KEY,
} from "@some-ui/rust-rounds"
import { ONE_TAKE, onPageVisibility } from "@some-ui/voice-capture"

import { copyText } from "@/lib/clipboard"
import type { PatternDesk } from "@/lib/takes-desk"
import { patternDesk } from "@/lib/takes-desk"
import { browserLocalStorage } from "@/lib/tenant/storage"

export type { Take as RustRoundTake } from "@/lib/takes-desk"

/** A note runs up to a minute (#2235: "up to 60 s"). */
const NOTE_MAX_MS = 60_000

const desk = patternDesk({
  key: "some-ui:rust-rounds.notes",
  screen: "rust-rounds.note",
  from: "rust-round",
  audioLeaves: true,
  dbName: "some-ui.rust-rounds-notes",
  // No count of its own: only the device's room refuses a note.
  limits: { max: Number.POSITIVE_INFINITY, maxMs: NOTE_MAX_MS },
})

/**
 * A week's takes (RR13): one per ticket, each waiting on this phone until
 * the week is sent (`send: "on-confirm"`), then going home as a Rust Rounds
 * voice note named by its line, `<week>:<ticket>` (`lib/home-link/voice-copy`).
 * Up to three minutes a take, under home's ceiling for a note. No count of
 * its own, as the notes' desk: only the device's room refuses a take. No
 * set-aside marks: a take here is let go only by the week's Delete, Redo or
 * clean-up before Send, for good, and only while it waits.
 */
const weekDesk = patternDesk({
  key: WEEK_TAKES_KEY,
  screen: "rust-rounds.week",
  from: null,
  dbName: "some-ui.rust-week-takes",
  limits: { max: Number.POSITIVE_INFINITY, maxMs: 180_000 },
  shape: { ...ONE_TAKE, send: "on-confirm" },
})

/** Audio no note or take names, and one whose audio never landed. */
export function sweepRustRoundsNotes(): void {
  desk.sweep()
  weekDesk.sweep()
}

/** The week's desk, for the copy home (`lib/home-link/voice-copy`). */
export const rustWeekDesk = weekDesk

/** The desk, for the copy home (`lib/home-link/voice-copy`). */
export const rustRoundsDesk = desk

/**
 * What home is told each note was said on (`homeRef`), read against the
 * rounds this phone holds now, so a refine card names the note it brings
 * back. Read once per look; null while a note can't be named truly (home
 * doesn't hold its round as played here, or its card isn't among the
 * rounds read) or for a line no card makes, and the note waits on this
 * phone.
 */
export function rustRoundRef(): (line: string) => string | null {
  const { held } = keptRounds(browserLocalStorage).open()
  return (line) => homeRef(line, held)
}

/**
 * A desk as the session's microphone: its take pattern and the notes it
 * keeps. The phone's is `desk`; tests give theirs over the simulated
 * microphone.
 */
export function notesPort(
  on: Pick<PatternDesk, "phone" | "keptOn">
): NotesPort {
  const { pattern, takes } = on.phone()
  return { pattern, takes, keptOn: on.keptOn }
}

let rounds: RoundsStore | null = null

/**
 * What plays, kept in this device's storage, for the exchange with home
 * (`lib/home-link/rust-rounds`, RR4b): one per page load. The session makes
 * its own over the same storage on each mount, and each hears the other's
 * writes (`subscribe`).
 */
export function phoneRounds(): RoundsStore {
  rounds ??= keptRounds(browserLocalStorage)
  return rounds
}

let weeks: WeeksStore | null = null

/**
 * The weeks this phone holds (RR13), kept in this device's storage, which
 * the lane fills from home (`lib/home-link/rust-rounds`) and the week's
 * screens read: one per page load.
 */
export function phoneWeeks(): WeeksStore {
  weeks ??= keptWeeks(browserLocalStorage)
  return weeks
}

/**
 * The week's ports (RR13), with the week open now among those this phone
 * holds, or null while it holds none; `home` and `heard` are handed in by
 * the route, which may reach home.
 */
export function phoneRustWeekPorts(
  reach: Pick<RustWeekPorts, "home" | "heard">
): RustWeekPorts | null {
  const week = currentWeek(phoneWeeks().held().weeks, Date.now())
  return week === null
    ? null
    : {
        ...reach,
        week,
        takes: weekDesk.phone(),
        storage: browserLocalStorage,
        now: () => Date.now(),
        newId: () => crypto.randomUUID(),
        onVisibility: onPageVisibility,
        engage,
      }
}

/** The ports the session reads once, on mount. */
export function phoneRustRoundsPorts(): RustRoundsPorts {
  return {
    store: keptRounds(browserLocalStorage),
    notes: notesPort(desk),
    copy: copyText,
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    onVisibility: onPageVisibility,
    home: true,
  }
}
