/**
 * SF-CUT3 (#1489) — the content side of the enforcement sheet's handshake:
 * request the sheet for *this* document, confirm it by reading the cascade,
 * and only then let the caller release the veil.
 *
 * The background (`background/background.ts`) owns `insertCSS`/`removeCSS`,
 * because content scripts have no `scripting` API. It answers
 * `ENSURE_ENFORCEMENT`/`REMOVE_ENFORCEMENT` for the requesting frame and
 * keeps no state of its own. That puts idempotency here, and it has to be
 * here: measured on Chromium 1194, two `insertCSS` calls with the same CSS
 * stack two copies, and one `removeCSS` leaves the second one applied. So:
 *
 *   - `ensureEnforcement()` sends a request only while a read shows the sheet
 *     absent, and re-sends at most once (a worker mid-restart can answer
 *     before its `insertCSS` promise has settled);
 *   - `removeEnforcement()` repeats the request, bounded, until a read shows
 *     the sheet gone, which also cleans up after a stacked duplicate.
 *
 * The presence read is the sheet's own sentinel custom property
 * (`ENFORCEMENT_SENTINEL_PROPERTY`, declared by its canvas rule with the
 * swatch id) read from `<html>`'s computed style. It is not the canvas
 * colour: a vendor page can paint `<html>` exactly `bg0` on its own
 * (bot-found on #1521). A read is the confirmation the issue asks for, rather
 * than trusting that an `insertCSS` promise resolving means the sheet is in
 * this document's cascade.
 *
 * Transitions: CSS transitions sit above every `!important` origin, so a
 * vendor `transition: background-color 5s` on `<html>` would otherwise
 * interpolate from white to `bg0` *after* the sheet lands, and the veil
 * would come down onto a canvas still mid-way. The freeze (`withPrepaintSuppressed`'s own rule)
 * goes in before the request and comes out only after the confirm read and
 * one painted frame, so the vendor's transitions resume once the sheet's
 * values are already the current ones — nothing is left to animate.
 *
 * Liveness: the whole exchange is bounded by `ENFORCEMENT_LIVENESS_MS`. The
 * timeout bounds *waiting*; it is never read as evidence that the sheet is
 * present. On expiry the caller releases the veil onto the native page.
 */

/**
 * An MV3 service worker cold start is a few hundred milliseconds (the worker
 * is started on demand by the message itself), and `insertCSS` then costs one
 * more round trip to the renderer. `COMMIT_FALLBACK_MS` (100 ms) is the wrong
 * scale: it exists for occluded tabs whose rAF never fires, not for a worker
 * that has to boot. 2,500 ms leaves roughly 5x headroom over a cold start,
 * while still ending a dead-worker blackout within the time a user would
 * reload the page themselves.
 */
export const ENFORCEMENT_LIVENESS_MS = 2_500

/** Bounded, so a background that keeps answering without removing anything cannot spin. */
const MAX_REMOVE_ATTEMPTS = 3

export type EnforcementRequest =
  | { readonly type: "ENSURE_ENFORCEMENT"; readonly swatchId: string }
  | { readonly type: "REMOVE_ENFORCEMENT"; readonly swatchId: string }

export type EnforcementDeps = {
  /** `ext.runtime.sendMessage` — resolves with the background's response. */
  readonly send: (request: EnforcementRequest) => Promise<unknown>
  /** `<html>`'s computed value of `ENFORCEMENT_SENTINEL_PROPERTY` ("" when absent). */
  readonly readSentinel: () => string
  /** Installs the transition/animation freeze; returns its remover. */
  readonly freeze: () => () => void
  /** Resolves once the current state has painted at least once. */
  readonly afterPaint: () => Promise<void>
  readonly setTimer: (fn: () => void, ms: number) => unknown
  readonly clearTimer: (handle: unknown) => void
}

export type EnsureOutcome =
  | { readonly kind: "confirmed"; readonly sent: number }
  | { readonly kind: "timeout"; readonly sent: number }
  /** The tab's state moved on before the request reached the head of its queue; nothing was sent. */
  | { readonly kind: "superseded"; readonly sent: 0 }

/** True when this document's cascade currently carries the sheet for `swatchId`. */
export function sheetPresent(deps: EnforcementDeps, swatchId: string): boolean {
  return deps.readSentinel().trim() === swatchId
}

/** Resolves `"timeout"` after `ms`, or with `work`'s value if it settles first. */
function withLiveness<T>(
  deps: EnforcementDeps,
  work: Promise<T>,
  ms: number
): Promise<T | "timeout"> {
  return new Promise((resolve) => {
    const handle = deps.setTimer(() => resolve("timeout"), ms)
    work.then(
      (value) => {
        deps.clearTimer(handle)
        resolve(value)
      },
      () => {
        // A rejected sendMessage (no receiving end, worker torn down) is not
        // an answer; keep waiting until the liveness bound, so a genuinely
        // dead background and a transiently absent one look the same.
      }
    )
  })
}

/**
 * One enforcement operation, split in two. `result` is what the caller acts
 * on and is bounded by the liveness timeout. `settled` is the underlying
 * request, which can outlive that bound — a busy or restarting worker still
 * performs an `insertCSS` it received late — so the queue below holds the
 * next operation until it settles, not merely until the caller stopped
 * waiting (bot-found on #1521: a removal that ran while a timed-out insert
 * was still pending finished first and the insert then landed in an off or
 * legacy tab).
 */
type Operation<T> = {
  readonly result: Promise<T>
  readonly settled: Promise<unknown>
}

function ensureOperation(
  deps: EnforcementDeps,
  swatchId: string
): Operation<EnsureOutcome> {
  if (sheetPresent(deps, swatchId)) {
    return {
      result: Promise.resolve({ kind: "confirmed", sent: 0 }),
      settled: Promise.resolve(),
    }
  }

  const unfreeze = deps.freeze()
  let sent = 0
  const attempt = (async (): Promise<boolean> => {
    for (let i = 0; i < 2; i++) {
      sent++
      await deps.send({ type: "ENSURE_ENFORCEMENT", swatchId })
      if (sheetPresent(deps, swatchId)) return true
    }
    return false
  })()

  const result = (async (): Promise<EnsureOutcome> => {
    const confirmed = await withLiveness(deps, attempt, ENFORCEMENT_LIVENESS_MS)
    if (confirmed === true) {
      // The freeze stays until the sheet's values have painted once, so a
      // vendor transition that resumes afterwards has nothing left to
      // animate.
      await deps.afterPaint()
      unfreeze()
      return { kind: "confirmed", sent }
    }
    unfreeze()
    return { kind: "timeout", sent }
  })()
  return { result, settled: attempt }
}

function removeOperation(
  deps: EnforcementDeps,
  swatchId: string
): Operation<boolean> {
  const attempt = (async (): Promise<boolean> => {
    for (let i = 0; i < MAX_REMOVE_ATTEMPTS; i++) {
      if (!sheetPresent(deps, swatchId)) return true
      await deps.send({ type: "REMOVE_ENFORCEMENT", swatchId })
    }
    return !sheetPresent(deps, swatchId)
  })()
  const result = withLiveness(deps, attempt, ENFORCEMENT_LIVENESS_MS).then(
    (removed) => removed === true
  )
  return { result, settled: attempt }
}

/**
 * Requests the sheet for this document and confirms it by reading the
 * cascade. Does not touch the veil: the caller releases it on `confirmed`
 * (through the document scope's custody), and on `timeout` too, onto the
 * native page. Unqueued — callers use `createEnforcementQueue()`.
 */
export function ensureEnforcement(
  deps: EnforcementDeps,
  swatchId: string
): Promise<EnsureOutcome> {
  return ensureOperation(deps, swatchId).result
}

/**
 * Removes the sheet from this document, repeating until a read shows it gone
 * (a stacked duplicate needs one request per copy). Resolves `true` once the
 * read agrees, `false` if the liveness bound or the attempt cap ran out.
 * Unqueued — callers use `createEnforcementQueue()`.
 */
export function removeEnforcement(
  deps: EnforcementDeps,
  swatchId: string
): Promise<boolean> {
  return removeOperation(deps, swatchId).result
}

export type EnforcementQueue = {
  /**
   * Queues an ensure. `isCurrent` is re-read when the operation reaches the
   * head of the queue: a request the tab's state has moved on from resolves
   * `superseded` without sending anything.
   */
  ensure(isCurrent: () => boolean): Promise<EnsureOutcome>
  remove(): Promise<boolean>
}

/**
 * One document's enforcement operations, strictly in call order: each starts
 * only after the previous one's underlying request has settled, so an ensure
 * can never read a sheet a queued removal is about to take away, nor a
 * removal finish ahead of an insert still in flight (bot-found on #1521, the
 * auto -> legacy -> auto race and the timed-out insert). The caller-facing
 * answer stays bounded regardless: each call resolves within
 * `ENFORCEMENT_LIVENESS_MS` of being made, even while it waits behind a
 * request that never settles — the veil is never held on a dead worker.
 */
export function createEnforcementQueue(
  deps: EnforcementDeps,
  swatchId: string
): EnforcementQueue {
  let tail: Promise<unknown> = Promise.resolve()

  function enqueue<T>(start: () => Operation<T>, timedOut: T): Promise<T> {
    return new Promise<T>((resolve) => {
      let answered = false
      const answer = (value: T): void => {
        if (answered) return
        answered = true
        deps.clearTimer(handle)
        resolve(value)
      }
      const handle = deps.setTimer(
        () => answer(timedOut),
        ENFORCEMENT_LIVENESS_MS
      )
      tail = tail.then(async () => {
        const operation = start()
        void operation.result.then(answer)
        await operation.settled.then(
          () => undefined,
          () => undefined
        )
      })
    })
  }

  return {
    ensure: (isCurrent) =>
      enqueue<EnsureOutcome>(
        () =>
          isCurrent()
            ? ensureOperation(deps, swatchId)
            : {
                result: Promise.resolve({ kind: "superseded", sent: 0 }),
                settled: Promise.resolve(),
              },
        { kind: "timeout", sent: 0 }
      ),
    remove: () => enqueue(() => removeOperation(deps, swatchId), false),
  }
}
