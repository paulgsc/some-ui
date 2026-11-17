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
 * What a read that could not be done ends as: home away, or an answer this
 * phone could not read (home busy or overloaded among them). Unpaired and
 * an older home are answers, not failures to check.
 */
const UNREAD: ReadonlySet<string> = new Set(["away", "unreadable"])

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
