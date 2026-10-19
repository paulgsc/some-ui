/**
 * The phone's link to its home server: pairing, unpairing, the sync, the
 * shelf send and the sessions copy, one at a time, each started by a tap
 * (LA8, docs/learner-data-authority.md); and aph, the Jobs record and
 * Practice kept on home, once their person opted in, while each is open
 * (`./lanes`; aph, LA9; the Jobs record, LA10; Practice, LA11).
 * Phone-only (`build.paths.ts`).
 */
import { useSyncExternalStore } from "react"

import { homeRequest } from "@/lib/device-backend/native-http"

import { nativeCredential } from "./credential"
import type { HomeLinkState } from "./model"
import type { HomeLink } from "./runtime"
import { createHomeLink } from "./runtime"
import { onHidden } from "./visibility"

export { hostOf, pairingAddress, typedCode } from "./address"
export type { HomeLinkState, PairFailure, UnpairedNote } from "./model"
export type { HomeLink } from "./runtime"

let link: HomeLink | null = null

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
    })
    void link.load()
  }
  return link
}

export function useHomeLink(): HomeLinkState {
  const current = homeLink()
  return useSyncExternalStore(current.subscribe, current.getSnapshot)
}
