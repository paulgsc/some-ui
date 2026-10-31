/**
 * A term: how long LeetType has in its scene, counted only while the
 * session around it plays. Plain TypeScript over a clock and a timer, with
 * React only reading whether it has run out (`hooks/leetype/use-term`).
 *
 * It starts held: nothing counts until `release`, which the host's hold
 * forwards once the activity is connected (`useHostHold`, or once, with no
 * host). While held its timer is off and its time stands still, so a
 * session paused, stopped or waiting behind the reflection drawer spends
 * none of it (promise SS2). `spentMs` is where an earlier mount left it: a
 * player reopened on a stop goes on with what was left, not a fresh term.
 */

export type TermPorts = {
  readonly now: () => number
  /** Calls `fire` after `ms`, unless cancelled. */
  readonly after: (ms: number, fire: () => void) => () => void
}

const timerAfter = (ms: number, fire: () => void): (() => void) => {
  const timer = setTimeout(fire, ms)
  return () => clearTimeout(timer)
}

const browserTerm: TermPorts = {
  now: () => performance.now(),
  after: timerAfter,
}

export class Term {
  /** Time spent before `since`. */
  private spentBefore: number
  /** When it last began counting; null while held. */
  private since: number | null = null
  private cancel: () => void = () => undefined
  private expired = false
  private readonly listeners = new Set<() => void>()

  constructor(
    private durationMs: number,
    spentMs: number,
    private readonly ports: TermPorts = browserTerm
  ) {
    this.spentBefore = Math.max(0, spentMs)
    this.expired = this.spentBefore >= durationMs
  }

  /** Time counted so far, this mount and the ones before it. */
  spent = (): number =>
    this.spentBefore + (this.since === null ? 0 : this.ports.now() - this.since)

  left = (): number => Math.max(0, this.durationMs - this.spent())

  /** Whether it has run out. For handlers and snapshots. */
  hasExpired = (): boolean => this.expired

  /** Told when it runs out, and when a restart takes that back. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** The session waits: the time stands still. */
  hold = (): void => {
    if (this.since === null) return
    this.spentBefore = this.spent()
    this.since = null
    this.cancel()
  }

  /** The session plays: the time runs on from where it stood. */
  release = (): void => {
    if (this.since !== null) return
    this.since = this.ports.now()
    this.arm()
  }

  /** A fresh term of the whole duration, from now. */
  restart = (): void => {
    this.spentBefore = 0
    if (this.since !== null) this.since = this.ports.now()
    this.setExpired(false)
    this.arm()
  }

  /** The scene's duration changed: what was spent stays spent. */
  setDuration = (durationMs: number): void => {
    if (durationMs === this.durationMs) return
    this.durationMs = durationMs
    this.setExpired(this.spent() >= durationMs)
    this.arm()
  }

  private arm(): void {
    this.cancel()
    this.cancel = (): void => undefined
    if (this.expired || this.since === null) return
    this.cancel = this.ports.after(this.left(), () => this.setExpired(true))
  }

  private setExpired(expired: boolean): void {
    if (expired === this.expired) return
    this.expired = expired
    for (const listener of this.listeners) listener()
  }
}
