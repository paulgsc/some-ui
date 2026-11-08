/**
 * When a record this phone drains to home asks for a run (LA15,
 * docs/learner-data-authority.md): only while the phone is paired and the
 * app is in the foreground, at the moments that invariant names, a pull
 * among them (`pullKept`, PULL3). Never on a timer but one: a lane whose
 * run stopped at its share of home's limit asks again at its turn on the
 * shared refill schedule (`Refill`, AD3).
 *
 * The one wiring (`./lanes`) hands in each lane's record and its runtime
 * (`./kept-runtime`); this module names no record.
 */
import { homeLink, paired, pairingOf } from "./index"
import type { KeptRun } from "./kept-model"
import type { Kept } from "./kept-runtime"
import { linkOpen } from "./model"

/** A record as the watch sees it. */
export type KeptRecord = {
  /** Moves when this phone changes what the record would send. */
  revision: () => number
  subscribe: (listener: () => void) => () => void
}

/** The document as an ask reads it: whether the app is in front. */
export type Front = Pick<Document, "visibilityState">

/**
 * How long home takes to refill one request of this phone's (paulgsc/server
 * `file_host`'s limiter refills 60 a minute, one a second), doubled: a lane
 * whose run stopped at its share asks again only once home has had twice
 * the time to refill what that run sent.
 */
const REFILL_MS_PER_REQUEST = 2_000

/**
 * When a lane whose run stopped at its share (`capped`) may ask again: one
 * schedule every watch shares, so the lanes draining on their own take
 * turns rather than each keeping its own pace. Each booking starts once the
 * one before it has had its refill time, and lasts the refill time of what
 * its run sent, so however many lanes are capped at once, their re-asks
 * together send at most one request per `REFILL_MS_PER_REQUEST`: 30 a
 * minute, half of home's 60. Home's bucket then still gains 30 a minute
 * while lanes drain, so a round of every lane (49 at most, `./lanes`'
 * `REQUESTS_PER_RUN`) that the owner starts (a pull, the app coming back)
 * finds it refilled within about 80 s of the last (from 11 left to 49, at
 * 30 a minute), and one that comes sooner meets home's busy (AD3), which
 * every lane then waits out.
 */
export type Refill = {
  /**
   * Books the next turn for a lane whose run sent `sent` requests, and says
   * how many ms from now it comes.
   */
  readonly book: (sent: number) => number
  /** Runs `run` once, `ms` from now; returns the cancel. */
  readonly after: (ms: number, run: () => void) => () => void
}

export function createRefill(
  now: () => number,
  after: Refill["after"]
): Refill {
  // When the last booked turn's requests have been refilled.
  let free = 0
  return {
    after,
    book: (sent): number => {
      free = Math.max(now(), free) + sent * REFILL_MS_PER_REQUEST
      return free - now()
    },
  }
}

/** The one schedule the app shell's watches share. */
const sharedRefill = createRefill(
  () => Date.now(),
  (ms, run): (() => void) => {
    const timer = setTimeout(run, ms)
    return (): void => clearTimeout(timer)
  }
)

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
 * one ask however many moments came while it waited, AD3); and, after a run
 * that stopped at its share, at its turn on `refill`, or once home's busy
 * ends if home is busy then; until the returned unsubscribe is called.
 */
export function watchKept(
  record: KeptRecord,
  home: Kept,
  doc: Document = document,
  win: Window = window,
  refill: Refill = sharedRefill
): () => void {
  const link = homeLink()
  let revision = record.revision()
  let wasPaired = pairingOf(link.getSnapshot()) !== null
  let idle = link.getSnapshot().activity.kind === "idle"
  let open = linkOpen(link.getSnapshot())
  // Who turned the lane's last run away, while it has not been asked since:
  // read off its runs as they end, since the link frees (a run's own end)
  // before that run's end reaches the lane.
  let owed: "link" | "home" | null = null
  // A capped run's turn to ask again, while it is booked.
  let cancelTurn: (() => void) | null = null
  let turnFor: KeptRun | null = null

  const onRecord = (): void => {
    const now = record.revision()
    if (now === revision) return
    revision = now
    askKept(home, doc)
  }
  const onRun = (): void => {
    const { running, last } = home.getSnapshot()
    if (running) return
    owed = turnedAwayBy(last)
    if (last?.kind !== "capped") {
      // In step, turned away or stopped: nothing is left to drain on its own.
      cancelTurn?.()
      cancelTurn = null
      return
    }
    if (turnFor === last) return
    turnFor = last
    cancelTurn?.()
    cancelTurn = refill.after(refill.book(last.sent), () => {
      cancelTurn = null
      // Home busy now: its end asks, once, as for any lane it turned away.
      if (link.getSnapshot().homeBusyUntil !== null) owed = "home"
      else askKept(home, doc)
    })
  }
  const onLink = (): void => {
    const state = link.getSnapshot()
    const nowPaired = pairingOf(state) !== null
    const nowIdle = state.activity.kind === "idle"
    const nowOpen = linkOpen(state)
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
    cancelTurn?.()
    unsubscribeLink()
    doc.removeEventListener("visibilitychange", onBack)
    win.removeEventListener("online", onBack)
  }
}
