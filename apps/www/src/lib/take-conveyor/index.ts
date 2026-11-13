/**
 * The phone's moves of Studio's takes along the conveyor (`./runtime`,
 * CONVEYOR1 #2873): one store per page load, its record in this device's
 * storage. Phone-only (`build.paths.ts`). What sends a move home and when
 * is the home link's voice lane (`lib/home-link/take-stations`).
 */
import type { LibraryStations } from "@some-ui/soundbites"

import { browserLocalStorage } from "@/lib/tenant/storage"

import type { TakeConveyor } from "./runtime"
import { createTakeConveyor, libraryStationsOf } from "./runtime"

let conveyor: TakeConveyor | null = null

/** Made on first use, so importing this module reads nothing. */
export function takeConveyor(): TakeConveyor {
  conveyor ??= createTakeConveyor({
    storage: browserLocalStorage,
    newId: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
  })
  return conveyor
}

/**
 * Takes on home's word for where each take stands, over this conveyor,
 * which it makes only once the screen first asks: a route that hands this
 * in as it loads reads nothing until then.
 */
export const libraryStations = (): LibraryStations => ({
  subscribe: (listener) => takeConveyor().subscribe(listener),
  getSnapshot: () => takeConveyor().getSnapshot(),
  standing: (take) => libraryStationsOf(takeConveyor()).standing(take),
})
