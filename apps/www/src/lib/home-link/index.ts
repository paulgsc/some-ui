/**
 * The phone's link to its home server: pairing, unpairing, the sync, the
 * clear of finished sessions home holds and the study list's "Let it go",
 * one at a time, each started by a tap (LA8,
 * docs/learner-data-authority.md); the drain of everything the
 * phone keeps (aph, the Jobs record, Practice's record, voice notes, Rust
 * Rounds' rounds, whose run also brings home's rounds and runs back), which
 * a paired phone sends on its own while the app is open (`./lanes`, LA15);
 * and Korean's look at the routine's files on home (`./routine`).
 * Phone-only (`build.paths.ts`).
 */
import { useSyncExternalStore } from "react"

import { after } from "@/lib/clock"
import { homeRequest } from "@/lib/device-backend/native-http"

import { nativeCredential } from "./credential"
import type { HomeLinkState } from "./model"
import type { HomeLink, HomeLinkPorts } from "./runtime"
import { createHomeLink } from "./runtime"
import { onHidden } from "./visibility"

export { hostOf, pairingAddress, typedCode } from "./address"
export type { HomeLinkState, PairFailure, UnpairedNote } from "./model"
export type { HomeLink } from "./runtime"

let link: HomeLink | null = null

/** The page's clock, which the link keeps home's busy on and the drain paces by. */
export const LINK_CLOCK: Pick<HomeLinkPorts, "now" | "after"> = {
  now: () => Date.now(),
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
    })
    void link.load()
  }
  return link
}

/** The id of the pairing this phone holds, or `null`. */
export function pairingOf(
  state: HomeLinkState = homeLink().getSnapshot()
): string | null {
  return state.link.kind === "paired" ? state.link.id : null
}

/** Whether this phone is paired with home now: the one gate on sending. */
export function paired(): boolean {
  return pairingOf() !== null
}

export function useHomeLink(): HomeLinkState {
  const current = homeLink()
  return useSyncExternalStore(current.subscribe, current.getSnapshot)
}
