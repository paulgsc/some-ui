/**
 * Studio's Spoken on this phone (W5): one runtime per page load
 * (`./runtime`) over the Takes desk; what a card is and its rules are
 * `./model`'s, every word `./words`'. Phone-only (`build.paths.ts`).
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

export type { PartKind, SpokenCard, SpokenPart } from "./model"
export { parseCard, partAt, PARTS_MOST } from "./model"
export type { SpokenRuntime } from "./runtime"
export { essayBlock, SPOKEN_WORDS, titleOf } from "./words"

let runtime: SpokenRuntime | null = null

/** Made on first use, so importing this module reads nothing. */
export function phoneSpoken(): SpokenRuntime {
  if (runtime === null) {
    const phone = libraryTakesDesk.phone()
    runtime = createSpokenRuntime({
      store: spokenStore(browserLocalStorage),
      pace: bandPace(browserLocalStorage),
      takes: phone.takes,
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
