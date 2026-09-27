/**
 * A test-only probe of the standing resources a piece of UI holds, so an
 * extension can *assert* its lifetimes instead of trusting them: mount the
 * thing, drive it (minimise, hide, destroy), and check what is still running.
 *
 *   const probe = probeResources()
 *   const card = new Card(…)
 *   card.setSize("min")
 *   expect(probe.counts()).toMatchObject({ intervals: 0, frames: 0 })
 *   card.destroy()
 *   expect(probe.counts()).toEqual(probe.baseline)
 *   probe.restore()
 *
 * It wraps the globals of one window (jsdom in unit tests): intervals until
 * cleared, timeouts and animation frames until they fire or are cancelled,
 * and listeners on the page-lifetime targets (window, document, and its root
 * and body) until removed — directly or by their `signal` aborting. `once`
 * listeners are not counted: they end themselves.
 *
 * Not for production code — it replaces globals.
 */

export type ResourceCounts = {
  intervals: number
  timeouts: number
  frames: number
  /** Listeners on window / document / documentElement / body. */
  pageListeners: number
}

export type ResourceProbe = {
  /** Counts at the moment the probe was installed. */
  readonly baseline: ResourceCounts
  counts: () => ResourceCounts
  /** Put the original globals back. */
  restore: () => void
}

type Listening = {
  target: EventTarget
  type: string
  listener: EventListenerOrEventListenerObject
  capture: boolean
}

export function probeResources(win: Window = window): ResourceProbe {
  const intervals = new Set<unknown>()
  const timeouts = new Set<unknown>()
  const frames = new Set<number>()
  const listening: Array<Listening> = []
  const restorers: Array<() => void> = []
  // jsdom implements requestAnimationFrame with an interval of its own. Timers
  // an environment creates *inside* its frame scheduler are its machinery, not
  // the code under test's, so they are not counted.
  let inScheduler = 0
  const scheduler = <T>(run: () => T): T => {
    inScheduler++
    try {
      return run()
    } finally {
      inScheduler--
    }
  }

  const origSetInterval = win.setInterval.bind(win)
  const origClearInterval = win.clearInterval.bind(win)
  const origSetTimeout = win.setTimeout.bind(win)
  const origClearTimeout = win.clearTimeout.bind(win)
  const origRaf = win.requestAnimationFrame.bind(win)
  const origCaf = win.cancelAnimationFrame.bind(win)

  const patch = <K extends keyof Window>(key: K, value: Window[K]): void => {
    const original = win[key]
    Object.defineProperty(win, key, {
      value,
      configurable: true,
      writable: true,
    })
    restorers.push(() =>
      Object.defineProperty(win, key, {
        value: original,
        configurable: true,
        writable: true,
      })
    )
  }

  patch(
    "setInterval",
    (handler: TimerHandler, ms?: number, ...args: Array<unknown>): number => {
      const id = origSetInterval(handler, ms, ...args)
      if (inScheduler === 0) intervals.add(id)
      return id
    }
  )
  patch("clearInterval", (id?: number): void => {
    intervals.delete(id)
    origClearInterval(id)
  })
  patch(
    "setTimeout",
    (handler: TimerHandler, ms?: number, ...args: Array<unknown>): number => {
      const id: number = origSetTimeout(
        (...a: Array<unknown>) => {
          timeouts.delete(id)
          if (typeof handler === "function") handler(...a)
        },
        ms,
        ...args
      )
      timeouts.add(id)
      return id
    }
  )
  patch("clearTimeout", (id?: number): void => {
    timeouts.delete(id)
    origClearTimeout(id)
  })
  patch("requestAnimationFrame", (cb: FrameRequestCallback): number => {
    const id = scheduler(() =>
      origRaf((now) => {
        frames.delete(id)
        cb(now)
      })
    )
    frames.add(id)
    return id
  })
  patch("cancelAnimationFrame", (id: number): void => {
    frames.delete(id)
    scheduler(() => origCaf(id))
  })

  const doc = win.document
  const targets: Array<EventTarget> = [win, doc, doc.documentElement, doc.body]

  const indexOf = (l: Omit<Listening, "target">, target: EventTarget): number =>
    listening.findIndex(
      (x) =>
        x.target === target &&
        x.type === l.type &&
        x.listener === l.listener &&
        x.capture === l.capture
    )

  for (const target of targets) {
    const origAdd = target.addEventListener.bind(target)
    const origRemove = target.removeEventListener.bind(target)
    const add = (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions
    ): void => {
      origAdd(type, listener, options)
      if (!listener) return
      const opts = typeof options === "object" ? options : {}
      const capture =
        typeof options === "boolean" ? options : Boolean(opts.capture)
      if (opts.once || opts.signal?.aborted) return
      const entry = { target, type, listener, capture }
      if (indexOf(entry, target) !== -1) return
      listening.push(entry)
      opts.signal?.addEventListener(
        "abort",
        () => {
          const i = indexOf(entry, target)
          if (i !== -1) listening.splice(i, 1)
        },
        { once: true }
      )
    }
    const remove = (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions
    ): void => {
      origRemove(type, listener, options)
      if (!listener) return
      const capture =
        typeof options === "boolean" ? options : Boolean(options?.capture)
      const i = indexOf({ type, listener, capture }, target)
      if (i !== -1) listening.splice(i, 1)
    }
    // Some environments (jsdom's window) carry these as own properties, so
    // put back exactly what was there rather than deleting ours.
    const ownAdd = Object.getOwnPropertyDescriptor(target, "addEventListener")
    const ownRemove = Object.getOwnPropertyDescriptor(
      target,
      "removeEventListener"
    )
    Object.defineProperty(target, "addEventListener", {
      value: add,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(target, "removeEventListener", {
      value: remove,
      configurable: true,
      writable: true,
    })
    restorers.push(() => {
      for (const [key, own] of [
        ["addEventListener", ownAdd],
        ["removeEventListener", ownRemove],
      ] as const) {
        if (own) Object.defineProperty(target, key, own)
        else Reflect.deleteProperty(target, key)
      }
    })
  }

  const counts = (): ResourceCounts => ({
    intervals: intervals.size,
    timeouts: timeouts.size,
    frames: frames.size,
    pageListeners: listening.length,
  })

  return {
    baseline: counts(),
    counts,
    restore: (): void => {
      for (const r of restorers.reverse()) r()
    },
  }
}
