/**
 * Home, as Studio's Takes on home reads it (ST32): `@some-ui/soundbites`'
 * `TakesHome` port over the link's one request per read
 * (`lib/home-link/takes-read`, LA8), its answer read by `./model`, and a
 * take's audio for Play (`lib/home-link/voice-audio`). Every call resolves.
 * A busy link is asked again (`askWhileBusy`), but not once the screen no
 * longer wants the read (a newer one, or the screen left).
 *
 * And this phone's takes of every kind, as Takes reads them (TAKES20,
 * #3219): `LibraryOnPhone` over the recordings still here
 * (`recordingsOnPhone`, the same list My data reads; the soundbites once
 * Takes' route hands their store in) and the game bites home
 * holds (`lib/game-bites`), merged by `./model`'s `phoneTakesOf`, a bite
 * whose audio has left playing from home. Read again after each copy pass,
 * each change to the bites, and once the pairing record is read; a read
 * overtaken by a newer one is dropped. It sends nothing of its own.
 * Phone-only (`build.paths.ts`).
 */
import type { LibraryOnPhone, PhoneTake, TakesHome } from "@some-ui/soundbites"

import { phoneGameBites } from "@/lib/game-bites"
import { hearAgainHome } from "@/lib/hear-again"
import { askTakes } from "@/lib/home-link/takes-read"
import { askAudio } from "@/lib/home-link/voice-audio"
import {
  copyPasses,
  recordingsOnPhone,
  voiceKept,
  whenPlacesKnown,
} from "@/lib/home-link/voice-copy"
import { askWhileBusy } from "@/lib/home-link/while-busy"
import { onSoundbitesKept } from "@/lib/soundbite-keeping"
import { onStudioKept } from "@/lib/studio-keeping"
import { phoneTakeUses } from "@/lib/take-uses"

import { phoneTakesOf, readTakes, readUsedBy } from "./model"

export const takesHome: TakesHome = {
  async takes(q, wanted, after = null, query) {
    const asked = await askWhileBusy(() => askTakes(q, after, query), wanted)
    if (asked.kind === "answered") {
      phoneTakeUses().told(readUsedBy(asked.answer))
      return readTakes(asked.answer)
    }
    return asked.kind === "unreachable" ? { kind: "away" } : asked
  },
  audio: (id) => askAudio(id),
  hearAgain: hearAgainHome,
}

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
          { bite: (id) => phoneGameBites().audio(id), home: askAudio }
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
          // Studio's and the soundbites' stores, once a page hands each in:
          // Studio's route hands its own in after Takes first reads.
          onStudioKept(read),
          onSoundbitesKept(read),
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
