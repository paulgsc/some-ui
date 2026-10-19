/**
 * When a record kept on home asks for a run (aph, LA9; the Jobs record,
 * LA10; Practice, LA11; docs/learner-data-authority.md): only while its screens are open
 * with the app in the foreground, at the moments those invariants name.
 * Never on a timer.
 *
 * Each record's lane (`./aph`, `./jobs`) hands in its record and its runtime
 * (`./kept-runtime`); this module names neither record.
 */
import { homeLink } from "./index"
import type { Kept } from "./kept-runtime"

/** A record as the watch sees it. */
export type KeptRecord = {
  /** Whether its person keeps the record on home. */
  kept: () => boolean
  /** Moves when this phone changes the record, or switches it to home. */
  revision: () => number
  subscribe: (listener: () => void) => () => void
}

/** Asks for a run when the record is kept on home and the app is in front. */
export function askKept(record: KeptRecord, home: Kept, doc: Document): void {
  if (!record.kept()) return
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
    askKept(record, home, doc)
  }
  const onLink = (): void => {
    const { link: pairing, activity } = link.getSnapshot()
    const nowPaired = pairing.kind === "paired"
    const nowIdle = activity.kind === "idle"
    const freed = nowIdle && !idle
    const turnedAway = home.getSnapshot().last?.kind === "busy"
    if ((nowPaired && !paired) || (freed && turnedAway)) {
      askKept(record, home, doc)
    }
    paired = nowPaired
    idle = nowIdle
  }
  const onBack = (): void => {
    askKept(record, home, doc)
  }

  const unsubscribeRecord = record.subscribe(onRecord)
  const unsubscribeLink = link.subscribe(onLink)
  doc.addEventListener("visibilitychange", onBack)
  win.addEventListener("online", onBack)
  askKept(record, home, doc)
  return () => {
    unsubscribeRecord()
    unsubscribeLink()
    doc.removeEventListener("visibilitychange", onBack)
    win.removeEventListener("online", onBack)
  }
}
