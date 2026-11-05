/**
 * The takes recorded on Takes on home with no scene yet (STUDIO ST32,
 * #2590; the owner's decision 8 on #2248: "the ramble about an idea, a line,
 * an aside"), on the phone: a desk of takes on the take pattern
 * (`lib/takes-desk`'s `patternDesk`), many beside each other, each played on
 * its own. Each goes home as a Studio voice note named by its own id
 * (`lib/home-link/voice-copy`'s `libraryNote`: `studio`, `take:<id>`), and
 * home lists it with every other take it keeps. Attaching one to a scene by
 * that id is ST30's.
 *
 * - **Bounded, and nothing let go before home holds it** (HF5, #2180; LG1
 *   and RM1). At most forty takes, each at most three minutes. At forty a
 *   new take makes room by letting go the oldest home holds, and is refused
 *   while home holds none; nothing else leaves but a take whose audio never
 *   landed (the sweep), and the phone's copy of one My data deleted for good
 *   on home (`letGoDeleted`).
 * - **Redo keeps the earlier take, and Let go sets one aside** (D2, D3):
 *   both stay listed and go home, and Let go owes home its set-aside mark
 *   (`from: "studio"`, MIC2).
 *
 * Phone-only (`build.paths.ts`).
 */
import type { LibraryPhone, LibraryPhoneSnapshot } from "@some-ui/soundbites"

import { patternDesk } from "@/lib/takes-desk"

export type { Take as LibraryTake } from "@/lib/takes-desk"

/**
 * A ramble runs longer than an idea's answer (a minute): three minutes at
 * the soundbites' bitrate is about 720 KB, under the 1 MiB home takes one
 * note at (paulgsc/server `voice_repo`'s `NOTE_CEILING`).
 */
const MAX_MS = 180_000
/**
 * As the idea desks keep: forty full takes are about 29 MB on the phone,
 * and a take leaves only once home holds it, so a phone away from home
 * that long is told it is full rather than losing one.
 */
const MAX = 40

/** What every take here answers: no scene, no idea, the library itself. */
const LIBRARY_LINE = "library"

const desk = patternDesk({
  key: "some-ui:library-takes",
  screen: "studio.take-library",
  from: "studio",
  dbName: "some-ui.library-takes",
  limits: { max: MAX, maxMs: MAX_MS },
  // Many beside each other; the desk makes room at its cap (HF5), so the
  // button stays ready and the screen says when the phone is full.
  shape: {
    takes: { per: "many", max: MAX, full: "make-room" },
    play: "each",
  },
})

/** Audio no take names, and a take whose audio never landed. */
export const sweepLibraryTakes = desk.sweep

/** The desk, for the copy home (`lib/home-link/voice-copy`). */
export const libraryTakesDesk = desk

/** The port's snapshot, made again only when the takes or the room change. */
function adapted(): () => LibraryPhoneSnapshot {
  let made: LibraryPhoneSnapshot | null = null
  return () => {
    const phone = desk.phone()
    const takes = phone.takes.getSnapshot()
    const full = phone.full()
    if (made?.takes !== takes || made.full !== full) {
      made = { takes, full }
    }
    return made
  }
}

let port: LibraryPhone | null = null

/** The phone's takes with no scene, as Takes on home records and lists them. */
export function libraryTakes(): LibraryPhone {
  port ??= {
    pattern: desk.phone().pattern,
    line: LIBRARY_LINE,
    getSnapshot: adapted(),
    subscribe: (listener): (() => void) =>
      desk.phone().takes.subscribe(listener),
  }
  return port
}
