/**
 * Rust Rounds' lane (RR4b, #2347; LA15): `exchangeRounds` in
 * `@some-ui/rust-rounds`'s `lib/home`, then, once the rounds are synced, the
 * weeks home holds (`lib/weeks`, RR13 #2688), which the phone only reads
 * (`exchangeRustRounds`), then what Rust Rounds keeps that goes home for
 * good (`./rust-kept`, RR14 #2689), through the one wiring (`./lanes`).
 *
 * Its record moves with each round taken on this phone, never with one taken
 * from home, and with each week sent, paste kept or card-log sitting. A
 * write to the rounds' store asks for a run at once, and so does home saying
 * it serves this build when that lets a week sent by points go (RR24, C681);
 * otherwise a week sent or a paste kept goes at the lane's next run (the app
 * coming to the front, or a pull).
 * The lane has no wing mark: Settings' readout says where the rounds are
 * kept.
 */
import { useSyncExternalStore } from "react"
import { fnv1a } from "@some-ui/core-utils"
import { keptGoing, roundsCounts, roundsTaken } from "@some-ui/rust-rounds"

import { phoneRounds } from "@/lib/rust-rounds"
import { browserLocalStorage } from "@/lib/tenant/storage"

import { usePairing } from "./index"
import type { Lane, LaneCounts } from "./lanes"
import { exchangeRustRoundsLane, keptCounts } from "./rust-kept"
import { fingerprintOf, sentUnder } from "./sent"
import { onServes, servesNow } from "./serves-now"

/** The counts as one value, so an unchanged record reads as the same snapshot. */
function countsKey(): string {
  const { onHome, refused, waiting } = roundsCounts(phoneRounds().held())
  return `${onHome}/${refused}/${waiting}`
}

export const rustRoundsLane: Lane = {
  id: "rust-rounds",
  exchange: (send, { pairing }) => exchangeRustRoundsLane(send, pairing),
  revision: () =>
    fnv1a(
      [
        roundsTaken(phoneRounds().held()),
        ...keptGoing(
          browserLocalStorage,
          Date.now(),
          servesNow() === "fits"
        ).map((item) => `${item.kind}/${item.id}@${fingerprintOf(item.wire)}`),
      ].join("|")
    ),
  // A week sent by points waits for home to serve this build (RR24, C681).
  subscribe: (listener) => {
    const rounds = phoneRounds().subscribe(listener)
    const serves = onServes(listener)
    return () => {
      rounds()
      serves()
    }
  },
  useCounts: (): LaneCounts => {
    const key = useSyncExternalStore(phoneRounds().subscribe, countsKey)
    // Read again whenever a run ends, which is when home's answers land.
    const pairing = usePairing()
    const [onHome = 0, refused = 0, waiting = 0] = key.split("/").map(Number)
    const kept = keptCounts(
      keptGoing(browserLocalStorage, Date.now(), servesNow() === "fits"),
      sentUnder(browserLocalStorage, pairing)
    )
    return {
      held: {
        rounds: onHome,
        rustWeeks: kept.rustWeeks,
        rustPastes: kept.rustPastes,
        roundLog: kept.roundLog,
      },
      refused: { rounds: refused },
      waiting: waiting + kept.waiting,
      hidden: 0,
      pulled: true,
    }
  },
}
