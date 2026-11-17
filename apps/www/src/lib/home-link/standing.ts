/**
 * When the phone asks home whether it still knows it (SIGNIN1, #3087): the
 * link's `check`, once as each pairing is read back (the app's start; a
 * new pairing is known already) and each time the app comes back to the
 * foreground, one at a time. Never on a timer, and never on any other change of the link: a
 * check that found home silent or busy waits for the next of those
 * moments. Every credentialed answer also says it (`./runtime`'s
 * `heardKey`), so a phone sending anyway rarely needs the check at all.
 * The link's `check` itself sends nothing unpaired, forgotten, away or
 * while home is busy.
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
  let pairing: string | null = null
  const check = (): void => {
    if (checking || doc.visibilityState !== "visible") return
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
    unsubscribe()
    doc.removeEventListener("visibilitychange", onFront)
  }
}
