/**
 * Disposables — the lifetime a resource is acquired against (Charter §8).
 *
 * Every standing resource — a listener on the page, an interval, a frame
 * loop, a child scope — is acquired *through* one of these, so its end is
 * decided where it starts: when the owner's `dispose()` runs, everything it
 * acquired goes with it, in reverse order. Nothing needs a matching
 * remove/clear written three files away, which is the shape of every leak
 * the lifetime lint rules describe.
 *
 *   const life = new Disposables()
 *   document.addEventListener("pointermove", onMove, { signal: life.signal })
 *   life.interval(advance, 5_000)
 *   const blossoms = spawnBlossoms(root)
 *   life.add(() => blossoms.destroy())
 *   …
 *   life.dispose() // all of the above, gone
 *
 * `signal` is what makes page listeners pass
 * extension-charter/require-scoped-lifetime; `interval()` and `loop()` are
 * the raw primitives that require-named-lifetime and require-scoped-lifetime
 * forbid elsewhere, with this object as their named lifetime.
 *
 * Hoisted from some-conveyor's DisposableRegistry (#280), which it follows in
 * spirit — reverse-order disposal, disposal errors contained, registering
 * after dispose disposes immediately — with the resource kinds built in.
 */

export type Disposer = () => void

export class Disposables {
  private readonly controller = new AbortController()
  private readonly disposers = new Set<Disposer>()

  /** Aborts on dispose(). Pass it as `{ signal }` to addEventListener / fetch. */
  get signal(): AbortSignal {
    return this.controller.signal
  }

  get disposed(): boolean {
    return this.controller.signal.aborted
  }

  /**
   * Run `disposer` when this lifetime ends. Added after the end, it runs at
   * once — a resource acquired too late is released, never leaked.
   */
  add(disposer: Disposer): void {
    if (this.disposed) {
      runSafely(disposer)
      return
    }
    this.disposers.add(disposer)
  }

  /** `setInterval`, cleared when this lifetime ends. */
  interval(callback: () => void, ms: number): void {
    if (this.disposed) return
    // Lifetime: this Disposables — cleared by dispose(), and by nothing else.
    // eslint-disable-next-line extension-charter/require-named-lifetime -- lifetime is this object; see above
    const id = setInterval(callback, ms)
    this.add(() => clearInterval(id))
  }

  /** One-shot `setTimeout`, cancelled if this lifetime ends first. */
  timeout(callback: () => void, ms: number): void {
    if (this.disposed) return
    const id = setTimeout(callback, ms)
    this.add(() => clearTimeout(id))
  }

  /** One-shot `requestAnimationFrame`, cancelled if this lifetime ends first. */
  frame(callback: (now: number) => void): void {
    if (this.disposed) return
    const id = requestAnimationFrame(callback)
    this.add(() => cancelAnimationFrame(id))
  }

  /** A frame loop: `callback` every frame until this lifetime ends. */
  loop(callback: (now: number) => void): void {
    if (this.disposed) return
    let id = 0
    const tick = (now: number): void => {
      callback(now)
      // Lifetime: this Disposables — the pending frame is cancelled by
      // dispose(), which ends the loop.
      // eslint-disable-next-line extension-charter/require-scoped-lifetime -- lifetime is this object; see above
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    this.add(() => cancelAnimationFrame(id))
  }

  /**
   * A nested lifetime that ends with this one, or earlier on its own. An
   * early end unregisters it, so short-lived children do not accumulate.
   */
  child(): Disposables {
    const child = new Disposables()
    if (this.disposed) {
      child.dispose()
      return child
    }
    const end = (): void => child.dispose()
    this.disposers.add(end)
    child.add(() => this.disposers.delete(end))
    return child
  }

  /** End this lifetime: abort `signal`, then run every disposer, newest first. */
  dispose(): void {
    if (this.disposed) return
    this.controller.abort()
    const ordered = Array.from(this.disposers).reverse()
    this.disposers.clear()
    for (const disposer of ordered) runSafely(disposer)
  }
}

function runSafely(disposer: Disposer): void {
  try {
    disposer()
  } catch (err) {
    // A failing disposer must not strand the ones after it.
    // eslint-disable-next-line no-console -- disposal has no caller to return to
    console.error("[Disposables] disposer failed:", err)
  }
}
