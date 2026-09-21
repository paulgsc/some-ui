/**
 * The polling channel (BC2, #1435) — canon Definition 3.3's $S_"poll"$, as
 * the former manager's unresolved queue and budget were, now the Sensor's.
 *
 * A catalogue element with no extractable id yet — a lockup YouTube has not
 * filled in, a channel or playlist tile that never will be, an ad cell — is
 * re-sampled on every mutation batch and on a 500 ms tick until it resolves
 * or its wall-clock budget runs out (#973, #1422). Giving up is sticky
 * (`scan()` re-offers every element on the page, and a rejected one must
 * not restart its budget) and revocable (`recheck()` revives an element the
 * moment extraction would succeed). Cards mounted without a channel are
 * re-observed the same way so the channel can arrive late (Entry-4).
 */

/** How long an element gets to resolve before it is dropped. */
export const RESOLVE_BUDGET_MS = 10_000

/** The tick between re-samples while anything is queued. */
export const RETRY_INTERVAL_MS = 500

export type QueueEntry = {
  readonly el: HTMLElement
  readonly firstSeenAt: number
}

export type RetryQueue = {
  /** Queue `el`, keeping an existing budget if it is already queued. */
  enqueue(el: HTMLElement, now: number): boolean
  dequeue(el: HTMLElement): void
  /** Spend `el`'s budget: dequeued and rejected until `revive()`. */
  reject(el: HTMLElement): void
  revive(el: HTMLElement): void
  isRejected(el: HTMLElement): boolean
  has(el: HTMLElement): boolean
  spent(el: HTMLElement, now: number): boolean
  entries(): ReadonlyArray<QueueEntry>
  rejected(): ReadonlyArray<HTMLElement>
  readonly size: number
  clear(): void
}

export function createRetryQueue(budgetMs = RESOLVE_BUDGET_MS): RetryQueue {
  const queued = new Map<HTMLElement, number>()
  // Strong refs so `rejected()` can be iterated; bounded by the non-card
  // tiles on one page, pruned as they disconnect, cleared on navigation.
  const rejectedSet = new Set<HTMLElement>()

  return {
    enqueue(el: HTMLElement, now: number): boolean {
      if (rejectedSet.has(el)) return false
      if (queued.has(el)) return false
      queued.set(el, now)
      return true
    },
    dequeue(el: HTMLElement): void {
      queued.delete(el)
    },
    reject(el: HTMLElement): void {
      queued.delete(el)
      rejectedSet.add(el)
    },
    revive(el: HTMLElement): void {
      rejectedSet.delete(el)
    },
    isRejected(el: HTMLElement): boolean {
      return rejectedSet.has(el)
    },
    has(el: HTMLElement): boolean {
      return queued.has(el)
    },
    spent(el: HTMLElement, now: number): boolean {
      const since = queued.get(el)
      return since !== undefined && now - since >= budgetMs
    },
    entries(): ReadonlyArray<QueueEntry> {
      return [...queued].map(([el, firstSeenAt]) => ({ el, firstSeenAt }))
    },
    rejected(): ReadonlyArray<HTMLElement> {
      return [...rejectedSet]
    },
    get size(): number {
      return queued.size
    },
    clear(): void {
      queued.clear()
      rejectedSet.clear()
    },
  }
}
