/**
 * The shell's refresh port as this package's screens take it (PULL1,
 * `apps/www/src/lib/pull-refresh/refreshers.ts`): a screen registers what a
 * pull down reads again, and drops it as it goes. Absent where the app has
 * no pull (the web).
 */
export type Refresh = (refresher: {
  /** What it reads, as the person knows it. */
  readonly what: string
  /** Reads it again: resolves once read, rejects if it could not be. */
  readonly checkAgain: () => Promise<void>
}) => () => void

/** How a screen's read of home stands: every kind the three screens' reads end in. */
export type ReadKind =
  | "reading"
  | "read"
  | "unpaired"
  | "older"
  | "away"
  | "unreadable"

/** A screen's runtime whose `readAgain` starts its read of home, numbered `seq`. */
export type ReadsAgain = {
  readonly getSnapshot: () => {
    readonly seq: number
    readonly read: { readonly kind: ReadKind }
  }
  readonly subscribe: (listener: () => void) => () => void
  readonly readAgain: () => void
}

/**
 * What a read that brought nothing to show ends as: home away, an answer
 * this phone could not read (home busy or overloaded among them), or a home
 * too old to answer. Unpaired is no home to check, so not a failure.
 */
const UNREAD: ReadonlySet<ReadKind> = new Set(["away", "unreadable", "older"])

/**
 * A pull's check of `screen` (HERD2, #3102): asks its read again, and
 * resolves once that read lands, rejecting when it could not be read
 * (`UNREAD`). A read a newer one replaced answers for itself, as resolved.
 */
export function checkAgainOf(screen: ReadsAgain): () => Promise<void> {
  return () =>
    new Promise<void>((resolve, reject) => {
      screen.readAgain()
      const { seq } = screen.getSnapshot()
      let stop = (): void => undefined
      const check = (): void => {
        const { seq: now, read } = screen.getSnapshot()
        if (now === seq && read.kind === "reading") return
        stop()
        if (now === seq && UNREAD.has(read.kind)) reject(new Error(read.kind))
        else resolve()
      }
      stop = screen.subscribe(check)
      check()
    })
}
