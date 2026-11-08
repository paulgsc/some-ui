/**
 * When a record this phone drains to home asks for a run (LA15,
 * docs/learner-data-authority.md): only while the phone is paired and the
 * app is in the foreground, at the moments that invariant names, a pull
 * among them (`pullKept`, PULL3). Never on a timer.
 *
 * The one wiring (`./lanes`) hands in each lane's record and its runtime
 * (`./kept-runtime`); this module names no record.
 */
import { homeLink, LINK_CLOCK, paired, pairingOf } from "./index"
import type { KeptRun } from "./kept-model"
import type { Kept } from "./kept-runtime"
import { drainFree, linkOpen } from "./model"

/** A record as the watch sees it. */
export type KeptRecord = {
  /** Moves when this phone changes what the record would send. */
  revision: () => number
  subscribe: (listener: () => void) => () => void
}

/** The document as an ask reads it: whether the app is in front. */
export type Front = Pick<Document, "visibilityState">

/** Whether a run may be asked for: the phone is paired and the app is in front. */
const mayAsk = (doc: Front): boolean =>
  paired() && doc.visibilityState === "visible"

/** Asks for a run when the phone is paired and the app is in front. */
export function askKept(home: Kept, doc: Document): void {
  if (mayAsk(doc)) home.want()
}

/**
 * A pull's ask (`./pull`): as `askKept`, resolving to how the run that
 * answers it ended, or to null when nothing was asked.
 */
export function pullKept(home: Kept, doc: Front): Promise<KeptRun | null> {
  return mayAsk(doc) ? home.pull() : Promise.resolve(null)
}

/**
 * Who turned `run` away, if anyone: the link, busy with another run, or
 * home being busy (AD3), which the link also answers for while it waits.
 */
function turnedAwayBy(run: KeptRun | null): "link" | "home" | null {
  if (run?.kind === "busy") return "link"
  return run?.kind === "failed" && run.why === "busy" ? "home" : null
}

/**
 * Asks once now; when the record changes on this phone, the app comes back to
 * the foreground, the network comes back, the phone is paired, or the link
 * opens again after turning a run away (it frees up, or home's busy ends:
 * one ask however many moments came while it waited, AD3); until the
 * returned unsubscribe is called.
 */
export function watchKept(
  record: KeptRecord,
  home: Kept,
  doc: Document = document,
  win: Window = window
): () => void {
  const link = homeLink()
  let revision = record.revision()
  let wasPaired = pairingOf(link.getSnapshot()) !== null
  let idle = drainFree(link.getSnapshot())
  let open = linkOpen(link.getSnapshot(), LINK_CLOCK.now())
  // Who turned the lane's last run away, while it has not been asked since:
  // read off its runs as they end, since the link frees (a run's own end)
  // before that run's end reaches the lane.
  let owed: "link" | "home" | null = null

  const onRecord = (): void => {
    const now = record.revision()
    if (now === revision) return
    revision = now
    askKept(home, doc)
  }
  const onRun = (): void => {
    const run = home.getSnapshot()
    if (!run.running) owed = turnedAwayBy(run.last)
  }
  const onLink = (): void => {
    const state = link.getSnapshot()
    const nowPaired = pairingOf(state) !== null
    const nowIdle = drainFree(state)
    const nowOpen = linkOpen(state, LINK_CLOCK.now())
    // Turned away by another run: asked once that run ends, even while home
    // is busy, when the run only says so (it sends nothing). Turned away by
    // home: asked once home's busy ends, and not before.
    const again =
      (owed === "link" && nowIdle && !idle) ||
      (owed !== null && nowOpen && !open)
    if (again) owed = null
    if ((nowPaired && !wasPaired) || again) {
      askKept(home, doc)
    }
    wasPaired = nowPaired
    idle = nowIdle
    open = nowOpen
  }
  const onBack = (): void => {
    askKept(home, doc)
  }

  const unsubscribeRecord = record.subscribe(onRecord)
  const unsubscribeRun = home.subscribe(onRun)
  const unsubscribeLink = link.subscribe(onLink)
  doc.addEventListener("visibilitychange", onBack)
  win.addEventListener("online", onBack)
  askKept(home, doc)
  return () => {
    unsubscribeRecord()
    unsubscribeRun()
    unsubscribeLink()
    doc.removeEventListener("visibilitychange", onBack)
    win.removeEventListener("online", onBack)
  }
}
