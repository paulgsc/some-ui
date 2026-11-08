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
import type {
  NotesPort,
  RoundsStore,
  RustRoundsPorts,
  WeeksStore,
} from "@some-ui/rust-rounds"
import { homeRef, keptRounds, keptWeeks } from "@some-ui/rust-rounds"
import { onPageVisibility } from "@some-ui/voice-capture"

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

/** Audio no note names, and a note whose audio never landed. */
export const sweepRustRoundsNotes = desk.sweep

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
