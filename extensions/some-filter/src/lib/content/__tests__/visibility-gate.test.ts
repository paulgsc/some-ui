import { createVisibilityGate } from "@filter/lib/content/visibility-gate"
import type { VisibilitySource } from "@filter/lib/content/visibility-gate"
import { describe, expect, it, vi } from "vitest"

/**
 * A document whose visibility the test drives directly. The real one cannot
 * be driven: headless Chromium reports every page visible regardless of
 * which target is foregrounded, which is why this gate takes its source as
 * a parameter at all.
 */
type FakeDocument = {
  source: VisibilitySource
  show: () => void
  hide: () => void
  readonly listeners: number
}

function fakeDocument(initial: DocumentVisibilityState): FakeDocument {
  let state: DocumentVisibilityState = initial
  const handlers = new Set<EventListenerOrEventListenerObject>()

  const fire = (): void => {
    for (const handler of [...handlers]) {
      if (typeof handler === "function") handler(new Event("visibilitychange"))
      else handler.handleEvent(new Event("visibilitychange"))
    }
  }

  const source: VisibilitySource = {
    get visibilityState(): DocumentVisibilityState {
      return state
    },
    addEventListener(
      _type: string,
      handler: EventListenerOrEventListenerObject | null
    ): void {
      if (handler !== null) handlers.add(handler)
    },
    removeEventListener(
      _type: string,
      handler: EventListenerOrEventListenerObject | null
    ): void {
      if (handler !== null) handlers.delete(handler)
    },
  }

  return {
    source,
    show(): void {
      state = "visible"
      fire()
    },
    hide(): void {
      state = "hidden"
      fire()
    },
    get listeners(): number {
      return handlers.size
    },
  }
}

describe("createVisibilityGate", () => {
  it("runs immediately in a visible tab", () => {
    const doc = fakeDocument("visible")
    const start = vi.fn()

    createVisibilityGate(doc.source).whenVisible(start)

    expect(start).toHaveBeenCalledTimes(1)
    // Nothing to wait for, so nothing is left attached.
    expect(doc.listeners).toBe(0)
  })

  it("defers in a hidden tab and runs on first view", () => {
    const doc = fakeDocument("hidden")
    const start = vi.fn()

    createVisibilityGate(doc.source).whenVisible(start)
    // The whole point: a restored or re-injected background tab runs the
    // expensive first round zero times until someone looks at it.
    expect(start).not.toHaveBeenCalled()

    doc.show()
    expect(start).toHaveBeenCalledTimes(1)
  })

  it("ignores a visibilitychange that goes the other way", () => {
    const doc = fakeDocument("hidden")
    const start = vi.fn()

    createVisibilityGate(doc.source).whenVisible(start)
    // `visibilitychange` fires on both edges; hidden -> hidden must not
    // start anything.
    doc.hide()

    expect(start).not.toHaveBeenCalled()
  })

  it("runs once across repeated visibility flips", () => {
    const doc = fakeDocument("hidden")
    const start = vi.fn()

    createVisibilityGate(doc.source).whenVisible(start)
    doc.show()
    doc.hide()
    doc.show()

    expect(start).toHaveBeenCalledTimes(1)
    expect(doc.listeners).toBe(0)
  })

  it("supersedes a pending deferral rather than arming a second", () => {
    const doc = fakeDocument("hidden")
    const first = vi.fn()
    const second = vi.fn()
    const gate = createVisibilityGate(doc.source)

    // auto -> off -> auto while hidden. Two armed waiters would start two
    // sessions the moment the tab is finally shown.
    gate.whenVisible(first)
    gate.whenVisible(second)
    doc.show()

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(doc.listeners).toBe(0)
  })

  it("cancel() drops a pending deferral without running it", () => {
    const doc = fakeDocument("hidden")
    const start = vi.fn()
    const gate = createVisibilityGate(doc.source)

    gate.whenVisible(start)
    gate.cancel()
    doc.show()

    expect(start).not.toHaveBeenCalled()
    expect(doc.listeners).toBe(0)
  })

  describe("pending", () => {
    // Bot-found (#1459 review): callers that do startup-shaped work of their
    // own have to be able to see a deferral, or they do it anyway and the
    // gate buys nothing. content.ts's yt-navigate-finish handler is the
    // case — a background-loaded SPA tab fires it without ever being shown.

    it("is false before anything is deferred and in a visible tab", () => {
      const visible = fakeDocument("visible")
      const gate = createVisibilityGate(visible.source)
      expect(gate.pending).toBe(false)

      gate.whenVisible(vi.fn())
      // Ran inline; there is nothing outstanding.
      expect(gate.pending).toBe(false)
    })

    it("is true only while a hidden tab's deferral is armed", () => {
      const doc = fakeDocument("hidden")
      const gate = createVisibilityGate(doc.source)

      gate.whenVisible(vi.fn())
      expect(gate.pending).toBe(true)

      doc.show()
      expect(gate.pending).toBe(false)
    })

    it("tracks a hidden -> hidden change without clearing", () => {
      const doc = fakeDocument("hidden")
      const gate = createVisibilityGate(doc.source)

      gate.whenVisible(vi.fn())
      doc.hide()

      // The waiter ignored that edge, so the deferral is still outstanding
      // and a caller consulting this must still stand down.
      expect(gate.pending).toBe(true)
    })

    it("clears on cancel(), so a torn-down session reports nothing pending", () => {
      const doc = fakeDocument("hidden")
      const gate = createVisibilityGate(doc.source)

      gate.whenVisible(vi.fn())
      // What applyState() does when the mode changes out from under a
      // deferral — the gate's one live cancel() caller.
      gate.cancel()

      expect(gate.pending).toBe(false)
    })
  })
})
