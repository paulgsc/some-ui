import type { HomeLinkPorts } from "@/lib/home-link/runtime"

/**
 * A clock a test moves, for the ports that take `now` and `after`. `pass`
 * moves it on, running each timer that falls due, unless they are held back
 * (a WebView in the background); `next` moves it to the earliest timer
 * waiting.
 */
export type FakeClock = {
  readonly now: HomeLinkPorts["now"]
  readonly after: HomeLinkPorts["after"]
  readonly pass: (ms: number, timersRun?: boolean) => void
  /** Moves to the earliest timer and runs those due then; false when none waits. */
  readonly next: () => boolean
}

export function fakeClock(start = 0): FakeClock {
  let now = start
  let timers: Array<{ at: number; run: () => void }> = []
  const runDue = (): void => {
    const due = timers.filter((timer) => timer.at <= now)
    timers = timers.filter((timer) => timer.at > now)
    for (const timer of due) timer.run()
  }
  return {
    now: () => now,
    after: (ms, run): (() => void) => {
      const timer = { at: now + ms, run }
      timers.push(timer)
      return (): void => {
        timers = timers.filter((each) => each !== timer)
      }
    },
    pass: (ms, timersRun = true): void => {
      now += ms
      if (timersRun) runDue()
    },
    next: (): boolean => {
      if (timers.length === 0) return false
      now = Math.max(now, Math.min(...timers.map((timer) => timer.at)))
      runDue()
      return true
    },
  }
}
