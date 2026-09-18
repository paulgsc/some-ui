import { createVisibilityGate } from "@filter/lib/content/visibility-gate"
import type {
  VisibilityLifecycle,
  VisibilitySource,
} from "@filter/lib/content/visibility-gate"
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

/** A lifecycle whose three phases are individually observable. */
function spyLifecycle(): {
  lifecycle: VisibilityLifecycle
  start: ReturnType<typeof vi.fn>
  suspend: ReturnType<typeof vi.fn>
  resume: ReturnType<typeof vi.fn>
} {
  const start = vi.fn()
  const suspend = vi.fn()
  const resume = vi.fn()
  return { lifecycle: { start, suspend, resume }, start, suspend, resume }
}

describe("createVisibilityGate — starting", () => {
  it("starts immediately in a visible tab", () => {
    const doc = fakeDocument("visible")
    const spy = spyLifecycle()

    createVisibilityGate(doc.source).run(spy.lifecycle)

    expect(spy.start).toHaveBeenCalledTimes(1)
    expect(spy.suspend).not.toHaveBeenCalled()
  })

  it("does not start in a hidden tab, and starts on first view", () => {
    const doc = fakeDocument("hidden")
    const spy = spyLifecycle()

    createVisibilityGate(doc.source).run(spy.lifecycle)
    // The whole point: a restored or re-injected background tab runs the
    // expensive first round zero times until someone looks at it.
    expect(spy.start).not.toHaveBeenCalled()

    doc.show()
    expect(spy.start).toHaveBeenCalledTimes(1)
  })

  it("never suspends something that never started", () => {
    const doc = fakeDocument("hidden")
    const spy = spyLifecycle()

    createVisibilityGate(doc.source).run(spy.lifecycle)
    doc.hide()

    // "never started" and "started then suspended" are different states;
    // collapsing them would tear down watchers that were never created.
    expect(spy.suspend).not.toHaveBeenCalled()
    expect(spy.resume).not.toHaveBeenCalled()
  })
})

describe("createVisibilityGate — suspending and resuming", () => {
  it("suspends on hide and resumes on return, without re-starting", () => {
    const doc = fakeDocument("visible")
    const spy = spyLifecycle()

    createVisibilityGate(doc.source).run(spy.lifecycle)
    doc.hide()
    doc.show()

    expect(spy.start).toHaveBeenCalledTimes(1)
    expect(spy.suspend).toHaveBeenCalledTimes(1)
    expect(spy.resume).toHaveBeenCalledTimes(1)
  })

  it("suspends once per hide, not once per event", () => {
    const doc = fakeDocument("visible")
    const spy = spyLifecycle()

    createVisibilityGate(doc.source).run(spy.lifecycle)
    doc.hide()
    doc.hide()

    // A repeated hidden->hidden edge must not tear down twice: the second
    // call would run against watchers the first already stopped.
    expect(spy.suspend).toHaveBeenCalledTimes(1)
  })

  it("resumes once per return, not once per event", () => {
    const doc = fakeDocument("visible")
    const spy = spyLifecycle()

    createVisibilityGate(doc.source).run(spy.lifecycle)
    doc.hide()
    doc.show()
    doc.show()

    expect(spy.resume).toHaveBeenCalledTimes(1)
  })

  it("survives many cycles, which is the tab-switching case", () => {
    const doc = fakeDocument("visible")
    const spy = spyLifecycle()

    createVisibilityGate(doc.source).run(spy.lifecycle)
    for (let i = 0; i < 5; i += 1) {
      doc.hide()
      doc.show()
    }

    expect(spy.start).toHaveBeenCalledTimes(1)
    expect(spy.suspend).toHaveBeenCalledTimes(5)
    expect(spy.resume).toHaveBeenCalledTimes(5)
  })
})

describe("createVisibilityGate — superseding and cancelling", () => {
  it("supersedes a previous binding rather than keeping both", () => {
    const doc = fakeDocument("hidden")
    const first = spyLifecycle()
    const second = spyLifecycle()
    const gate = createVisibilityGate(doc.source)

    // auto -> off -> auto while hidden. Two live bindings would start two
    // sessions the moment the tab is finally shown.
    gate.run(first.lifecycle)
    gate.run(second.lifecycle)
    doc.show()

    expect(first.start).not.toHaveBeenCalled()
    expect(second.start).toHaveBeenCalledTimes(1)
    expect(doc.listeners).toBe(1)
  })

  it("cancel() detaches and fires nothing further", () => {
    const doc = fakeDocument("visible")
    const spy = spyLifecycle()
    const gate = createVisibilityGate(doc.source)

    gate.run(spy.lifecycle)
    gate.cancel()
    doc.hide()
    doc.show()

    expect(spy.suspend).not.toHaveBeenCalled()
    expect(spy.resume).not.toHaveBeenCalled()
    expect(doc.listeners).toBe(0)
  })
})
