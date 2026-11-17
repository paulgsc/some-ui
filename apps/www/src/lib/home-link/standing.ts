/**
 * When the phone asks home whether it still knows it (SIGNIN1, #3087): the
 * link's `check`, at the moments this watch names, one at a time. The
 * phone found paired with nothing yet heard of it (the app's start, a
 * restore read back), and the app coming back to the foreground. Never on a
 * timer. Every credentialed answer also says it (`./runtime`'s `heardKey`),
 * so a phone sending anyway rarely needs the check at all.
 */
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

/** Whether `state` is a pairing home hasn't answered for yet. */
const unchecked = (state: HomeLinkState): boolean =>
  state.link.kind === "paired" && state.link.standing.kind === "unchecked"

/** Checks at the watch's moments until the returned unsubscribe is called. */
export function watchStanding({ link, doc }: StandingWatchPorts): () => void {
  let checking = false
  const check = (): void => {
    const { link: now } = link.getSnapshot()
    if (checking || doc.visibilityState !== "visible") return
    if (now.kind !== "paired" || now.standing.kind === "forgotten") return
    checking = true
    void link.check().finally(() => {
      checking = false
    })
  }

  const onLink = (): void => {
    if (unchecked(link.getSnapshot())) check()
  }
  const onFront = (): void => {
    check()
  }

  const unsubscribe = link.subscribe(onLink)
  doc.addEventListener("visibilitychange", onFront)
  onLink()
  return () => {
    unsubscribe()
    doc.removeEventListener("visibilitychange", onFront)
  }
}
