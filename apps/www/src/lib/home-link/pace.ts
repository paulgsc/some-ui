/**
 * The one pace every request this phone sends home takes a turn on (AD3):
 * `BURST` at once, then one per `MS_PER_REQUEST`, whoever sends it. Home
 * lets this phone a bucket of `RATE_LIMIT` that refills `RATE_LIMIT` a
 * minute (paulgsc/server `file_host`'s limiter, keyed by the phone's
 * address; 60 by default, two digits on the owner's home). A burst of 20
 * fits under any two-digit bucket home may keep; one each 2 s after that is
 * home's default refill or slower. Where home's is slower still, its `429`
 * empties the burst (`spend`) and says how far short of its refill the
 * pace fell (`Retry-After`, the limiter's exact wait for one more), which
 * the pace then adds between requests: what waits goes at home's own rate
 * or slower, never as a herd,
 * and a drain that needs many requests finishes instead of failing part way
 * each time; its burst shrinks as much as its pace slowed. What it learned
 * lasts `LEARNED_MS`, so a home whose limit was raised is paced at 2 s
 * again by the next day.
 *
 * HERD1 (#3101): the pace is kept across page loads (`PaceMemory`), so
 * closing and opening the app does not hand it a whole burst again: home's
 * bucket did not refill because the app restarted.
 *
 * The person's turns (`urgent`) go ahead of the drain's. So the drain waits
 * while the person's requests keep coming faster than one each 2 s (a long
 * Sync, a video read part by part), for as long as that work lasts; a
 * screen's timed read comes slower (an idea answer's words, every 5 s while
 * its screen shows).
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { isRecord, jsonOf, writeRecord } from "@some-ui/core-utils"

import type { HomeLinkPorts } from "./runtime"

export const BURST = 20
export const MS_PER_REQUEST = 2_000
/** The slowest pace home's `Retry-After` can teach: one each minute. */
const SLOWEST_MS = 60_000
/** How long a pace learned from home's `429` lasts. */
const LEARNED_MS = 24 * 60 * 60 * 1_000

/** What the pace had left, and when: kept across page loads. */
type PaceKept = {
  readonly turns: number
  readonly at: number
  /** The wait between requests home's `429` taught, and when; absent at 2 s. */
  readonly learned?: { readonly ms: number; readonly at: number }
}

/** Where the pace is kept between page loads; null when it can't be. */
export type PaceMemory = {
  readonly read: () => PaceKept | null
  readonly write: (kept: PaceKept) => void
}

export type Pace = {
  /** Resolves true at the request's turn, or false once its side `leave`s. */
  readonly turn: (isUrgent: boolean) => Promise<boolean>
  /** Lets go of every turn of that side still waiting: each resolves false. */
  readonly leave: (isUrgent: boolean) => void
  /**
   * Home said busy (`429`): its bucket is empty, so nothing is left of the
   * burst; and `waitMs`, home's `Retry-After` when it sent one this phone
   * can read, is how far short of home's refill the pace fell, which it adds
   * between requests from now on, when it is at least `MS_PER_REQUEST`:
   * at most doubling the pace each time, and at most `SLOWEST_MS` apart.
   */
  readonly spend: (waitMs: number | null) => void
}

/** `kept` as this page may trust it: a number of turns from the past. */
function trusted(kept: PaceKept | null, now: number): PaceKept | null {
  if (kept === null) return null
  const { turns, at, learned } = kept
  // JSON reads `1e400` as Infinity.
  if (!Number.isFinite(turns) || !Number.isFinite(at)) return null
  // A clock set back reads as kept just now.
  const trimmed = {
    turns: Math.min(BURST, Math.max(0, turns)),
    at: Math.min(at, now),
  }
  return learned !== undefined &&
    Number.isFinite(learned.ms) &&
    Number.isFinite(learned.at)
    ? {
        ...trimmed,
        learned: { ms: paceOf(learned.ms), at: Math.min(learned.at, now) },
      }
    : trimmed
}

/** `ms` held to what the pace may learn. */
const paceOf = (ms: number): number =>
  Math.min(SLOWEST_MS, Math.max(MS_PER_REQUEST, ms))

export function createPace(
  clock: Pick<HomeLinkPorts, "now" | "after">,
  memory: PaceMemory | null = null
): Pace {
  const kept = trusted(memory?.read() ?? null, clock.now())
  let turns = kept?.turns ?? BURST
  let at = kept?.at ?? clock.now()
  let learned = kept?.learned ?? null
  /** The wait between requests now: 2 s, or what home taught and still lasts. */
  const every = (): number => {
    if (learned !== null && clock.now() - learned.at >= LEARNED_MS) {
      learned = null
    }
    return learned?.ms ?? MS_PER_REQUEST
  }
  /**
   * The burst now: `BURST`, or, while home's slower pace lasts, as much
   * smaller as that pace is slower, since home's bucket is too.
   */
  const most = (ms: number): number =>
    Math.max(1, Math.floor((BURST * MS_PER_REQUEST) / ms))
  const keep = (): void =>
    memory?.write(learned === null ? { turns, at } : { turns, at, learned })
  const urgent: Array<(went: boolean) => void> = []
  const queued: Array<(went: boolean) => void> = []
  let waking = false

  const serve = (): void => {
    const now = clock.now()
    const ms = every()
    turns = Math.min(most(ms), turns + (now - at) / ms)
    at = now
    while (turns >= 1) {
      const next = urgent.shift() ?? queued.shift()
      if (next === undefined) return
      turns -= 1
      keep()
      next(true)
    }
    if (waking || urgent.length + queued.length === 0) return
    waking = true
    clock.after(Math.ceil((1 - turns) * ms), () => {
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
    spend: (waitMs): void => {
      turns = 0
      at = clock.now()
      // A wait shorter than `MS_PER_REQUEST` is home's bucket emptied by
      // a burst (this phone's, or another on its address), not a refill
      // slower than the pace: nothing to learn.
      if (waitMs !== null && waitMs >= MS_PER_REQUEST) {
        const now = every()
        const ms = paceOf(now + Math.min(waitMs, now))
        learned = ms > MS_PER_REQUEST ? { ms, at } : null
      }
      keep()
    },
    leave: (isUrgent): void => {
      for (const resolve of (isUrgent ? urgent : queued).splice(0)) {
        resolve(false)
      }
    },
  }
}

const PACE_KEY = "home-link:pace"

/** The pace kept in `storage` (the phone's own); null without one. */
export function storedPace(storage: KeyedStorage | null): PaceMemory | null {
  if (storage === null) return null
  return {
    read: (): PaceKept | null => {
      const parsed = jsonOf(storage.getItem(PACE_KEY) ?? "null")
      if (!isRecord(parsed)) return null
      const { turns, at, learned } = parsed
      if (typeof turns !== "number" || typeof at !== "number") return null
      return isRecord(learned) &&
        typeof learned.ms === "number" &&
        typeof learned.at === "number"
        ? { turns, at, learned: { ms: learned.ms, at: learned.at } }
        : { turns, at }
    },
    // A store that refuses it keeps this page's pace only: a reload then
    // starts it whole (HERD1's Tolerance).
    write: (kept): void => {
      writeRecord(storage, PACE_KEY, JSON.stringify(kept), jsonOf)
    },
  }
}
