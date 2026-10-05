import { createVisibilityGate } from "@filter/lib/content/visibility-gate"
import type { VisibilitySource } from "@filter/lib/content/visibility-gate"
import { describe, expect, it, vi, type Mock } from "vitest"

/** A document whose visibility the test drives directly (headless Chromium reports every page visible). */
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

/** A gate over a fake document, with a spy to start. */
function setup(initial: DocumentVisibilityState): {
  doc: FakeDocument
  gate: ReturnType<typeof createVisibilityGate>
  start: Mock<() => void>
} {
  const doc = fakeDocument(initial)
  return {
    doc,
    gate: createVisibilityGate(doc.source),
    start: vi.fn<() => void>(),
  }
}

describe("createVisibilityGate", () => {
  it("runs immediately in a visible tab", () => {
    const { doc, gate, start } = setup("visible")

    gate.whenVisible(start)

    expect(start).toHaveBeenCalledTimes(1)
    // Nothing to wait for, so nothing is left attached.
    expect(doc.listeners).toBe(0)
  })

  it("defers in a hidden tab and runs on first view", () => {
    const { doc, gate, start } = setup("hidden")

    gate.whenVisible(start)
    expect(start).not.toHaveBeenCalled()

    doc.show()
    expect(start).toHaveBeenCalledTimes(1)
  })

  it("ignores a visibilitychange that goes the other way", () => {
    const { doc, gate, start } = setup("hidden")

    gate.whenVisible(start)
    doc.hide() // `visibilitychange` fires on both edges

    expect(start).not.toHaveBeenCalled()
  })

  it("runs once across repeated visibility flips", () => {
    const { doc, gate, start } = setup("hidden")

    gate.whenVisible(start)
    doc.show()
    doc.hide()
    doc.show()

    expect(start).toHaveBeenCalledTimes(1)
    expect(doc.listeners).toBe(0)
  })

  it("supersedes a pending deferral rather than arming a second", () => {
    const { doc, gate, start: first } = setup("hidden")
    const second = vi.fn()

    // auto -> off -> auto while hidden.
    gate.whenVisible(first)
    gate.whenVisible(second)
    doc.show()

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(doc.listeners).toBe(0)
  })

  it("cancel() drops a pending deferral without running it", () => {
    const { doc, gate, start } = setup("hidden")

    gate.whenVisible(start)
    gate.cancel()
    doc.show()

    expect(start).not.toHaveBeenCalled()
    expect(doc.listeners).toBe(0)
  })

  describe("pending", () => {
    it("is false before anything is deferred and in a visible tab", () => {
      const { gate, start } = setup("visible")
      expect(gate.pending).toBe(false)

      gate.whenVisible(start)
      // Ran inline; there is nothing outstanding.
      expect(gate.pending).toBe(false)
    })

    it("is true only while a hidden tab's deferral is armed", () => {
      const { doc, gate, start } = setup("hidden")

      gate.whenVisible(start)
      expect(gate.pending).toBe(true)

      doc.show()
      expect(gate.pending).toBe(false)
    })

    it("tracks a hidden -> hidden change without clearing", () => {
      const { doc, gate, start } = setup("hidden")

      gate.whenVisible(start)
      doc.hide()

      // The waiter ignored that edge, so callers must still stand down.
      expect(gate.pending).toBe(true)
    })

    it("clears on cancel(), so a torn-down session reports nothing pending", () => {
      const { gate, start } = setup("hidden")

      gate.whenVisible(start)
      gate.cancel() // what applyState() does when the mode changes

      expect(gate.pending).toBe(false)
    })
  })
})
