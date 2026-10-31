/**
 * When a record this phone drains to home asks for a run (LA15,
 * docs/learner-data-authority.md): only while the phone is paired and the
 * app is in the foreground, at the moments that invariant names. Never on a
 * timer.
 *
 * The one wiring (`./lanes`) hands in each lane's record and its runtime
 * (`./kept-runtime`); this module names no record.
 */
import { homeLink } from "./index"
import type { Kept } from "./kept-runtime"

/** A record as the watch sees it. */
export type KeptRecord = {
  /** Moves when this phone changes what the record would send. */
  revision: () => number
  subscribe: (listener: () => void) => () => void
}

/** Asks for a run when the phone is paired and the app is in front. */
export function askKept(home: Kept, doc: Document): void {
  if (homeLink().getSnapshot().link.kind !== "paired") return
  if (doc.visibilityState !== "visible") return
  home.want()
}

/**
 * Asks once now; when the record changes on this phone, the app comes back to
 * the foreground, the network comes back, the phone is paired, or the link
 * frees up after turning a run away; until the returned unsubscribe is
 * called.
 */
export function watchKept(
  record: KeptRecord,
  home: Kept,
  doc: Document = document,
  win: Window = window
): () => void {
  const link = homeLink()
  let revision = record.revision()
  let paired = link.getSnapshot().link.kind === "paired"
  let idle = link.getSnapshot().activity.kind === "idle"

  const onRecord = (): void => {
    const now = record.revision()
    if (now === revision) return
    revision = now
    askKept(home, doc)
  }
  const onLink = (): void => {
    const { link: pairing, activity } = link.getSnapshot()
    const nowPaired = pairing.kind === "paired"
    const nowIdle = activity.kind === "idle"
    const freed = nowIdle && !idle
    const turnedAway = home.getSnapshot().last?.kind === "busy"
    if ((nowPaired && !paired) || (freed && turnedAway)) {
      askKept(home, doc)
    }
    paired = nowPaired
    idle = nowIdle
  }
  const onBack = (): void => {
    askKept(home, doc)
  }

  const unsubscribeRecord = record.subscribe(onRecord)
  const unsubscribeLink = link.subscribe(onLink)
  doc.addEventListener("visibilitychange", onBack)
  win.addEventListener("online", onBack)
  askKept(home, doc)
  return () => {
    unsubscribeRecord()
    unsubscribeLink()
    doc.removeEventListener("visibilitychange", onBack)
    win.removeEventListener("online", onBack)
  }
}
