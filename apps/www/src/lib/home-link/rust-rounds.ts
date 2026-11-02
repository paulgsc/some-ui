/**
 * Rust Rounds' lane (RR4b, #2347; LA15, docs/learner-data-authority.md):
 * each round pasted on this phone that home doesn't hold yet goes home, so
 * home's rust-runner records its programs, and the rounds home holds come
 * back with the runs recorded of them (`exchangeRounds`, in
 * `@some-ui/rust-rounds`'s `lib/home`), through the one wiring (`./lanes`).
 * The app shell mounts its watch on every screen, so rounds and runs are
 * fetched ahead whenever the phone is near home and the app is open, and
 * the session plays from the phone alone: no screen waits on this.
 *
 * Its record moves with each round taken on this phone, never with one taken
 * from home. The lane has no wing mark: Settings' readout says where the
 * rounds are kept.
 */
import { useSyncExternalStore } from "react"
import { exchangeRounds, roundsCounts, roundsTaken } from "@some-ui/rust-rounds"

import { phoneRounds } from "@/lib/rust-rounds"

import type { Lane, LaneCounts } from "./lanes"

/** The counts as one value, so an unchanged record reads as the same snapshot. */
function countsKey(): string {
  const { onHome, refused, waiting } = roundsCounts(phoneRounds().held())
  return `${onHome}/${refused}/${waiting}`
}

export const rustRoundsLane: Lane = {
  id: "rust-rounds",
  exchange: (send) => exchangeRounds(phoneRounds(), send),
  revision: () => roundsTaken(phoneRounds().held()),
  subscribe: (listener) => phoneRounds().subscribe(listener),
  useCounts: (): LaneCounts => {
    const key = useSyncExternalStore(phoneRounds().subscribe, countsKey)
    const [onHome = 0, refused = 0, waiting = 0] = key.split("/").map(Number)
    return {
      held: { rounds: onHome },
      refused: { rounds: refused },
      waiting,
      hidden: 0,
      pulled: true,
    }
  },
}
