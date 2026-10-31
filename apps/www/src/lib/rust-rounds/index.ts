/**
 * Rust Rounds' ports on the phone (`@some-ui/rust-rounds`, #2235): its kept
 * records in this device's storage, its voice notes on a takes desk of their
 * own (`lib/takes-desk`), the clipboard, the clock and the page. Nothing here
 * reaches the network: every card plays from what is on the phone.
 * Phone-only (`build.paths.ts`).
 *
 * The voice notes wait on this phone, each named by id in the log. What
 * sends them home is RR6 (#2237); until then the desk holds up to
 * `NOTES_MAX`, and past it a new one is refused, never evicting an earlier
 * one.
 */
import type {
  NotesPort,
  NoteView,
  RustRoundsPorts,
  TakeEnd,
} from "@some-ui/rust-rounds"
import { keptRounds } from "@some-ui/rust-rounds"
import type { TakeView } from "@some-ui/voice-capture"
import { onPageVisibility, VOICE_NOTE_SAID } from "@some-ui/voice-capture"

import { copyText } from "@/lib/clipboard"
import { takesDesk } from "@/lib/takes-desk"
import { browserLocalStorage } from "@/lib/tenant/storage"

/** Voice notes kept until home holds them (RR6): days of cards away from home. */
const NOTES_MAX = 100

/** A note runs up to a minute (#2235: "Hold to speak, up to 60 s"). */
const NOTE_MAX_MS = 60_000

const desk = takesDesk({
  key: "some-ui:rust-rounds.notes",
  dbName: "some-ui.rust-rounds-notes",
  limits: { max: NOTES_MAX, maxMs: NOTE_MAX_MS },
})

/** Audio no note names, and a note whose audio never landed. */
export const sweepRustRoundsNotes = desk.sweep

function isTakeEnd(value: string): value is TakeEnd {
  return value in VOICE_NOTE_SAID
}

/** Each of the desk's sentences for how a take ended, to the end it says. */
const ENDS = new Map(
  Object.entries(VOICE_NOTE_SAID).flatMap(([end, said]) =>
    isTakeEnd(end) ? [[said, end] as const] : []
  )
)

/**
 * The desk's word beside its button, translated: how the last take ended,
 * or why none can start. The desk says it in a tap recorder's sentence, so
 * the session says it in its own words instead; anything else it says is
 * why the microphone did not start (`RECORDING_FAILURE_COPY`), shown as is.
 */
export function translate(
  said: string | null
): Pick<NoteView, "ended" | "blocked"> {
  if (said === null) return { ended: null, blocked: null }
  const ended = ENDS.get(said)
  return ended === undefined
    ? { ended: null, blocked: said }
    : { ended, blocked: null }
}

function takeOf(take: TakeView): NoteView["take"] {
  return take.kind === "recording" ? { kind: "recording" } : take
}

/** The desk as the session's microphone; the same view while nothing changed. */
function notesPort(): NotesPort {
  let from: unknown = null
  let view: NoteView | null = null
  const phone = (): ReturnType<typeof desk.phone> => desk.phone()
  return {
    getSnapshot(): NoteView {
      const now = phone().getSnapshot()
      if (view === null || now !== from) {
        from = now
        view = {
          take: takeOf(now.take),
          kept: now.kept === null ? null : { id: now.kept.id },
          full: now.full,
          ...translate(now.said),
        }
      }
      return view
    },
    subscribe: (listener) => phone().subscribe(listener),
    start: (line) => phone().start(line),
    stop: () => phone().stop(),
    reset: () => phone().reset(),
  }
}

/** The ports the session reads once, on mount. */
export function phoneRustRoundsPorts(): RustRoundsPorts {
  return {
    store: keptRounds(browserLocalStorage),
    notes: notesPort(),
    copy: copyText,
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    onVisibility: onPageVisibility,
  }
}
