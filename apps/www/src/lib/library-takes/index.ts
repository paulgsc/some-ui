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
 * At most forty takes of at most three minutes; Let go owes home its
 * set-aside mark (`from: "studio"`). The pattern desk's own rules (HF5, LG1,
 * D2, D3) hold as for every desk.
 *
 * Phone-only (`build.paths.ts`).
 */
import type { LibraryPhone } from "@some-ui/soundbites"

import { patternDesk, patternPort } from "@/lib/takes-desk"

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
  shape: {
    takes: { per: "many", max: MAX, full: "make-room" },
    play: "each",
  },
})

/** Audio no take names, and a take whose audio never landed. */
export const sweepLibraryTakes = desk.sweep

/** The desk, for the copy home (`lib/home-link/voice-copy`). */
export const libraryTakesDesk = desk

let port: LibraryPhone | null = null

/** The phone's takes with no scene, as Takes on home records and lists them. */
export function libraryTakes(): LibraryPhone {
  port ??= { ...patternPort(desk), line: LIBRARY_LINE }
  return port
}
