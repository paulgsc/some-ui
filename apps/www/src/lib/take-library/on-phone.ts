/**
 * This phone's takes of every kind, as Takes reads them (TAKES20, #3219):
 * `@some-ui/soundbites`' `LibraryOnPhone` over the recordings still here
 * (`recordingsOnPhone`, the same list My data reads) and the game bites home
 * holds (`lib/game-bites`), merged by `./model`'s `phoneTakesOf`. Read again
 * after each copy pass, each change to the bites, and once the pairing
 * record is read; a read overtaken by a newer one is dropped. Phone-only
 * (`build.paths.ts`).
 */
import type { LibraryOnPhone, PhoneTake } from "@some-ui/soundbites"

import { phoneGameBites } from "@/lib/game-bites"
import { askAudio } from "@/lib/home-link/voice-audio"
import {
  copyPasses,
  recordingsOnPhone,
  voiceKept,
  whenPlacesKnown,
} from "@/lib/home-link/voice-copy"

import { phoneTakesOf } from "./model"

const NONE: ReadonlyArray<PhoneTake> = []

/** The port, made once its first reader subscribes. */
export function phoneOnlyTakes(): LibraryOnPhone {
  let takes = NONE
  let seq = 0
  const listeners = new Set<() => void>()
  let stops: ReadonlyArray<() => void> = []

  const read = (): void => {
    seq += 1
    const mine = seq
    // A store that can't be read lists none of its takes, as My data's does.
    void recordingsOnPhone()
      .catch(() => ({ notes: [] }))
      .then(({ notes }) => {
        if (mine !== seq) return
        takes = phoneTakesOf(
          notes,
          phoneGameBites().getSnapshot(),
          (id) => voiceKept(id).place === "home",
          askAudio
        )
        for (const listener of listeners) listener()
      })
  }

  return {
    getSnapshot: () => takes,
    subscribe(listener) {
      listeners.add(listener)
      if (listeners.size === 1) {
        stops = [
          copyPasses.subscribe(read),
          phoneGameBites().subscribe(read),
          whenPlacesKnown(read),
        ]
        read()
      }
      return (): void => {
        listeners.delete(listener)
        if (listeners.size > 0) return
        for (const stop of stops) stop()
        stops = []
        seq += 1
      }
    },
  }
}
