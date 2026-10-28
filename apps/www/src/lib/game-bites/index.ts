/**
 * The phone's game bites (`./runtime`): one store per page load, its record
 * in this device's storage, its audio on a shelf of its own. Phone-only
 * (`build.paths.ts`). The recorder is `@some-ui/game-week`; what sends a
 * bite home is the home link's voice lane (`lib/home-link/voice-copy`).
 */
import type { GameWeekPorts } from "@some-ui/game-week"
import { SOUNDBITE_BITS_PER_SECOND } from "@some-ui/soundbites/contract"
import { blobShelf, micRecorder } from "@some-ui/voice-capture"

import { browserLocalStorage } from "@/lib/tenant/storage"

import type { GameBites } from "./runtime"
import { createGameBites } from "./runtime"

let bites: GameBites | null = null

/** Made on first use, so importing this module reads nothing. */
export function phoneGameBites(): GameBites {
  if (bites === null) {
    bites = createGameBites({
      storage: browserLocalStorage,
      // No cap of the bites' own: every bite stays until home holds it,
      // and only the phone's room refuses one (GW3).
      shelf: blobShelf({
        dbName: "some-ui.game-bites",
        maxBytes: Number.POSITIVE_INFINITY,
      }),
      now: () => Date.now(),
    })
    bites.sweep()
  }
  return bites
}

function onPageVisibility(listener: (hidden: boolean) => void): () => void {
  const onChange = (): void => listener(document.visibilityState === "hidden")
  document.addEventListener("visibilitychange", onChange)
  onChange()
  return () => document.removeEventListener("visibilitychange", onChange)
}

/** The recorder's ports this phone provides; home's feed and the choices are the page's. */
export function phoneBitePorts(): Omit<GameWeekPorts, "feed" | "prefs"> {
  return {
    startRecording: micRecorder({ bitsPerSecond: SOUNDBITE_BITS_PER_SECOND }),
    store: phoneGameBites(),
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    onVisibility: onPageVisibility,
  }
}
