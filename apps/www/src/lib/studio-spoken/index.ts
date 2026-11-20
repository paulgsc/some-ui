/**
 * Studio's Spoken on this phone (W5, run #3311): a spoken card pasted and
 * kept here, with its category, read part by part on the shared
 * teleprompter, each take an ordinary Studio take on home named by its card
 * and part (`./model`, C806, C807), which an essay reads there by id (C808). One runtime per page load (`./runtime`); every word is
 * `./words`'. Phone-only (`build.paths.ts`).
 *
 * - **SCR1:** a part's takes only grow.
 * - **SCR2:** a part's kind changes only while it has no take.
 * - **SCR3:** a part uses only one of its own takes.
 */
import { audioPlayer } from "@some-ui/voice-capture"

import { askHeard } from "@/lib/home-link/heard"
import { askAudio } from "@/lib/home-link/voice-audio"
import { bandPace } from "@/lib/interview-week/store"
import { libraryTakesDesk } from "@/lib/library-takes"
import { browserLocalStorage } from "@/lib/tenant/storage"

import type { SpokenRuntime } from "./runtime"
import { createSpokenRuntime } from "./runtime"
import { spokenStore } from "./store"

export type { Category, PartKind, SpokenCard, SpokenPart } from "./model"
export { essayParts, lineOf, parseCard, phrasesOf } from "./model"
export type { Heard, Playing, SpokenRuntime } from "./runtime"
export { essayBlock, SPOKEN_WORDS } from "./words"

let runtime: SpokenRuntime | null = null

/** Made on first use, so importing this module reads nothing. */
export function phoneSpoken(): SpokenRuntime {
  if (runtime === null) {
    const phone = libraryTakesDesk.phone()
    let seen: ReadonlyArray<{ id: string; line: string }> = []
    let from: unknown = null
    runtime = createSpokenRuntime({
      store: spokenStore(browserLocalStorage),
      pace: bandPace(browserLocalStorage),
      takes: {
        // The same array while the desk's list is the same.
        getSnapshot: () => {
          const now = phone.takes.getSnapshot()
          if (now !== from) {
            from = now
            seen = now.map((take) => ({ id: take.id, line: take.answers }))
          }
          return seen
        },
        subscribe: phone.takes.subscribe,
      },
      pattern: phone.pattern,
      audioHere: libraryTakesDesk.audio,
      audioFromHome: askAudio,
      heard: askHeard,
      player: audioPlayer,
      now: Date.now,
      random: Math.random,
    })
  }
  return runtime
}
