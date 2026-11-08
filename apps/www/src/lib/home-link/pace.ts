/**
 * The one pace every request this phone sends home takes a turn on (AD3):
 * `BURST` at once, then one per `MS_PER_REQUEST`, whoever sends it. Home
 * lets this phone a bucket of 60 that refills one a second (paulgsc/server
 * `file_host`'s limiter); sending at most 49 at once and one each 2 s after
 * that, within one page load the phone never takes it below 11. A reload
 * starts the pace whole again: one right after a burst can meet home's
 * busy, which the link then waits out.
 *
 * The person's turns (`urgent`) go ahead of the drain's. So the drain waits
 * while the person's requests keep coming faster than one each 2 s (a long
 * Sync, a video read part by part), for as long as that work lasts; a
 * screen's timed read comes slower (an idea answer's words, every 5 s while
 * its screen shows).
 */
import type { HomeLinkPorts } from "./runtime"

const BURST = 49
const MS_PER_REQUEST = 2_000

export type Pace = {
  /** Resolves true at the request's turn, or false once its side `leave`s. */
  readonly turn: (isUrgent: boolean) => Promise<boolean>
  /** Lets go of every turn of that side still waiting: each resolves false. */
  readonly leave: (isUrgent: boolean) => void
}

export function createPace(clock: Pick<HomeLinkPorts, "now" | "after">): Pace {
  let turns = BURST
  let at = clock.now()
  const urgent: Array<(went: boolean) => void> = []
  const queued: Array<(went: boolean) => void> = []
  let waking = false

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
    if (waking || urgent.length + queued.length === 0) return
    waking = true
    clock.after(Math.ceil((1 - turns) * MS_PER_REQUEST), () => {
      waking = false
      serve()
    })
  }

  return {
    turn: (isUrgent) =>
      new Promise((resolve) => {
        ;(isUrgent ? urgent : queued).push(resolve)
        serve()
      }),
    leave: (isUrgent): void => {
      for (const resolve of (isUrgent ? urgent : queued).splice(0)) {
        resolve(false)
      }
    },
  }
}
