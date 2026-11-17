/**
 * When the phone asks home whether it still knows it (SIGNIN1, #3087): the
 * link's `check`, once as each pairing is read back (the app's start; a new
 * pairing is known already), or, if a check was out then, once it ends;
 * and each time the app comes back to the foreground; one at a time. Never
 * on a timer, and never on any other change of the link: a check that found
 * home silent or busy waits for the next of those moments. Every
 * credentialed answer also says it (`./runtime`'s `heardKey`), so a phone
 * sending anyway rarely needs the check at all. The link's `check` itself
 * sends nothing unpaired, forgotten, away or while home is busy.
 *
 * **RN1: a paired phone's session with home is renewed while the app is
 * used** (#3096). Held by tests, so not a gray-area invariant:
 *
 * - _Claim:_ while this phone is paired and home has not refused its key,
 *   each time the app comes to the front on a network where home answers,
 *   home has not asked to be left alone and the phone is not held away
 *   (AW1), the phone sends home's own
 *   `GET /auth/session` with its key, or has one already out, which slides
 *   the session once it is past half its term (paulgsc/server
 *   `handlers::auth::session`).
 * - _Family:_ how often the app comes to the front; whether home was known,
 *   unchecked or busy at each coming; the phone away from home at each
 *   coming; the pairing's age against the half-term.
 * - _Proof:_ `__tests__/standing.test.ts`, "RN1: …": the real link and the
 *   real watch, every coming to the front (one out stands for those that
 *   come while it is), home's busy held to its own
 *   Retry-After and then asked again, and away held to its hold and then
 *   asked again. The age dimension is the server's: its slide past half a
 *   term is held by its own test `a_phones_session_slides_without_a_cookie`.
 * - _Tolerance:_ a coming to the front while held away (AW1) or while home
 *   is busy (AD3) asks nothing; the next one after asks. A phone that never
 *   comes to the front on a network where home answers for a whole
 *   half-term (15 days) lapses, and says so (SIGNIN1's forgotten look).
 */
import { pairingOf } from "./index"
import type { HomeLinkState } from "./model"

/** What the watch hears and calls. */
export type StandingWatchPorts = {
  link: {
    getSnapshot: () => HomeLinkState
    subscribe: (listener: () => void) => () => void
    check: () => Promise<void>
  }
  doc: Pick<
    Document,
    "visibilityState" | "addEventListener" | "removeEventListener"
  >
}

const unchecked = ({ link }: HomeLinkState): boolean =>
  link.kind === "paired" && link.standing.kind === "unchecked"

/** Checks at the watch's moments until the returned unsubscribe is called. */
export function watchStanding({ link, doc }: StandingWatchPorts): () => void {
  let checking = false
  let stopped = false
  let pairing: string | null = null
  const check = (): void => {
    if (stopped || checking || doc.visibilityState !== "visible") return
    checking = true
    const asked = pairing
    void link.check().finally(() => {
      checking = false
      // A pairing found while that check was out has not been asked about.
      if (pairing !== asked && unchecked(link.getSnapshot())) check()
    })
  }

  const onLink = (): void => {
    const now = pairingOf(link.getSnapshot())
    if (now === pairing) return
    pairing = now
    if (unchecked(link.getSnapshot())) check()
  }
  const onFront = (): void => {
    if (pairing !== null) check()
  }

  const unsubscribe = link.subscribe(onLink)
  doc.addEventListener("visibilitychange", onFront)
  onLink()
  return () => {
    stopped = true
    unsubscribe()
    doc.removeEventListener("visibilitychange", onFront)
  }
}
