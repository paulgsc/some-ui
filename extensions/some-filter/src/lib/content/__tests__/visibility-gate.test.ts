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
    // This is the whole point: a restored or re-injected background tab does
    // the expensive round zero times until someone looks at it.
    expect(start).not.toHaveBeenCalled()

    doc.show()
    expect(start).toHaveBeenCalledTimes(1)
  })

  it("ignores a visibilitychange that goes the other way", () => {
    const doc = fakeDocument("hidden")
    const start = vi.fn()

    createVisibilityGate(doc.source).whenVisible(start)
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
})
