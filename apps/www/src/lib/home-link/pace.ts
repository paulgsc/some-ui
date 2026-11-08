/**
 * The one pace every request this phone sends home takes a turn on (AD3):
 * `BURST` at once, then one per `MS_PER_REQUEST`, whoever sends it. Home
 * lets this phone a bucket of 60 that refills one a second (paulgsc/server
 * `file_host`'s limiter); sending at most 49 at once and one each 2 s after
 * that, within one page load the phone never takes it below 11. A reload
 * starts the pace whole again: one right after a burst can meet home's
 * busy, which the link then waits out.
 *
 * A turn the person asked for (`urgent`: a screen's read, a tap, Sync,
 * Unpair) goes ahead of every drain turn waiting, so the drain yields to
 * the person without the rate changing.
 */
import type { HomeLinkPorts } from "./runtime"

const BURST = 49
const MS_PER_REQUEST = 2_000

export type Pace = {
  /** Resolves true at the request's turn, or false once its slot `leave`s. */
  readonly turn: (urgent: boolean) => Promise<boolean>
  /** Lets go of every turn of that slot still waiting: each resolves false. */
  readonly leave: (urgent: boolean) => void
}

export function createPace(clock: Pick<HomeLinkPorts, "now" | "after">): Pace {
  let turns = BURST
  let at = clock.now()
  const urgent: Array<(went: boolean) => void> = []
  const queued: Array<(went: boolean) => void> = []
  let waking: (() => void) | null = null

  const serve = (): void => {
    const now = clock.now()
    turns = Math.min(BURST, turns + (now - at) / MS_PER_REQUEST)
    at = now
    while (turns >= 1) {
      const next = urgent.shift() ?? queued.shift()
      if (next === undefined) return
      turns -= 1
      next(true)
    }
    if (waking !== null || urgent.length + queued.length === 0) return
    waking = clock.after(Math.ceil((1 - turns) * MS_PER_REQUEST), () => {
      waking = null
      serve()
    })
  }

  return {
    turn: (first) =>
      new Promise((resolve) => {
        ;(first ? urgent : queued).push(resolve)
        serve()
      }),
    leave: (first): void => {
      for (const resolve of (first ? urgent : queued).splice(0)) resolve(false)
    },
  }
}
