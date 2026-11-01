/**
 * Rust Rounds' ports on the phone (`@some-ui/rust-rounds`, #2235): its kept
 * records in this device's storage, its voice notes on a takes desk of their
 * own (`lib/takes-desk`), the clipboard, the clock and the page. Nothing here
 * reaches the network: every card plays from what is on the phone.
 * Phone-only (`build.paths.ts`).
 *
 * The voice notes are taken on the take pattern (`patternDesk`, MIC4
 * #2374): tap to start and stop, then Play, Redo and Let go. They wait on
 * this phone, each named by id in the log; a Redo's earlier note and one set
 * aside stay there too. What sends them home is RR6 (#2237). Until then the
 * desk keeps every one: it has no count of its own, and only the device's
 * measured room (`withRoom`) refuses a note, which the session then says,
 * never letting one go.
 */
import type { NotesPort, RustRoundsPorts } from "@some-ui/rust-rounds"
import { keptRounds } from "@some-ui/rust-rounds"
import { onPageVisibility } from "@some-ui/voice-capture"

import { copyText } from "@/lib/clipboard"
import type { PatternDesk } from "@/lib/takes-desk"
import { patternDesk } from "@/lib/takes-desk"
import { browserLocalStorage } from "@/lib/tenant/storage"

/** A note runs up to a minute (#2235: "up to 60 s"). */
const NOTE_MAX_MS = 60_000

const desk = patternDesk({
  key: "some-ui:rust-rounds.notes",
  dbName: "some-ui.rust-rounds-notes",
  // No count of its own: only the device's room refuses a note.
  limits: { max: Number.POSITIVE_INFINITY, maxMs: NOTE_MAX_MS },
})

/** Audio no note names, and a note whose audio never landed. */
export const sweepRustRoundsNotes = desk.sweep

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

/** The ports the session reads once, on mount. */
export function phoneRustRoundsPorts(): RustRoundsPorts {
  return {
    store: keptRounds(browserLocalStorage),
    notes: notesPort(desk),
    copy: copyText,
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    onVisibility: onPageVisibility,
  }
}
