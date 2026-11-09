/**
 * Rust Rounds' lane (RR4b, #2347; LA15): `exchangeRounds` in
 * `@some-ui/rust-rounds`'s `lib/home`, then, once the rounds are synced, the
 * weeks home holds (`lib/weeks`, RR13 #2688), which the phone only reads,
 * then what Rust Rounds keeps that goes home to be kept for good (RR14
 * #2689, `lib/kept-home`): each week sent, each error pasted, and the card
 * log's sittings (`exchangeRustRounds`), through the one wiring (`./lanes`).
 *
 * Its record moves with each round taken on this phone, never with one taken
 * from home, and with each week, paste or sitting home does not hold as it
 * is now. Only a write to the rounds' store asks for a run: a week sent or a
 * paste kept goes at the lane's next run (the app coming to the front, or a
 * pull). The lane has no wing mark: Settings' readout says where the rounds
 * are kept.
 */
import { useSyncExternalStore } from "react"
import {
  exchangeRustRounds,
  keptHomeCounts,
  roundsCounts,
  roundsTaken,
} from "@some-ui/rust-rounds"

import { phoneRounds, phoneWeeks } from "@/lib/rust-rounds"
import { browserLocalStorage } from "@/lib/tenant/storage"

import type { Lane, LaneCounts } from "./lanes"

/** The counts as one value, so an unchanged record reads as the same snapshot. */
function countsKey(): string {
  const rounds = roundsCounts(phoneRounds().held())
  const { sent, pastes, sessions } = keptHomeCounts(browserLocalStorage)
  return [rounds, sent, pastes, sessions]
    .flatMap(({ onHome, refused, waiting }) => [onHome, refused, waiting])
    .join("/")
}

/** What the lane waits to send, beyond the rounds taken. */
function keptWaiting(): number {
  const { sent, pastes, sessions } = keptHomeCounts(browserLocalStorage)
  return sent.waiting + pastes.waiting + sessions.waiting
}

export const rustRoundsLane: Lane = {
  id: "rust-rounds",
  exchange: (send) =>
    exchangeRustRounds(phoneRounds(), phoneWeeks(), browserLocalStorage, send),
  revision: () => roundsTaken(phoneRounds().held()) + keptWaiting(),
  subscribe: (listener) => phoneRounds().subscribe(listener),
  useCounts: (): LaneCounts => {
    const key = useSyncExternalStore(phoneRounds().subscribe, countsKey)
    const [
      rounds = 0,
      roundsRefused = 0,
      roundsWaiting = 0,
      weeks = 0,
      weeksRefused = 0,
      weeksWaiting = 0,
      pastes = 0,
      pastesRefused = 0,
      pastesWaiting = 0,
      sittings = 0,
      sittingsRefused = 0,
      sittingsWaiting = 0,
    ] = key.split("/").map(Number)
    return {
      held: {
        rounds,
        rustWeeks: weeks,
        rustPastes: pastes,
        roundLog: sittings,
      },
      refused: {
        rounds: roundsRefused,
        rustWeeks: weeksRefused,
        rustPastes: pastesRefused,
        roundLog: sittingsRefused,
      },
      waiting: roundsWaiting + weeksWaiting + pastesWaiting + sittingsWaiting,
      hidden: 0,
      pulled: true,
    }
  },
}
