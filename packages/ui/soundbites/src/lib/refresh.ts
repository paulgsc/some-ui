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

/** A screen's runtime whose `readAgain` starts its read of home, numbered `seq`. */
export type ReadsAgain = {
  readonly getSnapshot: () => {
    readonly seq: number
    readonly read: { readonly kind: string }
  }
  readonly subscribe: (listener: () => void) => () => void
  readonly readAgain: () => void
}

/**
 * A pull's check of `screen` (HERD2, #3102): asks its read again, and
 * resolves once that read lands, rejecting when it found home away. A read
 * a newer one replaced, or a screen gone, answers for itself, as resolved.
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
        if (now === seq && read.kind === "away") reject(new Error("away"))
        else resolve()
      }
      stop = screen.subscribe(check)
      check()
    })
}
