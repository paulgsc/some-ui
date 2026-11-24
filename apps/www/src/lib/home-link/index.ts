/**
 * The phone's link to its home server: pairing, unpairing, the sync, the
 * clear of finished sessions home holds and the study list's "Let it go",
 * one at a time, each started by a tap (LA8,
 * docs/learner-data-authority.md); the drain of everything the
 * phone keeps (aph, the Jobs record, Practice's record, voice notes, Rust
 * Rounds' rounds, whose run also brings home's rounds and runs back), which
 * a paired phone sends on its own while the app is open (`./lanes`, LA15);
 * Korean's look at the routine's files on home (`./routine`); and the game
 * day's live socket (`./live`, LA21), which alone reads the pairing's token
 * (`./live-pairing`) to open it.
 * Phone-only (`build.paths.ts`).
 */
import { useSyncExternalStore } from "react"
import { localStorageOrNull } from "@some-ui/core-utils"
import { reportFailure } from "@some-ui/intent-kit"

import { after } from "@/lib/clock"
import { homeRequest } from "@/lib/device-backend/native-http"

import { nativeCredential } from "./credential"
import type { HomeLinkState, Pairing } from "./model"
import { pairingIn } from "./model"
import { storedPace } from "./pace"
import type { HomeLink, HomeLinkPorts } from "./runtime"
import { createHomeLink } from "./runtime"
import { notePairingScope } from "./sent"
import { onHidden } from "./visibility"

export { hostOf, pairingAddress, typedCode } from "./address"
export type { HomeLinkState, Pairing } from "./model"
export type { HomeLink } from "./runtime"

let link: HomeLink | null = null

/**
 * The page's clocks: the wall clock the link keeps home's busy on and dates
 * what it keeps, and the forward-only one its pace measures waits by.
 */
export const LINK_CLOCK: Pick<HomeLinkPorts, "now" | "since" | "after"> = {
  now: () => Date.now(),
  since: () => performance.now(),
  after,
}

/**
 * One runtime per page load, made by the first block that shows the link,
 * which reads the phone's own record then: nothing is sent.
 */
export function homeLink(): HomeLink {
  if (link === null) {
    link = createHomeLink({
      credential: nativeCredential,
      request: homeRequest,
      onHidden,
      ...LINK_CLOCK,
      report: reportFailure,
      paceMemory: storedPace(localStorageOrNull()),
      noteScope: (id, scope) =>
        notePairingScope(localStorageOrNull(), id, scope),
      onNetwork: (listener) => {
        window.addEventListener("online", listener)
        return (): void => {
          window.removeEventListener("online", listener)
        }
      },
    })
    void link.load()
  }
  return link
}

/**
 * Whether this phone is paired with home, as `state` says (#3152): the one
 * read of it, with `reading` for not known yet (`./model`'s `Pairing`).
 */
export function pairing(
  state: HomeLinkState = homeLink().getSnapshot()
): Pairing {
  return pairingIn(state)
}

/** `pairing()`, read again whenever the link changes. */
export function usePairing(): Pairing {
  return pairingIn(useHomeLink())
}

export function useHomeLink(): HomeLinkState {
  const current = homeLink()
  return useSyncExternalStore(current.subscribe, current.getSnapshot)
}
