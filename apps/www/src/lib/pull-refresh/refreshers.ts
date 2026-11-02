/**
 * The refresh port (PULL1, #2458): what a screen reads past the query cache
 * registers here what a pull reads again.
 *
 * A refresher's `checkAgain` dispatches a check-again event into its
 * screen's runtime, so that runtime's own `step`, not React and not this
 * port, decides which of its late answers is stale; on a foreign API it
 * waits through `callForeign` (F1).
 */

/** One thing a screen shows that a pull reads again. */
export type Refresher = {
  /**
   * What it reads, as the person knows it, for the indicator's "Couldn't
   * check … just now": "today's digest", say. Never the machinery's name.
   */
  readonly what: string
  /** Reads it again: resolves once it came back, rejects if it could not. */
  readonly checkAgain: () => Promise<void>
}

export type Refreshers = {
  /** Adds `refresher` to every pull from now on, until the returned drop. */
  readonly register: (refresher: Refresher) => () => void
  /**
   * Runs every refresher registered now, together, and resolves once each
   * has answered or been dropped (its screen went away, so its answer is
   * stale and left out), to the `what` of each that could not read. One
   * check per refresher at a time: one whose check is still out is not asked
   * again, and this ask waits on that answer, so its `checkAgain` never runs
   * twice at once, while one registered since is asked now.
   */
  readonly checkAll: () => Promise<ReadonlyArray<string>>
}

type Entry = {
  readonly refresher: Refresher
  live: boolean
  /** Its check still out, which a new ask waits on. */
  out: Promise<string | null> | null
}

export function createRefreshers(): Refreshers {
  const entries = new Set<Entry>()
  /** Wakes a check waiting on an entry that was just dropped. */
  const dropped = new Set<() => void>()

  const register = (refresher: Refresher): (() => void) => {
    const entry: Entry = { refresher, live: true, out: null }
    entries.add(entry)
    return (): void => {
      if (!entry.live) return
      entry.live = false
      entries.delete(entry)
      dropped.forEach((wake) => wake())
    }
  }

  /** `entry`'s answer, or null once it is dropped without one. */
  const answerOf = (entry: Entry): Promise<string | null> =>
    new Promise((resolve) => {
      const wake = (): void => {
        if (entry.live) return
        dropped.delete(wake)
        resolve(null)
      }
      dropped.add(wake)
      const settle = (unread: string | null) => (): void => {
        dropped.delete(wake)
        resolve(entry.live ? unread : null)
      }
      // Through a resolved promise, so one that throws before it returns a
      // promise is a refresher that could not read, not a broken pull.
      Promise.resolve()
        .then(() => entry.refresher.checkAgain())
        .then(settle(null), settle(entry.refresher.what))
    })

  /** `entry`'s check still out, or a new one. */
  const askOf = (entry: Entry): Promise<string | null> => {
    if (entry.out !== null) return entry.out
    const answer = answerOf(entry).then((unread) => {
      entry.out = null
      return unread
    })
    entry.out = answer
    return answer
  }

  const checkAll = (): Promise<ReadonlyArray<string>> =>
    Promise.all(Array.from(entries, askOf)).then((answers) =>
      answers.filter((what): what is string => what !== null)
    )

  return { register, checkAll }
}

/**
 * The app's one set: the phone's screens register here, and every pull
 * reads them (`./reads`), whichever shell mount asks.
 */
export const screenRefreshers: Refreshers = createRefreshers()
